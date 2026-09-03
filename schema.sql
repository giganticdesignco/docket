-- Docket: internal time / retainer / expense tracking for Gigantic.
-- Postgres (Supabase). Single org, ~14 users, roles: admin | staff.
--
-- This file is the source of truth. It runs top to bottom against a
-- fresh Supabase project. Order: extensions/types -> functions ->
-- tables (with their triggers and indexes) -> views -> RLS.
--
-- Why functions can come before tables: they are plpgsql, and plpgsql
-- does not resolve table names until the function is first executed.
-- Every function sets search_path = '' and schema-qualifies its
-- references, which is what Supabase's security advisor expects.

-- ============================================================
-- OPEN QUESTIONS / TODO
-- ============================================================
-- 1. INVOICING: REOPENED 2026-09-02. Gigantic bills entirely through
--    Harvest today (invoices and payment follow-up), not QuickBooks, so
--    "QBO owns invoices" was the wrong premise. Open decision: Docket
--    invoices itself, billing moves to QBO, or Harvest stays for
--    invoicing only. Until then billing_batches is a draft-and-lock
--    grouping (see create_billing_batch) and harvest_invoices keeps the
--    Harvest history. If QBO wins, still to confirm:
--      a. ASSUMED: QuickBooks ONLINE (REST API). If Desktop, step 8
--         becomes a CSV/IIF export instead.
--      b. Whether QBO already has a customer list. If so, populate
--         clients.qbo_customer_id before the first push.
--      c. Whether QBO Service Items exist per task (tasks.qbo_item_id).
--      d. Whether payment is collected THROUGH Harvest (card/ACH). If
--         so, that moves to QBO Payments too.
-- 2. E-signature on quotes: not handled. accepted_by is a typed name
--    (plus accepted_email) recorded by accept_quote() from /q/<token>.
--    Keep PandaDoc if legally signable docs are required.
-- 3. RESOLVED in step 5: retainer_status() chains contiguous periods
--    (same client, project, name) and carries leftover forward when the
--    earlier period has rollover on, capped by its rollover_cap.
-- 4. No Docket invoice tables yet (see 1). harvest_invoices is imported
--    history only. CSV export is app-side; saved_reports stores
--    definitions, not output.
-- 5. RESOLVED in step 9: capacity_weekly counts time off on weekdays
--    only, so a week of PTO is 40h against a 40h base.
-- 6. RESOLVED in step 12: quotes.public_token feeds /q/<token>; the
--    public page is served by a service-role route.
-- 7. RESOLVED in step 4: receipts bucket + storage policies are in
--    section 6 at the bottom. Local check stubs the storage schema.
-- 8. Auth setup in the Supabase dashboard (not expressible in SQL):
--    Google provider on, "Allow new users to sign up" OFF, users are
--    added via Authentication > Users > Invite. Google Workspace domain
--    restriction is enforced here by handle_new_user() as a backstop.
-- 9. First admin: profiles are created as 'staff' by the auth trigger.
--    Promote the first admin by hand in the SQL editor:
--      update profiles set role = 'admin' where email = '...';

-- ============================================================
-- 0. TYPES
-- ============================================================

create type billing_method       as enum ('hourly', 'fixed', 'retainer', 'non_billable');
create type retainer_basis       as enum ('hours', 'amount');
create type quote_status         as enum ('draft', 'sent', 'accepted', 'declined', 'expired');
create type time_off_kind        as enum ('pto', 'holiday', 'unpaid', 'sick');
create type reminder_kind        as enum ('timer_left_running', 'missing_time', 'timesheet_nudge');
create type invoice_status       as enum ('draft', 'sent', 'paid', 'void');
create type work_priority        as enum ('low', 'normal', 'high', 'urgent');
create type audit_action         as enum ('insert', 'update', 'delete');
create type billing_batch_status as enum ('draft', 'pushing', 'pushed', 'failed', 'void', 'invoiced');

-- ============================================================
-- 1. FUNCTIONS
-- ============================================================

-- Is the current user an admin? Security definer so it can read
-- profiles regardless of the caller's RLS. Used by nearly every policy.
create or replace function public.is_admin()
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$;

-- What a role may do beyond its own rows. Admin has everything without
-- rows in permissions; is_admin() stays the short circuit.
create or replace function public.has_permission(p_key text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid()
      and (pr.role = 'admin' or exists (select 1 from public.permissions p where p.role = pr.role and p.key = p_key))
  );
$$;

-- A task is visible when you may see all tasks, made it, or are on it.
-- A client sees what was shared for review on their own projects, or
-- every task on a project marked visible to the client.
-- Security definer so comment and file policies can ask without RLS
-- recursing through work_items.
create or replace function public.task_visible(p_item uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case when public.is_client() then
      exists (select 1 from public.work_items w join public.projects p on p.id = w.project_id
              where w.id = p_item and p.client_id = public.my_client_id()
                and (w.shared_at is not null or p.client_visible))
    else
      public.has_permission('see_all_tasks')
      or exists (select 1 from public.work_items w where w.id = p_item and w.created_by = auth.uid())
      or exists (select 1 from public.work_item_assignees a where a.work_item_id = p_item and a.user_id = auth.uid())
    end;
$$;

-- Client contacts: role 'client' with a client_id.
create or replace function public.is_client()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'client');
$$;
create or replace function public.my_client_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select client_id from public.profiles where id = auth.uid();
$$;

-- Create a profile row when a user is created in Supabase Auth.
-- Name comes from user metadata (Google gives full_name / name), falls
-- back to the part of the email before the @. Role defaults to staff.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_role   text := new.raw_user_meta_data ->> 'role';
  v_client uuid := nullif(new.raw_user_meta_data ->> 'client_id', '')::uuid;
begin
  -- Invited clients arrive with role and client_id in their metadata
  -- (server/api/clients/invite.post.ts) and may use any address.
  if v_role = 'client' and v_client is not null then
    insert into public.profiles (id, full_name, email, role, client_id)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), new.email, 'client', v_client)
    on conflict (id) do nothing;
    return new;
  end if;
  -- Staff sign-in is Google only, restricted to the agency domain. Supabase
  -- Auth is configured with signups off and admin invites, and the
  -- Google provider is limited to the Workspace domain; this is the
  -- last line of defence if either setting drifts.
  if lower(split_part(new.email, '@', 2)) <> 'giganticdesign.com' then
    raise exception 'Docket accounts must use a giganticdesign.com address';
  end if;
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Staff may edit their own profile, but only full_name. Everything that
-- affects billing or access (role, default_rate, is_active, email) is
-- admin-only. RLS is row-level, so this has to be a trigger.
-- Skipped when there is no JWT (service role, SQL editor, migrations).
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.has_permission('manage_people') then
    if new.role         is distinct from old.role
    or new.default_rate is distinct from old.default_rate
    or new.cost_rate    is distinct from old.cost_rate
    or new.is_active    is distinct from old.is_active
    or new.email        is distinct from old.email then
      raise exception 'Only admins can change role, default_rate, cost_rate, is_active, or email';
    end if;
  end if;
  return new;
end;
$$;

-- Rate resolution: project_task -> project -> user default.
create or replace function public.resolve_rate(p_project_id uuid, p_task_id uuid, p_user_id uuid)
returns numeric
language plpgsql stable
set search_path = ''
as $$
begin
  return coalesce(
    (select pt.hourly_rate from public.project_tasks pt
      where pt.project_id = p_project_id and pt.task_id = p_task_id),
    (select p.hourly_rate from public.projects p where p.id = p_project_id),
    (select pr.default_rate from public.profiles pr where pr.id = p_user_id)
  );
end;
$$;

-- Freeze the rate on insert. Only recompute on update if the entry is
-- moved to a different project/task/user, so later rate changes don't
-- rewrite history. Staff cannot edit a frozen rate; admins can, which is
-- how the Harvest import stores Harvest's own rate after the insert.
-- (An upsert cannot do it: BEFORE INSERT runs on the proposed row first,
-- and ON CONFLICT's EXCLUDED values carry that result.)
create or replace function public.set_rate_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.project_id is distinct from old.project_id
     or new.task_id    is distinct from old.task_id
     or new.user_id    is distinct from old.user_id then
    new.rate_snapshot := public.resolve_rate(new.project_id, new.task_id, new.user_id);
    new.cost_snapshot := (select cost_rate from public.profiles where id = new.user_id);
  else
    if new.rate_snapshot is distinct from old.rate_snapshot
       and auth.uid() is not null and not public.is_admin() then
      new.rate_snapshot := old.rate_snapshot;
    end if;
    if new.cost_snapshot is distinct from old.cost_snapshot
       and auth.uid() is not null and not public.is_admin() then
      new.cost_snapshot := old.cost_snapshot;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Append-only audit trail for time entries and expenses.
-- Security definer so the insert works even though nobody has an
-- insert policy on audit_log.
create or replace function public.write_audit_log()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_fields text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(key) into v_fields
      from jsonb_each(v_new)
      where v_new -> key is distinct from v_old -> key
        and key not in ('updated_at');
    -- nothing meaningful changed
    if v_fields is null then
      return new;
    end if;
  end if;

  insert into public.audit_log (table_name, record_id, action, changed_by, old_data, new_data, changed_fields)
  values (
    tg_table_name,
    coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid),
    lower(tg_op)::public.audit_action,
    auth.uid(),
    v_old,
    v_new,
    v_fields
  );

  return coalesce(new, old);
end;
$$;

-- work_items: updated_at and completed_at look after themselves;
-- completed_at follows the status's is_done flag.
create or replace function public.work_item_touch() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_done boolean;
begin
  select is_done into v_done from public.work_statuses where key = new.status;
  v_done := coalesce(v_done, false);
  if tg_op = 'INSERT' then
    if v_done then new.completed_at := now(); end if;
    return new;
  end if;
  new.updated_at := now();
  if v_done and old.completed_at is null then
    new.completed_at := now();
  elsif not v_done then
    new.completed_at := null;
  end if;
  return new;
end $$;

-- Quote lines: hours x rate when both are given, otherwise the typed
-- amount (a flat fee). The quote's subtotal follows its lines.
create or replace function public.quote_line_amount() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.hours is not null and new.rate is not null then
    new.amount := round(new.hours * new.rate, 2);
  end if;
  return new;
end $$;

create or replace function public.quote_recalc(p_quote_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.quotes set
    subtotal = coalesce((select sum(amount) from public.quote_line_items where quote_id = p_quote_id), 0),
    updated_at = now()
  where id = p_quote_id;
end $$;

create or replace function public.quote_lines_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then perform public.quote_recalc(old.quote_id); end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.quote_id is distinct from old.quote_id) then
    perform public.quote_recalc(new.quote_id);
  end if;
  return null;
end $$;

-- ============================================================
-- 2. TABLES
-- Ordered so every foreign key points at a table above it.
-- ============================================================

-- ---------- People ----------

-- Roles are rows, not an enum, so Gigantic can add its own (and a client
-- role later). Built-in ones cannot be deleted; admin is the one role
-- is_admin() recognises and needs no permission rows.
create table roles (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  label       text not null,
  description text,
  is_builtin  boolean not null default false,
  position    int not null default 0
);
insert into roles (key, label, description, is_builtin, position) values
  ('admin',   'Admin',   'Everything.', true, 0),
  ('manager', 'Manager', 'Everyone''s time, tasks, budgets, capacity. No billing or settings.', true, 1),
  ('staff',   'Staff',   'Own time and expenses, all tasks.', true, 2),
  ('client',  'Client',  'Sees their own quotes, invoices, and tasks shared for review. Nothing else.', true, 3);

-- Nobody can delete a built-in role, and a role in use stays.
create or replace function public.protect_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_builtin then raise exception 'Built-in roles cannot be deleted'; end if;
  if exists (select 1 from public.profiles where role = old.key) then
    raise exception 'People still have this role. Move them first.';
  end if;
  return old;
end $$;
create trigger roles_protect before delete on roles for each row execute function public.protect_roles();

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null,
  email        text not null unique,
  role         text not null default 'staff' references roles(key) on update cascade on delete restrict,
  default_rate numeric(10,2),          -- fallback billable rate
  is_active    boolean not null default true,
  tours_seen   jsonb not null default '{}'::jsonb,   -- walkthroughs finished or skipped, by id
  client_id    uuid references clients(id) on delete restrict,  -- set only for role 'client'
  created_at   timestamptz not null default now(),
  check ((role = 'client') = (client_id is not null))
);
create index profiles_client on profiles (client_id) where client_id is not null;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_protect_columns
  before update on profiles
  for each row execute function public.protect_profile_columns();

-- What each role may do, one row per (role, key). Keys:
--   see_all_time     everyone's time and expenses, reports
--   see_money        rates and amounts (contractors never)
--   see_all_tasks    every task, not just assigned ones
--   manage_tasks     delete any task or comment
--   manage_reference clients, projects, task types, project rates
--   manage_quotes    quotes, their lines and sitemaps
--   manage_invoices  batches, invoices, lines, payments, Harvest history
--   manage_retainers retainers
--   approve_time     review, approve, or send back submitted timesheets
--   manage_people    profiles, availability, everyone's time off
--   manage_settings  statuses, categories, invoice settings, imports, audit
--   see_capacity     the capacity page
-- Defaults: manager gets see_all_time, see_money, see_all_tasks,
-- manage_tasks, manage_reference, see_capacity; staff see_money and
-- see_all_tasks. Roles and the matrix are edited on /admin/permissions.
create table permissions (
  role text not null references roles(key) on update cascade on delete cascade,
  key  text not null,
  primary key (role, key)
);
insert into permissions (role, key) values
  ('manager', 'see_all_time'), ('manager', 'see_money'), ('manager', 'see_all_tasks'),
  ('manager', 'manage_tasks'), ('manager', 'manage_reference'), ('manager', 'see_capacity'), ('manager', 'approve_time'),
  ('staff', 'see_money'), ('staff', 'see_all_tasks');

-- ---------- Work structure ----------

create table clients (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  qbo_customer_id text unique,          -- QuickBooks Online Customer.Id
  harvest_id      bigint unique,        -- Harvest client id, set by the import
  is_active       boolean not null default true,
  search          tsvector generated always as (to_tsvector('simple', coalesce(name, ''))) stored,
  created_at      timestamptz not null default now()
);

create table projects (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete restrict,
  name           text not null,
  code           text,                  -- internal job number
  billing_method billing_method not null default 'hourly',
  budget_hours   numeric(10,2),         -- null = no budget
  budget_amount  numeric(12,2),
  hourly_rate    numeric(10,2),         -- project override
  harvest_id     bigint unique,         -- Harvest project id, set by the import
  server_path    text,                  -- folder on the office server (smb:// or a path)
  client_visible boolean not null default false,  -- portal shows all its tasks, read-only
  search         tsvector generated always as (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(code, ''))) stored,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (client_id, name)
);

-- Tasks are global (Design, Front-end Dev, QA, Sign Install...)
create table tasks (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  harvest_id          bigint unique,       -- Harvest task id, set by the import
  qbo_item_id         text,             -- QuickBooks Service Item.Id for invoice lines
  is_billable_default boolean not null default true,
  is_active           boolean not null default true
);

-- Which tasks are available on which project, with optional rate override.
create table project_tasks (
  project_id  uuid not null references projects(id) on delete cascade,
  task_id     uuid not null references tasks(id) on delete restrict,
  hourly_rate numeric(10,2),
  primary key (project_id, task_id)
);

-- ---------- Tasks (step 10; ClickUp is being canceled) ----------
-- Statuses are a table admins manage (Settings > Task statuses). Flags say
-- which status means done (completed_at, off open lists), paused (off
-- capacity), client review (Share for review moves there), and returned
-- (a client's "changes requested" moves there). Keys are stable; labels,
-- colors, and order are not.
create table work_statuses (
  key              text primary key,
  label            text not null,
  color            text not null default 'neutral' check (color in ('neutral', 'primary', 'info', 'success', 'warning', 'error')),
  position         int not null default 0,
  is_done          boolean not null default false,
  is_paused        boolean not null default false,
  is_client_review boolean not null default false,
  is_return        boolean not null default false,
  is_active        boolean not null default true
);
insert into work_statuses (key, label, color, position, is_done, is_paused, is_client_review, is_return) values
  ('new',               'New',               'neutral', 1, false, false, false, false),
  ('ready_to_start',    'Ready to start',    'neutral', 2, false, false, false, false),
  ('in_progress',       'In progress',       'primary', 3, false, false, false, false),
  ('internal_review',   'Internal review',   'info',    4, false, false, false, false),
  ('client_review',     'Client review',     'info',    5, false, false, true,  false),
  ('back_in_our_court', 'Back in our court', 'warning', 6, false, false, false, true),
  ('sent_to_print',     'Sent to print',     'info',    7, false, false, false, false),
  ('on_hold',           'On hold',           'neutral', 8, false, true,  false, false),
  ('completed',         'Completed',         'success', 9, true,  false, false, false)
on conflict (key) do nothing;

-- work_items live under projects; several people can be assigned; comments
-- and files hang off them. Comments allow a null author with a typed name
-- so the client review link (step 11, /r/<public_token>, served by a
-- service-role route) can post without an account. Only uploaded files
-- and comments marked visible_to_client reach the link.

create table work_items (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete restrict,
  title          text not null,
  description    text,
  status         text not null default 'new' references work_statuses(key) on update cascade on delete restrict,
  priority       work_priority not null default 'normal',
  start_on       date,
  due_on         date,
  is_milestone   boolean not null default false,   -- zero-length marker on the schedule
  search         tsvector generated always as (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))) stored,
  estimate_hours numeric(6,2),
  position       int not null default 0,
  public_token   text not null unique
                 default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  clickup_id     text unique,           -- set by the one-time ClickUp import
  -- Client review (step 11): /r/<public_token> needs no login. The client's
  -- last decision lives here; shared_at is when the link was first sent.
  client_decision    text check (client_decision in ('approved', 'changes_requested')),
  client_decision_by text,
  client_decision_at timestamptz,
  shared_at          timestamptz,
  created_by     uuid not null references profiles(id) on delete restrict,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index work_items_project_status on work_items (project_id, status);
create index work_items_due on work_items (due_on);
create trigger work_items_touch before insert or update on work_items
  for each row execute function public.work_item_touch();

