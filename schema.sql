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
-- 2. E-signature on quotes: not handled. accepted_by is a typed name.
--    Keep PandaDoc if legally signable docs are required.
-- 3. RESOLVED in step 5: retainer_status() chains contiguous periods
--    (same client, project, name) and carries leftover forward when the
--    earlier period has rollover on, capped by its rollover_cap.
-- 4. No Docket invoice tables yet (see 1). harvest_invoices is imported
--    history only. CSV export is app-side; saved_reports stores
--    definitions, not output.
-- 5. RESOLVED in step 9: capacity_weekly counts time off on weekdays
--    only, so a week of PTO is 40h against a 40h base.
-- 6. quotes.public_token (for the /q/[token] public zone) is not here
--    yet. Add it in step 10.
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

create type user_role            as enum ('admin', 'staff');
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

-- Create a profile row when a user is created in Supabase Auth.
-- Name comes from user metadata (Google gives full_name / name), falls
-- back to the part of the email before the @. Role defaults to staff.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Sign-in is Google only, restricted to the agency domain. Supabase
  -- Auth is configured with signups off and admin invites, and the
  -- Google provider is limited to the Workspace domain; this is the
  -- last line of defence if either setting drifts.
  if lower(split_part(new.email, '@', 2)) <> 'giganticdesign.com' then
    raise exception 'Docket accounts must use a giganticdesign.com address';
  end if;

  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
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
  if auth.uid() is not null and not public.is_admin() then
    if new.role         is distinct from old.role
    or new.default_rate is distinct from old.default_rate
    or new.is_active    is distinct from old.is_active
    or new.email        is distinct from old.email then
      raise exception 'Only admins can change role, default_rate, is_active, or email';
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
  elsif new.rate_snapshot is distinct from old.rate_snapshot
        and auth.uid() is not null and not public.is_admin() then
    new.rate_snapshot := old.rate_snapshot;
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

-- ============================================================
-- 2. TABLES
-- Ordered so every foreign key points at a table above it.
-- ============================================================

-- ---------- People ----------

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null,
  email        text not null unique,
  role         user_role not null default 'staff',
  default_rate numeric(10,2),          -- fallback billable rate
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_protect_columns
  before update on profiles
  for each row execute function public.protect_profile_columns();

-- ---------- Work structure ----------

create table clients (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  qbo_customer_id text unique,          -- QuickBooks Online Customer.Id
  harvest_id      bigint unique,        -- Harvest client id, set by the import
  is_active       boolean not null default true,
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

-- ---------- Tasks (step 10; ClickUp is being cancelled) ----------
-- Statuses are a table admins manage (Settings > Task statuses). Flags say
-- which status means done (completed_at, off open lists), paused (off
-- capacity), client review (Share for review moves there), and returned
-- (a client's "changes requested" moves there). Keys are stable; labels,
-- colours, and order are not.
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
  visible_to_client boolean not null default false,                   -- client comments are always true
  created_at        timestamptz not null default now()
);
create index work_item_comments_item on work_item_comments (work_item_id, created_at);

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
  where ended_at is null and started_at is not null;

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
  remind_every_days    int not null default 7 check (remind_every_days > 0)
);
insert into invoice_settings (id) values (true) on conflict do nothing;

create table invoices (
  id               uuid primary key default gen_random_uuid(),
  number           text not null unique,
  client_id        uuid not null references clients(id) on delete restrict,
  batch_id         uuid references billing_batches(id) on delete set null,
  status           invoice_status not null default 'draft',
  subject          text,
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

-- ---------- Quoting (phase 3 scaffolding) ----------
-- Replaces PandaDoc. A quote is accepted -> it becomes a project,
-- and its hour total seeds projects.budget_hours.

create table quotes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete restrict,
  project_id  uuid references projects(id) on delete set null, -- set on acceptance
  number      text not null unique,     -- e.g. Q-2026-014
  title       text not null,
  status      quote_status not null default 'draft',
  intro       text,                     -- scope narrative
  terms       text,
  valid_until date,
  sent_at     timestamptz,
  accepted_at timestamptz,
  accepted_by text,                     -- client name typed at accept
  created_by  uuid not null references profiles(id) on delete restrict,
  created_at  timestamptz not null default now()
);

create index quotes_client_status on quotes (client_id, status);

