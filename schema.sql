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
-- 1. INVOICING: RESOLVED. Billing goes to QuickBooks Online, not built
--    here. This app owns time + expenses; QBO owns invoices, numbering,
--    AR, and payment status.
--    Still to confirm before step 8:
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
-- 4. No invoice tables by design (see 1). CSV export is app-side;
--    saved_reports stores definitions, not output.
-- 5. capacity_weekly counts time off across all 7 days of a week.
--    A full week of PTO shows as 56h against a 40h base. Decide whether
--    to count weekdays only before step 9.
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
create type audit_action         as enum ('insert', 'update', 'delete');
create type billing_batch_status as enum ('draft', 'pushing', 'pushed', 'failed', 'void');

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
-- rewrite history.
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

-- ---------- QuickBooks handoff ----------
-- Defined before time_entries/expenses because they reference it.
-- We do NOT invoice here. A batch groups unbilled time + expenses,
-- pushes them to QuickBooks Online as an invoice, and stores the
-- reference back. QBO owns invoice numbering, AR, and payment status.

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
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique,
  is_active boolean not null default true
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
  created_at      timestamptz not null default now()
);

create trigger expenses_audit
  after insert or update or delete on expenses
  for each row execute function public.write_audit_log();

create index expenses_project_date on expenses (project_id, spent_on);
create index expenses_batch        on expenses (batch_id);

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
-- Booked hours come from ClickUp (cached below), not owned here.

create table availability (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  hours_per_week numeric(5,2) not null default 40,
  effective_from date not null,
  effective_to   date,                  -- null = current
  unique (user_id, effective_from)
);

-- Read-only mirror of ClickUp. Synced on a schedule; never edited by hand.
create table clickup_assignments (
  id              text primary key,     -- ClickUp task id
  user_id         uuid references profiles(id) on delete set null,
  clickup_user_id text,
  project_id      uuid references projects(id) on delete set null,
  clickup_list_id text,
  title           text not null,
  status          text,
  estimate_hours  numeric(8,2),
  start_on        date,
  due_on          date,
  url             text,
  synced_at       timestamptz not null default now()
);

create index clickup_assignments_user_due on clickup_assignments (user_id, due_on);

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
  coalesce((
    select sum(
      (least(t.ends_on, w.week_start + 6) - greatest(t.starts_on, w.week_start) + 1)
      * t.hours_per_day
    )
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
  coalesce((
    select sum(ca.estimate_hours) from clickup_assignments ca
    where ca.user_id = pr.id
      and ca.due_on >= w.week_start
      and ca.due_on <  w.week_start + 7
  ), 0) as booked_hours,
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
  and e.batch_id is null;

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
alter table time_off               enable row level security;
alter table availability           enable row level security;
alter table clickup_assignments    enable row level security;
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

-- ---------- Time off, capacity ----------

create policy read_all on time_off            for select to authenticated using (true);
create policy read_all on availability        for select to authenticated using (true);
create policy read_all on clickup_assignments for select to authenticated using (true);

-- People log their own time off; admins manage holidays and everyone else.
create policy own_time_off on time_off for all to authenticated
  using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

-- Calendar detail is personal: own rows only.
create policy own_calendar on calendar_busy for select to authenticated
  using (user_id = auth.uid() or is_admin());

create policy admin_write on availability        for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_write on clickup_assignments for all to authenticated using (is_admin()) with check (is_admin());
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
revoke execute on function public.is_admin()                 from public, anon;
revoke execute on function public.resolve_rate(uuid, uuid, uuid) from public, anon;
revoke execute on function public.project_budget(uuid)       from public, anon;
revoke execute on function public.retainer_status()          from public, anon;
revoke execute on function public.relink_harvest_archive()   from public, anon;

-- ============================================================
-- 6. STORAGE
-- Receipts live in the private `receipts` bucket, one folder per person:
--   receipts/<user_id>/<uuid>.<ext>
-- Owners read and write their own folder; admins read and delete any.
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
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy receipts_update on storage.objects for update to authenticated
  using (bucket_id = 'receipts'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))
  with check (bucket_id = 'receipts'
              and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