-- A task can wait on other tasks (drawn as arrows on /schedule; a
-- successor starting before its predecessor ends shows a warning).
create table work_item_dependencies (
  predecessor_id uuid not null references work_items(id) on delete cascade,
  successor_id   uuid not null references work_items(id) on delete cascade,
  primary key (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);
create index work_item_dependencies_successor on work_item_dependencies (successor_id);

create table work_item_assignees (
  work_item_id uuid not null references work_items(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  primary key (work_item_id, user_id)
);
create index work_item_assignees_user on work_item_assignees (user_id);

create table work_item_comments (
  id                uuid primary key default gen_random_uuid(),
  work_item_id      uuid not null references work_items(id) on delete cascade,
  author_id         uuid references profiles(id) on delete set null,  -- null = a client, via review link
  author_name       text,                                             -- what the client typed
  body              text not null,
  mentions          uuid[] not null default '{}',                     -- profiles named with @ in the body
  search            tsvector generated always as (to_tsvector('simple', coalesce(body, ''))) stored,
  visible_to_client boolean not null default false,                   -- client comments are always true
  created_at        timestamptz not null default now()
);
create index work_item_comments_item on work_item_comments (work_item_id, created_at);

-- Search (Cmd+K): generated tsvector columns above, GIN indexes here.
create index work_items_search on work_items using gin (search);
create index projects_search on projects using gin (search);
create index clients_search on clients using gin (search);
create index quotes_search on quotes using gin (search);
create index invoices_search on invoices using gin (search);
create index work_item_comments_search on work_item_comments using gin (search);

-- A file is either an uploaded copy in Storage or a link to where it already
-- lives on the office server (smb:// or a path), so nothing is stored twice.
-- Links cannot be opened from outside the office or from a client review
-- link; uploads can. A link can later be turned into an upload (kind flips,
-- path is set, link is kept so the server location is still known).
create table work_item_files (
  id           uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references work_items(id) on delete cascade,
  kind         text not null default 'upload' check (kind in ('upload', 'link')),
  path         text unique,             -- object path in the work-files bucket (uploads)
  link         text,                    -- server path or URL (links)
  file_name    text not null,
  content_type text,
  size_bytes   bigint,
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint work_item_files_kind_shape
    check ((kind = 'upload' and path is not null) or (kind = 'link' and link is not null))
);
create index work_item_files_item on work_item_files (work_item_id);

-- ---------- QuickBooks handoff ----------
-- Defined before time_entries/expenses because they reference it.
-- A batch groups unbilled time + expenses and locks them. The QBO push
-- and its columns below are the original plan; see TODO 1 for the open
-- invoicing decision. create_billing_batch() / void_billing_batch() are
-- the only writers of batch_id and is_locked.

create table billing_batches (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete restrict,
  project_id      uuid references projects(id) on delete set null,  -- null = all client work
  period_start    date not null,
  period_end      date not null,
  status          billing_batch_status not null default 'draft',
  -- filled in by the push
  qbo_invoice_id  text,
  qbo_doc_number  text,                 -- QBO's invoice number, for reference
  qbo_pushed_at   timestamptz,
  qbo_error       text,                 -- last failure message
  subtotal_hours  numeric(10,2) not null default 0,
  subtotal_amount numeric(12,2) not null default 0,
  created_by      uuid not null references profiles(id) on delete restrict,
  created_at      timestamptz not null default now(),
  check (period_end >= period_start)
);

create index billing_batches_client on billing_batches (client_id, period_start desc);
create unique index billing_batches_qbo_invoice
  on billing_batches (qbo_invoice_id) where qbo_invoice_id is not null;

-- ---------- Time ----------

create table time_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete restrict,
  project_id    uuid not null references projects(id) on delete restrict,
  task_id       uuid not null references tasks(id) on delete restrict,
  spent_on      date not null,
  started_at    timestamptz,            -- set while a timer runs
  ended_at      timestamptz,
  hours         numeric(6,2) not null default 0,  -- source of truth once stopped
  notes         text,
  is_billable   boolean not null default true,
  rate_snapshot numeric(10,2),          -- rate frozen at save; see resolve_rate()
  is_locked     boolean not null default false,   -- true once claimed by a batch
  batch_id      uuid references billing_batches(id) on delete set null,
  harvest_id    bigint unique,          -- Harvest entry id, set by the import
  work_item_id  uuid references work_items(id) on delete set null,  -- started from a task
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at)
);

create trigger time_entries_rate_snapshot
  before insert or update on time_entries
  for each row execute function public.set_rate_snapshot();

create trigger time_entries_audit
  after insert or update or delete on time_entries
  for each row execute function public.write_audit_log();

-- One running timer per person.
create unique index one_running_timer_per_user
  on time_entries (user_id)
  where ended_at is null and started_at is not null and deleted_at is null;

create index time_entries_spent_on   on time_entries (spent_on);            -- reports over a date range
create index time_entries_user_date    on time_entries (user_id, spent_on desc);
create index time_entries_project_date on time_entries (project_id, spent_on);
create index time_entries_batch        on time_entries (batch_id);
create index time_entries_work_item    on time_entries (work_item_id);

-- ---------- Retainers ----------

create table retainers (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete restrict,
  project_id   uuid references projects(id) on delete set null, -- null = client-wide
  name         text not null,
  basis        retainer_basis not null default 'hours',
  period_start date not null,
  period_end   date not null,
  allotted     numeric(12,2) not null,  -- hours or dollars per basis
  rollover     boolean not null default false,
  rollover_cap numeric(12,2),           -- null = uncapped
  created_at   timestamptz not null default now(),
  check (period_end >= period_start)
);

create index retainers_client_period on retainers (client_id, period_start, period_end);

-- ---------- Expenses ----------

create table expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  is_active  boolean not null default true,
  harvest_id bigint unique                 -- Harvest category id, set by the import
);

create table expenses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete restrict,
  project_id      uuid not null references projects(id) on delete restrict,
  category_id     uuid not null references expense_categories(id) on delete restrict,
  spent_on        date not null,
  amount          numeric(12,2) not null,
  notes           text,
  receipt_path    text,                 -- Supabase Storage object path
  is_billable     boolean not null default true,
  is_reimbursable boolean not null default false,
  is_locked       boolean not null default false,
  batch_id        uuid references billing_batches(id) on delete set null,
  harvest_id      bigint unique,        -- Harvest expense id, set by the import
  created_at      timestamptz not null default now()
);

create trigger expenses_audit
  after insert or update or delete on expenses
  for each row execute function public.write_audit_log();

create index expenses_project_date on expenses (project_id, spent_on);
create index expenses_batch        on expenses (batch_id);

-- ---------- Invoicing ----------
-- Docket owns invoicing (decided 2026-09-02, see TODO 1). An invoice is
-- usually made from a billing batch (lines grouped from its time and
-- expenses) but can also be built by hand. Totals are kept by
-- recalc_invoice() whenever lines, payments, or the tax rate change.
-- The public page /i/<public_token> is the "PDF"; the browser prints it.

create table invoice_settings (
  id                   boolean primary key default true check (id),   -- one row
  company_name         text not null default 'Gigantic Design Co.',
  company_address      text,                 -- printed as typed, line breaks kept
  company_email        text,
  company_phone        text,
  payment_instructions text,                 -- printed on every invoice and reminder
  default_terms_days   int not null default 30,
  default_notes        text,
  default_tax_rate     numeric(5,2) not null default 0,
  next_invoice_number  int not null default 1, -- set to continue Harvest's sequence
  remind_overdue       boolean not null default false,
  remind_every_days    int not null default 7 check (remind_every_days > 0),
  -- Quotes share this row: numbering, how long a quote stays open, terms.
  next_quote_number    int not null default 1,
  quote_valid_days     int not null default 30,
  quote_terms          text,
  -- Edited on /admin/project-settings. Fills projects.server_path for
  -- new projects: {client} {code} {name}.
  project_folder_template text
);
insert into invoice_settings (id) values (true) on conflict do nothing;

create table invoices (
  id               uuid primary key default gen_random_uuid(),
  number           text not null unique,
  client_id        uuid not null references clients(id) on delete restrict,
  batch_id         uuid references billing_batches(id) on delete set null,
  status           invoice_status not null default 'draft',
  subject          text,
  search           tsvector generated always as (to_tsvector('simple', coalesce(number, '') || ' ' || coalesce(subject, ''))) stored,
  notes            text,
  issue_date       date not null default current_date,
  due_date         date not null,
  tax_rate         numeric(5,2) not null default 0,
  subtotal         numeric(12,2) not null default 0,
  tax_amount       numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  paid_amount      numeric(12,2) not null default 0,
  due_amount       numeric(12,2) not null default 0,
  public_token     text not null unique
                   default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  sent_at          timestamptz,
  sent_to          text[],
  last_reminded_at timestamptz,
  paid_at          timestamptz,
  created_by       uuid not null references profiles(id) on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (due_date >= issue_date)
);
create index invoices_client on invoices (client_id, issue_date desc);
create index invoices_status on invoices (status, due_date);
-- A batch has at most one live invoice; a voided one may be redone.
create unique index invoices_batch on invoices (batch_id) where batch_id is not null and status <> 'void';

create table invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  position    int not null default 0,
  kind        text not null default 'service' check (kind in ('service', 'expense', 'other')),
  description text not null,
  quantity    numeric(10,2) not null default 1,
  unit_price  numeric(12,2) not null default 0,
  amount      numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  taxable     boolean not null default false,
  project_id  uuid references projects(id) on delete set null
);
create index invoice_lines_invoice on invoice_lines (invoice_id, position);

create table invoice_payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  paid_on     date not null default current_date,
  amount      numeric(12,2) not null check (amount > 0),
  method      text,                          -- check, ach, card, other
  reference   text,                          -- check number, transaction id
  notes       text,
  created_by  uuid not null references profiles(id) on delete restrict,
  created_at  timestamptz not null default now()
);
create index invoice_payments_invoice on invoice_payments (invoice_id, paid_on);

-- ---------- Quoting (step 12) ----------
-- Replaces PandaDoc. A quote is accepted from /q/<public_token> (or by an
-- admin) -> accept_quote() makes the project, its hour total becomes
-- budget_hours, its subtotal budget_amount, and each line's task type is
-- assigned to the project at the quoted rate.

