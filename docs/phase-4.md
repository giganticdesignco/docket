# Docket Phase 4 plan

**Shipped 2026-09-03, all twelve items.** What each became is in
`docs/status.md` (the dated sections from "Project page" through
"Invoice cost and margin") and the guide. Kept as the spec.

Written 2026-09-03, from the PM's written notes on Scoro (and Teamwork.com):
what she'd like to see in Docket, checked feature by feature against the
current code, then spec'd. All twelve items are independent — none blocks
another — so the order below is a suggestion by size and daily-use value,
not a dependency chain. Same build style as Phases 1 through 3: schema
first, RLS as the security model, verify in the browser, commit after each
verified item.

Two items from the PM's notes aren't here because Docket already has them:
a comprehensive client overview page, and reporting.

## Suggested order

| Order | Item | Why | Size |
| --- | --- | --- | --- |
| 1 | Project page upgrade | Daily-use screen; adds invoices/quote visibility, a lead, hours remaining, inline time | 2 days |
| 2 | Quote line catalog, margins, forecast link | Splits into 3 stoppable parts (a: catalog, b: margin, c: forecast); part (a) alone is quick | 3.5 days |
| 3 | Quotes pipeline view | Quick, pairs with #2 since both touch /quotes | 1 day |
| 4 | Project templates | Speeds every new non-quoted project's setup | 2 days |
| 5 | Department filter on projects | Quick, small | 1 day |
| 6 | Inline task timer + sidebar popover | Cuts the friction of logging time day to day | 1.5 days |
| 7 | Finer-grained permissions | Access hygiene, touches nine RLS policies precisely | 1.5 days |
| 8 | Retainer project view | A detail page most retainer clients would benefit from | 2 days |
| 9 | Planner / staffing view | Bigger behavioral shift; benefits from the above being settled first | 2 days |
| 10 | "My Work" home view | Touches navigation broadly; the agenda/calendar piece is the riskiest part | 2.5 days |
| 11 | Timesheet approvals | A process change that needs buy-in from whoever reviews hours | 2.5 days |
| 12 | Invoice cost & margin split | The biggest structural lift, and the one item that was fully missing, not partial | 2.5 days |

About 24 days in total, four and a half to five weeks.

## 1. Project page: invoices/quote section, project lead, hours remaining, inline time entry

What: the project detail page (`app/pages/projects/[id]/index.vue`) grows an invoices/quotes card, a project lead field, per-task hours remaining, and inline time logging — reusing `quotes`, `invoice_lines`/`invoices`, and the existing `TimeEntryForm.vue` + `AppDrawer` pattern already proven on `/time.vue`, instead of sending people there.

