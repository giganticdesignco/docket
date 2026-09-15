# Site plans

The quote sitemap (`quote_sitemap_nodes`, edited inline on `/quotes/[id]`)
becomes a site plan: a page tree that lives on its own screens, is priced
on quotes, is frozen onto a quote when the client accepts, and moves to
the project, where it stays editable and can make tasks for new pages.

This is the build spec. The migration and `schema.sql` are done first,
then `shared/types/database.ts` is regenerated, then the implementation
packages at the end run in parallel.

## 1. Decisions

Luke's decisions (final):

1. **Freeze at acceptance, not at pricing.** Draft and sent quotes show
   the live plan's pages. `accept_quote()` writes a frozen copy into
   `quote_pages`, and an accepted quote's client document reads that copy
   forever. There is no `set_quote_pages` function, no
   `quote_site_plan_changed` trigger, no priced list or dirty tracking of
   pages on the quote, and no "changed since priced" warnings.
   `decline_quote()` does not snapshot.
2. **Editing.** People with `manage_quotes` create and edit plans at every
   stage, including after a plan is on a project. All non-client staff can
   read plans. Clients read no plan table. The screen key
   `screen:site_plans` follows `manage_quotes`, per-person overrides
   included.
3. **Make tasks on request.** Once a plan is on a project, "Make tasks for
   new pages" on the plan screen creates a task for every page that has no
   live task. `site_plan_pages.work_item_id` references `work_items` on
   delete set null. `accept_quote()` sets it for the tasks it creates. A
   page whose linked task is soft-deleted counts as having no task.
4. **Start from a project.** A project without a plan gets "Start a site
   plan", which creates a plan for the project's client with `project_id`
   set. "Make tasks for new pages" then works for it.

Resolved by the orchestrator (not reopened here):

- Tables: `site_plans` (client_id not null, project_id unique nullable,
  name), `site_plan_pages` (tree rows as today plus `work_item_id`; no
  `line_item_id`, no `notes`), `quotes.site_plan_id` (on delete set null),
  `quote_pages` (the acceptance snapshot). `quote_sitemap_nodes` is
  dropped in a second migration, after the new code is deployed
  (section 3). Nothing to migrate.
- Linking: a quote may link only a plan of the same client whose
  `project_id` is null. Several open quotes may share one plan.
- Pricing stays today's algorithm (one line per template, matched by
  `template_id`, rates as today). It reads the plan's pages fresh before
  it runs, no longer stamps `line_item_id`, does not delete stale lines,
  and writes only draft lines, saved by the quote's normal Save.
- The page-to-line link is gone. A line's page count and the acceptance
  assignee both come from matching `template_id`.
- `accept_quote()`: guards and project creation unchanged; always snapshot
  the plan's pages; move the plan and make page tasks only when the plan
  has no project yet.
- Client document: draft or sent reads the live plan; accepted reads
  `quote_pages`; declined reads the live plan while still linked.
- Edit site plan: by decision 2 the name stays editable at every stage.
  Only the client locks, once a quote links the plan or it is on a
  project.

## 2. Facts this spec relies on (checked 2026-09-15)

- `projects.client_id` is `not null references clients(id) on delete
  restrict` (schema.sql:459); the live table has no project without a
  client. So "the project has a client" is always true and is not a
  separate condition in the UI.
- `work_items.deleted_at` / `deleted_by` are added at schema.sql:3271 and
  the `soft_delete` BEFORE DELETE trigger (schema.sql:3288, live) turns a
  delete into `deleted_at = now()`. `purge_deleted()` hard-deletes after
  thirty days (schema.sql:3346), which fires `on delete set null` on
  `site_plan_pages.work_item_id`. The work_items select policy hides
  deleted rows; security definer functions must filter `deleted_at is
  null` themselves.
- `work_items.created_by` is `not null`. The insert policy is
  `team_insert: created_by = auth.uid() and not is_client()` (definer
  functions bypass it). `work_item_owner_stamp` and
  `work_item_owner_follows` fire on insert and on `assignee_id` updates;
  `work_items_parent_check` only matters when `parent_id` is set (page
  tasks are flat).
- Live `accept_quote(uuid, text, text)` matches schema.sql:2553-2603 and
  has one overload. It locks the quote `for update`, requires draft or
  sent, builds the project and project_tasks, then turns every
  `quote_sitemap_nodes` row into a work_item (assignee through
  `line_item_id`), inserting `work_item_assignees` before setting
  `work_items.assignee_id`.
- Live `decline_quote(uuid, text, text)` matches schema.sql:2605-2617. It
  touches only the quote row.