create table quote_line_items (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references quotes(id) on delete cascade,
  task_id     uuid references tasks(id) on delete set null,  -- maps to tracked task
  sort_order  int not null default 0,
  description text not null,
  hours       numeric(8,2),
  rate        numeric(10,2),
  amount      numeric(12,2) not null default 0,  -- hours * rate, or flat
  created_at  timestamptz not null default now()
);

create index quote_line_items_quote on quote_line_items (quote_id, sort_order);

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
  hours_per_week numeric(5,2) not null default 40,
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
  case when te.is_billable then te.hours * coalesce(te.rate_snapshot, 0) else 0 end as amount,
  te.notes,
  te.is_locked,
  te.batch_id
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
  coalesce(av.hours_per_week, 40) as base_hours,
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
  ), 0) as logged_hours
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
create view unbilled_time with (security_invoker = true) as
select *
from time_detail
where is_billable
  and batch_id is null
  and not is_locked;

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
      and (te.ended_at is not null or te.started_at is null)
  ), arch as (
    select coalesce(sum(a.hours), 0) as hours,
           coalesce(sum(a.billable_hours), 0) as billable_hours,
           coalesce(sum(a.amount), 0) as amount
    from public.harvest_archive_monthly a
    where a.project_id = p_project_id
  )
  select live.hours + arch.hours, live.billable_hours + arch.billable_hours, live.amount + arch.amount
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
    where te.ended_at is not null or te.started_at is null
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
         coalesce(live.amount, 0) + coalesce(arch.amount, 0)
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
    return next;
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
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if v_want_time + v_want_exp = 0 then raise exception 'Pick at least one entry'; end if;

  insert into public.billing_batches (client_id, project_id, period_start, period_end, created_by)
  values (p_client_id, p_project_id, p_period_start, p_period_end, auth.uid())
  returning id into v_id;

  update public.time_entries te set batch_id = v_id, is_locked = true
  from public.projects p
  where te.id = any(p_time_entry_ids) and p.id = te.project_id and p.client_id = p_client_id
    and te.is_billable and te.batch_id is null and not te.is_locked
    and (te.ended_at is not null or te.started_at is null);
  get diagnostics v_got = row_count;
  if v_got <> v_want_time then
    raise exception 'Some time entries were already claimed, locked, or still running. Reload and try again.';
  end if;

  update public.expenses e set batch_id = v_id, is_locked = true
  from public.projects p
  where e.id = any(p_expense_ids) and p.id = e.project_id and p.client_id = p_client_id
    and e.is_billable and e.batch_id is null and not e.is_locked;
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
  if not public.is_admin() then raise exception 'Admins only'; end if;
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
    where te.is_billable and te.batch_id is null and not te.is_locked
      and (te.ended_at is not null or te.started_at is null)
    group by p.client_id
  ) t on t.client_id = c.id
  left join (
    select p.client_id, sum(ex.amount) as amount, min(ex.spent_on) as oldest, max(ex.spent_on) as newest
    from public.expenses ex join public.projects p on p.id = ex.project_id
    where ex.is_billable and ex.batch_id is null and not ex.is_locked
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

-- New draft invoice for a client. With a draft batch, its time becomes one
-- line per project, task, and rate, its expenses one line per project and
-- category, and the batch is marked invoiced.
create or replace function public.create_invoice(p_client_id uuid, p_batch_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id    uuid;
  s       record;
  b       record;
  r       record;
  v_pos   int := 0;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into s from public.invoice_settings where id;
  if p_batch_id is not null then
    select * into b from public.billing_batches where id = p_batch_id for update;
    if b.id is null then raise exception 'Batch not found'; end if;
    if b.status <> 'draft' then raise exception 'Only a draft batch can be invoiced'; end if;
    if b.client_id <> p_client_id then raise exception 'That batch belongs to another client'; end if;
  end if;

  insert into public.invoices (number, client_id, batch_id, issue_date, due_date, tax_rate, notes, created_by)
  values (public.next_invoice_number(), p_client_id, p_batch_id, current_date,
          current_date + s.default_terms_days, s.default_tax_rate, s.default_notes, auth.uid())
  returning id into v_id;

  if p_batch_id is not null then
    for r in
      select p.id as project_id, p.name as project_name, t.name as task_name,
             coalesce(te.rate_snapshot, 0) as rate, sum(te.hours) as hours
      from public.time_entries te
      join public.projects p on p.id = te.project_id
      join public.tasks    t on t.id = te.task_id
      where te.batch_id = p_batch_id
      group by p.id, p.name, t.name, coalesce(te.rate_snapshot, 0)
      order by p.name, t.name, 4 desc
    loop
      v_pos := v_pos + 1;
      insert into public.invoice_lines (invoice_id, position, kind, description, quantity, unit_price, project_id)
      values (v_id, v_pos, 'service', r.project_name || ' / ' || r.task_name, r.hours, r.rate, r.project_id);
    end loop;
    for r in
      select p.id as project_id, p.name as project_name, c.name as category_name, sum(e.amount) as amount
      from public.expenses e
      join public.projects p on p.id = e.project_id
      join public.expense_categories c on c.id = e.category_id
      where e.batch_id = p_batch_id
      group by p.id, p.name, c.name
      order by p.name, c.name
    loop
      v_pos := v_pos + 1;
      insert into public.invoice_lines (invoice_id, position, kind, description, quantity, unit_price, project_id)
      values (v_id, v_pos, 'expense', r.project_name || ' / ' || r.category_name, 1, r.amount, r.project_id);
    end loop;
    update public.billing_batches set status = 'invoiced' where id = p_batch_id;
  end if;
  return v_id;
end $$;

-- Void an unpaid invoice. Its batch (if any) goes back to draft so the
-- work can be invoiced again or the batch voided to release the rows.
create or replace function public.void_invoice(p_invoice_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status public.invoice_status; v_batch uuid; v_paid numeric;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
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

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

alter table profiles               enable row level security;
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

create policy read_all on profiles           for select to authenticated using (true);
create policy read_all on clients            for select to authenticated using (true);
create policy read_all on projects           for select to authenticated using (true);
create policy read_all on tasks              for select to authenticated using (true);
create policy read_all on project_tasks      for select to authenticated using (true);
create policy read_all on expense_categories for select to authenticated using (true);
create policy read_all on retainers          for select to authenticated using (true);

create policy admin_write on clients            for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_write on projects           for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_write on tasks              for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_write on project_tasks      for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_write on expense_categories for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_write on retainers          for all to authenticated using (is_admin()) with check (is_admin());

-- Profiles: you edit yourself (full_name only, see trigger), admins edit anyone.
-- No insert policy: rows come from the auth trigger.
create policy own_profile on profiles for update to authenticated
  using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

-- ---------- Time: own unlocked rows, admins everything ----------

create policy own_time_select on time_entries for select to authenticated
  using (user_id = auth.uid() or is_admin());

create policy own_time_insert on time_entries for insert to authenticated
  with check (user_id = auth.uid() or is_admin());

create policy own_time_update on time_entries for update to authenticated
  using ((user_id = auth.uid() and not is_locked) or is_admin())
  with check ((user_id = auth.uid() and not is_locked) or is_admin());

create policy own_time_delete on time_entries for delete to authenticated
  using ((user_id = auth.uid() and not is_locked) or is_admin());

-- ---------- Expenses: same shape ----------

create policy own_exp_select on expenses for select to authenticated
  using (user_id = auth.uid() or is_admin());

create policy own_exp_insert on expenses for insert to authenticated
  with check (user_id = auth.uid() or is_admin());

create policy own_exp_update on expenses for update to authenticated
  using ((user_id = auth.uid() and not is_locked) or is_admin())
  with check ((user_id = auth.uid() and not is_locked) or is_admin());

create policy own_exp_delete on expenses for delete to authenticated
  using ((user_id = auth.uid() and not is_locked) or is_admin());

-- ---------- Billing batches ----------

create policy read_all    on billing_batches for select to authenticated using (true);
create policy admin_write on billing_batches for all to authenticated using (is_admin()) with check (is_admin());

-- ---------- Invoicing: admins only ----------

create policy admin_all on invoice_settings for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on invoices         for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on invoice_lines    for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on invoice_payments for all to authenticated using (is_admin()) with check (is_admin());

-- ---------- Quoting ----------

create policy read_all on quotes              for select to authenticated using (true);
create policy read_all on quote_line_items    for select to authenticated using (true);
create policy read_all on quote_sitemap_nodes for select to authenticated using (true);

create policy admin_write on quotes              for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_write on quote_line_items    for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_write on quote_sitemap_nodes for all to authenticated using (is_admin()) with check (is_admin());

-- ---------- Harvest archive ----------

create policy read_all    on harvest_archive_monthly for select to authenticated using (true);
create policy admin_write on harvest_archive_monthly for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all   on harvest_invoices for all to authenticated using (is_admin()) with check (is_admin());

-- ---------- Tasks: the whole team reads and writes ----------
-- Deleting a task is the creator's or an admin's; comments and files are
-- edited by their author or an admin.

create policy read_all    on work_statuses for select to authenticated using (true);
create policy admin_write on work_statuses for all to authenticated using (is_admin()) with check (is_admin());

create policy read_all     on work_items for select to authenticated using (true);
create policy team_insert  on work_items for insert to authenticated with check (created_by = auth.uid());
create policy team_update  on work_items for update to authenticated using (true) with check (true);
create policy owner_delete on work_items for delete to authenticated using (created_by = auth.uid() or is_admin());

create policy read_all on work_item_assignees for select to authenticated using (true);
create policy team_all on work_item_assignees for all to authenticated using (true) with check (true);

create policy read_all   on work_item_comments for select to authenticated using (true);
create policy own_insert on work_item_comments for insert to authenticated with check (author_id = auth.uid());
create policy own_update on work_item_comments for update to authenticated using (author_id = auth.uid() or is_admin()) with check (author_id = auth.uid() or is_admin());
create policy own_delete on work_item_comments for delete to authenticated using (author_id = auth.uid() or is_admin());

create policy read_all    on work_item_files for select to authenticated using (true);
create policy own_insert  on work_item_files for insert to authenticated with check (uploaded_by = auth.uid());
-- Anyone on the team may turn a server link into a shareable uploaded copy.
create policy team_update on work_item_files for update to authenticated using (true) with check (true);
create policy own_delete  on work_item_files for delete to authenticated using (uploaded_by = auth.uid() or is_admin());

-- ---------- Time off, capacity ----------

create policy read_all on time_off            for select to authenticated using (true);
create policy read_all on availability        for select to authenticated using (true);

-- People log their own time off; admins manage holidays and everyone else.
create policy own_time_off on time_off for all to authenticated
  using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

-- Calendar detail is personal: own rows only.
create policy own_calendar on calendar_busy for select to authenticated
  using (user_id = auth.uid() or is_admin());

create policy admin_write on availability        for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_write on calendar_busy       for all to authenticated using (is_admin()) with check (is_admin());

-- ---------- Reminders ----------

create policy own_reminders on reminder_log for select to authenticated
  using (user_id = auth.uid() or is_admin());
create policy admin_write   on reminder_log for all to authenticated using (is_admin()) with check (is_admin());

-- ---------- Audit log: admins read, nobody writes directly ----------

create policy admin_read on audit_log for select to authenticated using (is_admin());

-- ---------- Saved reports ----------

create policy own_or_shared on saved_reports for select to authenticated
  using (owner_id = auth.uid() or is_shared or is_admin());

create policy own_reports on saved_reports for all to authenticated
  using (owner_id = auth.uid() or is_admin())
  with check (owner_id = auth.uid() or is_admin());

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
revoke execute on function public.is_admin()                 from public, anon;
revoke execute on function public.resolve_rate(uuid, uuid, uuid) from public, anon;
revoke execute on function public.project_budget(uuid)       from public, anon;
revoke execute on function public.project_budgets()          from public, anon;
revoke execute on function public.retainer_status()          from public, anon;
revoke execute on function public.relink_harvest_archive()   from public, anon;
revoke execute on function public.report_time_monthly(date, date, text, text, text, text[]) from public, anon;
revoke execute on function public.create_billing_batch(uuid, date, date, uuid[], uuid[], uuid) from public, anon;
revoke execute on function public.void_billing_batch(uuid)  from public, anon;
revoke execute on function public.unbilled_summary()        from public, anon;
revoke execute on function public.recalc_invoice(uuid)       from public, anon, authenticated;
revoke execute on function public.invoice_children_changed() from public, anon, authenticated;
revoke execute on function public.invoice_tax_changed()      from public, anon, authenticated;
revoke execute on function public.next_invoice_number()      from public, anon, authenticated;
revoke execute on function public.create_invoice(uuid, uuid) from public, anon;
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
    where te.started_at is not null and te.ended_at is null
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
    return next;
  end loop;

  if extract(hour from v_local) = 9 and extract(isodow from v_yesterday) between 1 and 5 then
    for r in
      select pr.id as user_id, pr.full_name, pr.email as to_email
      from public.profiles pr
      where pr.is_active
        and not exists (select 1 from public.time_entries te
                        where te.user_id = pr.id and te.spent_on = v_yesterday)
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
exception when others then
  raise notice 'pg_cron not available here, invoice reminders not scheduled: %', sqlerrm;
end $$;