create table quotes (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete restrict,
  project_id     uuid references projects(id) on delete set null, -- set on acceptance
  number         text not null unique,     -- Q-2026-014, from invoice_settings.next_quote_number
  title          text not null,
  search         tsvector generated always as (to_tsvector('simple', coalesce(number, '') || ' ' || coalesce(title, ''))) stored,
  status         quote_status not null default 'draft',
  intro          text,                     -- scope narrative
  terms          text,
  valid_until    date,
  subtotal       numeric(12,2) not null default 0,  -- kept by quote_recalc()
  public_token   text not null unique
                 default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  sent_at        timestamptz,
  accepted_at    timestamptz,
  accepted_by    text,                     -- client name typed at accept
  accepted_email text,
  declined_at    timestamptz,
  declined_by    text,
  decline_reason text,
  created_by     uuid not null references profiles(id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index quotes_client_status on quotes (client_id, status);

-- Page templates: what a kind of page usually takes. A sitemap page
-- picks one and inherits its hours (or overrides them), and "Price the
-- sitemap" turns the pages into scope lines per template. On accept,
-- every page becomes a task on the new project.
create table page_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  hours       numeric(8,2) not null default 0,
  rate        numeric(10,2),
  task_id     uuid references tasks(id) on delete set null,
  description text,
  color       text not null default 'neutral',
  position    int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
insert into page_templates (name, hours, description, color, position) values
  ('Home',         8, 'The front page: hero, sections, calls to action.',            'primary', 1),
  ('Landing',      6, 'A campaign or product page with its own layout.',              'info',    2),
  ('Interior',     3, 'A standard content page on the site template.',                'neutral', 3),
  ('Listing',      4, 'A page that lists things: services, team, locations, posts.', 'success', 4),
  ('Detail',       3, 'One item from a listing: a service, a person, a location.',    'success', 5),
  ('Form',         3, 'Contact, application, or request form with its handling.',     'warning', 6),
  ('Blog post',    1, 'A post or article on the blog template.',                      'neutral', 7)
on conflict (name) do nothing;

create table quote_line_items (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references quotes(id) on delete cascade,
  task_id     uuid references tasks(id) on delete set null,  -- maps to tracked task
  sort_order  int not null default 0,
  description text not null,
  hours       numeric(8,2),
  rate        numeric(10,2),
  amount      numeric(12,2) not null default 0,  -- hours * rate, or flat
  details     jsonb,                              -- the estimator job behind a signage line
  template_id uuid references page_templates(id) on delete set null,  -- made by "Price the sitemap"
  created_at  timestamptz not null default now()
);

create index quote_line_items_quote on quote_line_items (quote_id, sort_order);
create trigger quote_line_items_amount before insert or update on quote_line_items
  for each row execute function public.quote_line_amount();
create trigger quote_line_items_recalc after insert or update or delete on quote_line_items
  for each row execute function public.quote_lines_changed();

-- Sitemap / page inventory (the Octopus.do part).
-- Self-referencing tree. A node can roll up into a quote line item
-- so page counts price themselves.
create table quote_sitemap_nodes (
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null references quotes(id) on delete cascade,
  parent_id    uuid references quote_sitemap_nodes(id) on delete cascade,
  line_item_id uuid references quote_line_items(id) on delete set null,
  sort_order   int not null default 0,
  title        text not null,
  path         text,                    -- /about/team
  template     text,                    -- template name, for dedupe
  notes        text,
  template_id  uuid references page_templates(id) on delete set null,  -- the page's kind
  hours        numeric(8,2),                                          -- override; null = the template's
  created_at   timestamptz not null default now()
);

create index quote_sitemap_quote on quote_sitemap_nodes (quote_id, parent_id, sort_order);

-- ---------- Harvest archive ----------
-- Pre-cutover history, rolled up to month. Individual entries live
-- as raw CSVs in Supabase Storage; this table is for reporting only.
-- No hard FKs to live tables: names are frozen as they were in Harvest.

create table harvest_archive_monthly (
  id             uuid primary key default gen_random_uuid(),
  period_month   date not null,         -- first of month
  client_name    text not null,
  project_name   text not null,
  project_code   text,
  user_name      text not null,
  task_name      text,
  hours          numeric(10,2) not null default 0,
  billable_hours numeric(10,2) not null default 0,
  amount         numeric(12,2) not null default 0,
  -- soft links: populated where a match was found at import, else null
  client_id      uuid references clients(id) on delete set null,
  project_id     uuid references projects(id) on delete set null,
  user_id        uuid references profiles(id) on delete set null,
  -- nulls not distinct so a null task_name can't create duplicate rows
  -- and the import can upsert on this key.
  unique nulls not distinct (period_month, client_name, project_name, user_name, task_name)
);

create index harvest_archive_period on harvest_archive_monthly (period_month);
create index harvest_archive_client on harvest_archive_monthly (client_name);

-- Harvest invoice history (header plus line items as JSON), imported by
-- the invoices mode of the Harvest import so AR history survives the
-- cancellation. Admin only. Needs a token that can see invoices.
create table harvest_invoices (
  id                 uuid primary key default gen_random_uuid(),
  harvest_id         bigint not null unique,
  number             text not null,
  client_name        text not null,
  client_id          uuid references clients(id) on delete set null,
  subject            text,
  state              text not null check (state in ('draft', 'open', 'paid', 'closed')),
  issue_date         date not null,
  due_date           date,
  period_start       date,
  period_end         date,
  amount             numeric(12,2) not null,
  due_amount         numeric(12,2) not null,
  tax_amount         numeric(12,2),
  discount_amount    numeric(12,2),
  currency           text,
  sent_at            timestamptz,
  paid_at            timestamptz,
  paid_date          date,
  closed_at          timestamptz,
  line_items         jsonb not null default '[]'::jsonb,
  harvest_updated_at timestamptz not null
);
create index harvest_invoices_client on harvest_invoices (client_id, issue_date desc);
create index harvest_invoices_state  on harvest_invoices (state, due_date);

-- ---------- Time off ----------
-- No approval workflow: people log it, it reduces capacity.

create table time_off (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references profiles(id) on delete cascade,  -- null = company-wide holiday
  kind          time_off_kind not null default 'pto',
  starts_on     date not null,
  ends_on       date not null,
  hours_per_day numeric(4,2) not null default 8,   -- 4 = half day
  notes         text,
  created_at    timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index time_off_user_range on time_off (user_id, starts_on, ends_on);

-- ---------- Capacity ----------
-- Availability = weekly hours - time off - meetings.
-- Booked hours come from work_items due that week.

create table availability (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  hours_per_week numeric(5,2) not null default 30,   -- a billable week is 30, not 40
  effective_from date not null,
  effective_to   date,                  -- null = current
  unique (user_id, effective_from)
);

-- Cached calendar busy time, so meetings subtract from capacity.
create table calendar_busy (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  hours     numeric(5,2) not null,
  source    text not null default 'google',
  synced_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index calendar_busy_user_range on calendar_busy (user_id, starts_at);

-- ---------- Reminders ----------
-- Driven by a scheduled edge function; email out via Resend.

create table reminder_log (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references profiles(id) on delete cascade,
  kind     reminder_kind not null,
  for_date date not null,
  sent_at  timestamptz not null default now(),
  unique (user_id, kind, for_date)      -- send once per person per day
);

-- ---------- Notifications ----------
-- One row per person per thing that happened: assigned, mentioned, a
-- comment or status change on your task, due soon, client decisions and
-- comments, quote and invoice outcomes, timer and missing-time nudges.
-- Rows are written by triggers through notify(); the bell reads them
-- live (Realtime); run_notification_emails() emails the pending ones
-- per each person's choices. Kinds: assigned, mentioned, comment,
-- status, due, client_comment, client_decision, quote_decision,
-- invoice_paid, timer, missing_time.
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text,
  link         text,
  actor_id     uuid references profiles(id) on delete set null,
  work_item_id uuid references work_items(id) on delete cascade,
  read_at      timestamptz,
  email        text not null default 'none' check (email in ('none', 'pending', 'sent')),
  created_at   timestamptz not null default now()
);
create index notifications_user on notifications (user_id, created_at desc);
create index notifications_pending on notifications (email) where email = 'pending';
alter publication supabase_realtime add table notifications;

-- Per person, per kind: show it in the bell, and email never, as it
-- happens, or in a daily digest. Missing rows mean the defaults
-- (bell on; email instant except comment, status, due).
create table notification_prefs (
  user_id uuid not null references profiles(id) on delete cascade,
  kind    text not null,
  in_app  boolean not null default true,
  email   text not null default 'instant' check (email in ('off', 'instant', 'daily')),
  primary key (user_id, kind)
);

-- ---------- Google Calendar ----------
-- Each person can connect their Google Calendar (read only) from
-- /account; busy time for the next eight weeks lands in calendar_busy,
-- which capacity_weekly subtracts. The refresh token lives here and is
-- only ever read by the server with the service role: the browser can
-- select the other columns of its own row (and admins everyone's)
-- through the calendar_connections view. Nightly sync is a Vercel cron
-- (vercel.json) hitting /api/google/sync-all with the CRON_SECRET.
create table google_tokens (
  user_id        uuid primary key references profiles(id) on delete cascade,
  google_email   text not null,
  refresh_token  text not null,
  connected_at   timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error     text
);
create view calendar_connections with (security_invoker = true) as
select g.user_id, g.google_email, g.connected_at, g.last_synced_at, g.last_error
from google_tokens g;

-- ---------- Signage estimator ----------
-- Materials from estimator.giganticdesign.com: a roll or sheet with a
-- cost, so cost per square inch is cost / (width x length). markup_pct
-- is the old tool's number (925 = 9.25x). Pricing rules live in
-- shared/estimator.ts; estimator_settings holds the knobs. Edited on
-- /admin/estimator; the calculator is /estimator.
create table estimator_materials (
  id         uuid primary key default gen_random_uuid(),
  legacy_id  int unique,                  -- entry id in the old tool
  name       text not null,
  types      text[] not null,             -- Print Vinyl, Cut Vinyl, Overlaminate, Transfer Tape, Banner Tape, Substrate, Mounting Tape
  width_in   numeric(8,2) not null,
  length_in  numeric(8,2) not null,
  cost       numeric(10,2) not null,
  markup_pct int not null default 925,
  printable  boolean not null default false,
  is_active  boolean not null default true,
  position   int not null default 0
);
create table estimator_settings (
  id                   boolean primary key default true check (id),
  ink_sq_in_cost       numeric(10,7) not null default 0.0016099,  -- based on a $160.99 cartridge
  default_markup       numeric(6,2) not null default 9.25,
  cut_vinyl_markup     numeric(6,2) not null default 3.5,
  substrate_markup     numeric(6,2) not null default 2.5,
  mounting_tape_markup numeric(6,2) not null default 1.25
);
insert into estimator_settings (id) values (true) on conflict do nothing;
insert into estimator_materials (legacy_id, name, types, width_in, length_in, cost, markup_pct, printable, position) values
(116, 'Alumalite® 10mm White (Double Thick AluPanels)', array['Substrate'], 48, 96, 214.86, 925, false, 0),
(106, 'ALUPANEL / White / ALPHAPANEL - 4 ft x 8 ft x 3 mm', array['Substrate'], 96, 48, 50.51, 925, false, 1),
(107, 'ALUPANEL / White / ALPHAPANEL - 4 ft x 8 ft x 6 mm', array['Substrate'], 96, 48, 90.09, 925, false, 2),
(33, 'Banner Stand / White / Luster Polyester / Alpha Banner Film - 10 mil', array['Print Vinyl'], 36, 1200, 174.56, 925, true, 3),
(82, 'Banners / White / Matte  / Lumina Matte White Mesh Banner - 9 oz', array['Print Vinyl'], 54, 1800, 204.37, 925, true, 4),
(58, 'Beige / Gloss / Lumina® 2100/2200 Cast Vinyl', array['Cut Vinyl'], 24, 360, 92.44, 925, false, 5),
(111, 'Black / Gloss / ALPHA Cast Vinyl 2163 Black', array['Cut Vinyl'], 24, 1800, 354.89, 925, false, 6),
(83, 'Black / Matte / ALPHA Vinyl 1040', array['Cut Vinyl'], 24, 1800, 98.5, 925, false, 7),
(67, 'Black / Matte / Heat Press / Siser EasyWeed - 3.5 Mil', array['Cut Vinyl'], 15, 180, 38, 925, false, 8),
(108, 'Cascade Blue / Cast Cut Vinyl / Avery Dennison® SC950', array['Cut Vinyl'], 24, 360, 76.04, 925, false, 9),
(48, 'Chrome Yellow / Gloss / Gerber 220 High Performance 220-145', array['Cut Vinyl'], 15, 1800, 271.37, 925, false, 10),
(72, 'Corrugated Plastic / 6 mm / White', array['Substrate'], 96, 48, 31.33, 925, false, 11),
(50, 'Dark Gray / Gloss / Oracal® 751C High Performance Cast Vinyl Film', array['Cut Vinyl'], 24, 1800, 348.12, 925, false, 12),
(63, 'Fire Red / Gloss / Avery Dennison® SC950', array['Cut Vinyl'], 24, 1800, 358.55, 925, false, 13),
(110, 'Foam Board', array['Substrate'], 24, 36, 12.84, 925, false, 14),
(115, 'GATORFOAM', array['Substrate'], 48, 96, 84.19, 925, false, 15),
(113, 'Geranium Red / Gloss / ORACAL 951 Premium Cast Vinyl', array['Cut Vinyl'], 24, 1800, 441.51, 925, false, 16),
(90, 'Gray / Cast Cut Vinyl / ORACAL® 751C High Performance Cast Vinyl', array['Cut Vinyl'], 24, 360, 80.34, 925, false, 17),
(23, 'Hanging Banner / White / Gloss / Alpha Premium Frontlit Banner - 13oz', array['Print Vinyl'], 54, 1440, 155.11, 925, true, 18),
(6, 'Hanging Banner / White / Matte / Alpha Premium Frontlit Banner - 13oz', array['Print Vinyl'], 54, 1440, 155.11, 925, true, 19),
(47, 'Heat Press / White / Semi-Gloss / Siser Colorprint Solvent Easy Printable HTV', array['Print Vinyl'], 20, 360, 76.64, 925, true, 20),
(68, 'Heat Press / White / Semi-Gloss / Siser EasyWeed - 3.5 Mil', array['Cut Vinyl'], 15, 180, 38, 925, false, 21),
(89, 'Komatsu Gray / Cast Cut Vinyl / ORACAL® 751C High Performance Cast Vinyl', array['Cut Vinyl'], 24, 360, 80.34, 925, false, 22),
(3, 'Laminate / Clear / Gloss / Arlon 3420 Premium Calendered Overlam - 3 mil', array['Overlaminate'], 54, 1800, 256.66, 925, false, 23),
(19, 'Laminate / Clear / Matte / Arlon 3220 Premium Calendered Overlam - 2 mil', array['Overlaminate'], 54, 1800, 492.43, 925, false, 24),
(20, 'Laminate / Clear / Matte / Arlon 3420 Premium Calendered Overlam - 3 mil', array['Overlaminate'], 54, 1800, 256.66, 500, false, 25),
(30, 'Laminate / Clear / Textured / MacTac PermaFlex Luster Textured Floor Overlam - 5 mil', array['Overlaminate'], 54, 1200, 298.31, 100, false, 26),
(96, 'Laminate / Gloss / Arlon 3220 Premium Cast Overlaminate - 2 mil', array['Overlaminate'], 54, 900, 296.69, 925, false, 27),
(94, 'Laminate / Matte / PERMACOLOR RAYZOR Matte Laminate - 1.5 mil', array['Overlaminate'], 54, 1800, 417, 925, false, 28),
(114, 'Orange / Gloss / Avery Dennison® SC950 Bright Orange', array['Cut Vinyl'], 24, 360, 77.94, 925, false, 29),
(71, 'Orange / Satin / Avery Dennison SW900 Wrap Film', array['Cut Vinyl'], 60, 900, 739.1, 925, false, 30),
(117, 'Outdoor Signage / Arlon OMNI Cast Wrap Gloss White Vinyl', array['Print Vinyl'], 54, 1800, 769.07, 925, true, 31),
(104, 'Peacock Red / Cast Cut Vinyl / Arlon 2100 Cast Vinyl 223', array['Cut Vinyl'], 24, 360, 82.85, 925, false, 32),
(15, 'Poster Paper / White / Matte / SIHL - Pacifica II Photo Paper 180 - 7 Mil (30 in)', array['Print Vinyl'], 30, 1800, 112.45, 925, true, 33),
(86, 'Poster Paper / White / Matte / SIHL - Pacifica II Photo Paper 180 - 7 Mil (36 in)', array['Print Vinyl'], 36, 1800, 161, 925, true, 34),
(57, 'Red / Gloss / Avery Dennison SW900 Wrap Film', array['Cut Vinyl'], 60, 900, 615.91, 925, false, 35),
(103, 'Rough Surface (Cinder Block) / White / Gloss / IMAGin RoughRAP Cast Vinyl', array['Print Vinyl'], 54, 1800, 477, 925, true, 36),
(55, 'Rough Surface / White / Satin / Arlon DPF 8200 High Tack Calendared Film - 3.5mil', array['Print Vinyl'], 54, 1800, 482.6, 925, true, 37),
(70, 'Sintra® / 10mm / Black / Masked PVC', array['Substrate'], 48, 96, 95.83, 925, false, 38),
(41, 'Sintra® / 12mm / Black / Masked PVC', array['Substrate'], 48, 96, 105.72, 925, false, 39),
(43, 'Sintra® / 3mm / Black / Masked PVC', array['Substrate'], 48, 96, 51.5, 925, false, 40),
(42, 'Sintra® / 6mm / Black / Masked PVC', array['Substrate'], 48, 96, 97.2, 925, false, 41),
(16, 'Smooth Surface / Frosted / MacTac Frosted Window Film - 3.1 mil', array['Cut Vinyl'], 54, 900, 329.87, 925, false, 42),
(64, 'Smooth Surface / Frosted / MacTac Frosted Window Film - 3.1 mil', array['Print Vinyl'], 54, 900, 370.35, 925, true, 43),
(65, 'Smooth Surface / White / Gloss / Post-it Dry Erase Whiteboard Film', array['Cut Vinyl'], 48, 600, 505.78, 925, false, 44),
(44, 'Smooth Surface / White / Matte / Arlon DPF 4200 Permanent Wall Film - 6 mil', array['Print Vinyl'], 54, 1800, 377.46, 925, true, 45),
(109, 'Stickers / MacTac / Crack-N-Peel / Permanent Adhesive - 3.2 mil', array['Print Vinyl'], 54, 1800, 207, 925, true, 46),
(100, 'Stickers / Matte White / Permanent Adhesive - 3.2 mil (CINC)', array['Print Vinyl'], 54, 900, 179, 925, true, 47),
(28, 'Stickers / Reflective / Gloss / Alpha Vinyl 8022 - 5.9 mi', array['Cut Vinyl','Print Vinyl'], 24, 360, 138.53, 925, true, 48),
(54, 'Stickers / White / Gloss / Alpha Calendared Permanent Vinyl - 6 mil', array['Print Vinyl'], 54, 1800, 260.83, 925, true, 49),
(9, 'Stickers / White / Matte / Alpha Calendared Permanent Vinyl - 6 mil', array['Print Vinyl'], 54, 1800, 221.97, 925, true, 50),
(8, 'Substrate / White / Matte / DigiMag Magnetic', array['Substrate'], 24, 300, 74.27, 925, false, 51),
(14, 'Tape / 1in / Banner Tape', array['Banner Tape'], 1, 2592, 13.47, 925, false, 52),
(29, 'Tape / 24in / Alpha Transfer Tape', array['Transfer Tape'], 24, 3600, 83.75, 925, false, 53),
(4, 'Tape / 48in / Alpha Transfer Tape', array['Transfer Tape'], 48, 3600, 151.99, 925, false, 54),
(102, 'Tape / 54in / Alpha Transfer Tape', array['Transfer Tape'], 54, 3600, 188.48, 925, false, 55),
(56, 'Tape / High Tack Indoor / 1/2in / 3M™ 5952 VHB Tape', array['Cut Vinyl','Mounting Tape'], 0.5, 1296, 72.8, 125, false, 56),
(66, 'Tape / High Tack Indoor / 1in / 3M™ 5952 VHB Tape', array['Mounting Tape'], 1, 1296, 122.06, 125, false, 57),
(21, 'Tape / High Tack Indoor / 3/4in / 3M™ 5952 VHB Tape', array['Mounting Tape'], 0.75, 1296, 97.35, 250, false, 58),
(22, 'Tape / Low Tack Indoor / 1/2 in / 3M™ 4016 VHB Foam Tape', array['Mounting Tape'], 0.5, 1296, 46.46, 925, false, 59),
(118, 'Translucent / Gloss White / Arlon DPF 6500 Cast Vinyl', array['Print Vinyl'], 54, 900, 458.19, 925, true, 60),
(32, 'Vehicle Wrap Film / White / Gloss / Arlon 4600GLX High Performance Calendared Vinyl - 3.2 mil', array['Print Vinyl'], 54, 1800, 347.73, 925, true, 61),
(95, 'Vehicle Wrap Film / White / Gloss / Arlon SLX + Cast Wrap Gloss White - 2mil', array['Print Vinyl'], 54, 1800, 690.06, 925, true, 62),
(84, 'Velcro Hook Strips - Black ½ in', array['Mounting Tape'], 0.5, 900, 27, 925, false, 63),
(85, 'Velcro Loop Strips - Black ½ in', array['Mounting Tape','Banner Tape'], 0.5, 900, 54, 925, false, 64),
(51, 'Walls / Smooth Surface / Gloss White / 3M Scotchcal Graphic Film Non-Cast - 3.2 mil', array['Print Vinyl'], 54, 1800, 268.48, 925, true, 65),
(52, 'Walls / Smooth Surface / Matte White / 3M Scotchcal Graphic Film Non-Cast - 3.2 mil', array['Print Vinyl'], 54, 1800, 268.48, 925, true, 66),
(112, 'White / Gloss / ALPHA Cast Vinyl 2160 White', array['Cut Vinyl'], 24, 1800, 354.89, 925, false, 67),
(92, 'White / Matte / Lumina® 2100/2200 Cast Vinyl', array['Cut Vinyl'], 24, 1800, 360.43, 925, false, 68),
(119, 'White Acrylic Sheet', array['Substrate'], 51, 100, 134.37, 925, false, 69),
(97, 'Window Perffed / SiHL 3214 Value Line 60/40 Window Perf Film, 6.5 mil (DBQ Buses)', array['Print Vinyl'], 54, 1968, 432.0, 925, true, 70);

-- ---------- AI assistant ----------
-- Every call to the model: who, which job, what went in and came out,
-- tokens, and what was saved. Written by the server with the service
-- role (server/utils/ai.ts); people read their own rows, admins
-- everyone's. The daily cap counts today's rows per person. The model
-- only ever sees data through the caller's own client, so RLS decides.
create table ai_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  job           text not null,            -- chat, parse_time, draft_*, quote_draft, digest
  model         text not null,
  prompt        text,
  response      text,
  input_tokens  int,
  output_tokens int,
  saved         jsonb,                    -- what the person accepted, if anything
  created_at    timestamptz not null default now()
);
create index ai_events_user_day on ai_events (user_id, created_at desc);

-- ---------- Audit trail ----------
-- Who changed what, on time entries and expenses.
-- Append-only: nobody can update or delete rows here.

create table audit_log (
  id             bigserial primary key,
  table_name     text not null,
  record_id      uuid not null,
  action         audit_action not null,
  changed_by     uuid references profiles(id) on delete set null,
  changed_at     timestamptz not null default now(),
  old_data       jsonb,
  new_data       jsonb,
  changed_fields text[]                 -- only the keys that actually differ
);

create index audit_log_record on audit_log (table_name, record_id, changed_at desc);
create index audit_log_actor  on audit_log (changed_by, changed_at desc);

-- ---------- Saved reports ----------
-- filters is jsonb so the UI owns the shape rather than the schema
-- needing a migration per new filter.

create table saved_reports (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  base_view  text not null,             -- 'time_detail', 'time_monthly_all', etc.
  filters    jsonb not null default '{}'::jsonb,
  group_by   text[],
  owner_id   uuid not null references profiles(id) on delete cascade,
  is_shared  boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. VIEWS
-- All views are security_invoker so they run under the caller's RLS.
-- Without that, a view owned by postgres would show staff every
-- user's time entries.
-- ============================================================

-- Every hour with its frozen rate resolved to money. Excludes running timers.
create view time_detail with (security_invoker = true) as
select
  te.id,
  te.spent_on,
  date_trunc('month', te.spent_on)::date as period_month,
  c.id   as client_id,
  c.name as client_name,
  p.id   as project_id,
  p.name as project_name,
  p.code as project_code,
  t.name as task_name,
  pr.id  as user_id,
  pr.full_name as user_name,
  te.hours,
  te.is_billable,
  case when te.is_billable then te.hours else 0 end as billable_hours,
  -- Scalar subquery: the permission check runs once per query, not per row.
  case when not (select public.has_permission('see_money')) then null
       when te.is_billable then te.hours * coalesce(te.rate_snapshot, 0) else 0 end as amount,
  te.notes,
  te.is_locked,
  te.batch_id,
  te.status
from time_entries te
join projects p  on p.id = te.project_id
join clients  c  on c.id = p.client_id
join tasks    t  on t.id = te.task_id
join profiles pr on pr.id = te.user_id
where te.ended_at is not null or te.started_at is null;

-- Live + archived history in one shape, so year-over-year reports work
-- across the Harvest cutover.
create view time_monthly_all with (security_invoker = true) as
select period_month, client_name, project_name, user_name, task_name,
       sum(hours) as hours, sum(billable_hours) as billable_hours, sum(amount) as amount,
       'live'::text as source
from time_detail
group by 1,2,3,4,5
union all
select period_month, client_name, project_name, user_name, task_name,
       hours, billable_hours, amount,
       'harvest_archive'::text as source
from harvest_archive_monthly;

-- Budget burn per project.
-- Admin-only. Runs as the caller, so staff would see only their own
-- hours. The app reads project_budget() instead.
create view project_budget_status with (security_invoker = true) as
select
  p.id as project_id,
  p.name as project_name,
  c.name as client_name,
  p.billing_method,
  p.budget_hours,
  p.budget_amount,
  coalesce(sum(td.hours), 0) as hours_used,
  coalesce(sum(td.amount), 0) as amount_used,
  case when p.budget_hours > 0
       then round(coalesce(sum(td.hours), 0) / p.budget_hours * 100, 1)
  end as pct_hours_used
from projects p
join clients c on c.id = p.client_id
left join time_detail td on td.project_id = p.id
group by p.id, p.name, c.name, p.billing_method, p.budget_hours, p.budget_amount;

-- Retainer burn-down = sum of billable time in the window, against allotted.
-- Admin-only, same caveat. The app reads retainer_status() instead,
-- which also handles rollover.
create view retainer_burndown with (security_invoker = true) as
select
  r.id as retainer_id,
  r.client_id,
  r.name,
  r.period_start,
  r.period_end,
  r.basis,
  r.allotted,
  coalesce(sum(
    case when r.basis = 'hours' then te.hours
         else te.hours * coalesce(te.rate_snapshot, 0)
    end
  ), 0) as used,
  r.allotted - coalesce(sum(
    case when r.basis = 'hours' then te.hours
         else te.hours * coalesce(te.rate_snapshot, 0)
    end
  ), 0) as remaining
from retainers r
left join projects p
  on p.client_id = r.client_id
 and (r.project_id is null or p.id = r.project_id)
left join time_entries te
  on te.project_id = p.id
 and te.is_billable
 and te.spent_on between r.period_start and r.period_end
group by r.id;

-- Capacity: available vs booked vs actually logged, by person by week.
create view capacity_weekly with (security_invoker = true) as
select
  pr.id as user_id,
  pr.full_name as user_name,
  w.week_start,
  coalesce(av.hours_per_week, 30) as base_hours,
  -- Weekdays only: a Monday-to-Friday week off is 5 x hours_per_day.
  coalesce((
    select sum(t.hours_per_day * (
      select count(*)
      from generate_series(greatest(t.starts_on, w.week_start)::timestamp,
                           least(t.ends_on, w.week_start + 6)::timestamp, interval '1 day') d
      where extract(isodow from d) < 6))
    from time_off t
    where (t.user_id = pr.id or t.user_id is null)
      and t.starts_on <= w.week_start + 6
      and t.ends_on   >= w.week_start
  ), 0) as time_off_hours,
  coalesce((
    select sum(cb.hours) from calendar_busy cb
    where cb.user_id = pr.id
      and cb.starts_at >= w.week_start
      and cb.starts_at <  w.week_start + 7
  ), 0) as meeting_hours,
  -- Estimates split evenly across a task's assignees; done and paused
  -- statuses do not book time.
  coalesce((
    select sum(coalesce(wi.estimate_hours, 0)
               / greatest((select count(*) from work_item_assignees a2 where a2.work_item_id = wi.id), 1))
    from work_items wi
    join work_item_assignees a on a.work_item_id = wi.id
    join work_statuses s on s.key = wi.status
    where a.user_id = pr.id
      and not s.is_done and not s.is_paused
      and wi.due_on >= w.week_start
      and wi.due_on <  w.week_start + 7
  ), 0) as booked_hours,
  coalesce((
    select count(*)
    from work_items wi
    join work_item_assignees a on a.work_item_id = wi.id
    join work_statuses s on s.key = wi.status
    where a.user_id = pr.id
      and not s.is_done and not s.is_paused
      and wi.due_on >= w.week_start
      and wi.due_on <  w.week_start + 7
  ), 0) as booked_tasks,
  coalesce((
    select sum(td.hours) from time_detail td
    where td.user_id = pr.id
      and td.spent_on >= w.week_start
      and td.spent_on <  w.week_start + 7
  ), 0) as logged_hours,
  -- Quoted but not yet won: scope lines on draft or sent quotes that name
  -- this person and this week. Gone once the quote is decided, so it is
  -- never counted twice against the tasks acceptance creates.
  coalesce((
    select sum(l.hours) from quote_line_items l
    join quotes qu on qu.id = l.quote_id
    where l.assignee_id = pr.id
      and l.target_week = w.week_start
      and qu.status in ('draft', 'sent')
  ), 0) as forecast_hours
from profiles pr
cross join (
  select generate_series(
    date_trunc('week', now() - interval '8 weeks')::date,
    date_trunc('week', now() + interval '12 weeks')::date,
    interval '1 week'
  )::date as week_start
) w
left join availability av
  on av.user_id = pr.id
 and av.effective_from <= w.week_start
 and (av.effective_to is null or av.effective_to >= w.week_start)
where pr.is_active;

-- Everything billable and not yet claimed by a batch.
-- Locked with no batch means billed before the cutover (Harvest import).
-- Only approved time can be billed (Phase 4, item 11).
create view unbilled_time with (security_invoker = true) as
select *
from time_detail
where is_billable
  and batch_id is null
  and not is_locked
  and status = 'approved';

create view unbilled_expenses with (security_invoker = true) as
select e.*, p.name as project_name, c.name as client_name, c.id as client_id
from expenses e
join projects p on p.id = e.project_id
join clients  c on c.id = p.client_id
where e.is_billable
  and e.batch_id is null
  and not e.is_locked;

-- One row per year of the Harvest archive, for the import page.
create view harvest_archive_yearly with (security_invoker = true) as
select extract(year from period_month)::int as year,
       count(*)::int      as row_count,
       sum(hours)         as hours,
       sum(billable_hours) as billable_hours,
       sum(amount)        as amount,
       min(period_month)  as first_month,
       max(period_month)  as last_month
from harvest_archive_monthly
group by 1;

-- ---------- Aggregates the app reads ----------
-- The views above run as the caller, so a staff member would see budget
-- burn and retainer use counting only their own hours. These are security
-- definer, return totals only, count everyone's time, and include the
-- Harvest archive where it is linked to a Docket client or project.

-- Lifetime burn for one project. Running timers are left out.
create or replace function public.project_budget(p_project_id uuid)
returns table (hours_used numeric, billable_hours numeric, amount_used numeric)
language sql stable security definer
set search_path = ''
as $$
  with live as (
    select coalesce(sum(te.hours), 0) as hours,
           coalesce(sum(case when te.is_billable then te.hours else 0 end), 0) as billable_hours,
           coalesce(sum(case when te.is_billable then te.hours * coalesce(te.rate_snapshot, 0) else 0 end), 0) as amount
    from public.time_entries te
    where te.project_id = p_project_id
      and te.deleted_at is null
      and (te.ended_at is not null or te.started_at is null)
  ), arch as (
    select coalesce(sum(a.hours), 0) as hours,
           coalesce(sum(a.billable_hours), 0) as billable_hours,
           coalesce(sum(a.amount), 0) as amount
    from public.harvest_archive_monthly a
    where a.project_id = p_project_id
  )
  select live.hours + arch.hours, live.billable_hours + arch.billable_hours,
         case when public.has_permission('see_money') then live.amount + arch.amount end
  from live, arch;
$$;

-- Same numbers for every project at once, for list pages.
create or replace function public.project_budgets()
returns table (project_id uuid, hours_used numeric, billable_hours numeric, amount_used numeric)
language sql stable security definer
set search_path = ''
as $$
  with live as (
    select te.project_id,
           sum(te.hours) as hours,
           sum(case when te.is_billable then te.hours else 0 end) as billable_hours,
           sum(case when te.is_billable then te.hours * coalesce(te.rate_snapshot, 0) else 0 end) as amount
    from public.time_entries te
    where te.deleted_at is null and (te.ended_at is not null or te.started_at is null)
    group by te.project_id
  ), arch as (
    select a.project_id, sum(a.hours) as hours, sum(a.billable_hours) as billable_hours, sum(a.amount) as amount
    from public.harvest_archive_monthly a
    where a.project_id is not null
    group by a.project_id
  )
  select p.id,
         coalesce(live.hours, 0) + coalesce(arch.hours, 0),
         coalesce(live.billable_hours, 0) + coalesce(arch.billable_hours, 0),
         case when public.has_permission('see_money') then coalesce(live.amount, 0) + coalesce(arch.amount, 0) end
  from public.projects p
  left join live on live.project_id = p.id
  left join arch on arch.project_id = p.id;
$$;

-- Every retainer with use and rollover worked out. Periods chain when they
-- share client, project, and name and one starts the day after the previous
-- ends. A period's leftover carries into the next when the earlier period
-- has rollover on, capped by its rollover_cap (null = uncapped). Archive
-- months count when their first day falls inside the period.
create or replace function public.retainer_status()
returns table (
  retainer_id uuid, client_id uuid, project_id uuid, name text,
  basis public.retainer_basis, period_start date, period_end date,
  allotted numeric, rollover boolean, rollover_cap numeric,
  carried_in numeric, used numeric, available numeric, remaining numeric
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  r record;
  prev_chain text := null;
  prev_end date := null;
  prev_leftover numeric := 0;
  v_client uuid := case when public.is_client() then public.my_client_id() end;  -- clients: own rows only
begin
  for r in
    select x.id, x.client_id, x.project_id, x.name, x.basis, x.period_start, x.period_end,
           x.allotted, x.rollover, x.rollover_cap,
           x.client_id::text || '|' || coalesce(x.project_id::text, '') || '|' || lower(x.name) as chain,
           coalesce((
             select sum(case when x.basis = 'hours' then te.hours else te.hours * coalesce(te.rate_snapshot, 0) end)
             from public.time_entries te
             join public.projects p on p.id = te.project_id
             where p.client_id = x.client_id
               and te.deleted_at is null
               and (x.project_id is null or p.id = x.project_id)
               and te.is_billable
               and te.spent_on between x.period_start and x.period_end
               and (te.ended_at is not null or te.started_at is null)
           ), 0)
           + coalesce((
             select sum(case when x.basis = 'hours' then a.billable_hours else a.amount end)
             from public.harvest_archive_monthly a
             where a.client_id = x.client_id
               and (x.project_id is null or a.project_id = x.project_id)
               and a.period_month between x.period_start and x.period_end
           ), 0) as used_total
    from public.retainers x
    order by chain, x.period_start
  loop
    if r.chain is distinct from prev_chain or prev_end is null or r.period_start <> prev_end + 1 then
      prev_leftover := 0;
    end if;
    retainer_id := r.id;
    client_id := r.client_id;
    project_id := r.project_id;
    name := r.name;
    basis := r.basis;
    period_start := r.period_start;
    period_end := r.period_end;
    allotted := r.allotted;
    rollover := r.rollover;
    rollover_cap := r.rollover_cap;
    carried_in := prev_leftover;
    used := r.used_total;
    available := r.allotted + carried_in;
    remaining := available - used;
    if v_client is null or r.client_id = v_client then
      return next;
    end if;
    prev_chain := r.chain;
    prev_end := r.period_end;
    prev_leftover := case when r.rollover
                          then least(greatest(remaining, 0), coalesce(r.rollover_cap, remaining))
                          else 0 end;
  end loop;
end;
$$;

-- Point archive rows at Docket clients, projects, and people that exist
-- now (the live Harvest import creates them after the archive was loaded).
-- Runs as the caller; only admins can update the archive.
create or replace function public.relink_harvest_archive()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer := 0;
  m integer;
begin
  update public.harvest_archive_monthly a set client_id = c.id
    from public.clients c
   where a.client_id is null and lower(a.client_name) = lower(c.name);
  get diagnostics m = row_count; n := n + m;
  update public.harvest_archive_monthly a set project_id = p.id
    from public.projects p join public.clients c on c.id = p.client_id
   where a.project_id is null
     and lower(a.project_name) = lower(p.name)
     and lower(a.client_name) = lower(c.name);
  get diagnostics m = row_count; n := n + m;
  update public.harvest_archive_monthly a set user_id = pr.id
    from public.profiles pr
   where a.user_id is null and lower(a.user_name) = lower(pr.full_name);
  get diagnostics m = row_count; n := n + m;
  return n;
end;
$$;

-- Time by month with optional grouping, for the report builder. Runs as
-- the caller under RLS, so it is for admins: a staff member would get
-- their own live time plus the whole archive. Group keys not named in
-- p_group_by come back null and collapse into one row. Filters are by
-- name because the archive has no ids.
create or replace function public.report_time_monthly(
  p_from date, p_to date,
  p_client text default null, p_project text default null, p_user text default null,
  p_group_by text[] default array['client']
)
returns table (
  period_month date, client_name text, project_name text, user_name text, task_name text,
  hours numeric, billable_hours numeric, amount numeric
)
language sql stable
set search_path = ''
as $$
  select
    case when 'month'   = any(p_group_by) then t.period_month end,
    case when 'client'  = any(p_group_by) then t.client_name end,
    case when 'project' = any(p_group_by) then t.project_name end,
    case when 'person'  = any(p_group_by) then t.user_name end,
    case when 'task'    = any(p_group_by) then t.task_name end,
    sum(t.hours), sum(t.billable_hours), sum(t.amount)
  from public.time_monthly_all t
  where t.period_month >= date_trunc('month', p_from)::date
    and t.period_month <= p_to
    and (p_client  is null or t.client_name  = p_client)
    and (p_project is null or t.project_name = p_project)
    and (p_user    is null or t.user_name    = p_user)
  group by 1, 2, 3, 4, 5
  order by 1, 2, 3, 4, 5;
$$;

-- Harvest-style time report: one row per group with hours, billable
-- hours, billable amount, and what is still uninvoiced. Runs under the
-- caller's RLS (time_detail is security invoker), so staff see their own
-- time. Live entries carry the frozen rate; archive months come in as
-- they were rolled up, with no uninvoiced amount. Filters are by name
-- because the archive has no ids. p_group: client, project, task,
-- person, day, week, month.
create or replace function public.report_time(
  p_from date, p_to date, p_group text,
  p_client text default null, p_project text default null,
  p_person text default null, p_task text default null,
  p_billable boolean default null
)
returns table (
  key text, label text, sublabel text,
  hours numeric, billable_hours numeric, billable_amount numeric, uninvoiced_amount numeric
)
language sql stable
set search_path = ''
as $$
  with live as (
    select
      case p_group
        when 'client'  then t.client_name
        when 'project' then t.client_name || ' / ' || t.project_name
        when 'task'    then t.task_name
        when 'person'  then t.user_name
        when 'day'     then t.spent_on::text
        when 'week'    then date_trunc('week', t.spent_on)::date::text
        else t.period_month::text
      end as key,
      case p_group
        when 'client'  then t.client_name
        when 'project' then t.project_name
        when 'task'    then t.task_name
        when 'person'  then t.user_name
        when 'day'     then t.spent_on::text
        when 'week'    then date_trunc('week', t.spent_on)::date::text
        else t.period_month::text
      end as label,
      case when p_group = 'project' then t.client_name end as sublabel,
      t.hours, t.billable_hours, t.amount,
      case when t.is_billable and not t.is_locked then t.amount else 0 end as uninvoiced
    from public.time_detail t
    where t.spent_on between p_from and p_to
      and (p_client   is null or t.client_name  = p_client)
      and (p_project  is null or t.project_name = p_project)
      and (p_person   is null or t.user_name    = p_person)
      and (p_task     is null or t.task_name    = p_task)
      and (p_billable is null or t.is_billable  = p_billable)
  ), arch as (
    select
      case p_group
        when 'client'  then a.client_name
        when 'project' then a.client_name || ' / ' || a.project_name
        when 'task'    then coalesce(a.task_name, '')
        when 'person'  then a.user_name
        else a.period_month::text
      end as key,
      case p_group
        when 'client'  then a.client_name
        when 'project' then a.project_name
        when 'task'    then coalesce(a.task_name, '')
        when 'person'  then a.user_name
        else a.period_month::text
      end as label,
      case when p_group = 'project' then a.client_name end as sublabel,
      case when p_billable is true then a.billable_hours
           when p_billable is false then a.hours - a.billable_hours
           else a.hours end as hours,
      case when p_billable is false then 0 else a.billable_hours end as billable_hours,
      case when p_billable is false then 0 else a.amount end as amount,
      0::numeric as uninvoiced
    from public.harvest_archive_monthly a
    where a.period_month between date_trunc('month', p_from)::date and p_to
      and (p_client  is null or a.client_name  = p_client)
      and (p_project is null or a.project_name = p_project)
      and (p_person  is null or a.user_name    = p_person)
      and (p_task    is null or a.task_name    = p_task)
  ), everything as (
    select * from live union all select * from arch
  )
  select e.key, e.label, e.sublabel,
         sum(e.hours), sum(e.billable_hours), sum(e.amount), sum(e.uninvoiced)
  from everything e
  group by e.key, e.label, e.sublabel
  order by case when p_group in ('day', 'week', 'month') then e.key end, sum(e.hours) desc, e.key;
$$;

-- Same shape for expenses. p_group: client, project, category, person,
-- day, week, month. Uninvoiced means billable and not yet claimed.
create or replace function public.report_expenses(
  p_from date, p_to date, p_group text,
  p_client text default null, p_project text default null,
  p_person text default null, p_category text default null,
  p_billable boolean default null
)
returns table (key text, label text, sublabel text, amount numeric, billable_amount numeric, uninvoiced_amount numeric)
language sql stable
set search_path = ''
as $$
  with grouped as (
    select
      case p_group
        when 'client'   then c.name
        when 'project'  then c.name || ' / ' || p.name
        when 'category' then cat.name
        when 'person'   then pr.full_name
        when 'day'      then e.spent_on::text
        when 'week'     then date_trunc('week', e.spent_on)::date::text
        else date_trunc('month', e.spent_on)::date::text
      end as key,
      case p_group
        when 'client'   then c.name
        when 'project'  then p.name
        when 'category' then cat.name
        when 'person'   then pr.full_name
        when 'day'      then e.spent_on::text
        when 'week'     then date_trunc('week', e.spent_on)::date::text
        else date_trunc('month', e.spent_on)::date::text
      end as label,
      case when p_group = 'project' then c.name end as sublabel,
      sum(e.amount) as amount,
      sum(case when e.is_billable then e.amount else 0 end) as billable_amount,
      sum(case when e.is_billable and not e.is_locked then e.amount else 0 end) as uninvoiced_amount
    from public.expenses e
    join public.projects p on p.id = e.project_id
    join public.clients c on c.id = p.client_id
    join public.expense_categories cat on cat.id = e.category_id
    join public.profiles pr on pr.id = e.user_id
    where e.spent_on between p_from and p_to
      and (p_client   is null or c.name = p_client)
      and (p_project  is null or p.name = p_project)
      and (p_person   is null or pr.full_name = p_person)
      and (p_category is null or cat.name = p_category)
      and (p_billable is null or e.is_billable = p_billable)
    group by 1, 2, 3
  )
  select g.key, g.label, g.sublabel, g.amount, g.billable_amount, g.uninvoiced_amount
  from grouped g
  order by case when p_group in ('day', 'week', 'month') then g.key end, g.amount desc, g.key;
$$;

-- The strip above a report: one row of totals for the period under the
-- same filters, so the strip and the table always agree. One pass over
-- live rows, one over the archive, one over expenses.
create or replace function public.report_rollup(
  p_from date, p_to date,
  p_client text default null, p_project text default null, p_person text default null,
  p_task text default null, p_billable boolean default null
)
returns table (hours numeric, billable_hours numeric, billable_amount numeric, uninvoiced_amount numeric, expenses numeric)
language sql stable
set search_path = ''
as $$
  with live as (
    select coalesce(sum(t.hours), 0) as hours,
           coalesce(sum(t.billable_hours), 0) as billable_hours,
           coalesce(sum(t.amount), 0) as amount,
           coalesce(sum(case when t.is_billable and not t.is_locked then t.amount else 0 end), 0) as uninvoiced
    from public.time_detail t
    where t.spent_on between p_from and p_to
      and (p_client   is null or t.client_name  = p_client)
      and (p_project  is null or t.project_name = p_project)
      and (p_person   is null or t.user_name    = p_person)
      and (p_task     is null or t.task_name    = p_task)
      and (p_billable is null or t.is_billable  = p_billable)
  ), arch as (
    select coalesce(sum(case when p_billable is true then a.billable_hours when p_billable is false then a.hours - a.billable_hours else a.hours end), 0) as hours,
           coalesce(sum(case when p_billable is false then 0 else a.billable_hours end), 0) as billable_hours,
           coalesce(sum(case when p_billable is false then 0 else a.amount end), 0) as amount
    from public.harvest_archive_monthly a
    where a.period_month between date_trunc('month', p_from)::date and p_to
      and (p_client  is null or a.client_name  = p_client)
      and (p_project is null or a.project_name = p_project)
      and (p_person  is null or a.user_name    = p_person)
      and (p_task    is null or a.task_name    = p_task)
  ), exp as (
    select coalesce(sum(e.amount), 0) as amount
    from public.expenses e
    join public.projects p on p.id = e.project_id
    join public.clients c on c.id = p.client_id
    join public.profiles pr on pr.id = e.user_id
    where e.spent_on between p_from and p_to
      and (p_client   is null or c.name = p_client)
      and (p_project  is null or p.name = p_project)
      and (p_person   is null or pr.full_name = p_person)
      and (p_billable is null or e.is_billable = p_billable)
  )
  select live.hours + arch.hours,
         live.billable_hours + arch.billable_hours,
         case when (select public.has_permission('see_money')) then live.amount + arch.amount end,
         case when (select public.has_permission('see_money')) then live.uninvoiced end,
         exp.amount
  from live, arch, exp;
$$;

-- Search across tasks, projects, clients, quotes, invoices, and task
-- comments. Security invoker, so RLS decides what each caller sees.
-- Every word must match, the last one as a prefix so results appear as
-- you type. Numbers like Q-2026-014 also match by substring.
create or replace function public.search(p_q text, p_kind text default null, p_limit int default 20)
returns table (kind text, id uuid, title text, subtitle text, rank real)
language sql stable
set search_path = ''
as $$
  with terms as (
    select array_remove(regexp_split_to_array(lower(trim(p_q)), '\s+'), '') as words
  ), q as (
    select case when cardinality(words) = 0 then null
                else to_tsquery('simple', array_to_string(array(select quote_literal(w) || ':*' from unnest(words) w), ' & '))
           end as tsq,
           '%' || trim(p_q) || '%' as pat
    from terms
  ), hits as (
    select 'task'::text as kind, w.id, w.title, c.name || ' / ' || p.name || ' · ' || coalesce(ws.label, w.status) as subtitle,
           ts_rank(w.search, q.tsq) as rank
    from public.work_items w
    join public.projects p on p.id = w.project_id
    join public.clients c on c.id = p.client_id
    left join public.work_statuses ws on ws.key = w.status, q
    where q.tsq is not null and w.search @@ q.tsq and (p_kind is null or p_kind = 'task')
    union all
    select 'project', p.id, p.name, c.name || coalesce(' · ' || p.code, ''), ts_rank(p.search, q.tsq) + 0.2
    from public.projects p join public.clients c on c.id = p.client_id, q
    where q.tsq is not null and p.search @@ q.tsq and (p_kind is null or p_kind = 'project')
    union all
    select 'client', c.id, c.name, case when c.is_active then 'Client' else 'Inactive client' end, ts_rank(c.search, q.tsq) + 0.3
    from public.clients c, q
    where q.tsq is not null and c.search @@ q.tsq and (p_kind is null or p_kind = 'client')
    union all
    select 'quote', qu.id, qu.number || ' ' || qu.title, c.name || ' · ' || qu.status, ts_rank(qu.search, q.tsq) + 0.1
    from public.quotes qu join public.clients c on c.id = qu.client_id, q
    where ((q.tsq is not null and qu.search @@ q.tsq) or qu.number ilike q.pat) and (p_kind is null or p_kind = 'quote')
    union all
    select 'invoice', i.id, i.number || coalesce(' ' || i.subject, ''), c.name || ' · ' || i.status, ts_rank(i.search, q.tsq) + 0.1
    from public.invoices i join public.clients c on c.id = i.client_id, q
    where ((q.tsq is not null and i.search @@ q.tsq) or i.number ilike q.pat) and (p_kind is null or p_kind = 'invoice')
    union all
    select 'comment', w.id, w.title, 'Comment: ' || left(regexp_replace(m.body, '\s+', ' ', 'g'), 80), ts_rank(m.search, q.tsq) - 0.1
    from public.work_item_comments m join public.work_items w on w.id = m.work_item_id, q
    where q.tsq is not null and m.search @@ q.tsq and (p_kind is null or p_kind = 'task')
  )
  select h.kind, h.id, h.title, h.subtitle, h.rank
  from hits h
  order by h.rank desc, h.title
  limit greatest(1, least(p_limit, 50));
$$;

-- ---------- Notifications ----------

create or replace function public.notification_email_default(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case when p_kind in ('comment', 'status', 'due') then 'off' else 'instant' end;
$$;

-- Insert a notification for one person, honouring their preferences.
-- Never notifies the actor about their own action, or clients. p_email
-- overrides the email column (the reminder job passes 'none' since it
-- already emails).
create or replace function public.notify(
  p_user uuid, p_kind text, p_title text, p_body text default null, p_link text default null,
  p_actor uuid default null, p_item uuid default null, p_email text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_in_app boolean;
  v_email  text;
begin
  if p_user is null or p_user = p_actor then return; end if;
  if not exists (select 1 from public.profiles where id = p_user and is_active and role <> 'client') then return; end if;
  select in_app, email into v_in_app, v_email from public.notification_prefs where user_id = p_user and kind = p_kind;
  v_in_app := coalesce(v_in_app, true);
  v_email := coalesce(p_email, v_email, public.notification_email_default(p_kind));
  if not v_in_app and v_email = 'off' then return; end if;
  insert into public.notifications (user_id, kind, title, body, link, actor_id, work_item_id, read_at, email)
  values (p_user, p_kind, p_title, p_body, p_link, p_actor, p_item,
          case when v_in_app then null else now() end,
          case when v_email = 'off' then 'none' else 'pending' end);
end $$;

-- People on a task: assignees plus whoever made it.
create or replace function public.task_people(p_item uuid) returns setof uuid
language sql stable set search_path = '' as $$
  select a.user_id from public.work_item_assignees a where a.work_item_id = p_item
  union
  select w.created_by from public.work_items w where w.id = p_item and w.created_by is not null;
$$;
create or replace function public.actor_name() returns text
language sql stable set search_path = '' as $$
  select coalesce((select full_name from public.profiles where id = auth.uid()), 'Someone');
$$;
-- Everyone who may run billing: admins and roles holding manage_invoices.
create or replace function public.billing_people() returns setof uuid
language sql stable set search_path = '' as $$
  select id from public.profiles
  where is_active and (role = 'admin' or role in (select role from public.permissions where key = 'manage_invoices'));
$$;

create or replace function public.notify_on_assignee() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_title text;
begin
  select title into v_title from public.work_items where id = new.work_item_id;
  perform public.notify(new.user_id, 'assigned', public.actor_name() || ' assigned you: ' || v_title, null,
                        '/tasks/' || new.work_item_id, auth.uid(), new.work_item_id);
  return new;
end $$;
create trigger notify_on_assignee after insert on work_item_assignees for each row execute function public.notify_on_assignee();

create or replace function public.notify_on_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_title   text;
  v_who     text;
  v_client  boolean;
  v_snippet text := left(regexp_replace(new.body, '\s+', ' ', 'g'), 160);
  v_user    uuid;
begin
  select title into v_title from public.work_items where id = new.work_item_id;
  v_client := new.author_id is null or exists (select 1 from public.profiles where id = new.author_id and role = 'client');
  v_who := coalesce((select full_name from public.profiles where id = new.author_id), new.author_name, 'A client');
  for v_user in select unnest(new.mentions) loop
    perform public.notify(v_user, 'mentioned', v_who || ' mentioned you on ' || v_title, v_snippet,
                          '/tasks/' || new.work_item_id, new.author_id, new.work_item_id);
  end loop;
  for v_user in select public.task_people(new.work_item_id) except select unnest(new.mentions) loop
    perform public.notify(v_user, case when v_client then 'client_comment' else 'comment' end,
                          v_who || (case when v_client then ' (client) commented on ' else ' commented on ' end) || v_title, v_snippet,
                          '/tasks/' || new.work_item_id, new.author_id, new.work_item_id);
  end loop;
  return new;
end $$;
create trigger notify_on_comment after insert on work_item_comments for each row execute function public.notify_on_comment();

create or replace function public.notify_on_item_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_label text;
begin
  if new.status is distinct from old.status then
    select label into v_label from public.work_statuses where key = new.status;
    for v_user in select public.task_people(new.id) loop
      perform public.notify(v_user, 'status', public.actor_name() || ' moved ' || new.title || ' to ' || coalesce(v_label, new.status), null,
                            '/tasks/' || new.id, auth.uid(), new.id);
    end loop;
  end if;
  if new.client_decision is distinct from old.client_decision and new.client_decision is not null then
    for v_user in select public.task_people(new.id) loop
      perform public.notify(v_user, 'client_decision',
                            coalesce(new.client_decision_by, 'The client') || (case when new.client_decision = 'approved' then ' approved ' else ' requested changes on ' end) || new.title,
                            null, '/tasks/' || new.id, null, new.id);
    end loop;
  end if;
  return new;
end $$;
create trigger notify_on_item_change after update on work_items for each row execute function public.notify_on_item_change();

create or replace function public.notify_on_quote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_client text;
begin
  if new.status is distinct from old.status and new.status in ('accepted', 'declined') then
    select name into v_client from public.clients where id = new.client_id;
    for v_user in select public.billing_people() loop
      perform public.notify(v_user, 'quote_decision', v_client || ' ' || new.status || ' quote ' || new.number || ': ' || new.title, null, '/quotes/' || new.id);
    end loop;
  end if;
  return new;
end $$;
create trigger notify_on_quote after update on quotes for each row execute function public.notify_on_quote();

create or replace function public.notify_on_invoice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_client text;
begin
  if new.status is distinct from old.status and new.status = 'paid' then
    select name into v_client from public.clients where id = new.client_id;
    for v_user in select public.billing_people() loop
      perform public.notify(v_user, 'invoice_paid', v_client || ' paid invoice ' || new.number, null, '/invoices/' || new.id);
    end loop;
  end if;
  return new;
end $$;
create trigger notify_on_invoice after update on invoices for each row execute function public.notify_on_invoice();

-- Every five minutes: one email per person with their pending rows.
-- "Instant" rows go after a two-minute pause so a burst is one email;
-- "daily" rows go at 8am Central. Uses the same Resend key as reminders.
create or replace function public.run_notification_emails() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_local  timestamp := now() at time zone 'America/Chicago';
  v_daily  boolean := extract(hour from v_local) = 8 and extract(minute from v_local) < 5;
  v_key    text := public.vault_secret('resend_api_key');
  v_from   text := public.vault_secret('resend_from', 'Docket <onboarding@resend.dev>');
  v_app    text := public.vault_secret('app_url', 'https://docket.giganticdesign.com');
  r        record;
  v_lines  text;
  v_count  int;
  v_sent   int := 0;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Admins only'; end if;
  if v_key is null then return 0; end if;
  for r in
    select n.user_id, pr.email, pr.full_name
    from public.notifications n
    join public.profiles pr on pr.id = n.user_id and pr.is_active
    where n.email = 'pending'
      and n.created_at < now() - interval '2 minutes'
      and (v_daily or coalesce((select p.email from public.notification_prefs p where p.user_id = n.user_id and p.kind = n.kind), public.notification_email_default(n.kind)) = 'instant')
    group by n.user_id, pr.email, pr.full_name
  loop
    select string_agg('- ' || n.title || coalesce(E'\n  ' || n.body, '') || coalesce(E'\n  ' || v_app || n.link, ''), E'\n\n' order by n.created_at), count(*)
      into v_lines, v_count
    from public.notifications n
    where n.user_id = r.user_id and n.email = 'pending'
      and (v_daily or coalesce((select p.email from public.notification_prefs p where p.user_id = n.user_id and p.kind = n.kind), public.notification_email_default(n.kind)) = 'instant');
    perform net.http_post(
      url     := 'https://api.resend.com/emails',
      body    := jsonb_build_object('from', v_from, 'to', jsonb_build_array(r.email),
                                    'subject', case when v_count = 1 then split_part(v_lines, E'\n', 1) else v_count || ' things happened in Docket' end,
                                    'text', format(E'Hi %s,\n\n%s\n\nSee everything: %s/notifications\n\nDocket', split_part(r.full_name, ' ', 1), regexp_replace(v_lines, '^- ', '', 'n'), v_app)),
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json')
    );
    update public.notifications n set email = 'sent'
    where n.user_id = r.user_id and n.email = 'pending'
      and (v_daily or coalesce((select p.email from public.notification_prefs p where p.user_id = n.user_id and p.kind = n.kind), public.notification_email_default(n.kind)) = 'instant');
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;

-- Due tomorrow, today, and overdue: once a day at 9am Central, in the
-- bell (and by email if the person turns 'due' on).
create or replace function public.run_due_notifications() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_local timestamp := now() at time zone 'America/Chicago';
  v_today date := v_local::date;
  r record; v_n int := 0;
begin
  if extract(hour from v_local) <> 9 then return 0; end if;
  for r in
    select w.id, w.title, w.due_on, a.user_id
    from public.work_items w
    join public.work_item_assignees a on a.work_item_id = w.id
    join public.work_statuses s on s.key = w.status
    where not s.is_done and w.due_on is not null and w.due_on <= v_today + 1
      and not exists (select 1 from public.notifications n where n.user_id = a.user_id and n.work_item_id = w.id and n.kind = 'due' and n.created_at::date = v_today)
  loop
    perform public.notify(r.user_id, 'due',
      case when r.due_on > v_today then 'Due tomorrow: ' || r.title
           when r.due_on = v_today then 'Due today: ' || r.title
           else 'Overdue: ' || r.title || ' (due ' || to_char(r.due_on, 'FMMon FMDD') || ')' end,
      null, '/tasks/' || r.id, null, r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------- Billing batches ----------

-- Claim the given rows for a new draft batch, all or nothing. Rows that
-- are not this client's, not billable, already claimed, locked, or still
-- running are refused and the whole call fails. p_project_id null means
-- all of the client's work.
create or replace function public.create_billing_batch(
  p_client_id uuid, p_period_start date, p_period_end date,
  p_time_entry_ids uuid[], p_expense_ids uuid[], p_project_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id        uuid;
  v_want_time int := (select count(distinct x) from unnest(p_time_entry_ids) x);
  v_want_exp  int := (select count(distinct x) from unnest(p_expense_ids) x);
  v_got       int;
  v_hours     numeric;
  v_time_amt  numeric;
  v_exp_amt   numeric;
begin
  if not public.has_permission('manage_invoices') then raise exception 'Invoices permission needed'; end if;
  if v_want_time + v_want_exp = 0 then raise exception 'Pick at least one entry'; end if;

  insert into public.billing_batches (client_id, project_id, period_start, period_end, created_by)
  values (p_client_id, p_project_id, p_period_start, p_period_end, auth.uid())
  returning id into v_id;

  update public.time_entries te set batch_id = v_id, is_locked = true
  from public.projects p
  where te.id = any(p_time_entry_ids) and p.id = te.project_id and p.client_id = p_client_id
    and te.is_billable and te.batch_id is null and not te.is_locked and te.deleted_at is null
    and te.status = 'approved'
    and (te.ended_at is not null or te.started_at is null);
  get diagnostics v_got = row_count;
  if v_got <> v_want_time then
    raise exception 'Some time entries were already claimed, locked, still running, or not yet approved. Reload and try again.';
  end if;

  update public.expenses e set batch_id = v_id, is_locked = true
  from public.projects p
  where e.id = any(p_expense_ids) and p.id = e.project_id and p.client_id = p_client_id
    and e.is_billable and e.batch_id is null and not e.is_locked and e.deleted_at is null;
  get diagnostics v_got = row_count;
  if v_got <> v_want_exp then
    raise exception 'Some expenses were already claimed or locked. Reload and try again.';
  end if;

  select coalesce(sum(hours), 0), coalesce(sum(hours * coalesce(rate_snapshot, 0)), 0)
    into v_hours, v_time_amt from public.time_entries where batch_id = v_id;
  select coalesce(sum(amount), 0) into v_exp_amt from public.expenses where batch_id = v_id;
  update public.billing_batches
     set subtotal_hours = v_hours, subtotal_amount = v_time_amt + v_exp_amt
   where id = v_id;
  return v_id;
end $$;

-- Release a draft or failed batch's rows. Pushed batches stay as they are.
create or replace function public.void_billing_batch(p_batch_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status public.billing_batch_status;
begin
  if not public.has_permission('manage_invoices') then raise exception 'Invoices permission needed'; end if;
  select status into v_status from public.billing_batches where id = p_batch_id for update;
  if v_status is null then raise exception 'Batch not found'; end if;
  if v_status not in ('draft', 'failed') then raise exception 'Only draft or failed batches can be voided'; end if;
  update public.time_entries set batch_id = null, is_locked = false where batch_id = p_batch_id;
  update public.expenses     set batch_id = null, is_locked = false where batch_id = p_batch_id;
  update public.billing_batches set status = 'void' where id = p_batch_id;
end $$;

-- Unbilled work per client, for the billing page. Admins only; staff get
-- no rows.
create or replace function public.unbilled_summary()
returns table (client_id uuid, client_name text, hours numeric, time_amount numeric, expense_amount numeric, oldest date, newest date)
language sql security definer set search_path = '' stable as $$
  select c.id, c.name,
         coalesce(t.hours, 0), coalesce(t.amount, 0), coalesce(e.amount, 0),
         least(t.oldest, e.oldest), greatest(t.newest, e.newest)
  from public.clients c
  left join (
    select p.client_id, sum(te.hours) as hours, sum(te.hours * coalesce(te.rate_snapshot, 0)) as amount,
           min(te.spent_on) as oldest, max(te.spent_on) as newest
    from public.time_entries te join public.projects p on p.id = te.project_id
    where te.is_billable and te.batch_id is null and not te.is_locked and te.deleted_at is null
      and (te.ended_at is not null or te.started_at is null)
    group by p.client_id
  ) t on t.client_id = c.id
  left join (
    select p.client_id, sum(ex.amount) as amount, min(ex.spent_on) as oldest, max(ex.spent_on) as newest
    from public.expenses ex join public.projects p on p.id = ex.project_id
    where ex.is_billable and ex.batch_id is null and not ex.is_locked and ex.deleted_at is null
    group by p.client_id
  ) e on e.client_id = c.id
  where public.is_admin() and (t.client_id is not null or e.client_id is not null)
  order by coalesce(t.amount, 0) + coalesce(e.amount, 0) desc
$$;

-- ---------- Invoicing ----------

-- Recompute one invoice's money columns from its lines and payments. A
-- sent invoice becomes paid when payments cover the total, and goes back
-- to sent if a payment is removed.
create or replace function public.recalc_invoice(p_invoice_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_sub     numeric := 0;
  v_taxable numeric := 0;
  v_paid    numeric := 0;
  v_rate    numeric;
  v_status  public.invoice_status;
  v_tax     numeric;
  v_total   numeric;
begin
  select tax_rate, status into v_rate, v_status from public.invoices where id = p_invoice_id;
  if v_rate is null then return; end if;
  select coalesce(sum(amount), 0), coalesce(sum(amount) filter (where taxable), 0)
    into v_sub, v_taxable from public.invoice_lines where invoice_id = p_invoice_id;
  select coalesce(sum(amount), 0) into v_paid from public.invoice_payments where invoice_id = p_invoice_id;
  v_tax := round(v_taxable * v_rate / 100, 2);
  v_total := v_sub + v_tax;
  update public.invoices set
    subtotal    = v_sub,
    tax_amount  = v_tax,
    total       = v_total,
    paid_amount = v_paid,
    due_amount  = v_total - v_paid,
    status      = case when v_status = 'sent' and v_paid > 0 and v_paid >= v_total then 'paid'
                       when v_status = 'paid' and v_paid < v_total then 'sent'
                       else v_status end,
    paid_at     = case when v_paid > 0 and v_paid >= v_total then coalesce(paid_at, now()) else null end,
    updated_at  = now()
  where id = p_invoice_id;
end $$;

create or replace function public.invoice_children_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then perform public.recalc_invoice(old.invoice_id); end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id) then
    perform public.recalc_invoice(new.invoice_id);
  end if;
  return null;
end $$;

create or replace function public.invoice_tax_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.recalc_invoice(new.id);
  return null;
end $$;

create trigger invoice_lines_recalc
  after insert or update or delete on invoice_lines
  for each row execute function public.invoice_children_changed();
create trigger invoice_payments_recalc
  after insert or update or delete on invoice_payments
  for each row execute function public.invoice_children_changed();
create trigger invoices_tax_recalc
  after update of tax_rate on invoices
  for each row when (old.tax_rate is distinct from new.tax_rate)
  execute function public.invoice_tax_changed();

-- Hand out the next number and bump the counter, under the row lock.
create or replace function public.next_invoice_number() returns text
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  update public.invoice_settings set next_invoice_number = next_invoice_number + 1
   where id returning next_invoice_number - 1 into v;
  return v::text;
end $$;

-- Hours in summary lines read 1.25, 0.5, 8, not 1 and 0.
create or replace function public.hours_text(h numeric) returns text
language sql immutable set search_path = '' as $$
  select rtrim(rtrim(round(coalesce(h, 0), 2)::text, '0'), '.');
$$;

-- How much detail the lines carry when a batch becomes an invoice:
--   task     one line per project, task type, and rate (hours x rate)
--   project  one line per project, hours by task type in the text
--   summary  one line for all the work, one for all the expenses
-- Lines stay editable on the invoice afterwards.
create or replace function public.create_invoice(p_client_id uuid, p_batch_id uuid default null, p_detail text default 'task') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id     uuid;
  s        record;
  b        record;
  r        record;
  v_pos    int := 0;
  v_period text;
  v_hours  numeric;
  v_amount numeric;
  v_cost   numeric;
begin
  if not public.has_permission('manage_invoices') then raise exception 'Invoices permission needed'; end if;
  if p_detail not in ('task', 'project', 'summary') then raise exception 'Unknown detail level %', p_detail; end if;
  select * into s from public.invoice_settings where id;
  if p_batch_id is not null then
    select * into b from public.billing_batches where id = p_batch_id for update;
    if b.id is null then raise exception 'Batch not found'; end if;
    if b.status <> 'draft' then raise exception 'Only a draft batch can be invoiced'; end if;
    if b.client_id <> p_client_id then raise exception 'That batch belongs to another client'; end if;
    v_period := to_char(b.period_start, 'Mon FMDD') || ' to ' || to_char(b.period_end, 'Mon FMDD, YYYY');
  end if;

  insert into public.invoices (number, client_id, batch_id, issue_date, due_date, tax_rate, notes, created_by)
  values (public.next_invoice_number(), p_client_id, p_batch_id, current_date,
          current_date + s.default_terms_days, s.default_tax_rate, s.default_notes, auth.uid())
  returning id into v_id;

  if p_batch_id is null then return v_id; end if;

  if p_detail = 'task' then
    for r in
      select p.id as project_id, p.name as project_name, t.name as task_name,
             coalesce(te.rate_snapshot, 0) as rate, sum(te.hours) as hours,
             -- Cost is known only when every entry carries a cost snapshot.
             case when bool_and(te.cost_snapshot is not null) then round(sum(te.hours * te.cost_snapshot), 2) end as cost
      from public.time_entries te
      join public.projects p on p.id = te.project_id
      join public.tasks    t on t.id = te.task_id
      where te.batch_id = p_batch_id and te.deleted_at is null
      group by p.id, p.name, t.name, coalesce(te.rate_snapshot, 0)
      order by p.name, t.name, 4 desc
    loop
      v_pos := v_pos + 1;
      insert into public.invoice_lines (invoice_id, position, kind, description, quantity, unit_price, project_id, cost_amount)
      values (v_id, v_pos, 'service', r.project_name || ' / ' || r.task_name, r.hours, r.rate, r.project_id, r.cost);
    end loop;
    for r in
      select p.id as project_id, p.name as project_name, c.name as category_name, sum(e.amount) as amount
      from public.expenses e
      join public.projects p on p.id = e.project_id
      join public.expense_categories c on c.id = e.category_id
      where e.batch_id = p_batch_id and e.deleted_at is null
      group by p.id, p.name, c.name
      order by p.name, c.name
    loop
      v_pos := v_pos + 1;
      insert into public.invoice_lines (invoice_id, position, kind, description, quantity, unit_price, project_id)
      values (v_id, v_pos, 'expense', r.project_name || ' / ' || r.category_name, 1, r.amount, r.project_id);
    end loop;

  elsif p_detail = 'project' then
    for r in
      select p.id as project_id, p.name as project_name,
             sum(te.hours) as hours,
             sum(te.hours * coalesce(te.rate_snapshot, 0)) as amount,
             case when bool_and(te.cost_snapshot is not null) then round(sum(te.hours * te.cost_snapshot), 2) end as cost,
             (select string_agg(x.task_name || ' ' || public.hours_text(x.h) || 'h', ', ' order by x.h desc)
                from (select t.name as task_name, sum(te2.hours) as h
                      from public.time_entries te2
                      join public.tasks t on t.id = te2.task_id
                      where te2.batch_id = p_batch_id and te2.deleted_at is null and te2.project_id = p.id
                      group by t.name) x) as breakdown
      from public.time_entries te
      join public.projects p on p.id = te.project_id
      where te.batch_id = p_batch_id and te.deleted_at is null
      group by p.id, p.name
      order by p.name
    loop
      v_pos := v_pos + 1;
      insert into public.invoice_lines (invoice_id, position, kind, description, quantity, unit_price, project_id, cost_amount)
      values (v_id, v_pos, 'service',
              r.project_name || ': ' || public.hours_text(r.hours) || ' hours (' || r.breakdown || ')',
              1, r.amount, r.project_id, r.cost);
    end loop;
    for r in
      select p.id as project_id, p.name as project_name, sum(e.amount) as amount
      from public.expenses e
      join public.projects p on p.id = e.project_id
      where e.batch_id = p_batch_id and e.deleted_at is null
      group by p.id, p.name
      order by p.name
    loop
      v_pos := v_pos + 1;
      insert into public.invoice_lines (invoice_id, position, kind, description, quantity, unit_price, project_id)
      values (v_id, v_pos, 'expense', r.project_name || ': expenses', 1, r.amount, r.project_id);
    end loop;

  else
    select sum(te.hours), sum(te.hours * coalesce(te.rate_snapshot, 0)),
           case when bool_and(te.cost_snapshot is not null) then round(sum(te.hours * te.cost_snapshot), 2) end
      into v_hours, v_amount, v_cost
    from public.time_entries te where te.batch_id = p_batch_id and te.deleted_at is null;
    if v_hours is not null then
      v_pos := v_pos + 1;
      insert into public.invoice_lines (invoice_id, position, kind, description, quantity, unit_price, project_id, cost_amount)
      values (v_id, v_pos, 'service',
              'Design and development, ' || v_period || ' (' || public.hours_text(v_hours) || ' hours)',
              1, v_amount, b.project_id, v_cost);
    end if;
    select sum(e.amount) into v_amount from public.expenses e where e.batch_id = p_batch_id and e.deleted_at is null;
    if v_amount is not null then
      v_pos := v_pos + 1;
      insert into public.invoice_lines (invoice_id, position, kind, description, quantity, unit_price, project_id)
      values (v_id, v_pos, 'expense', 'Expenses, ' || v_period, 1, v_amount, b.project_id);
    end if;
  end if;

  update public.billing_batches set status = 'invoiced' where id = p_batch_id;
  return v_id;
end $$;

-- Void an unpaid invoice. Its batch (if any) goes back to draft so the
-- work can be invoiced again or the batch voided to release the rows.
create or replace function public.void_invoice(p_invoice_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status public.invoice_status; v_batch uuid; v_paid numeric;
begin
  if not public.has_permission('manage_invoices') then raise exception 'Invoices permission needed'; end if;
  select status, batch_id, paid_amount into v_status, v_batch, v_paid
    from public.invoices where id = p_invoice_id for update;
  if v_status is null then raise exception 'Invoice not found'; end if;
  if v_status = 'void' then return; end if;
  if v_paid > 0 then raise exception 'This invoice has payments recorded. Remove them first.'; end if;
  update public.invoices set status = 'void', updated_at = now() where id = p_invoice_id;
  if v_batch is not null then
    update public.billing_batches set status = 'draft' where id = v_batch and status = 'invoiced';
  end if;
end $$;

-- ---------- Quoting ----------

-- Q-2026-014 style numbers from the settings counter.
create or replace function public.next_quote_number() returns text
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  update public.invoice_settings set next_quote_number = next_quote_number + 1
   where id returning next_quote_number - 1 into v;
  return 'Q-' || to_char(now() at time zone 'America/Chicago', 'YYYY') || '-' || lpad(v::text, 3, '0');
end $$;

create or replace function public.create_quote(p_client_id uuid, p_title text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; s record;
begin
  if not public.has_permission('manage_quotes') then raise exception 'Quotes permission needed'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the quote a title'; end if;
  select * into s from public.invoice_settings where id;
  insert into public.quotes (client_id, number, title, terms, valid_until, created_by)
  values (p_client_id, public.next_quote_number(), trim(p_title), s.quote_terms,
          (now() at time zone 'America/Chicago')::date + s.quote_valid_days, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Acceptance, by the client from /q/<token> (service role, no session) or
-- by an admin on their behalf. Makes the project: hours from the lines
-- become budget_hours, the subtotal becomes budget_amount, and each line's
-- task type is assigned to the project with the quoted rate.
create or replace function public.accept_quote(p_quote_id uuid, p_name text, p_email text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare q record; v_project uuid; v_item uuid; v_hours numeric; r record;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Admins only'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'A name is required to accept'; end if;
  select * into q from public.quotes where id = p_quote_id for update;
  if q.id is null then raise exception 'Quote not found'; end if;
  if q.status not in ('draft', 'sent') then raise exception 'This quote is already %', q.status; end if;

  select sum(hours) into v_hours from public.quote_line_items where quote_id = q.id;
  insert into public.projects (client_id, name, billing_method, budget_hours, budget_amount)
  values (q.client_id, q.title, 'hourly', nullif(v_hours, 0), nullif(q.subtotal, 0))
  returning id into v_project;

  for r in
    select task_id, max(rate) as rate from public.quote_line_items
    where quote_id = q.id and task_id is not null group by task_id
  loop
    insert into public.project_tasks (project_id, task_id, hourly_rate) values (v_project, r.task_id, r.rate)
    on conflict do nothing;
  end loop;

  -- Every sitemap page becomes a task, with the page's hours as the
  -- estimate, assigned to whoever the page's scope line names.
  for r in
    select n.title, n.path, coalesce(n.hours, t.hours) as hours, t.name as template_name, n.sort_order, l.assignee_id
    from public.quote_sitemap_nodes n
    left join public.page_templates t on t.id = n.template_id
    left join public.quote_line_items l on l.id = n.line_item_id
    where n.quote_id = q.id
    order by n.sort_order
  loop
    insert into public.work_items (project_id, title, description, estimate_hours, created_by)
    values (v_project, r.title,
            concat_ws(E'\n', nullif(r.path, ''), case when r.template_name is not null then r.template_name || ' page' end, 'From quote ' || q.number),
            nullif(r.hours, 0), q.created_by)
    returning id into v_item;
    if r.assignee_id is not null then
      insert into public.work_item_assignees (work_item_id, user_id) values (v_item, r.assignee_id) on conflict do nothing;
    end if;
  end loop;

  update public.quotes set status = 'accepted', accepted_at = now(), accepted_by = trim(p_name),
    accepted_email = nullif(trim(coalesce(p_email, '')), ''), project_id = v_project, updated_at = now()
  where id = q.id;
  return v_project;
end $$;

create or replace function public.decline_quote(p_quote_id uuid, p_name text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status public.quote_status;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Admins only'; end if;
  select status into v_status from public.quotes where id = p_quote_id for update;
  if v_status is null then raise exception 'Quote not found'; end if;
  if v_status not in ('draft', 'sent') then raise exception 'This quote is already %', v_status; end if;
  update public.quotes set status = 'declined', declined_at = now(), declined_by = nullif(trim(coalesce(p_name, '')), ''),
    decline_reason = nullif(trim(coalesce(p_reason, '')), ''), updated_at = now()
  where id = p_quote_id;
end $$;

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

alter table profiles               enable row level security;
alter table roles       enable row level security;
alter table permissions enable row level security;
alter table notifications enable row level security;
alter table google_tokens enable row level security;
alter table work_item_dependencies enable row level security;
alter table estimator_materials enable row level security;
alter table estimator_settings  enable row level security;
alter table ai_events           enable row level security;
alter table notification_prefs enable row level security;
alter table clients                enable row level security;
alter table projects               enable row level security;
alter table tasks                  enable row level security;
alter table project_tasks          enable row level security;
alter table billing_batches        enable row level security;
alter table time_entries           enable row level security;
alter table retainers              enable row level security;
alter table expense_categories     enable row level security;
alter table expenses               enable row level security;
alter table quotes                 enable row level security;
alter table quote_line_items       enable row level security;
alter table quote_sitemap_nodes    enable row level security;
alter table harvest_archive_monthly enable row level security;
alter table harvest_invoices       enable row level security;
alter table invoice_settings       enable row level security;
alter table invoices               enable row level security;
alter table invoice_lines          enable row level security;
alter table invoice_payments       enable row level security;
alter table time_off               enable row level security;
alter table availability           enable row level security;
alter table work_statuses          enable row level security;
alter table work_items             enable row level security;
alter table work_item_assignees    enable row level security;
alter table work_item_comments     enable row level security;
alter table work_item_files        enable row level security;
alter table calendar_busy          enable row level security;
alter table reminder_log           enable row level security;
alter table audit_log              enable row level security;
alter table saved_reports          enable row level security;

-- ---------- Reference data: everyone reads, admins write ----------

create policy read_all on profiles           for select to authenticated using (id = (select auth.uid()) or not (select is_client()));
create policy read_all on roles              for select to authenticated using (true);
create policy read_all on permissions        for select to authenticated using (true);
create policy read_all on clients            for select to authenticated using (not (select is_client()) or id = (select my_client_id()));
create policy read_all on projects           for select to authenticated using (not (select is_client()) or client_id = (select my_client_id()));
create policy read_all on tasks              for select to authenticated using (not (select is_client()));
create policy read_all on project_tasks      for select to authenticated using (not (select is_client()));
create policy read_all on expense_categories for select to authenticated using (not (select is_client()));
create policy read_all on retainers          for select to authenticated using (not (select is_client()));

create policy admin_write on roles              for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_write on permissions        for all to authenticated using (is_admin()) with check (is_admin());
-- Notifications: yours to read, mark, and clear; only triggers write them.
create policy own_select on notifications      for select to authenticated using (user_id = auth.uid());
create policy own_update on notifications      for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_delete on notifications      for delete to authenticated using (user_id = auth.uid());
create policy own_all    on notification_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Google tokens: own row or the people permission, never the token column.
create policy own_or_people on google_tokens for select to authenticated using (user_id = auth.uid() or has_permission('manage_people'));
revoke select on google_tokens from authenticated;
grant select (user_id, google_email, connected_at, last_synced_at, last_error) on google_tokens to authenticated;
create policy manage_reference on clients       for all to authenticated using (has_permission('manage_reference')) with check (has_permission('manage_reference'));
create policy manage_reference on projects      for all to authenticated using (has_permission('manage_reference')) with check (has_permission('manage_reference'));
create policy manage_reference on tasks         for all to authenticated using (has_permission('manage_reference')) with check (has_permission('manage_reference'));
create policy manage_reference on project_tasks for all to authenticated using (has_permission('manage_reference')) with check (has_permission('manage_reference'));
create policy manage_settings on expense_categories for all to authenticated using (has_permission('manage_settings')) with check (has_permission('manage_settings'));
create policy manage_retainers on retainers       for all to authenticated using ((select has_permission('manage_retainers'))) with check ((select has_permission('manage_retainers')));

-- Profiles: you edit yourself (full_name only, see trigger), admins edit anyone.
-- No insert policy: rows come from the auth trigger.
create policy own_profile on profiles for update to authenticated
  using (id = auth.uid() or has_permission('manage_people'))
  with check (id = auth.uid() or has_permission('manage_people'));

-- ---------- Time: own unlocked rows, admins everything ----------

create policy own_time_select on time_entries for select to authenticated
  using (deleted_at is null and (user_id = (select auth.uid()) or (select has_permission('see_all_time')) or (select has_permission('approve_time'))));

create policy own_time_insert on time_entries for insert to authenticated
  with check ((user_id = auth.uid() and not is_client()) or is_admin());

-- Submitted and approved entries are frozen for their owner; submitting
-- is the owner moving a draft or rejected row to 'submitted'.
create policy own_time_update on time_entries for update to authenticated
  using ((user_id = auth.uid() and not is_locked and status in ('draft', 'rejected')) or (select is_admin()))
  with check ((user_id = auth.uid() and not is_locked and status in ('draft', 'rejected', 'submitted')) or (select is_admin()));

create policy own_time_delete on time_entries for delete to authenticated
  using ((user_id = auth.uid() and not is_locked and status in ('draft', 'rejected')) or (select is_admin()));

-- ---------- Expenses: same shape ----------

create policy own_exp_select on expenses for select to authenticated
  using (deleted_at is null and (user_id = (select auth.uid()) or (select has_permission('see_all_time'))));

create policy own_exp_insert on expenses for insert to authenticated
  with check ((user_id = auth.uid() and not is_client()) or is_admin());

create policy own_exp_update on expenses for update to authenticated
  using ((user_id = auth.uid() and not is_locked) or is_admin())
  with check ((user_id = auth.uid() and not is_locked) or is_admin());

create policy own_exp_delete on expenses for delete to authenticated
  using ((user_id = auth.uid() and not is_locked) or is_admin());

-- ---------- Billing batches ----------

create policy read_all    on billing_batches for select to authenticated using (not (select is_client()));
create policy manage_invoices on billing_batches for all to authenticated using ((select has_permission('manage_invoices'))) with check ((select has_permission('manage_invoices')));

-- ---------- Invoicing: admins only ----------

create policy manage_settings on invoice_settings for all to authenticated using (has_permission('manage_settings')) with check (has_permission('manage_settings'));
create policy client_select    on invoice_settings for select to authenticated using (is_client());  -- portal header
create policy manage_invoices on invoices         for all to authenticated using ((select has_permission('manage_invoices'))) with check ((select has_permission('manage_invoices')));
-- Clients read their own sent and paid invoices (and Harvest history).
create policy client_select on invoices         for select to authenticated using (is_client() and client_id = my_client_id() and status in ('sent', 'paid'));
create policy client_select on invoice_lines    for select to authenticated using (is_client() and exists (select 1 from invoices i where i.id = invoice_id));
create policy client_select on invoice_payments for select to authenticated using (is_client() and exists (select 1 from invoices i where i.id = invoice_id));
create policy manage_invoices on invoice_lines    for all to authenticated using ((select has_permission('manage_invoices'))) with check ((select has_permission('manage_invoices')));
create policy manage_invoices on invoice_payments for all to authenticated using ((select has_permission('manage_invoices'))) with check ((select has_permission('manage_invoices')));

-- ---------- Quoting ----------

create policy read_all on quotes              for select to authenticated using (not (select is_client()) or (client_id = (select my_client_id()) and status <> 'draft'));
create policy read_all on quote_line_items    for select to authenticated using (not is_client() or exists (select 1 from quotes q where q.id = quote_id));
create policy read_all on quote_sitemap_nodes for select to authenticated using (not is_client() or exists (select 1 from quotes q where q.id = quote_id));

create policy manage_quotes on quotes              for all to authenticated using ((select has_permission('manage_quotes'))) with check ((select has_permission('manage_quotes')));
create policy manage_quotes on quote_line_items    for all to authenticated using ((select has_permission('manage_quotes'))) with check ((select has_permission('manage_quotes')));
create policy manage_quotes on quote_sitemap_nodes for all to authenticated using ((select has_permission('manage_quotes'))) with check ((select has_permission('manage_quotes')));

-- ---------- Harvest archive ----------

create policy read_all    on harvest_archive_monthly for select to authenticated using (not (select is_client()));
create policy manage_invoices on harvest_archive_monthly for all to authenticated using ((select has_permission('manage_invoices'))) with check ((select has_permission('manage_invoices')));
create policy manage_invoices on harvest_invoices for all to authenticated using ((select has_permission('manage_invoices'))) with check ((select has_permission('manage_invoices')));
create policy client_select  on harvest_invoices for select to authenticated using (is_client() and client_id = my_client_id());

-- ---------- Tasks: the whole team reads and writes ----------
-- Deleting a task is the creator's or an admin's; comments and files are
-- edited by their author or an admin.

create policy read_all    on work_statuses for select to authenticated using (true);
create policy manage_settings on work_statuses for all to authenticated using (has_permission('manage_settings')) with check (has_permission('manage_settings'));

-- Who sees a task: the same rule as task_visible(), written so the
-- permission and client checks run once per query and the row parts
-- use indexes (work_items is the biggest table people list).
create policy visible_select on work_items for select to authenticated using (
  deleted_at is null and
  case when (select is_client()) then
    shared_at is not null or exists (select 1 from projects p where p.id = work_items.project_id and p.client_visible)
  else
    (select has_permission('see_all_tasks'))
    or created_by = (select auth.uid())
    or exists (select 1 from work_item_assignees a where a.work_item_id = work_items.id and a.user_id = (select auth.uid()))
  end
  and (not (select is_client()) or exists (select 1 from projects p where p.id = work_items.project_id and p.client_id = (select my_client_id())))
);
create policy team_insert    on work_items for insert to authenticated with check (created_by = auth.uid() and not is_client());
create policy visible_update on work_items for update to authenticated using (task_visible(id) and not is_client()) with check (task_visible(id) and not is_client());
create policy owner_delete   on work_items for delete to authenticated using (created_by = auth.uid() or has_permission('manage_tasks'));

-- CASE so the one-per-query permission check is tried before the per-row function.
create policy visible_select on work_item_assignees for select to authenticated using (case when (select has_permission('see_all_tasks')) then true else task_visible(work_item_id) end);
create policy visible_select on work_item_dependencies for select to authenticated using (case when (select has_permission('see_all_tasks')) then true else task_visible(predecessor_id) and task_visible(successor_id) end);
create policy team_write    on work_item_dependencies for all to authenticated
  using (not (select is_client()) and case when (select has_permission('see_all_tasks')) then true else task_visible(successor_id) end)
  with check (not (select is_client()) and case when (select has_permission('see_all_tasks')) then true else task_visible(predecessor_id) and task_visible(successor_id) end);
-- "for all" policies also apply to reads, so these use the same cheap-first CASE.
create policy visible_write  on work_item_assignees for all to authenticated
  using (not (select is_client()) and case when (select has_permission('see_all_tasks')) then true else task_visible(work_item_id) end)
  with check (not (select is_client()) and case when (select has_permission('see_all_tasks')) then true else task_visible(work_item_id) end);

-- Clients see and write only comments marked visible to them.
create policy visible_select on work_item_comments for select to authenticated using (deleted_at is null and (case when (select has_permission('see_all_tasks')) then true else task_visible(work_item_id) end) and (not (select is_client()) or visible_to_client));
create policy own_insert on work_item_comments for insert to authenticated with check (author_id = auth.uid() and task_visible(work_item_id) and (not is_client() or visible_to_client));
create policy own_update on work_item_comments for update to authenticated using (author_id = auth.uid() or has_permission('manage_tasks')) with check (author_id = auth.uid() or has_permission('manage_tasks'));
create policy own_delete on work_item_comments for delete to authenticated using (author_id = auth.uid() or has_permission('manage_tasks'));

create policy visible_select on work_item_files for select to authenticated using ((case when (select has_permission('see_all_tasks')) then true else task_visible(work_item_id) end) and (not (select is_client()) or kind = 'upload'));
create policy own_insert  on work_item_files for insert to authenticated with check (uploaded_by = auth.uid() and not is_client());
-- Anyone on the team may turn a server link into a shareable uploaded copy.
create policy visible_update on work_item_files for update to authenticated using (task_visible(work_item_id) and not is_client()) with check (task_visible(work_item_id) and not is_client());
create policy own_delete  on work_item_files for delete to authenticated using (uploaded_by = auth.uid() or has_permission('manage_tasks'));

-- ---------- Time off, capacity ----------

create policy read_all on time_off            for select to authenticated using (not (select is_client()));
create policy read_all on availability        for select to authenticated using (not (select is_client()));
create policy read_all on estimator_materials for select to authenticated using (not (select is_client()));
create policy read_all on estimator_settings  for select to authenticated using (not (select is_client()));
create policy manage_settings on estimator_materials for all to authenticated using (has_permission('manage_settings')) with check (has_permission('manage_settings'));
create policy manage_settings on estimator_settings  for all to authenticated using (has_permission('manage_settings')) with check (has_permission('manage_settings'));
create policy own_or_settings on ai_events for select to authenticated using (user_id = auth.uid() or has_permission('manage_settings'));

-- People log their own time off; admins manage holidays and everyone else.
create policy own_time_off on time_off for all to authenticated
  using ((user_id = auth.uid() and not is_client()) or has_permission('manage_people'))
  with check ((user_id = auth.uid() and not is_client()) or has_permission('manage_people'));

-- Calendar detail is personal: own rows only.
create policy own_calendar on calendar_busy for select to authenticated
  using (user_id = auth.uid() or has_permission('see_capacity'));

create policy manage_people on availability      for all to authenticated using (has_permission('manage_people')) with check (has_permission('manage_people'));
create policy manage_people on calendar_busy     for all to authenticated using (has_permission('manage_people')) with check (has_permission('manage_people'));

-- ---------- Reminders ----------

create policy own_reminders on reminder_log for select to authenticated
  using (user_id = auth.uid() or has_permission('manage_settings'));
create policy manage_settings on reminder_log for all to authenticated using (has_permission('manage_settings')) with check (has_permission('manage_settings'));

-- ---------- Audit log: admins read, nobody writes directly ----------

create policy manage_settings on audit_log for select to authenticated using (has_permission('manage_settings'));

-- ---------- Saved reports ----------

create policy own_or_shared on saved_reports for select to authenticated
  using (owner_id = auth.uid() or is_shared or is_admin());

create policy own_reports on saved_reports for all to authenticated
  using ((owner_id = auth.uid() and not is_client()) or is_admin())
  with check ((owner_id = auth.uid() and not is_client()) or is_admin());

-- ============================================================
-- 5. FUNCTION GRANTS
-- Supabase exposes every public function over /rest/v1/rpc by default.
-- Trigger functions run as the table owner and never need caller
-- EXECUTE. is_admin() must stay callable by authenticated because RLS
-- policies evaluate it as the querying user.
-- ============================================================

revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.write_audit_log()          from public, anon, authenticated;
revoke execute on function public.protect_profile_columns()  from public, anon, authenticated;
revoke execute on function public.set_rate_snapshot()        from public, anon, authenticated;
revoke execute on function public.work_item_touch()          from public, anon, authenticated;
revoke execute on function public.quote_line_amount()        from public, anon, authenticated;
revoke execute on function public.quote_recalc(uuid)         from public, anon, authenticated;
revoke execute on function public.quote_lines_changed()      from public, anon, authenticated;
revoke execute on function public.next_quote_number()        from public, anon, authenticated;
revoke execute on function public.create_quote(uuid, text)   from public, anon;
revoke execute on function public.accept_quote(uuid, text, text)  from public, anon;
revoke execute on function public.decline_quote(uuid, text, text) from public, anon;
revoke execute on function public.is_admin()                 from public, anon;
revoke execute on function public.has_permission(text)        from public, anon;
revoke execute on function public.task_visible(uuid)          from public, anon;
revoke execute on function public.notify(uuid, text, text, text, text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.run_notification_emails()   from public, anon;
revoke execute on function public.run_due_notifications()     from public, anon;
revoke execute on function public.is_client()                 from public, anon;
revoke execute on function public.my_client_id()              from public, anon;
revoke execute on function public.resolve_rate(uuid, uuid, uuid) from public, anon;
revoke execute on function public.project_budget(uuid)       from public, anon;
revoke execute on function public.project_budgets()          from public, anon;
revoke execute on function public.retainer_status()          from public, anon;
revoke execute on function public.relink_harvest_archive()   from public, anon;
revoke execute on function public.report_time_monthly(date, date, text, text, text, text[]) from public, anon;
revoke execute on function public.report_time(date, date, text, text, text, text, text, boolean) from public, anon;
revoke execute on function public.report_expenses(date, date, text, text, text, text, text, boolean) from public, anon;
revoke execute on function public.report_rollup(date, date, text, text, text, text, boolean) from public, anon;
revoke execute on function public.search(text, text, int) from public, anon;
revoke execute on function public.create_billing_batch(uuid, date, date, uuid[], uuid[], uuid) from public, anon;
revoke execute on function public.void_billing_batch(uuid)  from public, anon;
revoke execute on function public.unbilled_summary()        from public, anon;
revoke execute on function public.recalc_invoice(uuid)       from public, anon, authenticated;
revoke execute on function public.invoice_children_changed() from public, anon, authenticated;
revoke execute on function public.invoice_tax_changed()      from public, anon, authenticated;
revoke execute on function public.next_invoice_number()      from public, anon, authenticated;
revoke execute on function public.create_invoice(uuid, uuid, text) from public, anon;
revoke execute on function public.void_invoice(uuid)         from public, anon;

-- ============================================================
-- 6. STORAGE
-- Receipts live in the private `receipts` bucket, one folder per person:
--   receipts/<user_id>/<uuid>.<ext>
-- Owners read and write their own folder; admins read, write, and delete
-- any (the Harvest import files receipts under their owner).
-- Supabase's storage schema already exists; the local check stubs it.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts'
              and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy receipts_update on storage.objects for update to authenticated
  using (bucket_id = 'receipts'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))
  with check (bucket_id = 'receipts'
              and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Files on tasks (work_item_files): private bucket, whole team reads and
-- uploads, uploader or admin deletes. Paths are <work_item_id>/<uuid>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit)
values ('work-files', 'work-files', false, 26214400)
on conflict (id) do nothing;

create policy work_files_read on storage.objects for select to authenticated
  using (bucket_id = 'work-files');
create policy work_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'work-files');
create policy work_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'work-files' and (owner = auth.uid() or public.is_admin()));

-- ============================================================
-- 7. REMINDERS
-- pg_cron runs run_reminders() at five past every hour. It emails through
-- Resend with pg_net, straight from Postgres, so there is nothing to deploy
-- outside this file. Secrets live in Vault (dashboard > SQL editor):
--   select vault.create_secret('re_...', 'resend_api_key');
--   select vault.create_secret('Docket <docket@giganticdesign.com>', 'resend_from');
--   select vault.create_secret('https://docket.giganticdesign.com', 'app_url');
-- Until resend_api_key exists the job only raises a warning; nothing is
-- logged, so the first send happens once the key is in.
-- reminder_log's unique (user_id, kind, for_date) makes each reminder go
-- out once per person per day however often the job runs. The agency is
-- on Central Time: "today", "yesterday", and "9am" use America/Chicago.
-- The local check has neither pg_cron nor pg_net, hence the guards.
-- ============================================================

do $$ begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_net / pg_cron not available here: %', sqlerrm;
end $$;

-- Read one Vault secret, with a default. Internal only.
create or replace function public.vault_secret(p_name text, p_default text default null)
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = p_name limit 1),
    p_default
  );
$$;

-- Log and send one reminder. Returns false when it already went out for
-- that person, kind, and day, or when there is no Resend key yet. With
-- p_dry_run it only reports whether a send would happen.
create or replace function public.send_reminder(
  p_user_id uuid, p_kind public.reminder_kind, p_for_date date,
  p_subject text, p_body text, p_dry_run boolean default false
)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text;
  v_key   text;
  v_from  text;
  v_id    uuid;
begin
  select pr.email into v_email from public.profiles pr where pr.id = p_user_id and pr.is_active;
  if v_email is null then return false; end if;

  if p_dry_run then
    return not exists (
      select 1 from public.reminder_log l
      where l.user_id = p_user_id and l.kind = p_kind and l.for_date = p_for_date
    );
  end if;

  v_key := public.vault_secret('resend_api_key');
  if v_key is null then
    raise warning 'reminders: resend_api_key is not in Vault, not sending % to %', p_kind, v_email;
    return false;
  end if;

  insert into public.reminder_log (user_id, kind, for_date)
  values (p_user_id, p_kind, p_for_date)
  on conflict (user_id, kind, for_date) do nothing
  returning id into v_id;
  if v_id is null then return false; end if;

  v_from := public.vault_secret('resend_from', 'Docket <onboarding@resend.dev>');
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    body    := jsonb_build_object('from', v_from, 'to', jsonb_build_array(v_email),
                                  'subject', p_subject, 'text', p_body),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key,
                                  'Content-Type', 'application/json')
  );
  return true;
end;
$$;

-- Find what is due and send it. Timers running over 10 hours are checked
-- every run; "no time yesterday" only in the 9am hour Central, on weekdays,
-- skipping people who had time off (or a company holiday) that day.
-- Callable by admins over the API for a dry run; cron calls it as postgres.
create or replace function public.run_reminders(p_dry_run boolean default false)
returns table (kind public.reminder_kind, email text, subject text, sent boolean)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_local     timestamp := now() at time zone 'America/Chicago';
  v_today     date := v_local::date;
  v_yesterday date := v_local::date - 1;
  v_app       text := public.vault_secret('app_url', 'https://docket.giganticdesign.com');
  r           record;
  v_subject   text;
  v_body      text;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Admins only';
  end if;

  for r in
    select te.user_id, te.started_at, pr.full_name, pr.email as to_email,
           p.name as project_name, t.name as task_name,
           round(extract(epoch from (now() - te.started_at)) / 3600) as hours_running
    from public.time_entries te
    join public.profiles pr on pr.id = te.user_id
    join public.projects  p  on p.id = te.project_id
    join public.tasks     t  on t.id = te.task_id
    where te.started_at is not null and te.ended_at is null and te.deleted_at is null
      and te.started_at < now() - interval '10 hours'
      and pr.is_active
  loop
    v_subject := format('Your Docket timer has been running for %s hours', r.hours_running);
    v_body := format(
      E'Hi %s,\n\nA timer on %s / %s has been running since %s, about %s hours.\n\nIf you forgot to stop it, fix the entry here: %s/time\n\nDocket',
      split_part(r.full_name, ' ', 1), r.project_name, r.task_name,
      to_char(r.started_at at time zone 'America/Chicago', 'FMDay FMMon FMDD, FMHH12:MI AM'),
      r.hours_running, v_app);
    kind := 'timer_left_running';
    email := r.to_email;
    subject := v_subject;
    sent := public.send_reminder(r.user_id, 'timer_left_running', v_today, v_subject, v_body, p_dry_run);
    if sent and not p_dry_run then perform public.notify(r.user_id, 'timer', v_subject, null, '/time', null, null, 'none'); end if;
    return next;
  end loop;

  if extract(hour from v_local) = 9 and extract(isodow from v_yesterday) between 1 and 5 then
    for r in
      select pr.id as user_id, pr.full_name, pr.email as to_email
      from public.profiles pr
      where pr.is_active
        and not exists (select 1 from public.time_entries te
                        where te.user_id = pr.id and te.spent_on = v_yesterday and te.deleted_at is null)
        and not exists (select 1 from public.time_off o
                        where (o.user_id = pr.id or o.user_id is null)
                          and v_yesterday between o.starts_on and o.ends_on)
    loop
      v_subject := format('No time logged for %s', to_char(v_yesterday, 'FMDay, FMMon FMDD'));
      v_body := format(
        E'Hi %s,\n\nDocket has no time from you for %s. Add it here when you get a minute: %s/time?date=%s\n\nDocket',
        split_part(r.full_name, ' ', 1), to_char(v_yesterday, 'FMDay, FMMon FMDD'), v_app, v_yesterday);
      kind := 'missing_time';
      email := r.to_email;
      subject := v_subject;
      sent := public.send_reminder(r.user_id, 'missing_time', v_yesterday, v_subject, v_body, p_dry_run);
      if sent and not p_dry_run then perform public.notify(r.user_id, 'missing_time', v_subject, null, '/time?date=' || v_yesterday, null, null, 'none'); end if;
      return next;
    end loop;
  end if;
  return;
end;
$$;

revoke execute on function public.vault_secret(text, text) from public, anon, authenticated;
revoke execute on function public.send_reminder(uuid, public.reminder_kind, date, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.run_reminders(boolean) from public, anon;

do $$ begin
  perform cron.unschedule('docket-reminders');
exception when others then null;
end $$;
do $$ begin
  perform cron.schedule('docket-reminders', '5 * * * *', 'select public.run_reminders()');
exception when others then
  raise notice 'pg_cron not available here, reminders not scheduled: %', sqlerrm;
end $$;

-- Overdue invoice reminders. Off until invoice_settings.remind_overdue is
-- on. Emails the invoice's recipients every remind_every_days, in the 9am
-- hour Central. Admins can dry-run it over the API.
create or replace function public.run_invoice_reminders(p_dry_run boolean default false, p_force boolean default false)
returns table (invoice_number text, to_emails text[], sent boolean)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_local   timestamp := now() at time zone 'America/Chicago';
  v_today   date := v_local::date;
  s         record;
  r         record;
  v_key     text;
  v_from    text;
  v_app     text;
  v_subject text;
  v_body    text;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Admins only'; end if;
  select * into s from public.invoice_settings where id;
  if not s.remind_overdue then return; end if;
  if not p_force and not p_dry_run and extract(hour from v_local) <> 9 then return; end if;

  v_key  := public.vault_secret('resend_api_key');
  v_from := public.vault_secret('resend_from', 'Docket <onboarding@resend.dev>');
  v_app  := public.vault_secret('app_url', 'https://docket.giganticdesign.com');

  for r in
    select i.id, i.number, i.due_date, i.due_amount, i.sent_to, i.public_token, c.name as client_name
    from public.invoices i
    join public.clients c on c.id = i.client_id
    where i.status = 'sent' and i.due_amount > 0 and i.due_date < v_today
      and i.sent_to is not null and cardinality(i.sent_to) > 0
      and (i.last_reminded_at is null or i.last_reminded_at < now() - make_interval(days => s.remind_every_days))
    order by i.due_date
  loop
    invoice_number := r.number;
    to_emails := r.sent_to;
    sent := false;
    if p_dry_run then
      sent := v_key is not null;
      return next;
      continue;
    end if;
    if v_key is null then
      raise warning 'invoice reminders: resend_api_key is not in Vault, not sending for invoice %', r.number;
      return next;
      continue;
    end if;
    v_subject := format('Reminder: invoice %s from %s is past due', r.number, s.company_name);
    v_body := format(
      E'Hello,\n\nInvoice %s for %s was due on %s. $%s is still outstanding.\n\nView or download it here: %s/i/%s\n\n%s\n\nThank you,\n%s',
      r.number, r.client_name, to_char(r.due_date, 'FMMonth FMDD, YYYY'),
      to_char(r.due_amount, 'FM999,999,990.00'), v_app, r.public_token,
      coalesce(s.payment_instructions, ''), s.company_name);
    perform net.http_post(
      url     := 'https://api.resend.com/emails',
      body    := jsonb_build_object('from', v_from, 'to', to_jsonb(r.sent_to), 'subject', v_subject, 'text', v_body),
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json')
    );
    update public.invoices set last_reminded_at = now() where id = r.id;
    sent := true;
    return next;
  end loop;
end;
$$;

revoke execute on function public.run_invoice_reminders(boolean, boolean) from public, anon;
-- The invoice email route reads the Resend key through this, server side only.
grant execute on function public.vault_secret(text, text) to service_role;

do $$ begin
  perform cron.schedule('docket-invoice-reminders', '10 * * * *', 'select public.run_invoice_reminders()');
  perform cron.schedule('docket-notification-emails', '*/5 * * * *', 'select public.run_notification_emails()');
  perform cron.schedule('docket-due-notifications', '15 * * * *', 'select public.run_due_notifications()');
exception when others then
  raise notice 'pg_cron not available here, invoice reminders not scheduled: %', sqlerrm;
end $$;

-- ============================================================
-- PHASE 3. VIEW PERSISTENCE
-- How each person left each screen: view mode, grouping, sort, filters.
-- One row per person per screen (key), so it follows them between the
-- desktop app and the browser. useViewState() in the app reads all of a
-- person's rows once, then upserts the changed row half a second after
-- the last change. Anything in the page URL still wins over this.
-- ============================================================

create table user_views (
  user_id    uuid not null references profiles(id) on delete cascade,
  key        text not null,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table user_views enable row level security;
create policy own_views on user_views for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on user_views to authenticated;

-- Mac app builds. Public so the download link in the update banner works
-- without a sign-in; only people who manage settings can put files here.
-- desktop/release.sh builds the DMG and rewrites public/desktop/latest.json.
insert into storage.buckets (id, name, public, file_size_limit)
values ('desktop', 'desktop', true, 209715200)
on conflict (id) do nothing;
create policy desktop_read   on storage.objects for select to anon, authenticated using (bucket_id = 'desktop');
create policy desktop_insert on storage.objects for insert to authenticated with check (bucket_id = 'desktop' and has_permission('manage_settings'));
create policy desktop_update on storage.objects for update to authenticated using (bucket_id = 'desktop' and has_permission('manage_settings'));
create policy desktop_delete on storage.objects for delete to authenticated using (bucket_id = 'desktop' and has_permission('manage_settings'));

-- ============================================================
-- PHASE 3. UNDO
-- Deletes on tasks, time entries, expenses, and comments are soft: a
-- BEFORE DELETE trigger turns the delete into deleted_at = now() (after
-- the delete policy has already said yes), the select policies hide
-- marked rows, and restore_deleted() clears the mark within thirty
-- days for the person who deleted or someone who manages that data.
-- purge_deleted() removes marked rows for good after thirty days, with
-- docket.purge set so the trigger lets the delete through. Security
-- definer functions that aggregate these tables filter deleted_at
-- themselves; security invoker views get it from RLS.
-- ============================================================

alter table time_entries       add column deleted_at timestamptz, add column deleted_by uuid references profiles(id) on delete set null;
alter table expenses           add column deleted_at timestamptz, add column deleted_by uuid references profiles(id) on delete set null;
alter table work_items         add column deleted_at timestamptz, add column deleted_by uuid references profiles(id) on delete set null;
alter table work_item_comments add column deleted_at timestamptz, add column deleted_by uuid references profiles(id) on delete set null;

create or replace function public.soft_delete_row()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if current_setting('docket.purge', true) = 'on' then return old; end if;
  execute format('update public.%I set deleted_at = now(), deleted_by = $1 where id = $2', tg_table_name)
    using auth.uid(), old.id;
  return null;
end;
$$;
create trigger soft_delete before delete on time_entries       for each row execute function public.soft_delete_row();
create trigger soft_delete before delete on expenses           for each row execute function public.soft_delete_row();
create trigger soft_delete before delete on work_items         for each row execute function public.soft_delete_row();
create trigger soft_delete before delete on work_item_comments for each row execute function public.soft_delete_row();

create or replace function public.restore_deleted(p_table text, p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_by uuid;
  v_at timestamptz;
  v_perm text := case when p_table in ('work_items', 'work_item_comments') then 'manage_tasks' else 'see_all_time' end;
begin
  if p_table not in ('time_entries', 'expenses', 'work_items', 'work_item_comments') then
    raise exception 'Nothing to restore there';
  end if;
  execute format('select deleted_by, deleted_at from public.%I where id = $1', p_table) into v_by, v_at using p_id;
  if v_at is null then return; end if;
  if v_at < now() - interval '30 days' then raise exception 'Too old to restore'; end if;
  if not (v_by = auth.uid() or public.has_permission(v_perm)) then raise exception 'Not yours to restore'; end if;
  execute format('update public.%I set deleted_at = null, deleted_by = null where id = $1', p_table) using p_id;
end;
$$;
revoke execute on function public.restore_deleted(text, uuid) from public, anon;
grant execute on function public.restore_deleted(text, uuid) to authenticated;

-- The audit trail for one time entry or expense, readable by its owner
-- or anyone who sees all time. audit_log itself stays admin-only.
create or replace function public.entry_history(p_table text, p_id uuid)
returns table (changed_at timestamptz, changed_by uuid, changed_by_name text, action text, changed_fields text[], old_data jsonb, new_data jsonb)
language plpgsql security definer
set search_path = ''
as $$
declare v_ok boolean;
begin
  if p_table not in ('time_entries', 'expenses') then raise exception 'No history there'; end if;
  execute format('select exists (select 1 from public.%I where id = $1 and (user_id = auth.uid() or public.has_permission(''see_all_time'')))', p_table) into v_ok using p_id;
  if not v_ok then return; end if;
  return query
    select a.changed_at, a.changed_by, pr.full_name, a.action::text, a.changed_fields, a.old_data, a.new_data
    from public.audit_log a
    left join public.profiles pr on pr.id = a.changed_by
    where a.table_name = p_table and a.record_id = p_id
    order by a.changed_at desc
    limit 100;
end;
$$;
revoke execute on function public.entry_history(text, uuid) from public, anon;
grant execute on function public.entry_history(text, uuid) to authenticated;

create or replace function public.purge_deleted()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform set_config('docket.purge', 'on', true);
  delete from public.work_item_comments where deleted_at < now() - interval '30 days';
  delete from public.work_items         where deleted_at < now() - interval '30 days';
  delete from public.expenses           where deleted_at < now() - interval '30 days';
  delete from public.time_entries       where deleted_at < now() - interval '30 days';
end;
$$;
revoke execute on function public.purge_deleted() from public, anon, authenticated;

do $$ begin
  perform cron.schedule('docket-purge-deleted', '30 9 * * *', 'select public.purge_deleted()');
exception when others then
  raise notice 'pg_cron not available here, purge not scheduled: %', sqlerrm;
end $$;

-- The Assistant remembers its conversations per person. Own rows only.
create table assistant_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  title      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assistant_conversations_user on assistant_conversations (user_id, updated_at desc);
alter table assistant_conversations enable row level security;
create policy own_conversations on assistant_conversations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on assistant_conversations to authenticated;

create table assistant_messages (
  id              bigserial primary key,
  conversation_id uuid not null references assistant_conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);
create index assistant_messages_conversation on assistant_messages (conversation_id, id);
alter table assistant_messages enable row level security;
create policy own_messages on assistant_messages for all to authenticated
  using (exists (select 1 from assistant_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from assistant_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));
grant select, insert, update, delete on assistant_messages to authenticated;

-- Every finished project that had time on it (live ones marked inactive,
-- plus Harvest-only history), with total hours and amount and when it
-- ran. The New project form uses it to show what similar projects took.
-- Amount is null without see_money.
create or replace function public.project_history(p_words text[])
returns table (project_id uuid, name text, client_name text, hours numeric, amount numeric, first_on date, last_on date)
language sql stable
set search_path = ''
as $$
  -- Only names sharing a word with the one being typed, so the form
  -- does not pull every project that ever existed.
  with pat as (
    select '(' || string_agg(regexp_replace(w, '[^a-z0-9]', '', 'g'), '|') || ')' as re
    from unnest(p_words) w where length(regexp_replace(w, '[^a-z0-9]', '', 'g')) > 1
  ), live as (
    select p.id as project_id, p.name, c.name as client_name,
           coalesce(b.hours_used, 0) as hours,
           b.amount_used as amount,
           least(p.created_at::date,
                 (select min(te.spent_on) from public.time_entries te where te.project_id = p.id and te.deleted_at is null),
                 (select min(a.period_month) from public.harvest_archive_monthly a where a.project_id = p.id)) as first_on,
           greatest((select max(te.spent_on) from public.time_entries te where te.project_id = p.id and te.deleted_at is null),
                    (select max(a.period_month) from public.harvest_archive_monthly a where a.project_id = p.id)) as last_on
    from public.projects p
    join public.clients c on c.id = p.client_id
    left join public.project_budgets() b on b.project_id = p.id
    where not p.is_active and p.name ~* (select re from pat)  -- finished projects only
  ), arch as (
    select null::uuid as project_id, a.project_name as name, a.client_name,
           sum(a.hours) as hours,
           case when (select public.has_permission('see_money')) then sum(a.amount) end as amount,
           min(a.period_month) as first_on, max(a.period_month) as last_on
    from public.harvest_archive_monthly a
    where a.project_id is null and a.project_name ~* (select re from pat)
    group by a.project_name, a.client_name
  )
  select * from live where hours > 0
  union all
  select * from arch where hours > 0
  limit 300;
$$;

alter table page_templates enable row level security;
create policy read_all on page_templates for select to authenticated using (not (select is_client()));
create policy manage_settings on page_templates for all to authenticated
  using ((select has_permission('manage_settings'))) with check ((select has_permission('manage_settings')));
grant select, insert, update, delete on page_templates to authenticated;

-- Who owns a project day to day. One person, optional.
alter table projects add column lead_id uuid references profiles(id) on delete set null;

-- Phase 4, item 2: what a task type usually costs on a quote, what a
-- person costs the company, who a scope line is for and when.
alter table tasks add column default_rate numeric(10,2),        -- prefills a quote line's rate
                  add column default_description text;          -- and its description
alter table profiles add column cost_rate numeric(10,2);        -- internal cost per hour; margin is rate minus this
alter table quote_line_items add column assignee_id uuid references profiles(id) on delete set null,
                             add column target_week date;       -- the Monday the work should land; capacity shows it
create index quote_line_items_assignee on quote_line_items (assignee_id);

-- Cost and margin per scope line, for people who may see money. Cost
-- rates stay in Postgres: quote_line_items is readable by all staff, so
-- the join happens here, not in the browser. Lines with no person, no
-- hours, or a person with no cost rate are left out.
create or replace function public.quote_line_margins(p_quote_id uuid)
returns table (line_item_id uuid, cost numeric, margin numeric)
language sql stable security definer
set search_path = ''
as $$
  select l.id, round(l.hours * p.cost_rate, 2), round(l.amount - l.hours * p.cost_rate, 2)
  from public.quote_line_items l
  join public.profiles p on p.id = l.assignee_id
  where l.quote_id = p_quote_id
    and (select public.has_permission('see_money'))
    and l.hours is not null and p.cost_rate is not null;
$$;
revoke execute on function public.quote_line_margins(uuid) from public, anon;

-- Phase 4, item 4: project templates. A preset list of tasks (title,
-- task type, hours, a suggested role) dropped into a new project of any
-- kind. page_templates stays as it is, for quoted websites.
create table project_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  position    int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create table project_template_items (
  id             uuid primary key default gen_random_uuid(),
  template_id    uuid not null references project_templates(id) on delete cascade,
  title          text not null,
  task_id        uuid references tasks(id) on delete set null,
  estimate_hours numeric(6,2),
  default_role   text references roles(key) on update cascade on delete set null,  -- a hint for who, never assigned automatically
  sort_order     int not null default 0
);
create index project_template_items_template on project_template_items (template_id, sort_order);
alter table project_templates enable row level security;
alter table project_template_items enable row level security;
create policy read_all on project_templates for select to authenticated using (not (select is_client()));
create policy read_all on project_template_items for select to authenticated using (not (select is_client()));
create policy manage_settings on project_templates for all to authenticated
  using ((select has_permission('manage_settings'))) with check ((select has_permission('manage_settings')));
create policy manage_settings on project_template_items for all to authenticated
  using ((select has_permission('manage_settings'))) with check ((select has_permission('manage_settings')));
grant select, insert, update, delete on project_templates, project_template_items to authenticated;

-- Copies a template's items onto a project as tasks, and makes sure each
-- task type is on the project so time can be logged against it. Runs
-- once, from the New project form; there is no guard against a second
-- run, so that is the only place it is called.
create or replace function public.apply_project_template(p_project_id uuid, p_template_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  if not public.has_permission('manage_reference') then raise exception 'Not allowed'; end if;
  if not exists (select 1 from public.projects where id = p_project_id) then raise exception 'Project not found'; end if;
  for r in
    select task_id from public.project_template_items where template_id = p_template_id and task_id is not null group by task_id
  loop
    insert into public.project_tasks (project_id, task_id) values (p_project_id, r.task_id) on conflict do nothing;
  end loop;
  for r in
    select title, estimate_hours, sort_order from public.project_template_items where template_id = p_template_id order by sort_order
  loop
    insert into public.work_items (project_id, title, estimate_hours, position, created_by)
    values (p_project_id, r.title, r.estimate_hours, r.sort_order, auth.uid());
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.apply_project_template(uuid, uuid) from public, anon;

-- Phase 4, item 5: departments. A label on a project (Web, Signage...)
-- so the list can be filtered to one. Seeded with the Department field
-- ClickUp used; admins edit the list under Settings.
create table departments (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique,
  is_active boolean not null default true
);
insert into departments (name) values ('Web'), ('Creative/Design'), ('Photo/Video'), ('Digital/Lead Gen'), ('Copywriting');
alter table projects add column department_id uuid references departments(id) on delete restrict;
create index projects_department on projects (department_id);
alter table departments enable row level security;
create policy read_all on departments for select to authenticated using (not (select is_client()));
create policy manage_settings on departments for all to authenticated using ((select has_permission('manage_settings'))) with check ((select has_permission('manage_settings')));
grant select, insert, update, delete on departments to authenticated;

-- Phase 4, item 8: the entries behind one retainer period, for the
-- retainer page's drill-down. Scoped exactly as retainer_status() counts
-- usage, so the rows always add up to the period's "used". Security
-- definer because staff without see_all_time cannot read other people's
-- entries, yet the total already shows everyone's. Amount only with
-- see_money. Pre-cutover periods (Harvest archive only) return nothing.
create or replace function public.retainer_period_detail(p_retainer_id uuid)
returns table (entry_id uuid, spent_on date, project_id uuid, project_name text, task_name text, user_name text, hours numeric, amount numeric, notes text)
language sql stable security definer
set search_path = ''
as $$
  select te.id, te.spent_on, p.id, p.name, t.name, pr.full_name, te.hours,
         case when (select public.has_permission('see_money')) then te.hours * coalesce(te.rate_snapshot, 0) end,
         te.notes
  from public.retainers x
  join public.projects p on p.client_id = x.client_id and (x.project_id is null or p.id = x.project_id)
  join public.time_entries te on te.project_id = p.id
  join public.tasks t on t.id = te.task_id
  join public.profiles pr on pr.id = te.user_id
  where x.id = p_retainer_id
    and (not (select public.is_client()) or x.client_id = (select public.my_client_id()))
    and te.deleted_at is null and te.is_billable
    and te.spent_on between x.period_start and x.period_end
    and (te.ended_at is not null or te.started_at is null)
  order by te.spent_on desc, pr.full_name;
$$;
revoke execute on function public.retainer_period_detail(uuid) from public, anon;

-- Phase 4, item 11: timesheet approval. An entry is a draft until its
-- owner submits it; someone with approve_time approves it or sends it
-- back with a reason. Only approved time can go on a billing batch.
create type time_entry_status as enum ('draft', 'submitted', 'approved', 'rejected');
alter table time_entries
  add column status        time_entry_status not null default 'draft',
  add column submitted_at  timestamptz,
  add column reviewed_at   timestamptz,
  add column reviewed_by   uuid references profiles(id) on delete set null,
  add column reject_reason text,
  add constraint time_entries_reject_reason check (status <> 'rejected' or reject_reason is not null);
create index time_entries_status_submitted on time_entries (status) where status = 'submitted';

-- Editing a rejected entry makes it a draft again, so it is not labeled
-- rejected while the person is fixing it. Resubmitting is explicit.
create or replace function public.time_entries_unreject() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'rejected' and new.status = 'rejected' then new.status := 'draft'; end if;
  return new;
end $$;
create trigger time_entries_unreject before update on time_entries
  for each row when (old.status = 'rejected') execute function public.time_entries_unreject();

create or replace function public.approve_time_entries(p_ids uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare v_want int := (select count(distinct x) from unnest(p_ids) x); v_got int;
begin
  if not public.has_permission('approve_time') then raise exception 'Approve time permission needed'; end if;
  update public.time_entries set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = any(p_ids) and status = 'submitted' and deleted_at is null;
  get diagnostics v_got = row_count;
  if v_got <> v_want then raise exception 'Some entries were no longer waiting for approval. Reload and try again.'; end if;
  return v_got;
end $$;

create or replace function public.reject_time_entries(p_ids uuid[], p_reason text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_want int := (select count(distinct x) from unnest(p_ids) x); v_got int; r record;
begin
  if not public.has_permission('approve_time') then raise exception 'Approve time permission needed'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Say what needs to change'; end if;
  update public.time_entries set status = 'rejected', reject_reason = trim(p_reason), reviewed_by = auth.uid(), reviewed_at = now()
  where id = any(p_ids) and status = 'submitted' and deleted_at is null;
  get diagnostics v_got = row_count;
  if v_got <> v_want then raise exception 'Some entries were no longer waiting for approval. Reload and try again.'; end if;
  for r in select user_id, min(spent_on) as first_on, count(*) as n from public.time_entries where id = any(p_ids) group by user_id loop
    perform public.notify(r.user_id, 'time_rejected',
      public.actor_name() || ' sent back ' || r.n || case when r.n = 1 then ' time entry' else ' time entries' end,
      trim(p_reason), '/time?date=' || r.first_on, auth.uid());
  end loop;
  return v_got;
end $$;
revoke execute on function public.approve_time_entries(uuid[]) from public, anon;
revoke execute on function public.reject_time_entries(uuid[], text) from public, anon;

-- Phase 4, item 12: cost and margin on invoices. A person's cost rate
-- (profiles.cost_rate) is frozen onto each entry the way the billable
-- rate is, summed onto the invoice line at creation, and read back only
-- through invoice_lines_detail, which blanks it without see_money. The
-- public invoice and the email never carry it.
alter table time_entries add column cost_snapshot numeric(10,2);   -- cost frozen at save; see profiles.cost_rate
alter table invoice_lines add column cost_amount numeric(12,2);    -- cost behind a service line; null when any entry had no cost
create view invoice_lines_detail with (security_invoker = true) as
select l.id, l.invoice_id, l.position, l.kind, l.description, l.quantity, l.unit_price, l.amount, l.taxable, l.project_id,
       case when (select public.has_permission('see_money')) then l.cost_amount end as cost_amount,
       case when (select public.has_permission('see_money')) and l.cost_amount is not null then l.amount - l.cost_amount end as margin_amount
from invoice_lines l;
grant select on invoice_lines_detail to authenticated;