How:
- Schema: `alter table projects add column lead_id uuid references profiles(id) on delete set null;` (one person, not required — no non-null constraint, no new index; the table is small and nothing filters by lead yet). Comment it `-- who owns this project day to day` in schema.sql, appended as its own patch block like the `deleted_at`/`deleted_by` additions near the bottom of the file.
- Project lead: `ProjectForm.vue` gets a `people` prop (the project page already loads `people` for task assignment via `__ad5`, so just pass it through) and a `USelectMenu` bound to `lead_id`, same shape as the task page's assignee picker. The project page's info `<dl>` (Job code / Billing / Hourly rate / Budget hours / Budget amount) gets a `Lead` row showing `project.profiles?.full_name ?? 'Unassigned'`; `__ad1`'s select becomes `'*, clients(id, name), profiles!projects_lead_id_fkey(full_name)'`.
- Invoices/quotes card: new `useAsyncData` calls scoped to this project instead of the client. Quotes: `.from('quotes').select('id, number, title, status, subtotal, valid_until').eq('project_id', id)` — same shape as the client page's quotes list. Invoices: `projects` has no `invoice_id`/`project_id` itself (only `invoice_lines.project_id` does), so query `.from('invoice_lines').select('invoice_id, invoices(id, number, subject, status, issue_date, due_date, total, due_amount)').eq('project_id', id)` and dedupe client-side by `invoice_id`. Render as two compact lists modeled on the client page's Quotes/Invoices `UCard`s (same badge-coloring helpers, copy them or extract to a shared `invoiceLabel`/`invoiceColor` util). Gate the whole card on `can('manage_billing')`, not `manage_reference` — `invoices` and `invoice_lines` only carry a `manage_billing` RLS policy plus `client_select`, so a `manage_reference`-only admin would see an empty card, not a permissions error.
- Hours remaining: no new column — `estimate_hours` already exists on `work_items`, and hours logged is already summed from `time_entries` (task page's `__ad5`, project page has no per-task equivalent). Add `.select('work_item_id, hours').eq('project_id', id)` on `time_entries` (RLS already limits staff to their own rows same as the rest of the page) and reduce into a `Map<work_item_id, hours>` client-side. Extend the project page's `work_items` query (`__ad4`) to also select `estimate_hours`. Show remaining next to each task row and on `tasks/[id].vue`'s existing "Estimate … Logged" line, using the retainer card's existing wording convention (`'X left'` in normal text, `'X over'` in `text-error`) rather than inventing new copy.
- Inline time entry: swap the task page's `Log time` button (currently `:to="/time?item=..."`) for `@click="loggingTime = true"` opening an `AppDrawer` on the task page itself with `TimeEntryForm`, which already accepts a `workItem` prop and handles save/start — no new component. Needs the task page's existing `projects-for-tasks` query to add `billing_method` (currently missing, and `TimeEntryForm` needs it for its billable-default logic) and a new `project_tasks` query scoped to `item.project_id`. On the project page, add a small per-row time icon-button in the Tasks card that opens the same drawer/form for that task, passing `[project]` (already loaded, shape already matches `ProjectOption`) and a project-scoped `project_tasks` query (extend `__ad2`, which currently only selects `hourly_rate, tasks(name)`, to also carry `task_id, tasks(id, name, is_billable_default, is_active)`). Both surfaces refresh their hours-logged data (`refreshItems` / task page's time sum) on `@saved`.

Depends on: nothing. Size: 2 days (schema plus lead field half a day, invoices/quotes card half a day, hours remaining half a day, inline time entry three quarters of a day, verified in browser on a project with a linked quote and invoice).

Assumption to confirm: `quotes.project_id` is only ever set once, by `accept_quote()` on acceptance — there's no UI today to link a later change-order quote to an existing project, so the Quotes card will normally show at most the one founding quote. Fine for this pass; flag if Luke wants change orders linkable before shipping.

## 2. Quote line catalog, per-person margins, and schedule forecasting link

What: a lightweight service catalog on the existing `tasks` table so a quote line prefills a description and rate the way sitemap pages already do from `page_templates`, plus the cost-rate and per-line-assignee data `quote_line_items` needs to show an anticipated margin, and a read-only link from unaccepted quoted hours into `capacity_weekly` so a PM can see resourcing risk before a quote is won. Three pieces of clearly different size — sequenced so each stands alone if Luke wants to stop after any of them.

How:

#### a. Service catalog + cost-rate groundwork
- `alter table tasks add column default_rate numeric(10,2), add column default_description text;` — reuses the existing global task-type table (Design, Front-end Dev, QA...) instead of a new catalog table, since it's already the thing `quote_line_items.task_id` points at.
- `alter table profiles add column cost_rate numeric(10,2);` — internal cost per hour, alongside the existing `default_rate` (billable). Add `cost_rate` to the column list `protect_profile_columns()` already guards (schema.sql:178-193) so it's admin-only to write, same as `default_rate` today.
- `TaskForm.vue` (used by `admin/tasks.vue`): two new fields, "Default rate" and "Default description."
- `UserForm.vue`: one new field, "Cost rate," admin-only like "Default rate" already is.
- `app/pages/quotes/[id].vue`: when a line's `task_id` changes and its rate/description are still empty, prefill from `tasks.default_rate`/`default_description` — same shape as the existing template-hours prefill for sitemap lines (`quotes/[id].vue:169-185`), just for the task picker instead of the template picker.

Depends on: nothing. Size: 1 day.

#### b. Per-line assignee and margin
- `alter table quote_line_items add column assignee_id uuid references profiles(id) on delete set null;` with `create index quote_line_items_assignee on quote_line_items (assignee_id);`.
- Margin needs `cost_rate`, and `quote_line_items` is currently readable by *any* non-client staff member (`read_all` policy, schema.sql:2622) — wider than the `manage_billing` permission that actually gates the quote editor page. Rather than widen that exposure by joining `profiles.cost_rate` client-side, add a security definer function `quote_line_margins(p_quote_id uuid)` (pattern like `resolve_rate()`) that checks `has_permission('see_money')` and returns `(line_item_id, cost, margin)` per line — cost rates themselves never leave Postgres.
- `quotes/[id].vue`: an assignee `USelect` column next to the task-type picker (same styling as the existing `task_id` select at line 385); a "Margin" column and quote-level margin total, both rendered only when `can('see_money')`, fed by `quote_line_margins`. Lines with no `assignee_id` show no margin rather than guessing.
- `accept_quote()`: when a sitemap node's `line_item_id` resolves to a line with `assignee_id` set, also insert into `work_item_assignees` for the `work_items` row it creates (schema.sql:2461-2469) — carries the assignment forward instead of losing it at conversion, a few lines in a function that's already looping there.

Depends on: (a), for the assignee picker to sit next to a catalog-aware task picker. Size: 1.5 days.

#### c. Forecasting link into capacity
- `alter table quote_line_items add column target_week date;` — the week this work is expected to land, human-picked, so `date` not `timestamptz`. Shown only once a line has an `assignee_id`.
- Extend the `capacity_weekly` view (schema.sql:1331) with a `forecast_hours` column: sum of `quote_line_items.hours` where `assignee_id = pr.id`, `target_week = w.week_start`, and the parent `quotes.status in ('draft', 'sent')` — excluded once a quote is accepted or declined, so it never double-counts against the real `work_items` that `booked_hours` already tracks.
- `capacity.vue`: a second, visually distinct segment on each person's week bar for `forecast_hours` ("quoted, not yet won"). No new permission — it's still hours, gated by the page's existing `see_capacity`, not money.
- Not in this pass: a Gantt link on `schedule.vue`. Quote lines only carry a target *week*, not a start/end date, so there's no clean bar to draw there without inventing scheduling data a quote doesn't have yet; capacity's week granularity is the natural fit and covers the "resourcing forecast" ask on its own.

Depends on: (b), for `assignee_id` to exist. Size: 1 day.

Total: about 3.5 days across the three, verified in the browser after each part rather than at the end.

Assumption to confirm: "person or department" is scoped to person only (`assignee_id` → `profiles`) — Docket has no department table, and `task_id` already functions as the closest thing to a discipline grouping on a line. If Luke wants a coarser assignment (a team rather than one name), that's a bigger schema addition worth its own spec.

## 3. Quotes pipeline / board view with owner and follow-up signal

What: `app/pages/quotes/index.vue` gets a pipeline/board layout alongside its existing flat table, toggled the same way `app/pages/tasks/index.vue` toggles List vs Cards, plus an Owner column reading `quotes.created_by` and a stale-quote indicator for quotes stuck in `sent`. No new tables.

How:
- Extend the page's `useViewState('quotes', ...)` call (already storing `filter`) with a persisted `layout: 'list' | 'board'`, the same pattern tasks/index.vue uses for `viewMode`. Add the List/Board toggle as a `UButton` pair next to the existing filter pills, using `i-lucide-list` / `i-lucide-layout-grid` like tasks does; the status filter pills only render in list layout, since board columns make them redundant (mirrors how tasks hides its `groupBy` select in cards mode).
- Add `created_by, profiles(full_name)` to the existing `quotes` query in `__ad1` (currently selects `id, number, title, status, subtotal, valid_until, sent_at, accepted_at, created_at, client_id, project_id, clients(name)`). `quotes.created_by` is the only FK from `quotes` to `profiles`, so the join needs no alias.
- Owner shown as an initials pill, reusing the exact visual pattern from tasks/index.vue's assignee avatars (`grid size-5/6 place-items-center rounded-full bg-elevated text-[10px] font-medium ring-2 ring-default`, with a local `initials(name)` helper copied the same way tasks/index.vue, tasks/[id].vue, and schedule.vue each already define their own — no shared util exists yet, so match that convention rather than introducing one). Add an "Owner" `<th>`/`<td>` to the table, and the same pill on board cards.
- Board columns: a client-side `computed` groups the already-fetched `quotes` ref into Draft / Sent / Accepted / Declined (four `UCard`s in a `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`, wrapped for horizontal scroll on narrow viewports). No fifth "Expired" column — the `quote_status` enum's `expired` value is never actually written by any function in schema.sql (`accept_quote`/`decline_quote` only set `accepted`/`declined`); "expired" is purely the existing client-side `badge()` computed treating a `sent` quote past `valid_until` as expired. The board keeps that: expired-by-date quotes stay in the Sent column, flagged with the same red `expired` badge the table already renders.
- Column header shows count and `money()` sum of `subtotal`, reusing the page's existing `money()` helper — effectively generalizing the two summary `UCard`s ("Out with clients", "Won this year") per-column instead of just for sent/accepted.
- Each card is a `NuxtLink` to `/quotes/${q.id}` (same destination as today's row click) showing number, title, client name, owner pill, subtotal, and `valid_until`. No drag-and-drop between columns: unlike task status, moving a quote to `accepted`/`declined` runs `accept_quote()`/`decline_quote()`, both of which require a typed client name (`p_name`) — that's the existing "Accept or decline on the client's behalf" modal (kept as a modal per docs/phase-3.md's drawer inventory), not a one-field drag. Board cards stay click-through only.
- Staleness: a computed `isStale(q)` — `q.status === 'sent' && q.sent_at && daysSince(q.sent_at) >= 5` (not yet past `valid_until`, since that's already the separate "expired" state). Render as a small amber dot next to the Sent badge in both layouts, with a `UTooltip` reading "Sent 12 days ago, no reply yet." Purely a UI computed on data already fetched — no new column, notification kind, or cron job. Follow-up emails/reminders stay out of scope for this pass.

Depends on: nothing — `useViewState`/`persisted` and `created_by` both already exist. Size: 1 day.

Assumption to confirm: the 5-day staleness threshold is hardcoded in the page rather than a new `invoice_settings` column, since this spec calls it a "simple" signal — say if you want it tunable from Settings instead. Also confirming the board is click-through only (no drag-to-change-status), given accept/decline need a typed client name today.

## 4. Project templates

What: A reusable preset of work items — title, task type, default hours, suggested role — that can be dropped into a brand-new project of any kind, not just a quoted website job. Two new tables, `project_templates` and `project_template_items`, plus a "start from template" step in `ProjectForm.vue` that inserts matching `work_items` once the project exists, the same way `accept_quote()` already turns `quote_sitemap_nodes` into `work_items` for quoted web jobs. `page_templates` is untouched and keeps doing exactly what it does today (sitemap pricing, fired only from `accept_quote()`).

How:
- `project_templates (id, name unique, description, is_active, position, created_at)` — same shape as `page_templates` minus the sitemap-only columns (`hours`, `rate`, `color`).
- `project_template_items (id, template_id references project_templates(id) on delete cascade, title not null, task_id references tasks(id) on delete set null, estimate_hours numeric(6,2), default_role text references roles(key) on update cascade on delete set null, sort_order int not null default 0)`, index `project_template_items_template on (template_id, sort_order)`. `default_role` is a UI hint for who to assign, not a hard link — `work_item_assignees` needs real user ids, so it's never written automatically.
- RLS on both tables copies `page_templates` verbatim: `read_all` for authenticated non-clients (`not (select is_client())`), `manage_settings` policy for all using `(select has_permission('manage_settings'))`, granted to `authenticated`.
- New security definer function `apply_project_template(p_project_id uuid, p_template_id uuid)`, structured like the sitemap loop inside `accept_quote()`: for each `project_template_items` row, insert a `work_items` row (`project_id`, `title`, `estimate_hours`, `created_by = auth.uid()`); for each distinct `task_id` referenced, `insert into project_tasks ... on conflict do nothing` so the task type is available on the project before anyone tries to log time against it.
- New admin page `app/pages/admin/project-templates.vue`, following `app/pages/admin/page-templates.vue`'s CRUD pattern (inline add/edit, position via move up/down, `manage_settings` gate) but with a repeatable item list per template (title, task type picker from `tasks`, hours, role picker from `roles`) instead of one hours/rate/task_id row. Linked from `app/pages/admin/index.vue`'s settings list.
- `app/components/ProjectForm.vue`: a template `USelect` shown only on create (`v-if="!project"`, same guard already used for `SimilarProjects`). It doesn't touch the budget fields — those stay driven by `SimilarProjects` or manual entry, since a template's hours are per-item estimates, not a project total. On submit, after the `projects` insert succeeds and before `emit('saved', data)`, call `supabase.rpc('apply_project_template', { p_project_id: data.id, p_template_id: state.template_id })` when a template was picked. `app/pages/projects/index.vue` needs no change; it already refreshes on `saved`.

Depends on: nothing. Size: 2 days (schema, RLS, and the RPC half a day; the admin CRUD page with nested items a full day, since it's more form than `page_templates`; `ProjectForm` hookup and browser verify half a day).

Assumption to confirm: applying a template only happens at project creation, inside `ProjectForm`. Applying one to an already-existing project (say, someone forgot at creation) isn't in scope here — that would need its own entry point, likely a button on the project's task list, and re-running it would need a guard against double-adding items. Confirm whether that's wanted now or is a later add.

## 5. Department/category on projects + filter

What: a `department_id` on `projects` (nullable FK to a new `departments` lookup table) plus a filter control on the Projects list (`app/pages/projects/index.vue`) next to the existing client `USelectMenu`, so a project can be tagged "Web," "Signage," "Branding," etc. and the list filtered to one.

A lookup table beats a Postgres enum here, matching `expense_categories` rather than the `billing_method` enum (`shared/types/app.ts`): departments are agency-defined labels admins will rename and add to over time (the same shape as `work_statuses` and `expense_categories`, both editable at `/admin`), where `billing_method` is a small fixed set the app's billing logic branches on and never needs to grow. An enum would mean a migration every time Luke wants a new department.

How:
- `schema.sql`: new table, styled on `expense_categories` (no color/position/flags needed — those exist on `work_statuses` because it drives kanban order and done/paused/review behavior; a department is just a label):
  ```sql
  create table departments (
    id        uuid primary key default gen_random_uuid(),
    name      text not null unique,
    is_active boolean not null default true
  );
  ```
  and on `projects`, right after `client_id`:
  ```sql
  department_id uuid references departments(id) on delete restrict,
  ```
  nullable — existing projects (all 693-plus imported from ClickUp/Harvest) start unassigned rather than blocking on a backfill. Add `create index projects_department on projects (department_id);` next to the existing `projects_search` index, since the new list filter will query on it.
- RLS, following the `expense_categories` pair exactly: `create policy read_all on departments for select to authenticated using (not (select is_client()));` and `create policy manage_settings on departments for all to authenticated using (has_permission('manage_settings')) with check (has_permission('manage_settings'));`.
- New admin page `app/pages/admin/departments.vue`, a near copy of `app/pages/admin/expense-categories.vue` (list, "Show inactive" switch, New button, edit-in-drawer) with `definePageMeta({ middleware: 'can', permission: 'manage_settings' })`. New `app/components/DepartmentForm.vue`, a trimmed copy of `ExpenseCategoryForm.vue` (name + is_active only).
- `app/components/SettingsNav.vue` and the cards array in `app/pages/admin/index.vue` each get one more entry, next to "Expense categories."
- `app/components/ProjectForm.vue`: add `department_id` to `state`, an `UFormField label="Department"` with a `USelect` sourced from a `departments` fetch (same shape as the existing `clients` prop — pass it down from `app/pages/projects/index.vue`, which already loads `clients` alongside `projects`), and include `department_id: state.department_id ?? null` in the insert/update payload.
- `app/pages/projects/index.vue`: load `departments` in a fourth `useAsyncData` alongside `clients-for-projects`; add `departmentFilter` beside `clientFilter` with its own `USelectMenu` ("All departments" + names) placed next to the client one; extend the `rows` computed's filter predicate with `&& (!departmentFilter.value || p.department_id === departmentFilter.value)`; add a "Department" column to the table between Client and Code, reading `p.departments?.name` off the joined select (`.select('*, clients(name), departments(name)')`).

Depends on: nothing. Size: 1 day.

## 6. Inline task timer + sidebar assigned-tasks popover

What: a compact timer control on the task detail page (`app/pages/tasks/[id].vue`) and the project page's task list (`app/pages/projects/[id]/index.vue`), so starting or stopping the clock on a task no longer requires a trip through `/time`, plus a popover off the sidebar's Time link (`app/components/AppSidebar.vue`) showing the signed-in person's open assigned tasks with estimate and logged hours. Both reuse `useTimer()` and the existing `time_entries` schema (`work_item_id`, `started_at`/`ended_at`, `one_running_timer_per_user`) as is; nothing new in `schema.sql`.

How:
- New `app/components/TaskTimerControl.vue`: takes a work item (`id`, `title`, `project_id`) and the project's billable task types (`project_tasks` joined to `tasks`, filtered to that project). Uses `useTimer()`'s `running`, `isRunning`, `liveHours`, `startNew`, `stop`.
  - If `running.value?.work_item_id === workItem.id`: shows a ticking `formatHours(liveHours(running))` and a Stop icon-button (`timer.stop`).
  - Else: a "Start timer" button. If the project has exactly one active `project_tasks` row, it starts immediately (`timer.startNew({ user_id, project_id, task_id, work_item_id, spent_on: todayString(), notes: workItem.title })`); with more than one, a tiny inline `USelectMenu` (same options `TimeEntryForm.vue` builds from `projectTasks`) appears next to the button so the person picks the billable category before starting. Starting when a timer is already running elsewhere just calls `startNew`, which `claimSlot` in `useTimer` already stops-and-retries on the `23505` conflict — no new conflict handling needed.
- `app/pages/tasks/[id].vue`: replace the top-bar `<UButton :to="/time?item=..." icon="i-lucide-timer">Log time</UButton>` with `<TaskTimerControl>` next to a smaller "Log time" button (kept, unchanged, for entering a specific duration or backdating). Add one more `useAsyncData` after `item` resolves (alongside the existing `waitsOn`/`siblings` follow-up queries), `project-${id}-task-types`, fetching `project_tasks.select('project_id, task_id, tasks(id, name, is_active)').eq('project_id', item.value.project_id)`, passed into `TaskTimerControl`.
- `app/pages/projects/[id]/index.vue`: extend `__ad2` (`project_tasks`) to also select `task_id` (currently only `hourly_rate, tasks(name)`), and drop a compact `<TaskTimerControl>` (icon-only variant, no label) into each row of the open-tasks `<ul>` (around line 264), next to the status badge. Reuses `projectTasks` and `workItems` already loaded on that page.
- New `app/components/TimeClockPopover.vue`, styled like `NotificationBell.vue` (`UPopover`, `side: 'right', align: 'end'`): replaces the plain `{ label: 'Time', to: '/time', icon: 'i-lucide-clock' }` entry in `AppSidebar.vue`'s desktop rail (mobile sheet keeps the plain link, matching how the bell is desktop-only today).
  - Header: if `timer.running` is set, the live elapsed time and a Stop button (same pattern as `time.vue`'s `runningElsewhere` banner).
  - Body: the person's open assigned tasks — `work_items.select('id, title, due_on, estimate_hours, projects(name, clients(name))').eq('work_item_assignees.user_id', user.sub, { foreignTable: 'work_item_assignees' })` with `work_item_assignees!inner(user_id)`, same shape as `my_tasks` in `server/utils/ai.ts:145`, filtered to not-done/not-paused via `useWorkStatuses()` and ordered by `due_on`. A second query sums `time_entries.hours` grouped by `work_item_id` for those ids, to show "3.5h of 8h" next to each row (reduced client-side, as `tasks/[id].vue`'s own `timeLogged` already does for one task).
  - Each row is a `NuxtLink` to `/tasks/<id>`; footer link "Open Time" to `/time`, mirroring the bell's "All notifications" link. Read-only — no inline start/stop here, to keep the popover a status view rather than duplicating the task page's picker.

Depends on: nothing. Size: 1 day for the inline control (task page and project task list) plus 0.5 day for the sidebar popover — 1.5 days total.

Assumption to confirm: when a project has more than one billable task type, the inline control asks the person to pick one before starting rather than guessing (e.g. "most recently used"). If Luke would rather it silently default to the last category this person logged on that project, that's a small addition to the same component.

## 7. Finer-grained permissions

What: split the single `manage_billing` permission key (`permissions.key = 'manage_billing'`, checked via `has_permission('manage_billing')`) into three narrower keys — `manage_quotes`, `manage_invoices`, `manage_retainers` — so a role can be granted quoting without invoice/payment access, or retainer admin without either. Nothing about the permission *system* changes: `roles`, `permissions (role, key)`, `has_permission()`, and the generic matrix at `/admin/permissions.vue` (which already renders whatever is in the `PERMISSIONS` array) all stay as built. Harvest invoice history (`harvest_archive_monthly`, `harvest_invoices`) rides along with `manage_invoices` since it's read-only invoice data, not a fourth bucket.

How:
- `schema.sql`: update the key list comment above `create table permissions` (currently `manage_billing   batches, invoices, quotes, retainers, Harvest history`) to three lines: `manage_quotes`, `manage_invoices` (batches, invoices, invoice lines/payments, Harvest archive), `manage_retainers`. No seed-data change needed today: per the current `insert into permissions (...)` block, neither `manager` nor `staff` holds `manage_billing`, so no default role gains or loses anything.
- Migration (applied once, then mirrored into `schema.sql`): fan out any existing `manage_billing` row into all three, so a custom role Luke has already granted billing to doesn't lose access:
  ```sql
  insert into permissions (role, key)
    select role, k from permissions, unnest(array['manage_quotes','manage_invoices','manage_retainers']) as k
    where key = 'manage_billing'
    on conflict do nothing;
  delete from permissions where key = 'manage_billing';
  ```
- RLS: rewrite the nine `manage_billing` policies to their split key — `retainers` → `manage_retainers`; `billing_batches`, `invoices`, `invoice_lines`, `invoice_payments`, `harvest_archive_monthly`, `harvest_invoices` → `manage_invoices`; `quotes`, `quote_line_items`, `quote_sitemap_nodes` → `manage_quotes`. These nine are currently written as bare `has_permission('manage_billing')` (not wrapped in `(select ...)`, unlike `own_time_select` and the `work_item_*` policies) — since every one of them is being touched anyway, wrap them correctly this pass rather than leaving the per-row evaluation in place.
- Five `has_permission('manage_billing')` checks inside functions move to their matching key: `create_billing_batch()`, `void_billing_batch()` → `manage_invoices`; `create_invoice()`, `void_invoice()` → `manage_invoices`; `create_quote()` → `manage_quotes`.
- `shared/types/app.ts`: replace the single `manage_billing` entry in `PERMISSIONS` with three entries (labels/hints split the same way, e.g. `{ key: 'manage_quotes', label: 'Quotes', hint: 'Draft, send, and edit quotes.' }`). The `/admin/permissions.vue` table needs no code change — it already iterates `PERMISSIONS`, so the matrix grows from 9 rows to 11 for free.
- App call sites (`can('manage_billing')` → the matching key, per what each screen actually shows): `invoices/index.vue`, `invoices/[id].vue`, `billing/index.vue`, `billing/[id].vue`, `billing/new.vue` → `manage_invoices`; `quotes/index.vue`, `quotes/[id].vue`, and the draft-quotes list/"Add to quote" button in `estimator.vue` → `manage_quotes`; nav entries in `AppSidebar.vue` and `SearchPalette.vue` split per-link (Quotes → `manage_quotes`, Invoices → `manage_invoices`); `AppShortcuts.vue`'s `g-i` shortcut → `manage_invoices`.
- A few spots mix all three and become an OR of the new keys rather than a single key: `clients/[id].vue`'s `canBill` (gates the combined Billing card, Contacts section, and "View as client" button, which surface quotes, invoices, and retainer status together), `portal/index.vue`'s preview guard (the portal page itself queries quotes, invoices, Harvest history, and retainers in one `Promise.all`), and `server/api/clients/invite.post.ts`'s `has_permission` check (inviting a client contact is reached from that same Billing card).

Depends on: nothing. Size: 1.5 days — the schema/RLS rewrite and `PERMISSIONS` split are mechanical, but there are nine RLS policies and five functions to touch precisely, plus verifying in the browser with a couple of test roles (quotes-only, invoices-only) that each is actually blocked from the other's tables, not just the nav link.

Assumption to confirm: the three composite spots (client detail page, portal preview, client invite) grant access on *any* of the three new keys, not all three — so someone with only `manage_quotes` can still preview the client portal and see invoices there, just can't edit them. If Luke wants those spots to require full billing access, they'd instead check `manage_invoices` alone (the broadest of the three) rather than an OR.

## 8. Retainer project view: contract rollup + period drill-down

What: A retainer detail page that rolls a client's chained retainer periods (`retainers` table, chained by `retainer_status()`) into one contract view with full period history, and makes each period clickable to drill into its logged time. Today `app/pages/clients/[id].vue` and the portal's `app/pages/portal/index.vue` both render `retainer_status()` as a flat list of periods with no grouping and no click target.

How:
- No new tables. `retainer_status()` already computes a chain key internally (`client_id || project_id || lower(name)`, schema.sql line ~1514) but doesn't return it — reuse that same grouping logic client-side instead of changing the function's signature.
- New function `retainer_period_detail(p_retainer_id uuid)`, `stable security definer`, `set search_path = ''`, placed after `retainer_status()`. Given one retainer id, it looks up that row's `client_id`/`project_id`/`period_start`/`period_end`/`basis`, then returns billable `time_entries` in that window scoped the same way `retainer_status()` scopes usage (`p.client_id = client_id and (project_id is null or p.id = project_id)`, `is_billable`, `ended_at is not null or started_at is null`): `spent_on, project_name, task_name, user_name, hours, amount, notes`. `amount` follows the `time_detail` pattern — null unless `(select public.has_permission('see_money'))`. For `is_client()` callers, checked and restricted to `my_client_id()` like `retainer_status()` does, so the function is safe to reuse from the portal later. Needed because `time_entries` RLS only shows a staffer their own rows unless they have `see_all_time` — querying `time_detail` directly would under-count against the totals `retainer_status()` already shows everyone. `revoke execute ... from public, anon;` alongside the existing `retainer_status()` line.
- For periods that predate the Docket cutover (covered only by `harvest_archive_monthly`, no entry rows), `retainer_period_detail` returns no rows; the page falls back to a plain "logged before the cutover, no entry-level detail" note using the total `retainer_status()` already gives.
- New page `app/pages/retainers/[id].vue`, flat like `tasks/[id].vue` and `invoices/[id].vue` (not nested under `clients/`). The route id is just one period's `retainer_id`; the page calls `retainer_status()`, finds that row, derives the chain key, and filters to every row sharing it. No `definePageMeta` permission gate, matching `clients/[id].vue` — same viewers, same data.
- Layout: header with contract name, client (link back), project name or "Client-wide," and a status pill for the chain as a whole (current / ended, from whether any period covers today). A summary strip: number of periods, contract start (earliest `period_start`), current period's used/available/remaining (existing `qty()`/`pct()`/`burnColor()` helpers, reused as-is). Below, a period-by-period table (dates, allotted, carried in, used, remaining, status), each row expanding in place (no new persisted view state) to a small entries table from `retainer_period_detail`, grouped by project when `project_id is null` so a client-wide retainer shows which projects it actually paid for.
- `app/pages/clients/[id].vue`: replace the flat `<ul>` of periods with a computed grouping by the same chain key, one `<UCard>` per contract showing the current period inline plus a "N periods" count; the whole row becomes a link to `/retainers/{retainer_id}` (most recent period's id). The per-period edit/pencil and delete buttons stay exactly as they are today, just nested under their contract's group, still gated on `isAdmin` (`can('manage_reference')`).
- `app/pages/portal/index.vue` is left untouched for this pass.

Depends on: nothing.

Size: 2 days (function plus new page: 1.5 days; regrouping the client page's retainer list: 0.5 day).

Assumption to confirm: the client portal doesn't get the rollup or drill-down in this pass, only the internal client page — clients keep seeing the flat period list they have today. `retainer_period_detail` is written so the portal could get the same drill-down later without another migration, but wiring it in isn't included here.

## 9. Planner / staffing assignment view

What: a Planner page (`/planner`) that solves the one problem Schedule and Capacity each half-cover: putting every open task with no assignee next to the people who have room, so a PM matches them by dragging. It reuses `work_items` / `work_item_assignees` (same tables Schedule and the tasks list already read and write) and the `capacity_weekly` view (same one driving Schedule's person-view capacity strip and the whole Capacity page) — no new tables, no new view.

How:
- Left rail, two lists pulled from the same `work_items` query shape as `schedule.vue`'s `unscheduled`/`nobody` groups, filtered to open tasks with zero `work_item_assignees`:
  - "Due this week or later" — has a `due_on`, sorted by date, each card tagged with its due week (`weekDays`-derived) so it's obvious which grid column it belongs to.
  - "Not yet scheduled" — no `due_on`. These can't map to a capacity week, so they get a plain assign action instead of drag: the same multi-select assignee menu already built for the tasks list (`app/pages/tasks/index.vue:413-479`), not a new component.
- Right grid: people as rows, weeks as columns, exactly the `capacity_weekly` query and the `available` / `used` / `free` / `pct` / `color` helpers already written in `app/pages/capacity.vue` (lines 16-60), copied over rather than re-derived. Forward-looking range only (this week plus 6 ahead) since staffing is about what's still open, unlike Capacity's 2-week look-back.
- Drag-and-drop, native HTML5 (`draggable`, `dragstart`, `dragover.prevent`, `drop`), not the pointer-capture mechanics `schedule.vue` uses for resizing bars — different gesture, no reason to share that code. A card's `dragstart` stores its task id; while dragging, only the grid cells in *that task's own due week* light up as valid drop targets (every person, one week). Dropping on a cell inserts a `work_item_assignees` row, the same delete-then-insert pattern already used in `WorkItemForm.vue:70-74` and `tasks/[id].vue:131-141`, just an insert with no delete since the task starts unassigned. Dropping never touches `start_on`/`due_on` — that stays Schedule's job, which is the actual gap: Schedule's drag reschedules but never reassigns; Planner reassigns but never reschedules.
- New page `app/pages/planner.vue`, gated `definePageMeta({ middleware: 'can', permission: 'see_capacity' })`, same permission as Capacity since it's the same capacity data plus an action. No RLS changes needed: `work_item_assignees`' existing `visible_write` policy already lets any non-client team member with `task_visible(work_item_id)` insert an assignee row, which is exactly what dropping a card does.
- Sidebar entry next to Capacity in `app/components/AppSidebar.vue`'s "More" section (line 33), same `can('see_capacity')` guard: `{ label: 'Planner', to: '/planner', icon: 'i-lucide-move' }`.
- View state: `useViewState('planner', { ... })` if it ends up needing a range toggle, otherwise skip it — the range is fixed (this week + 6), so there's nothing to remember.

Depends on: nothing.

Size: 2 days — most of the data layer (capacity query, helpers, assignee writes) is a direct copy from Capacity and the tasks list; the new work is the two-list left rail, the due-week-constrained drag targeting, and empty/verify passes for a team with no unassigned tasks.

Assumption to confirm: dropping a card is assignment only, never a reschedule, and a task with no due date has to get one first (on its own task page or on Schedule) before it can be drag-matched here — it only gets the plain picker until then. The alternative — letting a drop onto a week also set `due_on` for undated tasks — would make Planner double as a lightweight Schedule, which is the duplication the gap description said to avoid, but it's worth Luke confirming that's really the split he wants.

## 10. "My Work" unified home view (with calendar)

What: a single "My Work" home page that replaces `/`'s current redirect to `/time` (`app/pages/index.vue`) with a real dashboard: today's timer and hours, my open tasks, my active projects, and a day/week agenda. Tasks and projects reuse the same `work_items` and RLS-scoped queries already written for `app/pages/tasks/index.vue`; time reuses `useTimer()` and the pace calc from `app/pages/time.vue`; the agenda is new, built on the `calendar_busy` rows Google Calendar sync already writes.

How:
- Rewrite `app/pages/index.vue`: drop the `redirect: '/time'` page meta, build the dashboard directly there. Sidebar keeps its own link to `/time` for the full timesheet, so nothing about `/time` changes.
- Today strip: reuse `useTimer()` (running entry, start/stop) and the `report_rollup` RPC call already in `time.vue`'s pace block, scoped to today and this week. Link through to `/time?date=...`.
- My tasks: same `work_items` query shape as `tasks/index.vue` (`select id, title, status, priority, due_on, project_id, projects(...), work_item_assignees(...)`), filtered to `work_item_assignees.user_id = me` and not done, grouped with the same overdue / this week / later buckets the tasks page already computes for its `due` groupBy. Show ~8, with a "View all in Tasks" link to `/tasks`. Rows link to `/tasks/[id]` like they do today.
- My projects: no existing "my projects" relation, so derive it client-side from two small queries: distinct `project_id` from my open `work_items` (via `work_item_assignees`), and distinct `project_id` from my `time_entries` in the last 30 days. Merge and dedupe, `is_active = true`, sorted by client then name, linking to `/projects/[id]`. No new table.
- Agenda (the calendar piece): new `app/components/HomeAgenda.vue`, day/week toggle. Data is `calendar_busy` rows for the signed-in user in range (already selectable under the `own_calendar` policy) plus `work_items` with `due_on` in range (including milestones), merged and sorted by time. Google's freeBusy API is what `server/utils/google.ts` syncs from, and it returns opaque start/end blocks only, no event titles or attendees, so busy blocks render as plain "Busy, 9:00 - 9:30" strips, not labeled events. If `calendar_connections` has no row for the user, skip the busy strips and show only due tasks for the day, with a small "Connect Google Calendar" link to `/account`.
- Persist the day/week toggle the same way every other screen does: `useViewState('home', { agendaRange: 'day' as 'day' | 'week' })`, backed by the existing `user_views` table. No schema change.
- No schema changes at all: every query is a read against tables and views that already exist and are already scoped to the caller by RLS (`work_items`/`work_item_assignees` via `task_visible()`, `calendar_busy` via `own_calendar`, `time_entries` via the existing staff/`see_all_time` policy). This page adds no new security-definer functions or policies.

Depends on: nothing. Works with zero Google connections (agenda just shows due tasks); works with zero assigned tasks (sections collapse to empty states).

Size: 2.5 days — 1.5 for the page shell, today strip, my tasks, and my projects sections plus the routing swap and view persistence; 1 for the agenda component (day/week merge, empty and not-connected states), verified in the browser as each person, admin and staff.

Assumption to confirm: a real labeled calendar (month grid, actual meeting titles) is deliberately cut from this pass. `calendar_busy` only ever holds opaque busy/free blocks because the sync calls Google's `freeBusy` endpoint (`server/utils/google.ts`), which never returns event summaries; a titled calendar would mean switching that sync to the `events.list` API and storing titles, a separate, larger change. Flagging in case Luke wants the labeled version scoped now instead of the agenda-list compromise.

## 11. Timesheet approvals workflow

What: A submission and review step for time entries that sits between logging and `create_billing_batch()`: staff submit a week's entries, a reviewer with a new `approve_time` permission approves or rejects them (with a required comment on reject), and rejected entries flow back to the person who logged them to fix and resubmit. Builds on `time_entries`, `has_permission()`, `notify()`, and the `create_billing_batch()` / `unbilled_time` billing path already in `schema.sql`; reuses the notification bell and preferences UI from Phase 2.

How:
- `schema.sql`: `create type time_entry_status as enum ('draft', 'submitted', 'approved', 'rejected');`. Add to `time_entries`: `status time_entry_status not null default 'draft'`, `submitted_at timestamptz`, `reviewed_at timestamptz`, `reviewed_by uuid references profiles(id) on delete set null`, `reject_reason text`, plus `check (status <> 'rejected' or reject_reason is not null)`. Partial index `time_entries_status_submitted on time_entries (status) where status = 'submitted'` for the reviewer queue.
- New permission key `approve_time` (review and approve or reject submitted timesheets), documented in the comment block above `permissions` and seeded to `manager` alongside its other defaults; admins get it free through `is_admin()` as everywhere else.
- `own_time_select` on `time_entries` gains `or (select has_permission('approve_time'))` so a reviewer without `see_all_time` can still see submitted rows (through `time_entries` directly and the `time_detail` view, which is `security_invoker`).
- `own_time_update` and `own_time_delete` tighten: the `using` clause requires `status in ('draft', 'rejected')` for the owner (so a submitted or approved row is frozen to everyone but an admin), and `own_time_update`'s `with_check` allows the target state to be `'submitted'` too, so the owner's own "Submit" action is a plain `.update()` through RLS, not an RPC. A trigger `time_entries_unreject` (`before update ... when (old.status = 'rejected')`, mirroring `time_entries_rate_snapshot`'s shape) flips `status` back to `'draft'` whenever an edit lands on a rejected row without the app explicitly resubmitting it, so a fixed entry doesn't sit labeled "rejected."
- Two new security-definer functions next to `create_billing_batch()` / `void_billing_batch()`, same bulk-with-row-count-check shape: `approve_time_entries(p_ids uuid[])` (requires `approve_time`, requires every row currently `'submitted'`, sets `status = 'approved'`, `reviewed_by = auth.uid()`, `reviewed_at = now()`) and `reject_time_entries(p_ids uuid[], p_reason text)` (same guard, sets `status = 'rejected'`, `reject_reason = p_reason`, then loops the distinct `user_id`s and calls `public.notify(v_user, 'time_rejected', ...)` with a link back to `/time?date=<earliest spent_on>`). Both get the usual `revoke execute ... from public, anon`.
- `create_billing_batch()`'s time-entry `update` gains `and te.status = 'approved'` (or `public.is_admin()`) alongside its existing `is_billable`/`batch_id is null`/`not is_locked` checks, and `unbilled_time` (and therefore `unbilled_summary` and the `billing/new.vue` picker) filters to `status = 'approved'` too, so what a biller sees to pick from matches what will actually claim. Update the batch function's exception text to mention "or not yet approved."
- `app/pages/notifications.vue`: add `{ kind: 'time_rejected', label: 'Timesheet entries sent back' }` to the preferences list; `notification_email_default()` gets a case for it (instant, like `comment`).
- `app/pages/time.vue`: a "Submit week" button that bulk-updates the week's `draft`/`rejected`, stopped (not the running timer) entries to `status = 'submitted'`, `submitted_at = now()`. Each row's existing lock icon area gets a status pill (Submitted / Approved / a "Rejected — <reason>" tooltip); the edit/delete icon buttons' `:disabled="e.is_locked"` becomes `:disabled="e.is_locked || !['draft','rejected'].includes(e.status)"`.
- New page `app/pages/approvals/index.vue`, `definePageMeta({ middleware: 'can', permission: 'approve_time' })`, modeled on `billing/new.vue`'s picker: queries `time_detail` (or `time_entries` joined the same way) where `status = 'submitted'`, grouped by `user_name` then by week, with per-group Approve and Reject buttons calling the two RPCs against that group's ids. Reject opens a `UModal` for the one required reason field (fits the modal carve-out: a one-field prompt), not `AppDrawer`.
- `app/components/AppSidebar.vue`: a new link `{ label: 'Approvals', to: '/approvals', icon: 'i-lucide-badge-check' }` gated by `can('approve_time')`, grouped with Billing under "More."

Depends on: nothing. Size: 2.5 days.

Assumption to confirm: the approval gate is a hard block, unapproved time cannot enter a billing batch at all (only admins can override, same escape hatch `is_locked` already gives them elsewhere). If Luke wants it advisory only, `create_billing_batch()` and `unbilled_time` stay as they are today and this becomes a review screen with no teeth, which is a smaller cut.

## 12. Invoice cost & margin data (internal vs. client split)

What: Add an internal cost basis to time so invoicing can show margin next to what's billed, and split the invoice document's rendering so the public page and outbound email never see it. Today the only rate anywhere is billable — `profiles.default_rate`, `projects.hourly_rate`, `project_tasks.hourly_rate`, resolved by `resolve_rate()` and frozen into `time_entries.rate_snapshot` — there's no cost figure to net against it, and `InvoiceDocument.vue` plus `loadInvoiceDoc()` (`server/utils/invoiceDoc.ts`) are the exact same unmodified path for the editor at `/invoices/[id]`, the public `/i/<token>` page (`server/api/i/[token].get.ts`, service role), and the emailed HTML (`server/api/invoices/send.post.ts`) — the internal editor currently even fetches its preview from that same public token endpoint, so there's nowhere to hide a number even once one exists.

How:
- `profiles.cost_rate numeric(10,2)` — internal cost/burden rate per person, nullable, same shape as `default_rate`. No project- or task-level override table: cost is a property of the person, not the engagement, so unlike billable rate this needs no `resolve_rate()`-style ladder, just `profiles.cost_rate` read directly.
- `time_entries.cost_snapshot numeric(10,2)` — frozen the same instant `rate_snapshot` is, by extending the existing `set_rate_snapshot()` trigger to also set `new.cost_snapshot` from `profiles.cost_rate` for `new.user_id`, under the same admin-only re-edit guard once a row is locked. Comment above it mirrors the one on `rate_snapshot`: cost frozen at save, see `profiles.cost_rate`.
- `invoice_lines.cost_amount numeric(12,2)`, nullable — the cost basis for that line, frozen once inside `create_invoice()` the same way `unit_price` is frozen from `rate_snapshot`. All three `p_detail` branches (`task`, `project`, `summary`) get a matching cost sum next to their existing rate sum, e.g. for `task`: `case when bool_and(te.cost_snapshot is not null) then round(sum(te.hours * te.cost_snapshot), 2) end`. Null, not zero, whenever any contributing entry has no `cost_snapshot`, so a partly-unknown cost never renders as an inflated margin. Expense lines get no `cost_amount` (expenses have no separate cost basis — `amount` is a pass-through) and lines added by hand in the editor with no batch get none either; margin just doesn't show for those rows.
- A gated read path, matching how `see_money` already nulls out amounts in `time_detail` and the report views: a new view `invoice_lines_detail` (`security_invoker = true`) selecting `invoice_lines.*` plus `case when (select public.has_permission('see_money')) then cost_amount end as cost_amount` and the same for `amount - cost_amount as margin_amount`. This exists because RLS is row-level, not column-level — the `manage_billing` policy that already lets a billing-only person `select *` from `invoice_lines` directly would otherwise leak cost on the base table, so cost and margin only ever come from this view.
- `app/pages/invoices/[id].vue`'s line query (currently `supabase.from('invoice_lines').select('*')`) switches to `invoice_lines_detail` for display; its insert/update/delete calls for editing a line's description/qty/price keep hitting the base table, unchanged.
- `InvoiceDocument.vue` keeps its `doc: InvoiceDoc` prop and public markup exactly as is — that prop is what the public page and the email render use today, untouched. It gains one new optional prop, `margin?: { lineId: string, costAmount: number | null, marginAmount: number | null }[]`, rendered as an extra Cost/Margin column pair behind a single `v-if="props.margin"`, additive to the existing table rather than a second copy of the component.
- `app/pages/invoices/[id].vue` passes that prop from its own `invoice_lines_detail` query — never from `doc` — so the internal editor is the only caller that ever supplies it; its `$fetch('/api/i/${token}')` call for `doc` is unchanged, still the same public, service-role, token-scoped endpoint returning only the `InvoiceDoc` shape.
- `UserForm.vue` gets a matching "Cost rate" field next to "Default rate," but shown only when `useCurrentUser().can('see_money')`, not merely `manage_people` (the page's own gate) — otherwise a manage_people admin without see_money would see margin-relevant data the rest of the app hides from them.

Depends on: nothing — reuses `has_permission('see_money')` and the existing `set_rate_snapshot()` trigger. Size: 2.5 days (two new columns, one frozen column plus trigger change, the view, three branches of `create_invoice()`, the editor query swap, the component's optional block, `UserForm.vue`, and a type regen — verified for a staff user with and without `see_money`, a batch invoice at each detail level, and the public page and a sent email checked to confirm nothing new leaks).

Assumption to confirm: `cost_rate` resolves per person only, with no project- or task-level override the way billable rate has. If contractor cost varies by engagement rather than by person, this needs a `project_tasks`-style override table instead of a single column, which adds roughly a day.