- **Drift:** schema.sql:2535 `create_quote()` checks `manage_quotes`, but
  the live function still checks `manage_billing` ("Billing permission
  needed"), a leftover of the 2026-09-03 permission split. Only admins pass
  it today. The site plan screen's "Add to a quote" calls `create_quote`,
  so the migration below re-creates it from schema.sql. (Live
  `billing_people`, `void_billing_batch` and `void_invoice` also still
  check `manage_billing`; out of scope here, flagged for a separate item.)
- Screen seeds (schema.sql:4288-4299): everyday screens go to every
  non-client role; gated screens are copied from the key that gates them
  (`('manage_quotes', 'screen:quotes')` among them).
  `permission_overrides` (PK `user_id, key`) is created just above, at
  schema.sql:4258. Live: no role holds `manage_quotes` and there are no
  overrides for it, so only admins have quotes today. Profiles in use:
  admin and staff (10 staff); no client login exists.
- `useCurrentUser().can('screen:x')` returns `hasKey(screen) &&
  hasKey(requires)` from the SCREENS entry (useCurrentUser.ts:77-83). A
  SCREENS entry with `requires: 'manage_quotes'` therefore guarantees that
  anyone who can open the screen also holds `manage_quotes`.
  `screens.global.ts` guards every path under a SCREENS `path`.
- The assistant and MCP `quote` tool (server/utils/ai.ts:156-165, used by
  the connector through `docketTools` in server/utils/mcp.ts:8) returns the
  quote and its lines only. Its description wrongly says "and sitemap".
  The tool body does not change.
- `loadQuoteDoc()` (server/utils/quoteDoc.ts) is used by `/api/q/[token]`
  (service role), `/api/q/[token]/accept` and `/decline` (service role),
  and `/api/quotes/send` (staff through RLS). The editor preview fetches
  `/api/q/<token>`, so it also goes through the service role.
- The project page header (projects/[id]/index.vue:187) wraps its
  `PageActions` in `v-if="isAdmin"` (`isAdmin = can('manage_reference')`)
  with two items, "Edit project" and "Task types and rates".
  `PageActions` drops any action with `show: false`.
- `ClientPicker` has props `modelValue`, `clients`, `placeholder` and no
  disabled prop.
- `quotes` has table-level SELECT for authenticated, no column grants, so
  a new column needs no grant. Embeds from `quotes` to `clients` and
  `projects` already work while `quotes` has foreign keys to both, so a
  table like `site_plans` with keys to clients and projects does not make
  existing embeds ambiguous. Verify anyway (section 10).
- Live data: `quote_sitemap_nodes` has 4 rows, all on Q-2026-002 ("te",
  client 7 Foot Farm, accepted, 4 tasks already made from them).
  Q-2026-001 ("TEst") is a draft. Both are test quotes. Once the new
  `loadQuoteDoc` is deployed, Q-2026-002's document shows no page list.
- `page_templates`: 7 rows; RLS `read_all` (not client) and
  `manage_settings`; `grant select, insert, update, delete ... to
  authenticated` (schema.sql:3429-3433).
- Shared code outside `shared/types` is imported explicitly
  (`import ... from '~~/shared/estimator'`), and server code already
  imports `~~/shared/types/database`.
- Icons in use: `i-lucide-network` is Departments; `i-lucide-list-tree`
  is free.

## 3. Migrations `site_plans` and `drop_quote_sitemap_nodes`

Two migrations, applied through the Supabase MCP `apply_migration` and
mirrored into schema.sql (section 4). Production and dev share one
database, and the deployed code reads `quote_sitemap_nodes`
(`server/utils/quoteDoc.ts:19`, `app/pages/quotes/[id].vue:26`) and
returns a 500 when that query fails. So the break waits for the deploy,
by the two-migration rule:

1. `site_plans` (below), before the packages. It adds everything and
   replaces `accept_quote`, which no longer reads the old table. The old
   table stays, so the deployed code keeps working.
2. `drop_quote_sitemap_nodes`, after every package is committed, pushed
   and deployed. It only drops the table.

Between the two, a quote accepted from the old editor makes no tasks from
its old sitemap, because the new `accept_quote` ignores it. Only test
quotes have sitemap rows.

Migration 1, `site_plans`:

```sql
-- ---------- Site plans ----------
-- The pages a website will have, as a tree. A plan belongs to a client,
-- is linked from quotes (quotes.site_plan_id), and moves to the project
-- the accepted quote makes (site_plans.project_id). Hours only, no money.

create table public.site_plans (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete restrict,
  project_id uuid unique references public.projects(id) on delete set null,  -- one plan per project
  name       text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now()
);
create index site_plans_client on public.site_plans (client_id);

create table public.site_plan_pages (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.site_plans(id) on delete cascade,
  parent_id    uuid references public.site_plan_pages(id) on delete cascade,
  sort_order   int not null default 0,          -- pre-order position across the tree, parents first
  title        text not null,
  path         text,                            -- /about/team
  template     text,                            -- template name as picked
  template_id  uuid references public.page_templates(id) on delete set null,
  hours        numeric(8,2),                    -- override; null = the template's
  work_item_id uuid references public.work_items(id) on delete set null,  -- the task made for this page
  created_at   timestamptz not null default now()
);
create index site_plan_pages_plan on public.site_plan_pages (plan_id, parent_id, sort_order);
create index site_plan_pages_work_item on public.site_plan_pages (work_item_id) where work_item_id is not null;

-- The plan a quote prices. Several open quotes may point at one plan.
alter table public.quotes add column site_plan_id uuid references public.site_plans(id) on delete set null;
create index quotes_site_plan on public.quotes (site_plan_id) where site_plan_id is not null;

-- The pages as the client accepted them, written only by accept_quote().
-- The accepted quote's document reads this, never the live plan.
create table public.quote_pages (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes(id) on delete cascade,
  sort_order  int not null,                     -- pre-order position
  depth       int not null default 0,           -- indent on the client's list
  title       text not null,
  path        text,
  template    text,
  template_id uuid references public.page_templates(id) on delete set null,  -- counts pages per scope line
  hours       numeric(8,2)                      -- resolved: the page's own, else its template's
);
create index quote_pages_quote on public.quote_pages (quote_id, sort_order);

-- ---------- RLS and grants ----------
alter table public.site_plans      enable row level security;
alter table public.site_plan_pages enable row level security;
alter table public.quote_pages     enable row level security;

create policy read_all on public.site_plans      for select to authenticated using (not (select public.is_client()));
create policy read_all on public.site_plan_pages for select to authenticated using (not (select public.is_client()));
create policy read_all on public.quote_pages     for select to authenticated using (not (select public.is_client()));

create policy manage_quotes on public.site_plans      for all to authenticated
  using ((select public.has_permission('manage_quotes'))) with check ((select public.has_permission('manage_quotes')));
create policy manage_quotes on public.site_plan_pages for all to authenticated
  using ((select public.has_permission('manage_quotes'))) with check ((select public.has_permission('manage_quotes')));
-- quote_pages has no write policy and no write grant: only accept_quote()
-- (security definer) and the quote delete cascade write it.

revoke all on public.site_plans, public.site_plan_pages, public.quote_pages from anon, authenticated;
grant select, insert, update, delete on public.site_plans, public.site_plan_pages to authenticated;
grant select on public.quote_pages to authenticated;

-- ---------- create_quote: bring live in line with schema.sql ----------
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

-- ---------- accept_quote ----------
-- Acceptance, by the client from /q/<token> (service role, no session) or
-- by someone with the Quotes permission on their behalf. Makes the
-- project: hours from the lines become budget_hours, the subtotal becomes
-- budget_amount, and each line's task type is assigned to the project
-- with the quoted rate. With a site plan: its pages as they stand are
-- copied onto the quote (quote_pages), and if the plan is not on a project
-- yet it moves to this one and every page becomes a task, assigned to
-- whoever this quote's scope line for that template names.
create or replace function public.accept_quote(p_quote_id uuid, p_name text, p_email text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare q record; v_project uuid; v_item uuid; v_hours numeric; r record;
        v_plan_id uuid; v_plan_project uuid; v_ord int := 0;
begin
  if auth.uid() is not null and not public.has_permission('manage_quotes') then raise exception 'Quotes permission needed'; end if;
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

  -- The site plan, locked so make_site_plan_tasks() on it waits. Only a
  -- plan of this quote's client counts; the drawers only offer those.
  if q.site_plan_id is not null then
    select id, project_id into v_plan_id, v_plan_project
    from public.site_plans where id = q.site_plan_id and client_id = q.client_id
    for update;
  end if;

  if v_plan_id is not null then
    if v_plan_project is null then
      update public.site_plans set project_id = v_project where id = v_plan_id;
    end if;
    -- One read of the tree, parents first, feeds both the copy and the
    -- tasks, so they always hold the same pages.
    for r in
      with recursive ranked as (
        -- Siblings numbered in the app's order (flattenPages), so tied
        -- sort_order values cannot interleave two subtrees.
        select id, parent_id, row_number() over (partition by parent_id order by sort_order, created_at, id) as rn
        from public.site_plan_pages
        where plan_id = v_plan_id
      ), tree as (
        select s.id, 0 as depth, array[s.rn] as ord
        from ranked s
        where s.parent_id is null
        union all
        select c.id, t.depth + 1, t.ord || c.rn
        from ranked c
        join tree t on c.parent_id = t.id
      )
      select p.id, t.depth, p.title, nullif(p.path, '') as path,
             coalesce(pt.name, nullif(p.template, '')) as template, p.template_id,
             coalesce(p.hours, pt.hours) as hours,
             (select l.assignee_id from public.quote_line_items l
               where l.quote_id = q.id and l.template_id = p.template_id and l.assignee_id is not null
               order by l.sort_order, l.created_at limit 1) as assignee_id
      from tree t
      join public.site_plan_pages p on p.id = t.id
      left join public.page_templates pt on pt.id = p.template_id
      order by t.ord
    loop
      v_ord := v_ord + 1;
      insert into public.quote_pages (quote_id, sort_order, depth, title, path, template, template_id, hours)
      values (q.id, v_ord, r.depth, r.title, r.path, r.template, r.template_id, r.hours);

      -- Tasks only when this acceptance moved the plan. If another quote
      -- on the same plan was accepted first, the plan and its tasks stay
      -- on that project.
      if v_plan_project is null then
        insert into public.work_items (project_id, title, description, estimate_hours, created_by)
        values (v_project, r.title,
                concat_ws(E'\n', r.path, case when r.template is not null then r.template || ' page' end, 'From quote ' || q.number),
                nullif(r.hours, 0), q.created_by)
        returning id into v_item;
        if r.assignee_id is not null then
          insert into public.work_item_assignees (work_item_id, user_id) values (v_item, r.assignee_id) on conflict do nothing;
          update public.work_items set assignee_id = r.assignee_id where id = v_item;
        end if;
        update public.site_plan_pages set work_item_id = v_item where id = r.id;
      end if;
    end loop;
  end if;

  update public.quotes set status = 'accepted', accepted_at = now(), accepted_by = trim(p_name),
    accepted_email = nullif(trim(coalesce(p_email, '')), ''), project_id = v_project, updated_at = now()
  where id = q.id;
  return v_project;
end $$;

-- ---------- make_site_plan_tasks ----------
-- A plan on a project: one task for every page with no live task (never
-- linked, or its task was deleted), unassigned, with the page's hours (or
-- its template's) as the estimate. Returns how many it made. Reads
-- work_items as definer, so it filters deleted_at itself.
create or replace function public.make_site_plan_tasks(p_plan_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_plan record; r record; v_item uuid; v_count int := 0;
begin
  if not public.has_permission('manage_quotes') then raise exception 'Quotes permission needed'; end if;
  select id, name, project_id into v_plan from public.site_plans where id = p_plan_id for update;
  if not found then raise exception 'Site plan not found'; end if;
  if v_plan.project_id is null then raise exception 'This site plan is not on a project yet'; end if;

  for r in
    with recursive ranked as (
      -- Siblings numbered in the app's order, as in accept_quote().
      select id, parent_id, row_number() over (partition by parent_id order by sort_order, created_at, id) as rn
      from public.site_plan_pages
      where plan_id = p_plan_id
    ), tree as (
      select s.id, array[s.rn] as ord
      from ranked s
      where s.parent_id is null
      union all
      select c.id, t.ord || c.rn
      from ranked c
      join tree t on c.parent_id = t.id
    )
    select p.id, p.title, nullif(p.path, '') as path,
           coalesce(pt.name, nullif(p.template, '')) as template,
           coalesce(p.hours, pt.hours) as hours
    from tree t
    join public.site_plan_pages p on p.id = t.id
    left join public.page_templates pt on pt.id = p.template_id
    where not exists (select 1 from public.work_items w where w.id = p.work_item_id and w.deleted_at is null)
    order by t.ord
  loop
    insert into public.work_items (project_id, title, description, estimate_hours, created_by)
    values (v_plan.project_id, r.title,
            concat_ws(E'\n', r.path, case when r.template is not null then r.template || ' page' end, 'From site plan ' || v_plan.name),
            nullif(r.hours, 0), auth.uid())
    returning id into v_item;
    update public.site_plan_pages set work_item_id = v_item where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.make_site_plan_tasks(uuid) from public, anon;
grant execute on function public.make_site_plan_tasks(uuid) to authenticated;

-- ---------- Screen key: follows manage_quotes, overrides included ----------
insert into public.permissions (role, key)
select role, 'screen:site_plans' from public.permissions where key = 'manage_quotes'
on conflict do nothing;
insert into public.permission_overrides (user_id, key, allowed)
select user_id, 'screen:site_plans', allowed from public.permission_overrides where key = 'manage_quotes'
on conflict do nothing;
```

Migration 2, `drop_quote_sitemap_nodes`, after the packages are deployed:

```sql
drop table public.quote_sitemap_nodes;   -- 4 test rows on Q-2026-002; index and policies go with it
```

Notes on the functions:

- `create or replace` keeps each existing function's grants; the existing
  revokes on `create_quote` and `accept_quote` stay as they are.
- Page order: both functions number siblings with `row_number()` over
  `sort_order, created_at, id` before walking the tree, which is the
  order `flattenPages` gives (pages loaded by `sort_order`, then
  `created_at`). Raw `sort_order` values can tie when a stale tab saves,
  and an array of raw values would then interleave two subtrees.
- Concurrency: `accept_quote` holds the quote lock, then the plan lock.
  `make_site_plan_tasks` takes the plan lock. If both run on the same
  plan, the second waits. When it gets the lock, `select ... for update`
  re-reads the committed row, and the following loop query takes a fresh
  snapshot (read committed), so it sees the `project_id` and
  `work_item_id` values the first one wrote. The plan editor writes pages
  without the plan lock. That is fine: each function reads the tree in a
  single query, so its copy and its tasks match each other.
- `created_by` in `make_site_plan_tasks` is `auth.uid()`, which is never
  null there because `has_permission()` requires a session.
- After applying: run `get_advisors` (security) and confirm nothing new
  for the three tables or two functions.

## 4. schema.sql mirror (done with migration 1, before the packages)

schema.sql shows the end state of both migrations, so it has no
`quote_sitemap_nodes` from the start.

- Line 425 comment: `manage_quotes    quotes, their lines, and site plans`.
- Lines 890-893 (page templates comment): "A site plan page picks one and
  inherits its hours (or overrides them), and "Price the plan" on a quote
  turns the pages into scope lines per template. On accept, the pages
  become tasks on the new project."
- Line 926: `-- made by "Price the plan"`.
- Lines 936-954: replace the `quote_sitemap_nodes` comment, table and
  index with `site_plans`, `site_plan_pages` and `quote_pages` as in
  section 3, then `alter table quotes add column site_plan_id ...` and
  its index. (`quotes` is defined at 855, above.)
- `create_quote` at 2535 is already correct; no change.
- `accept_quote` at 2549-2603: replace the header comment and body with
  section 3. Add `make_site_plan_tasks` and its revoke and grant right
  after `decline_quote` (2617).
- RLS enable list (2643): replace `quote_sitemap_nodes` with the three new
  tables.
- Quoting policies (2749-2755): replace both `quote_sitemap_nodes`
  policies with the five new policies, then the revoke and the two grants.
- Screen mapping (4294-4299): add `('manage_quotes', 'screen:site_plans')`
  to the values list, then the `permission_overrides` copy insert after
  that statement.
- Then regenerate `shared/types/database.ts` with
  `generate_typescript_types`. The types still hold `quote_sitemap_nodes`
  until migration 2, so the old `quotes/[id].vue` and
  `server/utils/quoteDoc.ts` keep typechecking until the packages
  replace them.
- After migration 2, regenerate `shared/types/database.ts` again and run
  `npx nuxt typecheck`; nothing may still reference
  `quote_sitemap_nodes`.

## 5. Who can do what

| Who | site_plans, site_plan_pages | quote_pages | make_site_plan_tasks | Screens |
| --- | --- | --- | --- | --- |
| Admin, or anyone with `manage_quotes` | read, insert, update, delete | read | yes | /site-plans, project page actions (with `screen:site_plans`) |
| Other staff (not client) | read | read | "Quotes permission needed" | none |
| Client login | no rows | no rows | "Quotes permission needed" | none |
| anon | permission denied | permission denied | not executable | none |
| `/q/<token>` routes (service role) | read, picked by status in `loadQuoteDoc` | read | not called | public document |

- Money: none of the new tables has a money column. Pricing still reads
  `page_templates.rate` and line rates only on `/quotes/[id]`, behind
  `manage_quotes`.
- Clients see pages only on their quote document (title, path, template,
  depth). Per-page hours and ids never reach the public payload.
- UI gating is convenience; RLS decides.

## 6. The client document

`loadQuoteDoc()` picks the page list itself, because `/q` runs as the
service role:

| Quote status | Pages shown | Line page counts |
| --- | --- | --- |
| draft, sent (and the unused `expired`) | the linked plan's live pages, if `site_plan_id` is set and that plan's `client_id` matches the quote's | pages in that list with the line's `template_id` |
| accepted | `quote_pages` for the quote, by `sort_order` | rows in `quote_pages` with the line's `template_id` |
| declined | the linked plan's live pages while still linked (same rule as draft) | same |

- The payload's `pages` holds `{ title, path, template, depth }` only.
  Ids, `template_id` and hours stay out.
- A line with no `template_id` shows 0 pages (no hint).
- The editor preview, the public page, print, the accept and decline
  responses, and the Send route all use this one function. The email body
  does not list pages; Send still requires at least one line.

Known limitations (documented in the guide where it matters):

- A declined quote that is still linked shows the live plan, so later plan
  edits change what it shows.
- Deleting a page template sets `template_id` null on lines, plan pages
  and `quote_pages` alike, so an accepted document loses the "N pages"
  hint on that line. Its page list stays. Templates are normally retired
  with `is_active`.
- Q-2026-002 (accepted, a test quote) loses its page list once the new
  `loadQuoteDoc` is deployed.
- Linking rules (same client, no project) are enforced by the drawers.
  `accept_quote` ignores a plan of another client, and `loadQuoteDoc`
  shows no pages for one.
- Pricing does not warn when the plan changed after lines were priced, by
  decision 1. Acceptance copies the plan as it stands.
- If a page's task is deleted, Make tasks for new pages makes a new one
  and links the page to it. Restoring the old task afterwards (Undo, or
  `restore_deleted()`, which only clears `deleted_at`) leaves two tasks
  for that page, the restored one linked to no page. Delete one of them.
- `site_plan_pages.work_item_id` is set only by `accept_quote()` and
  `make_site_plan_tasks()`, and the plan editor never sends it. The table
  grant does not stop someone with `manage_quotes` writing it through the
  API, and a page pointed at an unrelated task gets no task from Make
  tasks for new pages. Only Quotes holders can do that; nothing reaches
  clients.

## 7. Shared helper `shared/sitePlan.ts`

New file, imported explicitly (`~~/shared/sitePlan`) from app pages and
from `server/utils/quoteDoc.ts`. Full contents:

```ts
// A site plan's pages as a tree, walked the same way by the plan screen,
// the quote editor's pricing, and the client's quote document.

// Parents before children, siblings in the order given (load pages ordered
// by sort_order, then created_at). Pages whose parent is missing are left
// out, as the canvas does.
export function flattenPages<T extends { id: string, parent_id: string | null }>(pages: T[]): { page: T, depth: number }[] {
  const byParent = new Map<string | null, T[]>()
  for (const p of pages) byParent.set(p.parent_id, [...(byParent.get(p.parent_id) ?? []), p])
  const walk = (parent: string | null, depth: number): { page: T, depth: number }[] =>
    (byParent.get(parent) ?? []).flatMap(p => [{ page: p, depth }, ...walk(p.id, depth + 1)])
  return walk(null, 0)
}

type Hours = number | string | null
type PageLike = { template_id: string | null, hours: Hours }
type TemplateLike = { id: string, hours: number }

// A page's hours: its own, else its template's, else 0.
export function pageHours(page: PageLike, templateById: Map<string, TemplateLike>): number {
  if (page.hours !== null && page.hours !== '') return Number(page.hours)
  return page.template_id ? templateById.get(page.template_id)?.hours ?? 0 : 0
}

// Pages grouped by template (templates not in the list count as untyped),
// most hours first. The plan screen's summary and "Price the plan" use it.
export function groupPages<P extends PageLike, T extends TemplateLike>(pages: P[], templates: T[]): { template: T | null, pages: P[], hours: number }[] {
  const byId = new Map(templates.map(t => [t.id, t]))
  const g = new Map<string | null, { template: T | null, pages: P[], hours: number }>()
  for (const p of pages) {
    const t = p.template_id ? byId.get(p.template_id) ?? null : null
    const e = g.get(t?.id ?? null) ?? { template: t, pages: [], hours: 0 }
    e.pages.push(p)
    e.hours += pageHours(p, byId)
    g.set(t?.id ?? null, e)
  }
  return [...g.values()].sort((a, b) => b.hours - a.hours)
}
```

## 8. Screens

All copy below is final UI copy: no em dashes, American spelling.

### 8.1 Nav, search, skeleton, permissions entries

- `shared/types/app.ts`
  - PERMISSIONS `manage_quotes` hint: `'Draft, send, and edit quotes and site plans.'`
  - SCREENS, right after `screen:estimator`:
    `{ key: 'screen:site_plans', label: 'Site plans', path: '/site-plans', hint: 'Needs the Quotes permission.', requires: 'manage_quotes' },`
  - SETTINGS_PAGES, Page templates `text`:
    `'The kinds of page a site plan is built from, with the hours each usually takes.'`
- `app/components/AppSidebar.vue`, More section, right after Estimator:
  `...(can('screen:site_plans') ? [{ label: 'Site plans', to: '/site-plans', icon: 'i-lucide-list-tree' }] : []),`
- `app/components/SearchPalette.vue`, right after `Go to Estimator`:
  `...(can('screen:site_plans') ? [nav('Go to Site plans', '/site-plans', 'i-lucide-list-tree')] : []),`
- `app/components/PageSkeleton.vue`: the detail regex becomes
  `/^\/(projects|clients|retainers|site-plans)\/[^/]+/`. `/site-plans`
  itself falls through to `list`.
- `app/pages/admin/page-templates.vue`, copy only:
  - Header comment (lines 2-5): "The kinds of page a site plan is built
    from, each with the hours it usually takes, an optional rate, and the
    task type its time logs under. The site plan canvas offers these;
    "Price the plan" on a quote makes a scope line per template."
  - Line 76: `The kinds of page a site plan is built from, with the hours each usually takes. The site plan canvas picks from these.`
  - Line 125 switch label: `Offered on site plans`
- The screen guard (`screens.global.ts`) and the Permissions page pick up
  the SCREENS entry with no code change. The two site plan pages add no
  `definePageMeta`; the guard is enough, and `can('screen:site_plans')`
  implies `manage_quotes`.

### 8.2 `SitemapCanvas.vue`

- Remove `line_item_id` from `CanvasNode` (line 8) and from the new node in
  `add()` (line 80).
- Header comment: "The pages of a site plan as a tree on a canvas, Octopus
  style: ..." (the rest unchanged).
- Nothing else changes.

### 8.3 `/site-plans` (app/pages/site-plans/index.vue)

Header comment: "Site plans: every website page tree, the client it is
for, and the quote or project it is on. New ones start from a client and
a name; the tree is built on the plan."

Data (start both, then `await Promise.all`, then destructure):

- `useAsyncData('site-plans', ...)`:
  `supabase.from('site_plans').select('id, name, created_at, client_id, project_id, clients(name), projects(id, name), site_plan_pages(count), quotes(id, number, status)').order('created_at', { ascending: false })`
- `useClientNames()` for the New drawer's ClientPicker.

Layout:

- `useHead({ title: 'Site plans' })`.
- Header row: `h1` "Site plans", under it `p.text-sm.text-muted`:
  "The pages a website will have. Start one here or from a quote, price it
  on the quote, and it moves to the project when the quote is accepted."
  On the right, `UButton icon="i-lucide-plus"` "New site plan", shown when
  `can('manage_quotes')`.
- `UCard :ui="{ body: 'p-0 sm:p-0' }"`, `div.table-scroll`, plain table.
  Columns:
  - **Name**: link to `/site-plans/<id>`.
  - **Client**: link to `/clients/<client_id>`.
  - **Pages**: right-aligned count from `site_plan_pages[0].count`.
  - **On**:
    - with a project: "Project: " plus a link to the project.
    - else with quotes: the quote numbers, each linked to `/quotes/<id>`,
      comma separated.
    - else muted "Not on a quote yet".
  - **Created**: `shortDate(created_at.slice(0, 10))`.
- Empty row: "No site plans yet."
- New drawer: `AppDrawer title="New site plan"`.
  - Body: `UFormField label="Client"` with
    `<ClientPicker v-model="newClientId" :clients="clients ?? []" @created="c => clients?.push(c)" />`,
    then `UFormField label="Name"` with `UInput` (placeholder
    "Website redesign").
  - Footer: Cancel (ghost neutral) and "Create" (loading while busy,
    disabled without a client or a name).
  - Create: `supabase.from('site_plans').insert({ client_id, name: name.trim() }).select('id').single()`,
    then `navigateTo('/site-plans/<id>')`.
  - Error toast: title "Could not create the site plan", description the
    message.

### 8.4 `/site-plans/[id]` (app/pages/site-plans/[id].vue)

Header comment: "One site plan: the page tree on a canvas, saved with
Save. Before it is on a project it can go onto a quote (priced there). On
a project, Make tasks for new pages adds a task for each page without
one. Editing a page never changes its task or a quote."

Data (start all, then `await Promise.all`, then destructure):

- `__ad1` `site-plan-${id}`:
  `site_plans.select('id, name, client_id, project_id, created_at, clients(id, name), projects(id, name)').eq('id', id).single()`.
  On error, `createError({ statusCode: 404, statusMessage: 'Site plan not found' })`.
- `__ad2` `site-plan-${id}-pages`:
  `site_plan_pages.select('id, parent_id, sort_order, title, path, template, template_id, hours, work_item_id').eq('plan_id', id).order('sort_order').order('created_at')`.
- `__ad3` `site-plan-${id}-quotes`:
  `quotes.select('id, number, title, status, valid_until').eq('site_plan_id', id).order('created_at', { ascending: false })`.
- `__ad4` `site-plan-page-templates` (its own key, so it does not share
  the quote editor's cache entry):
  `page_templates.select('id, name, hours, color, is_active').order('position').order('name')`.
  Retired templates are loaded too, so a page on one gets its template's
  hours, as `accept_quote` and `make_site_plan_tasks` give them (they
  join `page_templates` with no `is_active` filter). The canvas offers
  only active templates, plus any a page already uses. The quote
  editor's `page-templates` load drops its `is_active` filter for the
  same reason. Only what `SitemapCanvas` and `groupPages` use. The plan screen prices
  nothing, so it reads no `rate` (section 5).
- `__ad5` `site-plan-${id}-live-tasks`: read this plan's non-null
  `work_item_id`s from `site_plan_pages`. If there are none, return `[]`.
  Otherwise `work_items.select('id').in('id', ids)` and return the ids.
  RLS hides soft-deleted tasks. Limitation: a `manage_quotes` holder
  without `see_all_tasks` may not see some live tasks, so the count can
  read high. The function is the authority, and its toast says how many
  it made.
- `__ad6` `useClientNames()`.

Editor state (moved from quotes/[id].vue):

- `type PageDraft = { id: string, parent_id: string | null, title: string, path: string, template: string, template_id: string | null, hours: number | string | null }`.
- `draftPages`, a `removed` Set, and `snapshot`.
- `loadEditor()` maps saved pages to drafts (path and template default to
  `''`), clears `removed` and sets the snapshot.
- `watch(pages, loadEditor)`, and
  `dirty = JSON.stringify(draftPages) !== snapshot`.
- `pagesRemoved(ids)` adds the ids to `removed`.
- `groups = computed(() => groupPages(draftPages.value, templates.value ?? []))`.
- `linkedIds = new Set(liveTasks)`.
- `missing = computed(() => plan.project_id ? (pages ?? []).filter(p => !p.work_item_id || !linkedIds.has(p.work_item_id)).length : 0)`,
  counted from saved pages.
- `clientLocked = computed(() => !!plan.project_id || (quotes?.length ?? 0) > 0)`.

`save()`:

1. If any page title is blank, fail with "Every page needs a title".
2. If there are drafts, upsert `flattenPages(draftPages).map(({ page }, i) => ...)`
   with `onConflict: 'id'`. Each row is `{ id, plan_id: id, parent_id,
   sort_order: i + 1, title: title.trim(), path: path.trim() || null,
   template: template.trim() || null, template_id, hours: hours === null
   || hours === '' ? null : Number(hours) }`. Never send `work_item_id`:
   the upsert then leaves it as it is.
3. Then, if `removed` has ids, `site_plan_pages.delete().in('id', [...removed])`.
   The upsert goes first so a page moved out from under a removed page
   already points at its new parent when the delete cascades; otherwise
   the cascade deletes it and the upsert recreates it without its task.
4. Refresh pages and live tasks, then toast "Site plan saved".
5. On an error, toast title "Not saved" with the message, and return
   false.

`useHead({ title: () => plan.value?.name ?? 'Site plan' })` and
`useAssistantScreen(() => ({ client: plan.value?.clients?.name, project: plan.value?.projects?.name }))`.

Template:

- `<AppCrumbs :items="[{ label: 'Site plans', to: '/site-plans' }]" class="mb-3" />`
- Header row: `h1` with the plan name, then `PageActions class="ml-auto"`:
  - primary: `{ label: 'Save', icon: 'i-lucide-save', loading: saving, disabled: !dirty, onSelect: save }`
  - items:
    - `{ label: 'Make tasks for new pages', icon: 'i-lucide-list-plus', show: !!plan.project_id, onSelect: openMake }`
    - `{ label: 'Add to a quote', icon: 'i-lucide-file-signature', show: !plan.project_id, onSelect: openAddToQuote }`
    - `{ label: 'Edit site plan', icon: 'i-lucide-pencil', onSelect: openEdit }`
  - more: `{ label: 'Delete site plan', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { deleting = true } }`
- Subline, `p.text-sm.text-muted`:
  - The client name linked to `/clients/<client_id>`.
  - When on a project: ". On " plus the project linked.
  - When quotes point at it: ". Quotes: " then each quote as
    `<NuxtLink>` number plus its `quoteBadge(q, today).label` in
    parentheses, comma separated.
- When on a project, a line under the subline:
  - `missing > 0`: "{missing} of {pages.length} pages have no task yet."
  - otherwise: "Every page has a task."
- `UCard` holding
  `<SitemapCanvas :nodes="draftPages" :templates="templates ?? []" :editable="true" @removed="pagesRemoved" />`,
  then, when there are pages, the group chips exactly as today's quote
  card: count, template name or "untyped", `formatHours(hours)`. The note
  at the right of the chips:
  - not on a project: "Draft and sent quotes show these pages as saved. A
    quote keeps its own copy once it is accepted."
  - on a project: "Editing or removing a page does not change its task."
- `<p v-if="dirty" class="text-sm text-warning">Unsaved changes. Quotes and Make tasks use the saved version.</p>`

Make tasks for new pages:

- `openMake()`: if dirty and `!(await save())`, return. Refresh live
  tasks. If `missing === 0`, toast "Every page already has a task." and
  return. Otherwise open the modal.
- `UModal title="Make tasks for new pages?"`. Body `p.text-sm`:
  "{missing} {task|tasks} on {project name}, one for each page with no task
  yet, with the page's hours as the estimate. Nobody is assigned."
- Footer: Cancel, and a primary button "Make {missing} {task|tasks}"
  (loading).
- Action: `supabase.rpc('make_site_plan_tasks', { p_plan_id: id })`, then
  toast `${n} ${n === 1 ? 'task' : 'tasks'} made on ${project}` with the
  description "Assign them on the project.", then refresh pages and live
  tasks.
- On an error, toast "Could not make the tasks" with the message.

Add to a quote (shown while the plan has no project):

- `openAddToQuote()` loads this client's open quotes without a plan:
  `quotes.select('id, number, title, status').eq('client_id', plan.client_id).in('status', ['draft', 'sent']).is('site_plan_id', null).order('created_at', { ascending: false })`.
  Then it sets `target = '__new__'` when there are none, and
  `newTitle = plan.name`.
- `AppDrawer title="Add to a quote"`, description "Put this plan on a
  draft or sent quote for {client}, or start a new quote. Price it on the
  quote."
- Body:
  - `UFormField label="Quote"` with a `USelectMenu`. Items: each quote as
    `${number} ${title} (${status === 'draft' ? 'Draft' : 'Sent'})`, then
    `{ label: 'New quote', value: '__new__' }`.
  - When `__new__`: `UFormField label="Title" help="Becomes the project
    name when accepted."` with a `UInput`.
- Footer: Cancel, and "Add to quote" (loading, disabled without a target,
  or with `__new__` and a blank title).
- Action:
  1. If dirty and `!(await save())`, return.
  2. For `__new__`:
     `rpc('create_quote', { p_client_id: plan.client_id, p_title: newTitle.trim() })`.
  3. `quotes.update({ site_plan_id: id, updated_at: new Date().toISOString() }).eq('id', quoteId)`.
  4. Toast "Site plan added to the quote" with the description "Price the
     plan there to write the scope lines."
  5. `navigateTo('/quotes/<quoteId>')`.
  6. On an error, toast "Could not add to the quote" with the message.
- Writing only `site_plan_id` cannot race an open quote editor: its Save
  writes title, intro, terms, valid_until and tax_rate, never
  `site_plan_id`.

Edit site plan:

- `AppDrawer title="Edit site plan"`.
  - `UFormField label="Name"` with a `UInput`.
  - `UFormField label="Client"`: when `!clientLocked`, a `ClientPicker`
    (clients from `useClientNames`); otherwise the client's name as plain
    text with the help "The client is fixed once a quote uses this plan or
    it is on a project."
- Footer: Cancel, and "Save" (disabled with a blank name).
- Action: `site_plans.update({ name: name.trim(), ...(clientLocked ? {} : { client_id }) }).eq('id', id)`,
  refresh the plan, toast "Site plan updated".

Delete:

- `UModal v-model:open="deleting" title="Delete this site plan?"`, body
  `p.text-sm`: "Its pages go with it. Quotes that use it lose the link, and
  an accepted quote keeps the pages it was accepted with. Tasks made from
  it stay on the project."
- Footer: Cancel, and `color="error"` "Delete".
- Action: `site_plans.delete().eq('id', id)` (a hard delete; pages
  cascade, `quotes.site_plan_id` goes null), toast "Site plan deleted",
  `navigateTo('/site-plans')`.

### 8.5 Quote editor (app/pages/quotes/[id].vue)

Remove:

- The `__ad3` nodes loader, `refreshNodes`, `NodeDraft`, `draftNodes`,
  `removedNodes`, `flatNodes`, `nodesRemoved`, `nodeHours`, `pageGroups`,
  `priceSitemap`.
- The node loop in `removeLine`; page-title validation and the node delete
  and upsert in `save()`.
- The Sitemap heading, text, card and canvas (lines 466-479).
- `templateById`, if nothing else uses it.

Change:

- Header comment: "One quote. While draft or sent: edit the header and
  scope lines, link a site plan and price it; preview; send; accept or
  decline on the client's behalf. Accepted quotes link to the project they
  made."
- New `__ad3`, `quote-${id}-plan`, not in `loadEditor`'s watch (a refetch
  must never throw away drafts):
  ```ts
  const __ad3 = useAsyncData(`quote-${id}-plan`, async () => {
    const { data: q, error } = await supabase.from('quotes').select('site_plan_id, site_plans(id, name, client_id, project_id, projects(id, name))').eq('id', id).single()
    if (error) throw error
    if (!q.site_plan_id || !q.site_plans) return { plan: null, pages: [] }
    const { data: pages, error: pErr } = await supabase.from('site_plan_pages').select('id, parent_id, sort_order, title, path, template, template_id, hours').eq('plan_id', q.site_plan_id).order('sort_order').order('created_at')
    if (pErr) throw pErr
    return { plan: q.site_plans, pages }
  }, fresh)
  ```
  Destructure `const { data: planData, refresh: refreshPlan } = __ad3`.
  Add `refreshPlan()` to `refreshAll()`.
- `loadEditor`: drop nodes. `watch([quote, lines], loadEditor)`. The
  snapshot and `dirty` use `[form, draftLines.value]`.
- `planGroups = computed(() => groupPages(planData.value?.pages ?? [], templates.value ?? []))`.
- `pricePlan()`, replacing `priceSitemap`:
  1. `await refreshPlan()`.
  2. If the plan has no pages, toast "The site plan has no pages yet"
     (color neutral) and return.
  3. Recompute the groups from the fresh pages and run today's loop: for
     each group with a template, update the first draft line with that
     `template_id` (description and hours), or push a new line with
     `task_id`, and the rate from the template, else a same-task line's
     rate, else blank.
  4. Do not stamp pages. Do not remove lines.
  5. Same toast as today: lines added and updated, untyped pages left out,
     "Check the rates, then save."
- `pagesFor(line)`: `l.template_id ? (planData.value?.pages ?? []).filter(p => p.template_id === l.template_id).length : 0`.
  The hint under a line reads
  `{{ n }} page{{ n === 1 ? '' : 's' }} in the site plan`.
- Scope header: before "Add signage job", add
  `<UButton v-if="!planData?.plan" size="xs" variant="outline" color="neutral" icon="i-lucide-list-tree" @click="openPlanDrawer">Add site plan</UButton>`.
- In place of lines 466-479, when `planData?.plan`:
  - A row: `h2` "Site plan", muted "The pages the site will have. Price
    the plan writes one scope line per template.", and on the right:
    - `UButton v-if="planData.pages.length" size="xs" variant="outline" color="neutral" icon="i-lucide-calculator" class="ml-auto" @click="pricePlan"`
      "Price the plan"
    - `UButton size="xs" variant="outline" color="neutral" icon="i-lucide-link" @click="openPlanDrawer"`
      "Change"
  - `UCard`:
    - The plan name as `NuxtLink` to `/site-plans/<id>` (font-medium),
      then muted "{n} pages, {formatHours(total)}".
    - The group chips as today, from `planGroups`.
    - Empty: "No pages yet. Build the tree on the site plan."
    - When `planData.plan.project_id`, `p.text-sm.text-warning`: "This site
      plan is on {project link} now."
- Site plan drawer, `AppDrawer title="Site plan"`, description "Site plans
  for {client} that are not on a project yet. One plan can be on more than
  one open quote."
  - `openPlanDrawer()` loads
    `site_plans.select('id, name, site_plan_pages(count)').eq('client_id', quote.client_id).is('project_id', null).order('created_at', { ascending: false })`.
    It sets the selection to the current plan id, else to the first plan,
    else to `'__new__'`.
  - Body: `UFormField label="Plan"` with a `USelectMenu`. Items: each plan
    as `${name} (${count} ${count === 1 ? 'page' : 'pages'})`, then
    `{ label: 'Start a new site plan', value: '__new__' }`.
  - Footer: on the left, when a plan is linked,
    `UButton variant="ghost" color="neutral"` "Remove from this quote"; on
    the right Cancel and "Use this plan" (loading, disabled when the
    selection equals the current plan).
  - Use:
    1. If dirty and `!(await save())`, return.
    2. For `__new__`: insert
       `site_plans { client_id: quote.client_id, name: form.title.trim() || quote.title }`
       and select the id.
    3. `quotes.update({ site_plan_id, updated_at })`.
    4. For `__new__`: toast "Site plan started" and
       `navigateTo('/site-plans/<id>')`.
    5. Otherwise: close the drawer, `refreshAll()`, toast "Site plan added".
  - Remove: save first when dirty, then
    `quotes.update({ site_plan_id: null, updated_at })`, close,
    `refreshAll()`, toast "Site plan removed from the quote". Lines stay.
- Accept modal:
  - The "Accept on their behalf" `onSelect` also calls `refreshPlan()`.
  - Under the existing muted line, add
    `<p v-if="decideOpen === 'accept' && planData?.plan?.project_id" class="text-sm text-warning">`:
    "This site plan is already on {planData.plan.projects?.name}.
    Accepting copies its pages onto this quote but makes no tasks from
    them."
  - This is the only acceptance warning.
- Decided-quote subline: after the accepted or declined text, add
  `<NuxtLink v-if="quote.site_plan_id" :to="`/site-plans/${quote.site_plan_id}`" class="underline">Open the site plan</NuxtLink>.`
- Delete modal body: "Its lines go with it. Its site plan stays. The quote
  number is not reused."
- The "Unsaved changes" line stays as it is.

### 8.6 Project page (app/pages/projects/[id]/index.vue)

- New loader, started with the others and added to the `Promise.all`:
  ```ts
  const __ad12 = useAsyncData(`project-${id}-site-plan`, async () => {
    const { data, error } = await supabase.from('site_plans').select('id, name').eq('project_id', id).maybeSingle()
    if (error) throw error
    return data
  }, fresh)
  ```
  Then `const { data: sitePlan } = __ad12`.
- Header `PageActions` (line 187): remove `v-if="isAdmin"` and put it on
  the items:
  - `{ label: 'Edit project', icon: 'i-lucide-pencil', show: isAdmin, onSelect: () => { editing = true } }`
  - `{ label: 'Task types and rates', icon: 'i-lucide-settings', show: isAdmin, to: `/projects/${id}/settings` }`
  - `{ label: 'Site plan', icon: 'i-lucide-list-tree', show: !!sitePlan && can('screen:site_plans'), to: `/site-plans/${sitePlan?.id}` }`
  - more: `{ label: 'Start a site plan', icon: 'i-lucide-list-tree', show: !sitePlan && can('screen:site_plans'), onSelect: startSitePlan }`
  - Every project has a client (`client_id` is not null), so no client
    condition is needed.
- `startSitePlan()`:
  1. `site_plans.insert({ client_id: project.client_id, project_id: id, name: project.name }).select('id').single()`.
  2. On success, `navigateTo('/site-plans/<id>')`.
  3. On error: if `code === '23505'`, toast "This project already has a
     site plan" and refresh the loader; otherwise toast "Could not start
     the site plan" with the message.

### 8.7 Client document code

- `shared/types/quote.ts`:
  - Delete `SitemapNode`.
  - Add `export type QuotePage = { title: string, path: string | null, template: string | null, depth: number }`.
  - In `QuoteDoc`, replace `sitemap: SitemapNode[]` with
    `pages: QuotePage[]`. `lines[].pages` stays.
- `server/utils/quoteDoc.ts`:
  - Import `flattenPages` from `~~/shared/sitePlan`; import `QuoteDoc`
    only.
  - Header comment: "The quote as the client sees it. The caller picks the
    client: the service role for /q/<token> (the editor preview fetches the
    same route), the signed-in staff member through RLS for send. The page
    list is chosen here, by status, since the service role skips RLS."
  - Quote select: `'*, clients(name), site_plans(client_id)'`.
  - Lines select adds `template_id`.
  - Replace the nodes query and the tree builder with a local
    `loadPages()`, run in the same `Promise.all`:
    - Accepted:
      `quote_pages.select('title, path, template, template_id, depth').eq('quote_id', quote.id).order('sort_order')`.
    - Otherwise, when `quote.site_plan_id && quote.site_plans?.client_id === quote.client_id`:
      `site_plan_pages.select('id, parent_id, title, path, template, template_id').eq('plan_id', quote.site_plan_id).order('sort_order').order('created_at')`,
      mapped through `flattenPages` to
      `{ title, path, template, template_id, depth }`.
    - Otherwise `[]`.
    - Errors go through the same `createError(500)`.
  - `lines[].pages`:
    `l.template_id ? pages.filter(p => p.template_id === l.template_id).length : 0`.
  - Return `pages: pages.map(({ title, path, template, depth }) => ({ title, path, template, depth }))`
    in place of `sitemap`.
- `app/components/QuoteDocument.vue`:
  - Import `QuoteDoc` only; delete `flat` and `pageCount`.
  - The Pages block: `v-if="doc.pages.length"`, heading
    `Pages ({{ doc.pages.length }})`,
    `<li v-for="(p, i) in doc.pages" :key="i" ... :style="{ paddingLeft: `${p.depth * 1.25}rem` }">`
    with `p.title`, `p.path`, `p.template` as today.
- `server/utils/ai.ts` line 157:
  `description: 'A quote with its lines.'` (body unchanged).

## 9. Docs (same change)

### docs/guide.md

- Lines 52-54 become: "- **The canvas on a site plan** sits centered in
  its card, and the full-screen button in its toolbar gives it the whole
  window (Esc brings the page back)."
- Line 312: "Quoted websites get their tasks from the site plan instead."
- Step 4 (lines 380-388) becomes:

  4. **Plan the site.** For web work the pages live in a site plan. Start
     one from Site plans (under More in the rail), or with Add site plan on
     the quote. Build the tree there: a card per page with its title and
     path, a child or a sibling from the card, drag a card onto another to
     move it. Give each page a template (Home, Landing, Interior, Listing,
     Detail, Form, Blog post, set up in Settings with the hours each
     usually takes) and the hours follow; type over them on a page that is
     bigger or smaller. Save the plan. Then "Price the plan" on the quote
     writes one scope line per template ("6 x Interior pages", 18 hours)
     and updates those same lines when you price again. A draft or sent
     quote shows the plan's pages as they are saved.

- Step 7 (after "The quote and the project link to each other."): "With a
  site plan, each page becomes a task on the project, the plan moves to
  the project, and the quote keeps a copy of the pages as they were
  accepted."
- Lines 434-435: "When it is accepted, the site plan pages whose template
  matches that line become tasks assigned to that person."
- Line 602: "page templates for site plans".
- New section before "### The Quotes page" (line 416):

  ```md
  ### Site plans

  - **A site plan is the page tree for a website.** It belongs to a
    client, gets priced on a quote, and moves to the project when the
    quote is accepted. Anyone with the Quotes permission can make and edit
    plans, at any stage. No one else has a screen for them. Clients never
    see a plan, only the page list on their quote.
  - **The list and the plan.** Site plans lists every plan with its
    client, page count, and the quote or project it is on. New site plan
    picks the client and a name. On a plan, Save keeps the tree. Edit
    changes the name, and the client too until a quote uses the plan or it
    is on a project.
  - **On a quote.** Add to a quote on the plan, or Add site plan on the
    quote, links them. Only a plan for the same client that is not on a
    project yet can be linked, and one plan can be on more than one open
    quote (a revision, or a fresh quote after one expired). Price the plan
    on the quote reads the plan as last saved and writes the scope lines.
    Lines for a template you no longer use stay until you delete them.
  - **What the client sees.** A draft or sent quote shows the plan's pages
    as they are now, so the client's link follows your edits. When the
    client accepts, the quote keeps a copy of the pages, and the accepted
    quote shows that copy from then on. A declined quote still shows the
    plan while it is linked.
  - **Acceptance.** The plan moves to the new project and each page
    becomes a task, with the page's hours as its estimate and the person
    on the matching scope line assigned. If another quote on the same plan
    was accepted first, the plan stays on that project and this quote makes
    no page tasks; the Accept box says so.
  - **On a project.** The plan stays editable. Editing, moving, or
    removing a page never changes its task or a quote. Make tasks for new
    pages adds a task for each page that has none, including a page whose
    task was deleted. The new tasks are unassigned, with the page's hours
    as the estimate. Restoring a deleted page task after that leaves the
    page with two tasks; delete one.
  - **A project without a quote.** Start a site plan on the project page
    makes a plan for that project's client, already on the project. Build
    it, then use Make tasks for new pages.
  - **Deleting a plan** removes its pages. Quotes lose the link (an
    accepted quote keeps its copy) and tasks made from it stay.
  ```

### docs/permissions.md

Seeds paragraph (lines 30-36): change "Quotes from manage_quotes" to
"Quotes and Site plans from manage_quotes" and add the sentence: "Site
plans came later (2026-09-15) and copied manage_quotes from roles and from
per-person overrides, so it opens for exactly the people who have quotes."

### docs/structure.md

Remove line 75 (`sitemap.vue`). After the `quotes/` block add:

```
  site-plans/
    index.vue                  # every site plan, New site plan
    [id].vue                   # the page tree canvas, Add to a quote, Make tasks for new pages
```

### CLAUDE.md

One Schema bullet, after the invoicing bullet:

```md
- `site_plans` / `site_plan_pages` are a website's live page tree,
  linked from `quotes.site_plan_id` and moved to `site_plans.project_id`
  by `accept_quote()`. Draft and sent quotes show the live pages;
  acceptance copies them into `quote_pages`, which the accepted document
  reads forever. `site_plan_pages.work_item_id` is a page's task;
  `make_site_plan_tasks()` fills gaps and treats a soft-deleted task as none.
```

### docs/status.md

Append `## Site plans (2026-09-15)`. Say what shipped:

- migration 1 (three tables, `quotes.site_plan_id`, the new
  `accept_quote`, `make_site_plan_tasks`, the screen seed) and
  migration 2 after the deploy (the drop of `quote_sitemap_nodes`)
- the `create_quote` drift fix
- the two screens, the quote editor card, and the project page actions
- the client document rule by status
- what was removed (the inline sitemap, `line_item_id`)
- the known limitations from section 6
- the functions still checking `manage_billing` live

The verification that was actually done is appended after section 10
runs.

## 10. Verification plan

Nothing in this plan leaves data behind. Every SQL check runs in its own
`begin ... rollback`, and browser test rows are named `ZZ TEST` and
removed at the end. ClickUp and Harvest data are never touched.

### 10.1 After the migration (as postgres, read-only)

- The three tables exist with RLS on (`pg_class.relrowsecurity`).
  `select to_regclass('public.quote_sitemap_nodes')` is not null until
  migration 2 and null after it.
- `information_schema.role_table_grants`: anon has nothing on the three
  tables; authenticated has select, insert, update, delete on
  `site_plans` and `site_plan_pages`, and select only on `quote_pages`.
- `pg_get_functiondef` of `accept_quote`, `make_site_plan_tasks` and
  `create_quote` match section 3;
  `has_function_privilege('anon', 'public.make_site_plan_tasks(uuid)', 'execute')`
  is false.
- `get_advisors` security: no new finding for these objects.

### 10.2 RLS by impersonation (Supabase MCP `execute_sql`)

Pick ids first with a select: Luke's admin profile, one staff profile
(no role holds `manage_quotes`), and a client id. Each check is one
transaction; the setup rows are made inside it and vanish at rollback.

```sql
begin;
-- setup as postgres
insert into public.clients (id, name) values ('00000000-0000-4000-8000-000000000001', 'ZZ TEST client');
insert into public.site_plans (id, client_id, name) values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'ZZ TEST plan');
insert into public.site_plan_pages (plan_id, title, sort_order) values ('00000000-0000-4000-8000-000000000002', 'ZZ TEST home', 1);
-- impersonate
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
-- one check here
rollback;
```

Checks, each in its own transaction:

1. Staff: `select count(*) from site_plans` and `site_plan_pages` return
   the test rows; `select * from quote_pages` works.
2. Staff: `insert into site_plans (client_id, name) values (...)` raises
   a row-level security error.
3. Staff: `update site_plans set name = 'x'` updates 0 rows; `delete from
   site_plan_pages` deletes 0 rows.
4. Staff: `select public.make_site_plan_tasks('<plan>')` raises "Quotes
   permission needed".
5. Client: as postgres first
   `update public.profiles set role = 'client', client_id = '<client id>' where id = '<staff uuid>'`,
   then impersonate. `site_plans`, `site_plan_pages` and `quote_pages`
   return 0 rows.
6. anon: `set local role anon`; `select * from site_plans` raises
   permission denied.
7. Admin: `insert into quote_pages (quote_id, sort_order, title) values (...)`
   raises permission denied.
8. Admin: `make_site_plan_tasks` on the test plan (no project) raises
   "This site plan is not on a project yet".
9. Admin, the full acceptance path, in one transaction:
   - Setup: a plan with Home (root, template Home), About (child of Home,
     hours 5), Contact (root, no template, made after Home with the same
     `sort_order`, the tie a stale tab can leave). A draft quote
     `ZZ TEST quote A` for the test client with `site_plan_id` set, and a
     line with the Home template's `template_id` and `assignee_id` =
     the staff uuid. A second draft quote `ZZ TEST quote B` on the same
     plan.
   - Accept A: `select public.accept_quote('<A>', 'ZZ TEST')`. Expect:
     - `quote_pages` for A holds 3 rows in the order Home (depth 0),
       About (1), Contact (0), with hours 8, 5 and null.
     - The plan's `project_id` is A's project.
     - 3 work_items on that project, the Home one assigned to the staff
       user.
     - Every page's `work_item_id` is set.
   - Accept B: `quote_pages` for B holds 3 rows; no new work_items; the
     plan's `project_id` is unchanged.
   - `delete from work_items where id = <About's task>` (soft), then
     insert a fourth page. `make_site_plan_tasks` returns 2, and both
     pages now link to live tasks.
   - Rollback. Nothing is committed, so no notification or email goes out.
10. Admin: `decline_quote` on a linked draft writes no `quote_pages` rows.

### 10.3 Types and build

- `generate_typescript_types` into `shared/types/database.ts`;
  `npx nuxt typecheck` shows no `error TS` lines.
- Grep the changed files and docs for the em dash character and for
  British spellings; there should be none.
- Restart `docket-dev` (new pages).

### 10.4 Browser flows (docket-dev, Luke's Chrome)

Test rows carry `ZZ TEST` in the name. Test quotes use real quote
numbers; note the numbers used in status.md.

1. Rail: More shows Site plans after Estimator; Cmd+K "Go to Site plans";
   the loading skeleton on `/site-plans/<id>` is the detail shape.
2. `/site-plans`, New site plan: client `ZZ TEST client` (made in the
   picker), name `ZZ TEST plan`. Build 5 pages in two levels with
   templates, Save, reload: the tree persists and the list shows 5 pages
   and "Not on a quote yet".
3. Edit site plan: rename; the client can change.
4. Add to a quote, New quote `ZZ TEST quote A`: you land on the quote
   with the Site plan card.
   - Price the plan adds one line per template; Save.
   - The preview shows "Pages (5)" indented and "N pages" under the
     lines.
   - Edit the drawer: the client is now fixed.
5. In a second tab, add a page to the plan and Save. On the quote, reload
   the preview: 6 pages (live). Price the plan updates the same lines.
6. From the quote, Add site plan on a second quote `ZZ TEST quote B` for
   the same client (via Quotes, New quote): the drawer offers
   `ZZ TEST plan`; Use this plan.
7. Quote A, Accept on their behalf: no warning.
   - You land on the project; its tasks equal the pages, the matching
     line's person assigned.
   - The plan screen shows "On ZZ TEST quote A" and "Every page has a
     task".
   - The project page shows the Site plan action for an admin.
8. Rename a page and add a page on the plan, Save.
   - Quote A's preview and `/q/<token>` are unchanged (the copy).
   - The plan says "1 of 7 pages have no task yet".
   - Make tasks for new pages: the modal names 1 task, then the toast.
   - Delete one page task on the project, reload the plan: 1 missing;
     Make tasks makes it again.
9. Quote B: Accept modal shows "This site plan is already on ...". Accept:
   no new tasks; B's document shows its copy.
10. A new quote `ZZ TEST quote C` on a fresh plan, Decline on their
    behalf: the document still shows the live plan.
11. `/api/q/<token>` JSON for A: `pages` entries have only title, path,
    template, depth; lines have no `template_id`.
12. A project without a plan (make `ZZ TEST project` for the test
    client): More, Start a site plan, add pages, Save, Make tasks for new
    pages.
13. View as staff: no Site plans in the rail, `/site-plans` goes home,
    and the project page shows no site plan actions and no Edit project.
    (View as changes the UI only; RLS was checked in 10.2.)
14. Delete site plan on a test plan: its quotes lose the Site plan card;
    the accepted quote keeps its pages.
15. No PGRST201 in the network log on `/quotes`, `/quotes/<id>`,
    `/projects/<id>`, `/clients/<id>` and the two site plan screens.

Cleanup (as postgres, one transaction, after a select shows only ZZ TEST
rows):

```sql
begin;
set local docket.purge = 'on';   -- lets the soft delete trigger hard-delete
delete from public.site_plans where name like 'ZZ TEST%';
delete from public.work_items where project_id in (select id from public.projects where name like 'ZZ TEST%' or client_id in (select id from public.clients where name like 'ZZ TEST%'));
delete from public.quotes where client_id in (select id from public.clients where name like 'ZZ TEST%');
delete from public.projects where client_id in (select id from public.clients where name like 'ZZ TEST%');
delete from public.clients where name like 'ZZ TEST%';
commit;
```

Then select again for leftovers (notifications for the test tasks,
planner rows) and remove only those.

## 11. Implementation packages

Precondition for every package: migration 1 (`site_plans`, section 3) is
applied, schema.sql is mirrored (section 4), and
`shared/types/database.ts` is regenerated. Migration 2
(`drop_quote_sitemap_nodes`) is not a precondition. It runs after every
package is committed, pushed and deployed, then the types are regenerated
again and `npx nuxt typecheck` is run. File ownership is disjoint; no file appears in two packages.
Each package ends with `npx nuxt typecheck` clean for its own files.

| Key | Files | Depends on |
| --- | --- | --- |
| core | `shared/sitePlan.ts` (new), `app/components/SitemapCanvas.vue` | none |
| client-document | `shared/types/quote.ts`, `server/utils/quoteDoc.ts`, `app/components/QuoteDocument.vue`, `server/utils/ai.ts` | core |
| shell | `shared/types/app.ts`, `app/components/AppSidebar.vue`, `app/components/SearchPalette.vue`, `app/components/PageSkeleton.vue`, `app/pages/admin/page-templates.vue` | none |
| plan-screens | `app/pages/site-plans/index.vue` (new), `app/pages/site-plans/[id].vue` (new) | core |
| quote-editor | `app/pages/quotes/[id].vue` | core |
| project-page | `app/pages/projects/[id]/index.vue` | shell |
| docs | `docs/guide.md`, `docs/permissions.md`, `docs/structure.md`, `CLAUDE.md`, `docs/status.md` | none (the verification paragraph in status.md is added after 10.4) |

- **core**: write `shared/sitePlan.ts` exactly as section 7; apply the
  `SitemapCanvas.vue` changes in 8.2.
- **client-document**: section 8.7.
- **shell**: section 8.1.
- **plan-screens**: sections 8.3 and 8.4. Use `AppDrawer` for New, Add to
  a quote and Edit; `UModal` for Make tasks and Delete; breadcrumbs, not a
  back arrow; one `PageActions` row.
- **quote-editor**: section 8.5.
- **project-page**: section 8.6.
- **docs**: section 9.
