# Site plan parts

A page is quoted in parts. Each page template lists its parts in order
(usually Content, Design, Development), each under a task type with the
hours one page usually takes. A page on a site plan can type over any
part's hours for that page, and 0 skips the part. "Price the plan" on a
quote writes one scope line per template per part, each at its task
type's usual rate. Acceptance makes one task per page with a subtask per
part the page does not skip, and each person put on subtasks gets one
notification for the lot.

This is the build spec. It sits on top of site plans v1
(`docs/site-plans.md`), which is committed and pushed (0725cae, 7a97da8)
with both of its migrations applied; confirm its Vercel deploy is live
before migration 1. The migration and `schema.sql` are done first, then
`shared/types/database.ts` is regenerated, then the packages in section
11 run in parallel.

## 1. Decisions

Luke's decisions (2026-09-15), with his final answers to the design
questions folded in:

1. **Parts per template.** Each page template has its own ordered list
   of parts (add, remove, reorder), each tied to a task type with default
   hours. A new template starts with Content on the Copywriting task
   type, Design on Design/Production, and Development on Web
   Development. Those exact task type names are matched; a default whose
   task type is missing is left out, never guessed.
2. **Page hours (confirmed).** A page can type over any part's hours for
   that page only, and 0 means the page skips the part. This replaces
   v1's single per-page hours override.
3. **Quote lines group by pages.** One line per template per part, for
   example "6 x Interior pages, Design", with that part's task type, the
   summed hours of the pages that do not skip it, a rate from the part's
   task type (decision 5), and its own person.
4. **Acceptance** makes one task per page with a subtask per part the
   page does not skip. Subtasks carry the part hours and go to the person
   on the quote line for that template and part.
5. **Rates come from the task type.** A part line's rate is its task
   type's `default_rate`, the way a hand-typed quote line gets one when
   its task type is picked (`setTask` in `app/pages/quotes/[id].vue`).
   Page templates stop carrying a rate: it comes off pricing and off the
   page templates screen, and `page_templates.rate` is dropped in
   migration 2. `accept_quote` keeps its per-project rule, the highest
   rate per task type over the quote's lines.
6. **One summary bell per person.** When acceptance or Make tasks puts
   people on subtasks, each person gets one notification for the lot,
   for example "You have 12 parts on Carter's Website", linking to the
   project, never one per subtask. It goes only to the people put on
   subtasks, through `notify()` with the existing `assigned` kind, so each
   person's own setting for "Assigned to a task" decides the bell and the
   email. Subtasks are still inserted with `assignee_id` set, so the
   per-row assigned bell stays quiet.
7. **Seed the seven templates.** Migration 1 gives each of the seven live
   page templates the three default parts at 0 hours: Content on
   Copywriting (position 1), Design on Design/Production (2), and
   Development on Web Development (3), matched by the exact name of an
   active task type, as in decision 1. Luke types the hours.

Resolved here against the code (facts in section 2):

- **A part has its own name and a task type.** The line reads "6 x
  Interior pages, Design" while the task type is "Design/Production", so
  the name cannot be the task type's name. `page_template_parts (template_id,
  position, name, task_id not null, hours)`. No unique name constraint
  (renaming two parts into each other's names in one save would trip a
  non-deferrable one); the admin screen refuses duplicate names instead.
- **Matching task types for a new template's defaults** (decision 1).
  Content takes the active task type named Copywriting, Design the one
  named Design/Production, Development the one named Web Development:
  the exact name, as Luke asked, with no trimming, case folding or
  partial match. A default whose task type is missing or retired is left out.
  Live today all three exist and are active. Defaults start at 0 hours;
  Luke types the hours.
- **Existing templates get the three parts at 0 hours** (decision 7).
  There is no honest way to split v1's single hours (Home 8, Interior 3,
  ...) into parts, so migration 1 seeds Content, Design and Development
  on each of the seven at 0 hours and Luke types the hours. A part at 0
  is off, so until hours are typed a template prices nothing and its
  pages get a task with no subtasks. A template with no parts at all (a
  new one starts with the defaults, so only one whose parts were all
  removed) offers a button in its drawer that adds the default parts
  (Content, Design, Development, on their task types) at 0 hours.
- **Per-page hours live in `site_plan_pages.part_hours jsonb`**, keyed by
  part id, not in a child table. The plan screen already saves the whole
  tree with one upsert; a child table would need a second upsert and a
  diff of cleared overrides. A check constraint keeps every value a number
  from 0 to 9999 (so it fits `work_items.estimate_hours numeric(6,2)` and
  the `::numeric` casts in the two functions cannot fail on a typed
  value). The check's jsonpath is strict and silent: a lax path unwraps
  arrays, so `{"<part>": [5]}` would pass and then break acceptance,
  including a client's accept on `/q/<token>`. Keys for parts the
  template no longer has are ignored. Changing a page's template clears
  its typed hours in the canvas.
- **The page task has no estimate.** `capacity_weekly.booked_hours` and
  Planner's `hoursOn` both count every open task's estimate for the
  person up on it, with no parent filter, so a parent estimate equal to
  its subtasks' sum would book the hours twice. The subtasks carry the
  hours. The page task also has nobody up and nobody on it.
- **Planner's Nobody up band leaves out a task with open subtasks.** The
  band lists every open task with no one up, people on it or not, and
  staff see all tasks, so every page task would sit there for the life of
  the project. Its subtasks are what someone takes, and those still show
  when nobody is up on them. When every subtask is done the page task
  shows again, which is the nudge to close it. Home, the timer picker and
  the Tasks page list only tasks the viewer is on, the nudge skips tasks
  nobody is on, and Schedule's Nobody up row holds only dated tasks, so
  none of those changes.
- **The project page tucks subtasks under their page task.** It lists a
  project's tasks flat today; a 20-page plan with three parts would be
  about 80 mixed rows. It groups them the way the Tasks page does.
- **Subtask titles are "{page title}, {part name}"** ("About us, Design").
  Home, Planner, Schedule and the timer show a task title without its
  parent, and twenty tasks called "Design" would be unreadable. The comma
  matches the line wording in decision 3.
- **One summary bell, not one per subtask** (decision 6).
  `accept_quote` inserts each subtask with `assignee_id` set, so
  `work_item_owner_follows` adds the person and `notify_on_assignee`
  stays quiet (it skips the person already up). v1 inserted the assignee
  row first and rang a bell per page; per part that would be three or
  more bells per page. After the page loop, each function counts, per
  person, the subtasks under the page tasks it just made (their ids are
  collected in `v_pages`) and calls `notify()` once per person. Make
  tasks does the same.
  - **Kind: reuse `assigned`.** Its label is "Assigned to a task" and its
    email default is instant (`NOTIFICATION_KINDS` and
    `notification_email_default`). Being put on subtasks is being
    assigned, so the person's usual choice for assignments decides the
    bell and the email, as Luke asked. A new kind would add a second
    Notifications setting for the same thing with no saved choice for
    anyone, so someone who turned assignment emails off would still get
    these. None is added, and `shared/types/app.ts`,
    `notification_email_default` and the Notifications page do not
    change. `turn` ("A task handed to you") was considered too:
    `hand_off` rings it when someone passes a task to a person.
    `assigned` is used because Luke asked that the assignment
    preference decide, and because nobody hands these subtasks over: a
    quote line or Make tasks puts the person there. With no
    `notification_prefs` row (none exists live for either kind on
    2026-09-15) both kinds ring the bell and email instantly, so the
    choice matters only to someone who later sets the two differently.
  - **Who gets it.** Only the people that run put on a subtask.
    `notify()` drops the actor (`p_user = p_actor`), inactive people and
    clients. So when Luke accepts on a client's behalf or runs Make
    tasks, he gets no bell for his own subtasks and nobody else hears
    about them. A client accepting from `/q/<token>` has no session
    (`auth.uid()` null), so everyone put on a subtask, Luke included,
    gets one.
  - **Shape.** Title "You have 12 parts on Carter's Website" ("1 part"
    for one), with the project's name: the quote's title at acceptance
    (the project is made with it), `projects.name` for Make tasks. Body
    "From quote Q-2026-005" or "From site plan {plan name}", the same
    last line the page task's description carries. Link
    `/projects/<id>`, which `useNotifications().openItem` opens and
    `run_notification_emails()` puts after the app URL in the email.
    `work_item_id` is null (the column is nullable and no screen reads
    it).
- **Subtask order** is set with `position` 1..n from the template's part
  order (the ordinality in the template, so skipped parts leave gaps).
  The task page orders children by `position, created_at`, and every row
  made in one transaction shares `created_at = now()`.
- **`make_site_plan_tasks`**: pages with no live page task get a page
  task and its subtasks. Each subtask goes to the person on the line for
  its template and part on the accepted quote that moved the plan onto
  this project (`quotes.site_plan_id` is the plan and `quotes.project_id`
  the plan's project), the same person acceptance picks, so a page task
  that was deleted and made again, or a page added later, keeps decision
  4's routing. A plan started from a project has no such quote, and a
  line with nobody gives nobody; those subtasks have nobody up and show
  in Planner's Nobody up band. A part added to a template
  later, or a part a page stops skipping, does not add a subtask to a
  page that already has a live task. That is the smallest correct rule:
  adding subtasks to existing page tasks would need a link from each
  subtask to its part and a rule for subtasks people already renamed or
  deleted. The guide says to add such a subtask by hand. The function
  still returns the number of page tasks made, and rings one summary
  bell per person it put on subtasks (decision 6).
- **Rate for a new part line** (decision 5): the part's task type's
  `default_rate`, else blank, exactly what `setTask` puts on a blank line
  when that task type is picked. Neither the template (it has no rate
  now) nor another line on the quote is consulted, since a hand-typed
  line consults neither, so a priced line and a hand-made one agree. The
  quote editor's task type list holds only active task types, the same
  list `setTask` uses, so a part on a retired task type prices blank.
  Live, Copywriting, Design/Production and Web Development have no
  `default_rate`, so part lines price blank until Luke sets them.
  Re-pricing updates description and hours only, as v1, so a typed rate
  stays.
- **One project rate per task type, the highest** (kept, decision 5).
  `accept_quote` gives the project one rate per task type, `max(rate)`
  over the quote's lines, as v1. Priced lines of one task type now all
  start at that task type's usual rate, so they differ only when someone
  types a different rate on one; then the project bills all of that task
  type's time at the highest while `budget_amount` is the quote's
  subtotal. The rule reads only `quote_line_items.rate`, so dropping the
  template rate does not break it. The guide says so; rates are unset
  everywhere today.
- **Re-pricing counts lines that no longer match.** A line with a part
  id that the run did not price (every page now skips the part, the
  template has no pages left, or the part was removed) keeps its hours
  and amount. Skipping a part with 0 is now the normal way to cut scope,
  so the toast counts those lines and turns to a warning, instead of
  deleting them or silently leaving the total high.
- **Columns.** `page_templates.rate` goes (decision 5; no row has one).
  `page_templates.hours` and `page_templates.task_id` go (a template's
  hours are its parts' sum; each part has its own task type).
  `site_plan_pages.hours` goes (replaced by `part_hours`). The deployed v1
  code reads and writes all four, so they are dropped in a second
  migration after the parts code is deployed. Every reader of
  `page_templates.rate` today is v1 code that the packages replace: the
  quote editor's `page-templates` select and `pricePlan`, and the page
  templates screen (`select('*')`, its form, its Rate column and help
  text). Beyond those, only `shared/types/database.ts` (regenerated) and
  schema.sql's `create table` name it; no function or view reads it,
  nothing in `server/` or `shared/` does, and `loadQuoteDoc` reads only
  line rates. `quote_pages.hours` stays
  and becomes the page's parts added up. `quote_line_items.template_id`
  stays; `part_id` is added beside it.
- **The frozen copy** adds `quote_pages.parts jsonb`, the page's parts in
  order as resolved at acceptance (`[{part_id, name, hours}]`, 0 where
  skipped). `loadQuoteDoc` counts, per line, the pages on the line's
  template whose entry for the line's part has hours above 0. Only the
  counts leave the server; the page list payload is unchanged.
- **`quote_line_items.part_id` has no foreign key.** With `on delete set
  null`, removing a part in Settings would null the id on every line that
  priced it, accepted quotes included: the referential action runs as
  the table owner past the quote policies, `quote_lines_changed` then
  rewrites the quote's subtotal, tax and `updated_at`, and the accepted
  document loses its page counts. A plain uuid keeps the frozen copy
  frozen. A removed part's id then matches nothing, and a part id is
  unique across templates, so counts match on the part id alone.
- **A line counts pages only when it has a `part_id`.** v1 lines (template
  only) show no page count. On a quote not yet accepted, a line whose
  part was since removed shows none either (its id matches no live part);
  an accepted quote counts from `quote_pages.parts`, so its counts never
  change. A template-only fallback would overcount skipped pages. Only
  test quotes have v1 lines.
- **Parts drawer on the canvas.** A card has room for the template picker
  and one small control. The control is a button showing the page's total
  hours (highlighted when the page typed over anything, with a tooltip
  listing the parts); clicking it opens an `AppDrawer` for that page with
  one row per part. Forms open in `AppDrawer` by convention, and a drawer
  has room for part names, template hours and a reset per part.
- **UI word: "Parts".** Content, Design and Development are the parts of
  a page. "Work" is already how the app talks about tasks.

## 2. Facts this spec relies on (checked 2026-09-15)

Live database (project cnnrtsnevmjqhfgpolfo), read-only selects:

- Migrations `site_plans` (20260915172403) and `drop_quote_sitemap_nodes`
  are applied, and `quote_sitemap_nodes` is gone. v1 is committed and
  pushed (0725cae "Site plans: the quote sitemap becomes a plan on its own
  screen", 7a97da8 "Site plans: drop quote_sitemap_nodes after the
  deploy, regenerate types"); the tree has only `package-lock.json`
  modified and this spec untracked. `accept_quote` has one overload and
  its body reads `quote_pages`; `make_site_plan_tasks` exists.
- v1's browser verification rows are live: a site plan "ZZ TEST project"
  for "ZZ TEST client", quotes Q-2026-003 "ZZ TEST quote A" and
  Q-2026-004 "ZZ TEST quote B" (both accepted), 13 `quote_pages` rows, 5
  lines with `template_id`. They belong to the v1 run. This run names its
  rows `ZZ TEST parts ...` and cleans up only those.
- `page_templates`: 7 rows (Home 8, Landing 6, Interior 3, Listing 4,
  Detail 3, Form 3, Blog post 1 hours), every `rate` and `task_id` null,
  all active. A select on 2026-09-15 found no row with a `rate`, so
  dropping the column loses nothing. Policies `read_all` (not client)
  and `manage_settings`
  (all). Table-level grants.
- After migration 1 was applied, a read-only select found 21
  `page_template_parts` rows: Content (Copywriting), Design
  (Design/Production) and Development (Web Development), positions 1 to
  3, all at 0 hours, on each of the seven templates.
- `tasks` (task types): 23 active rows. None is named Content, Design or
  Development. Copywriting, Design/Production and Web Development exist
  under those exact names, all active, each with `default_rate` null
  (also Sound Design, Creative Direction). Columns include
  `default_rate` and `default_description`; `authenticated` has table and
  column SELECT on all of them; policy `read_all` is not client. `tasks`
  is not one of the money-gated tables (those are profiles, projects,
  project_tasks, time_entries; schema.sql:4579-4582).
- `work_items` has no task type column (no `task_id`), so a subtask
  cannot carry its part's task type. The part's task type reaches the
  project through the quote line (`project_tasks` at acceptance), as v1.
- `work_items` triggers: `work_items_touch`, `work_item_owner_stamp`
  (before insert or update), `work_items_parent_check` (before insert or
  update of parent_id, project_id), `work_item_owner_follows` (after
  insert or update of assignee_id), `work_items_cascade_children` (after
  update of deleted_at), `soft_delete` (before delete),
  `notify_on_item_change` (after update only). Nothing rings on insert.
- `work_items` rows with a `parent_id`: 0. There is no precedent for how a
  parent's estimate is treated.
- `quote_line_items`: table-level grants, so `part_id` needs no grant.
  `site_plan_pages` and `quote_pages`: table-level grants from v1 (select
  only on `quote_pages`), so `part_hours` and `parts` need no grant.
- `jsonb_path_exists(jsonb, jsonpath, jsonb, boolean)` is immutable, so a
  check constraint may use it. The lax path
  `'$.* ? (@.type() != "number" || @ < 0 || @ > 9999)'` is false (passes)
  for `{"a":[1]}` and `{"a":[]}`, because lax mode unwraps arrays, and
  `pg_input_is_valid('[1]', 'numeric')` is false, so such a value would
  break the functions' casts. The strict, silent form
  `jsonb_path_exists(v, 'strict $.* ? (...)', '{}', true)` was run: true
  (rejected) for `{"a":[1]}`, `{"a":[]}`, `{"a":{"b":1}}`, `{"a":"3"}`,
  `{"a":-1}`, `{"a":10000}`, `{"a":null}`; false for `{"a":0,"b":2.5}`
  and `{}`; null for a top-level `[]`, which the `jsonb_typeof` half of
  the check rejects.
- `quote_line_items` triggers: `quote_line_items_amount` (before insert or
  update) and `quote_line_items_recalc` (after insert, update or delete,
  calls `quote_lines_changed`); `quote_recalc` (schema.sql:320-346)
  rewrites a quote's subtotal, tax, total and `updated_at` with no status
  guard. Its foreign keys include `template_id ... on delete set null`
  (v1; templates have no delete in the app).
- Live grants on `page_templates`, `quote_line_items` and `tasks` still
  give `anon` table privileges; every policy on them is `to
  authenticated`, so anon reads no rows. Unchanged by this spec.
- The lateral parts query and `jsonb_array_elements(...) with ordinality`
  used in section 4 were run on sample values: parts come out in
  position order with typed hours applied, 0 kept, ordinality 1..n.
- Notifications. `notify(p_user, p_kind, p_title, p_body, p_link,
  p_actor, p_item, p_email)` (schema.sql:2003-2022; execute revoked from
  public, anon and authenticated at 3030, so only definer functions call
  it) returns without a row when the person is the actor, inactive or a
  client; reads their `notification_prefs` row for the kind (bell on, and
  `notification_email_default(kind)`, when there is none; `assigned` is
  `instant`); and inserts a `notifications` row with `email` 'pending' or
  'none'. `notifications.work_item_id` is nullable. The pg_cron job
  `docket-notification-emails` runs `run_notification_emails()` every
  five minutes and sends only pending rows older than two minutes, so a
  row written in a transaction that rolls back is never sent. No trigger
  sits on `notifications`, `projects`, `site_plans`, `site_plan_pages` or
  `page_templates`; `work_item_assignees` has `notify_on_assignee` and
  `work_item_assignee_removed`.
- `notify_on_quote` (schema.sql:2110-2122) sends a `quote_decision` bell,
  instant email by default, to everyone in `billing_people()` when a
  quote turns accepted or declined. That is why no test clicks Accept.
- Notification kinds are listed in `NOTIFICATION_KINDS`
  (shared/types/app.ts:105-121, read by `NotificationBell.vue` and
  `notifications.vue`), in `notification_email_default`
  (schema.sql:1994), and in the Notifications comment
  (schema.sql:1098-1107). `assigned` is "Assigned to a task", email
  instant. `useNotifications().openItem` marks the row read and pushes
  its `link`. The `notifications` policies let a person read, update and
  delete only their own rows.
- PostgreSQL 17.6. Luke's profile: `acdbde8e-a7a7-452b-9d6d-a7ad9032b83f`,
  admin.

Code and schema.sql (working tree with v1):

- Estimate readers (every `estimate_hours` in schema.sql, app, server):
  - `capacity_weekly.booked_hours` (schema.sql:1432-1466) sums open
    tasks' estimates where `assignee_id` is the person, due that week
    and unplanned, plus the unplanned remainder of partly planned tasks.
    No parent filter.
  - `planner.vue:152` `hoursOn`: the person up books the estimate minus
    planned hours. `planner-tasks` loads every task, no parent filter.
  - `projects/[id]/index.vue:129` remaining per row (estimate minus
    logged); `schedule.vue:248` bar length; `index.vue`,
    `TimeClockPopover.vue`, `tasks/index.vue`, `tasks/[id].vue` display
    per task. No project-wide sum of estimates anywhere; project budgets
    come from `projects.budget_hours` (from quote lines).
  - Writers: `apply_project_template` (flat tasks), the MCP
    create/update task tools, the ClickUp import, and v1's two functions.
- Parent rules: `work_item_parent_check` (schema.sql:3954-3968) requires
  the parent to exist, not be a subtask, and share the project; a task
  with subtasks cannot become a subtask. `parent_id` is `on delete
  cascade`. `work_item_cascade_children` (3971-3980) copies a parent's
  `deleted_at` to its children on delete and restore.
- Up now: `work_item_owner_stamp` stamps `assigned_at/by` when
  `assignee_id` is set on insert; `work_item_owner_follows` then inserts
  the `work_item_assignees` row; `notify_on_assignee` (2046-2060) returns
  quietly when the user is already `assignee_id`. v1 `accept_quote`
  inserts the assignee row before setting `assignee_id`, so it rings.
  `nudge_unowned_tasks` joins `work_item_assignees`, so a task nobody is
  on is never nudged. Home's "Nobody up" band (`index.vue:107`) lists
  only tasks the viewer is on. `docs/up-now.md:536`: a subtask is an
  ordinary task with its own owner.
- Planner's Nobody up band (`planner.vue:214-216`) lists every open task
  with no `assignee_id`, people on it or not; `planner-tasks`
  (`planner.vue:37-45`) loads every task with no parent filter, and the
  staff role has `see_all_tasks`. Schedule's Nobody up row
  (`schedule.vue:126-130`) holds only scheduled tasks in range. The Tasks
  page's Nobody up group (`tasks/index.vue:125`) is empty with Everyone
  on and otherwise holds only tasks the viewer is on. The timer picker
  (`TimeClockPopover.vue:19`) and `HomeAgenda.vue` join
  `work_item_assignees!inner` for the viewer.
- `projects/[id]/index.vue:37-44` lists the project's tasks flat, ordered
  by `due_on`, with no `parent_id`; `tasks/index.vue:247-260` `arrange()`
  tucks children under their parent.
- `accept_quote` sets `project_tasks.hourly_rate` to `max(rate)` per task
  type over the quote's lines. v1 `pricePlan` (`quotes/[id].vue:196-197`)
  takes `g.template.rate ?? sameTask.rate` and never `default_rate`.
- `tasks/[id].vue:54` orders children by `position, created_at` and shows
  each child's estimate. `tasks/index.vue` tucks children under parents.
- `capacity_weekly.forecast_hours` sums `quote_line_items.hours` by
  `assignee_id` and `target_week` on draft or sent quotes; part lines fit
  it unchanged. `quote_line_margins` works per line, unchanged.
- `loadQuoteDoc` (server/utils/quoteDoc.ts) returns `lines[]` with `id,
  description, hours, rate, amount, task, pages` and `pages[]` with
  `title, path, template, depth`. `QuoteDocument.vue` shows "N pages"
  under a line. Neither the type nor the component needs to change.
- Rates read today: `quotes/[id].vue` reads `page_templates.rate`
  (line 42, used by `pricePlan` at 197) and `tasks.default_rate` (line
  37, used by `setTask` at 119-125, which fills a blank line's rate when
  a task type is picked), both behind `manage_quotes`;
  `admin/page-templates.vue` reads `rate` through `select('*')` and edits
  it (lines 13, 29-42, 100, 121), behind `manage_settings`; the plan
  screen reads no rate. `server/utils/ai.ts:162` reads lines without
  template columns. Nothing else in `app/`, `server/` or `shared/` names
  `page_templates` except the generated types. Live, only `accept_quote`
  and `make_site_plan_tasks` mention `page_templates`. Those v1 bodies
  read `pt.name` and `pt.hours` from it and `p.hours` from
  `site_plan_pages`, never `pt.rate` or `pt.task_id` (a `pg_proc.prosrc`
  select, 2026-09-15). Migration 1 replaces them with versions that read
  only `pt.name` from `page_templates` and `part_hours`, not `hours`,
  from `site_plan_pages`, which the 10.1 pre-drop check confirms. No
  view uses the table.
- `useTaskTypes()` (useReference.ts:46) returns active `tasks (id, name)`
  ordered by name.
- `AppDrawer` wraps `USlideover` (props `open, title, description, wide,
  dirty`; slots body, footer). The canvas's full-screen mode is a
  `fixed inset-0 z-50` div (SitemapCanvas.vue:163) with a window Escape
  listener that leaves full screen.
- `admin/project-templates.vue` is the pattern for an ordered item list
  in a drawer (grid row, move up and down, remove, Add).

## 3. Data model

```
page_templates (id, name, description, color, position, is_active)
  └─ page_template_parts (id, template_id, position, name, task_id, hours)
site_plan_pages (..., template_id, part_hours jsonb {part_id: hours}, work_item_id)
quote_line_items (..., task_id, template_id, part_id (no foreign key), assignee_id, target_week)
quote_pages (..., template_id, hours, parts jsonb [{part_id, name, hours}])
work_items: page task (parent_id null, estimate null, nobody)
  └─ subtask per part with hours > 0 (title "Page, Part", estimate, assignee, position)
notifications: one 'assigned' row per person put on subtasks by a run (link /projects/<id>)
```

A part's hours on a page: `part_hours[part.id]` when present, else
`part.hours`. Above 0 means the page uses the part.

## 4. Migrations

Two migrations, applied through the Supabase MCP `apply_migration`,
mirrored in schema.sql (section 5). This section is the source of truth.
The design session's scratchpad file `site_plan_parts_migration.sql`
holds the same migration 1 text (and migration 2, commented out); a
later session may not have it, and if the two ever differ, this section
wins.

1. `site_plan_parts`, before the packages. Adds, seeds the seven
   templates' parts, replaces the two functions, drops nothing. The deployed v1 code keeps working: its
   canvas and pricing still read `page_templates.hours`, `rate` and
   `task_id` and write `site_plan_pages.hours`, and its document counts
   by `template_id`. A
   quote accepted between this migration and the deploy gets page tasks
   with no subtasks (every seeded part is at 0 hours). Only test quotes
   exist.
2. `drop_site_plan_v1_columns`, after every package is committed,
   pushed and deployed, and after the check in 10.1 shows no function,
   view or code reads the four columns (`page_templates.hours`, `rate`
   and `task_id`, and `site_plan_pages.hours`). Never before migration
   1: the live v1 functions still read `page_templates.hours` and
   `site_plan_pages.hours`, and PL/pgSQL does not track column
   references, so the drop would succeed and acceptance would then fail
   at run time.

Migration 1, `site_plan_parts`:

```sql
-- ---------- Parts of a page template ----------
-- A page template is quoted in parts (usually Content, Design,
-- Development), in order, each under a task type with the hours one page
-- usually takes. A part at 0 hours is off unless a page types hours in.
create table public.page_template_parts (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.page_templates(id) on delete cascade,
  position    int not null default 0,
  name        text not null check (btrim(name) <> ''),
  task_id     uuid not null references public.tasks(id) on delete restrict,
  hours       numeric(6,2) not null default 0 check (hours >= 0),   -- fits work_items.estimate_hours
  created_at  timestamptz not null default now()
);
create index page_template_parts_template on public.page_template_parts (template_id, position);

-- A page's own hours for a part, keyed by page_template_parts.id. A number
-- types over the template's hours for this page only; 0 skips the part; a
-- missing key means the template's hours. Keys for parts the page's
-- template does not have are ignored. The path is strict and silent: a lax
-- path unwraps arrays, so {"<part>": [5]} would pass and the ::numeric
-- casts in accept_quote and make_site_plan_tasks would then fail.
alter table public.site_plan_pages add column part_hours jsonb not null default '{}'::jsonb
  constraint site_plan_pages_part_hours check (
    jsonb_typeof(part_hours) = 'object'
    and not jsonb_path_exists(part_hours, 'strict $.* ? (@.type() != "number" || @ < 0 || @ > 9999)', '{}', true));

-- With template_id, the part a scope line prices: one line per template per
-- part. No foreign key: removing a part must never change a quote (a set
-- null would rewrite accepted quotes' lines, their totals and their page
-- counts), so the id may name a removed part, which then matches nothing.
alter table public.quote_line_items add column part_id uuid;

-- The page's parts as resolved at acceptance, in the template's order:
-- [{"part_id": ..., "name": ..., "hours": ...}], hours 0 where skipped.
-- quote_pages.hours becomes those hours added up.
alter table public.quote_pages add column parts jsonb not null default '[]'::jsonb
  constraint quote_pages_parts check (jsonb_typeof(parts) = 'array');

-- ---------- RLS and grants ----------
alter table public.page_template_parts enable row level security;
create policy read_all on public.page_template_parts for select to authenticated using (not (select public.is_client()));
create policy manage_settings on public.page_template_parts for all to authenticated
  using ((select public.has_permission('manage_settings'))) with check ((select public.has_permission('manage_settings')));
revoke all on public.page_template_parts from anon, authenticated;
grant select, insert, update, delete on public.page_template_parts to authenticated;

-- ---------- Seed: Content, Design, Development at 0 hours on every template ----------
-- Luke's call (2026-09-15). Exact task type names; a missing one is left out.
insert into public.page_template_parts (template_id, position, name, task_id, hours)
select t.id, d.position, d.name, k.id, 0
from public.page_templates t
cross join (values (1, 'Content', 'Copywriting'), (2, 'Design', 'Design/Production'), (3, 'Development', 'Web Development')) as d(position, name, task_name)
join public.tasks k on k.name = d.task_name and k.is_active;

-- ---------- accept_quote ----------
-- Acceptance, by the client from /q/<token> (service role, no session) or
-- by someone with the Quotes permission on their behalf. Makes the
-- project: hours from the lines become budget_hours, the subtotal becomes
-- budget_amount, and each line's task type is assigned to the project
-- with the quoted rate. With a site plan: its pages as they stand, parts
-- resolved, are copied onto the quote (quote_pages), and if the plan is
-- not on a project yet it moves to this one and every page becomes a task
-- with a subtask for each part the page does not skip, assigned to whoever
-- this quote's scope line for that template and part names. Each person
-- put on subtasks gets one "assigned" notification for the lot. Reads
-- work_items as definer for that bell, so it filters deleted_at itself.
create or replace function public.accept_quote(p_quote_id uuid, p_name text, p_email text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare q record; v_project uuid; v_page uuid; v_hours numeric; r record; v_part record; v_who record;
        v_plan_id uuid; v_plan_project uuid; v_ord int := 0; v_pages uuid[] := '{}';
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
    -- One read of the tree and the parts, parents first, feeds both the
    -- copy and the tasks, so they always hold the same pages and hours.
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
             coalesce(h.parts, '[]'::jsonb) as parts, h.hours
      from tree t
      join public.site_plan_pages p on p.id = t.id
      left join public.page_templates pt on pt.id = p.template_id
      left join lateral (
        -- The template's parts in order, each with this page's hours:
        -- what the page typed, else the template's. 0 means skipped.
        select jsonb_agg(jsonb_build_object('part_id', pp.id, 'name', pp.name, 'hours', x.hours)
                         order by pp.position, pp.created_at, pp.id) as parts,
               sum(x.hours) as hours
        from public.page_template_parts pp
        cross join lateral (select coalesce((p.part_hours ->> pp.id::text)::numeric, pp.hours) as hours) x
        where pp.template_id = p.template_id
      ) h on true
      order by t.ord
    loop
      v_ord := v_ord + 1;
      insert into public.quote_pages (quote_id, sort_order, depth, title, path, template, template_id, hours, parts)
      values (q.id, v_ord, r.depth, r.title, r.path, r.template, r.template_id, r.hours, r.parts);

      -- Tasks only when this acceptance moved the plan. If another quote
      -- on the same plan was accepted first, the plan and its tasks stay
      -- on that project.
      if v_plan_project is null then
        -- The page task: no estimate, because its subtasks carry the hours
        -- and Planner and capacity count every task's estimate; nobody up.
        insert into public.work_items (project_id, title, description, created_by)
        values (v_project, r.title,
                concat_ws(E'\n', r.path, case when r.template is not null then r.template || ' page' end, 'From quote ' || q.number),
                q.created_by)
        returning id into v_page;
        v_pages := v_pages || v_page;

        -- A subtask per part the page does not skip, in the template's
        -- order, up to the person on this quote's line for that template
        -- and part. assignee_id goes in with the insert, so the owner
        -- trigger puts them on the task with no "assigned" bell per
        -- subtask; one bell per person follows the page loop.
        -- The loop variable is v_part, not s: the tree query above aliases
        -- "ranked s", and PL/pgSQL would read s.id there as this record.
        for v_part in
          select e.n, e.v ->> 'name' as name, (e.v ->> 'hours')::numeric as hours,
                 (select l.assignee_id from public.quote_line_items l
                   where l.quote_id = q.id and l.template_id = r.template_id
                     and l.part_id = (e.v ->> 'part_id')::uuid and l.assignee_id is not null
                   order by l.sort_order, l.created_at limit 1) as assignee_id
          from jsonb_array_elements(r.parts) with ordinality as e(v, n)
          where (e.v ->> 'hours')::numeric > 0
          order by e.n
        loop
          insert into public.work_items (project_id, parent_id, title, estimate_hours, assignee_id, position, created_by)
          values (v_project, v_page, r.title || ', ' || v_part.name, v_part.hours, v_part.assignee_id, v_part.n, q.created_by);
        end loop;

        update public.site_plan_pages set work_item_id = v_page where id = r.id;
      end if;
    end loop;

    -- One "assigned" bell per person put on subtasks here, not one per
    -- subtask: "You have 12 parts on Carter's Website", to the project.
    -- notify() applies the person's own setting for that kind and skips
    -- the actor (whoever accepted on the client's behalf; a client on
    -- /q/<token> has no session, so nobody is skipped), inactive people
    -- and clients.
    for v_who in
      select w.assignee_id, count(*) as n
      from public.work_items w
      where w.parent_id = any(v_pages) and w.assignee_id is not null and w.deleted_at is null
      group by w.assignee_id
    loop
      perform public.notify(v_who.assignee_id, 'assigned',
        'You have ' || v_who.n || case when v_who.n = 1 then ' part on ' else ' parts on ' end || q.title,
        'From quote ' || q.number, '/projects/' || v_project, auth.uid());
    end loop;
  end if;

  update public.quotes set status = 'accepted', accepted_at = now(), accepted_by = trim(p_name),
    accepted_email = nullif(trim(coalesce(p_email, '')), ''), project_id = v_project, updated_at = now()
  where id = q.id;
  return v_project;
end $$;

-- ---------- make_site_plan_tasks ----------
-- A plan on a project: for every page with no live task (never linked, or
-- its task was deleted), a page task with no estimate and a subtask for
-- each part the page does not skip, with that part's hours as its
-- estimate, up to the person on the line for that template and part on
-- the accepted quote that moved the plan onto this project, else nobody.
-- A page that already has a live task gets nothing, even if its template
-- gained a part since. Each person put on subtasks gets one "assigned"
-- notification for the lot. Returns how many page tasks it made. Reads
-- work_items as definer, so it filters deleted_at itself.
create or replace function public.make_site_plan_tasks(p_plan_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_plan record; r record; v_page uuid; v_count int := 0; v_quote uuid;
        v_pages uuid[] := '{}'; v_who record; v_project_name text;
begin
  if not public.has_permission('manage_quotes') then raise exception 'Quotes permission needed'; end if;
  select id, name, project_id into v_plan from public.site_plans where id = p_plan_id for update;
  if not found then raise exception 'Site plan not found'; end if;
  if v_plan.project_id is null then raise exception 'This site plan is not on a project yet'; end if;

  -- The accepted quote that moved this plan onto its project, if any. A
  -- plan started from a project has none, and its subtasks go to nobody.
  select id into v_quote from public.quotes
  where site_plan_id = p_plan_id and project_id = v_plan.project_id and status = 'accepted'
  order by accepted_at, id limit 1;

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
           coalesce(h.parts, '[]'::jsonb) as parts
    from tree t
    join public.site_plan_pages p on p.id = t.id
    left join public.page_templates pt on pt.id = p.template_id
    left join lateral (
      select jsonb_agg(jsonb_build_object('part_id', pp.id, 'name', pp.name, 'hours', x.hours)
                       order by pp.position, pp.created_at, pp.id) as parts
      from public.page_template_parts pp
      cross join lateral (select coalesce((p.part_hours ->> pp.id::text)::numeric, pp.hours) as hours) x
      where pp.template_id = p.template_id
    ) h on true
    where not exists (select 1 from public.work_items w where w.id = p.work_item_id and w.deleted_at is null)
    order by t.ord
  loop
    insert into public.work_items (project_id, title, description, created_by)
    values (v_plan.project_id, r.title,
            concat_ws(E'\n', r.path, case when r.template is not null then r.template || ' page' end, 'From site plan ' || v_plan.name),
            auth.uid())
    returning id into v_page;
    v_pages := v_pages || v_page;

    -- As in accept_quote(), assignee_id goes in with the insert, so the
    -- owner trigger puts the person on the task with no bell per subtask.
    insert into public.work_items (project_id, parent_id, title, estimate_hours, assignee_id, position, created_by)
    select v_plan.project_id, v_page, r.title || ', ' || (e.v ->> 'name'), (e.v ->> 'hours')::numeric,
           (select l.assignee_id from public.quote_line_items l
             where l.quote_id = v_quote and l.part_id = (e.v ->> 'part_id')::uuid and l.assignee_id is not null
             order by l.sort_order, l.created_at limit 1),
           e.n, auth.uid()
    from jsonb_array_elements(r.parts) with ordinality as e(v, n)
    where (e.v ->> 'hours')::numeric > 0
    order by e.n;

    update public.site_plan_pages set work_item_id = v_page where id = r.id;
    v_count := v_count + 1;
  end loop;

  -- One "assigned" bell per person put on subtasks here, as in
  -- accept_quote(). The caller is the actor, so they get none for their own.
  select name into v_project_name from public.projects where id = v_plan.project_id;
  for v_who in
    select w.assignee_id, count(*) as n
    from public.work_items w
    where w.parent_id = any(v_pages) and w.assignee_id is not null and w.deleted_at is null
    group by w.assignee_id
  loop
    perform public.notify(v_who.assignee_id, 'assigned',
      'You have ' || v_who.n || case when v_who.n = 1 then ' part on ' else ' parts on ' end || v_project_name,
      'From site plan ' || v_plan.name, '/projects/' || v_plan.project_id, auth.uid());
  end loop;
  return v_count;
end $$;
```

Migration 2, `drop_site_plan_v1_columns`, after the deploy:

```sql
alter table public.site_plan_pages drop column hours;
alter table public.page_templates drop column hours, drop column rate, drop column task_id;
```

Notes on the functions:

- `create or replace` keeps each function's grants and revokes
  (schema.sql:3008-3011).
- Both functions read the tree and every page's parts in one query, so a
  page's copy and its subtasks always agree, including when someone edits
  a template during acceptance.
- Concurrency and page order are unchanged from v1 (docs/site-plans.md
  section 3 notes).
- `accept_quote`'s subtask loop variable is `v_part`, not `s`: the tree
  query aliases `ranked s`, and PL/pgSQL reads `s.id` there as the
  unassigned record (a read-only DO block with that shape, run in review
  on the live database, failed with 55000, record "s" is not assigned
  yet). `make_site_plan_tasks` declares no
  record named `s`.
- `make_site_plan_tasks` finds the accepted quote with `site_plan_id` =
  the plan and `project_id` = the plan's project. A second quote on the
  same plan, accepted after the first, has its own project, so it never
  matches.
- Subtask inserts pass `work_item_parent_check`: the page task was
  inserted earlier in the same transaction, in the same project, with no
  parent. `bigint` ordinality goes into `position int` by assignment cast.
- `created_by` for subtasks is the quote's creator (acceptance) or the
  caller (make tasks), as v1 does for page tasks, so the quote's creator
  is in `task_people()` for status bells on every subtask, as today.
- The summary bell counts only the subtasks under the page tasks this
  run made (`parent_id = any(v_pages)`), so subtasks made earlier on the
  same project are never counted again, and it runs once after the page
  loop, so a person gets one row per run. Its query also filters
  `deleted_at is null`, as CLAUDE.md asks of every security definer
  function that reads `work_items`; nothing deletes a subtask between
  its insert and the count, so the filter changes no count today. It calls `notify()` with
  `p_item` and `p_email` null: the person's `notification_prefs` row for
  `assigned`, else that kind's instant default, decides the bell and the
  email, and `notify()` itself drops the actor, inactive people and
  clients. Both functions are security definer, so they can call
  `notify()`, whose execute is revoked from authenticated.
- The bell names the project: the quote's title at acceptance (the
  project is made with that name), `projects.name` for Make tasks.
  `count(*)` is a bigint, and `text || bigint` concatenates.
- The bell's loop variable is `v_who` and its query aliases
  `public.work_items w`; neither function declares a variable named `w`
  or `n`, so the `ranked s` trap above does not repeat.
- No new notification kind: `NOTIFICATION_KINDS`,
  `notification_email_default` and the Notifications page do not change.
- After applying: `get_advisors` (security) shows nothing new for
  `page_template_parts` or the two functions.

## 5. schema.sql mirror (with migration 1, before the packages)

schema.sql shows the end state of both migrations from the start.

- Lines 890-893, the page templates comment, becomes: "Page templates:
  the kinds of page a site plan is built from. Each is quoted in parts
  (page_template_parts), each part under a task type with its usual
  hours. A site plan page picks a template and can type over any part's
  hours; "Price the plan" on a quote writes a scope line per template per
  part, and on accept each page becomes a task with a subtask per part.
  A part's scope line takes its task type's usual rate; templates carry
  none."
- `create table page_templates` (894-905): remove the `hours`, `rate`
  and `task_id` lines.
- The seed insert (906-914): drop the `hours` column and its values:
  `insert into page_templates (name, description, color, position) values
  ('Home', 'The front page: hero, sections, calls to action.', 'primary', 1), ...`
  (the other six the same way), `on conflict (name) do nothing;`.
- Right after that seed and before `create table quote_line_items`: the
  `page_template_parts` comment, table and index from migration 1 (without
  the `public.` prefixes, as the file does).
- `create table quote_line_items` (916-928): after `template_id`, add
  `part_id uuid,  -- with template_id, the part "Price the plan" priced; no foreign key, so removing a part never changes a quote`.
- `create table site_plan_pages` (949-961): replace the `hours` line with
  the `part_hours` column, its comment and its check constraint from
  migration 1.
- `create table quote_pages` (971-981): change the `hours` comment to
  `-- the page's parts added up, as accepted`, and add the `parts` column,
  its comment and check after it.
- `accept_quote` (2577-2676): replace the header comment and body with
  migration 1's.
- `make_site_plan_tasks` (2691-2737): replace the header comment and body
  with migration 1's.
- After `grant select, insert, update, delete on page_templates to
  authenticated;` (3571): the `page_template_parts` enable, both
  policies, the revoke and the grant from migration 1.
- Beside the `page_templates` seed: migration 1's parts seed (Content,
  Design, Development at 0 hours on every template), placed after the
  `tasks` seed so the task type names resolve on a fresh database.
- Then regenerate `shared/types/database.ts` with
  `generate_typescript_types`. The types keep `page_templates.hours`,
  `rate`, `task_id` and `site_plan_pages.hours` until migration 2, so the v1
  files still typecheck until the packages replace them.
- After migration 2: regenerate again and run `npx nuxt typecheck`;
  nothing may reference those four columns.

## 6. Who can do what

| Who | page_template_parts | site_plan_pages.part_hours | quote_line_items.part_id | quote_pages.parts |
| --- | --- | --- | --- | --- |
| `manage_settings` (admins) | read, write | as below | as below | read |
| `manage_quotes` | read | read, write (v1 policy) | read, write (quote policy) | read |
| Other staff | read | read | read | read |
| Client login | no rows | no rows | their non-draft quotes' lines (v1 policy; an id, no hours per page) | no rows |
| anon | permission denied | permission denied | no rows | permission denied |
| `/q/<token>` routes (service role) | read | read | read | read |

- No new money column. `page_template_parts` holds hours only.
- Rates read by the new code: only `tasks.default_rate`, on
  `/quotes/[id]` (behind `manage_quotes`), as `setTask` already does. It
  is readable by all non-client staff and is a price, not a cost; `tasks`
  is not money gated. No screen reads `page_templates.rate`, which
  migration 2 drops. The page templates screen, the plan screen and the
  canvas read no rate. `loadQuoteDoc` reads only line rates.
- The summary bell adds no access: `notify()` runs inside the two
  security definer functions, and a person sees only their own
  notifications, as with every other bell.
- The public payload gains nothing: per-page hours and part ids stay in
  `loadQuoteDoc`; only a line's page count leaves.
- Supabase's default privileges give `service_role` its grants on new
  tables; 10.1 checks it, since `loadQuoteDoc` reads parts as the service
  role.

## 7. Shared helper `shared/sitePlan.ts`

Full new contents (replaces v1's):

```ts
// A site plan's pages as a tree, walked the same way by the plan screen,
// the quote editor's pricing, and the client's quote document. A page
// takes its template's parts (Content, Design, Development, or whatever
// the template lists) and can type over any part's hours; 0 skips it.

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

export type PartHours = Record<string, number | string>
export type PartLike = { id: string, hours: number | string }
export type TemplateLike = { id: string, parts: PartLike[] }
type PageLike = { template_id: string | null, part_hours: unknown }

// The hours a page typed, keyed by part id, whatever the column came back as.
export function typedHours(page: { part_hours: unknown }): PartHours {
  const v = page.part_hours
  return v && typeof v === 'object' && !Array.isArray(v) ? v as PartHours : {}
}

// A part's hours on a page: what the page typed, else the template's. 0 skips it.
export function partHours(page: { part_hours: unknown }, part: PartLike): number {
  const typed = typedHours(page)[part.id]
  return typed !== undefined && typed !== '' ? Number(typed) : Number(part.hours)
}

// A page's parts in the template's order, with this page's hours for each.
export function pageParts<P extends PartLike>(page: PageLike, templateById: Map<string, { parts: P[] }>): { part: P, hours: number }[] {
  const t = page.template_id ? templateById.get(page.template_id) : undefined
  return (t?.parts ?? []).map(part => ({ part, hours: partHours(page, part) }))
}

// A page's hours: its parts added up.
export function pageHours(page: PageLike, templateById: Map<string, TemplateLike>): number {
  return pageParts(page, templateById).reduce((s, x) => s + x.hours, 0)
}

// What a page saves: typed numbers only, for parts its template has.
export function cleanPartHours(page: PageLike, templateById: Map<string, TemplateLike>): Record<string, number> {
  const typed = typedHours(page)
  const out: Record<string, number> = {}
  for (const { part } of pageParts(page, templateById)) {
    const v = typed[part.id]
    if (v === undefined || v === '') continue
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0) out[part.id] = n
  }
  return out
}

// Pages grouped by template (templates not in the list count as untyped),
// most hours first. The plan screen's summary and the quote's plan card use it.
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

// One entry per template per part for "Price the plan": the pages on that
// template that do not skip the part, and their hours for it. Templates
// in the order given, parts in each template's order.
export function groupParts<P extends PageLike, T extends TemplateLike>(pages: P[], templates: T[]): { template: T, part: T['parts'][number], pages: P[], hours: number }[] {
  const out: { template: T, part: T['parts'][number], pages: P[], hours: number }[] = []
  for (const template of templates) {
    const on = pages.filter(p => p.template_id === template.id)
    if (!on.length) continue
    for (const part of template.parts) {
      const using = on.filter(p => partHours(p, part) > 0)
      if (using.length) out.push({ template, part, pages: using, hours: using.reduce((s, p) => s + partHours(p, part), 0) })
    }
  }
  return out
}
```

## 8. Screens and code

All copy below is final UI copy: no em dashes, American spelling.

### 8.1 `app/components/SitemapCanvas.vue`

- Header comment: "The pages of a site plan as a tree on a canvas, Octopus
  style: a card per page, children under their parent, lines between
  them. Type on the card to name the page and set its path, pick a
  template, click the hours to type over a part for this page, add a
  child or a sibling from the card, drag a card onto another to move it
  there. The array handed in is edited in place; removed ids are
  reported so the page can delete them on save."
- `import { pageHours, pageParts, typedHours } from '~~/shared/sitePlan'`.
- Types:
  ```ts
  export type CanvasNode = { id: string, parent_id: string | null, title: string, path: string, template: string, template_id: string | null, part_hours: Record<string, number | string> }
  export type TemplatePart = { id: string, name: string, hours: number }
  export type PageTemplate = { id: string, name: string, color: string, is_active?: boolean, parts: TemplatePart[] }
  ```
- `hoursOf = (n: CanvasNode) => pageHours(n, templateById.value)`.
- `templateOptions` labels: `${t.name} (${formatHours(t.parts.reduce((s, p) => s + Number(p.hours), 0))})`.
- `add()`: the new node has `part_hours: {}` instead of `hours: null`.
- `setTemplate()`: also `n.part_hours = {}` (typed hours belong to the old
  template's parts).
- New helpers:
  ```ts
  const partsOf = (n: CanvasNode) => pageParts(n, templateById.value)
  const isTyped = (n: CanvasNode, partId: string) => typedHours(n)[partId] !== undefined && typedHours(n)[partId] !== ''
  const typedOver = (n: CanvasNode) => partsOf(n).some(x => isTyped(n, x.part.id))
  // "skipped" only when the page typed 0; a part at 0 in the template is "off".
  const summary = (n: CanvasNode) => partsOf(n).map(x => (x.hours > 0 ? `${x.part.name} ${formatHours(x.hours)}` : `${x.part.name} ${isTyped(n, x.part.id) ? 'skipped' : 'off'}`)).join(', ')
  // The page whose parts are open in the drawer.
  const partsNode = ref<string | null>(null)
  const partsPage = computed(() => props.nodes.find(n => n.id === partsNode.value) ?? null)
  function openParts(n: CanvasNode) { selected.value = n.id; partsNode.value = n.id }
  // Typing sets the page's own hours; clearing the box goes back to the template's.
  function setPart(n: CanvasNode, partId: string, v: string | number) {
    if (v === '' || v === null || v === undefined) delete n.part_hours[partId]
    else n.part_hours[partId] = v
  }
  ```
- `remove()`: also `if (partsNode.value && ids.has(partsNode.value)) partsNode.value = null`.
- `onEsc`: return early when a dialog is open, so Esc closes the drawer
  first and a second Esc leaves full screen:
  `if (e.key === 'Escape' && fullscreen.value && !document.querySelector('[role="dialog"]')) fullscreen.value = false`.
- Toolbar count stays `{n} pages, {formatHours(totalHours)}`, now from
  `hoursOf`.
- Card bottom row: keep the template `USelectMenu`, replace the hours
  `<input>` with:
  ```html
  <button
    v-if="p.node.template_id" type="button"
    class="w-14 shrink-0 rounded border px-1 py-0.5 text-right text-xs tabular-nums"
    :class="typedOver(p.node) ? 'border-primary/60 font-medium text-primary' : 'border-default text-muted hover:text-highlighted'"
    :title="summary(p.node) || 'This template has no parts yet'"
    :aria-label="`Parts and hours for ${p.node.title || 'this page'}`"
    @click.stop="openParts(p.node)"
  >{{ formatHours(hoursOf(p.node)) }}</button>
  ```
  A page with no template shows no hours button.
- The parts drawer, after the canvas markup inside the root div:
  ```html
  <AppDrawer
    :open="!!partsPage"
    :title="partsPage?.title.trim() || 'Untitled page'"
    :description="partsPage ? `${partsPage.template || 'No template'} page. Type hours to change a part on this page only, or 0 to skip it. Save the plan to keep them.` : undefined"
    @update:open="(v) => { if (!v) partsNode = null }"
  >
    <template #body>
      <div v-if="partsPage" class="space-y-3">
        <p v-if="!partsOf(partsPage).length" class="text-sm text-muted">The {{ partsPage.template }} template has no parts yet. Add them in Settings, Page templates.</p>
        <div v-for="x in partsOf(partsPage)" :key="x.part.id" class="grid grid-cols-[1fr_6rem_1.75rem] items-center gap-2">
          <div class="min-w-0">
            <div class="text-sm font-medium" :class="x.hours > 0 ? '' : 'text-muted line-through'">{{ x.part.name }}</div>
            <div class="text-xs text-muted">{{ partNote(partsPage, x) }}</div>
          </div>
          <UInput
            :model-value="partsPage.part_hours[x.part.id] ?? ''" type="number" step="0.25" min="0" size="sm"
            :placeholder="String(x.part.hours)" :readonly="!editable" :ui="{ base: 'text-right' }"
            @update:model-value="setPart(partsPage, x.part.id, $event)"
          />
          <UButton v-if="editable && isTyped(partsPage, x.part.id)" icon="i-lucide-undo-2" variant="ghost" color="neutral" size="xs" aria-label="Use the template's hours" title="Use the template's hours" @click="setPart(partsPage, x.part.id, '')" />
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center gap-2">
        <span v-if="partsPage" class="text-sm tabular-nums text-muted">This page: {{ formatHours(hoursOf(partsPage)) }}</span>
        <UButton v-if="editable && partsPage && typedOver(partsPage)" variant="ghost" color="neutral" class="ml-auto" @click="partsPage.part_hours = {}">Use the template's hours</UButton>
        <UButton :class="editable && partsPage && typedOver(partsPage) ? '' : 'ml-auto'" @click="partsNode = null">Done</UButton>
      </div>
    </template>
  </AppDrawer>
  ```
  with
  ```ts
  function partNote(n: CanvasNode, x: { part: TemplatePart, hours: number }) {
    const template = `Template: ${formatHours(x.part.hours)}`
    if (isTyped(n, x.part.id)) return x.hours > 0 ? `Typed for this page. ${template}` : `Skipped on this page. ${template}`
    return x.part.hours > 0 ? 'The template\'s hours' : 'Off in the template. Type hours to add it to this page.'
  }
  ```
- The phone fixes listed under core in section 11 change the card
  actions, the starting zoom on phones, a moved page's path and the
  toolbar button size. Nothing else changes (layout, drag, keys).

### 8.2 `/site-plans/[id]` (`app/pages/site-plans/[id].vue`)

- Import `{ cleanPartHours, flattenPages, groupPages, typedHours }` from
  `~~/shared/sitePlan`.
- `__ad2` select: `hours` becomes `part_hours`.
- `__ad4` (still its own key, still no rate):
  ```ts
  const { data, error } = await supabase.from('page_templates').select('id, name, color, is_active, page_template_parts(id, name, hours, position)').order('position').order('name')
  if (error) throw error
  return data.map(({ page_template_parts: parts, ...t }) => ({ ...t, parts: [...parts].sort((a, b) => a.position - b.position) }))
  ```
- `PageDraft`: `hours` becomes `part_hours: Record<string, number | string>`.
  `loadEditor` maps `part_hours: { ...typedHours(p) }`.
- `const templateById = computed(() => new Map((templates.value ?? []).map(t => [t.id, t])))`.
- `save()` row: `part_hours: cleanPartHours(p, templateById.value)` in
  place of `hours`. Still never sends `work_item_id`.
- Make tasks modal body:
  "{plural(missing)} on {project}, one for each page with no task yet.
  Each gets a subtask for every part the page does not skip, with that
  part's hours as its estimate, up to the person on the accepted quote's
  line for that part. Each of those people gets one notification, not
  one per subtask. Where there is no such person, nobody is up."
- Make tasks toast description: "Each has its parts as subtasks. Check
  who is up on the project." (title unchanged).
- Everything else as v1 (chips from `groupPages` now add parts up).

### 8.3 Quote editor (`app/pages/quotes/[id].vue`)

- Import `{ groupPages, groupParts, pageHours, partHours }` from
  `~~/shared/sitePlan`.
- `__ad3` pages select: `hours` becomes `part_hours`.
- `__ad5` (`page-templates`):
  ```ts
  const { data, error } = await supabase.from('page_templates').select('id, name, color, page_template_parts(id, name, hours, task_id, position)').order('position').order('name')
  if (error) throw error
  return data.map(({ page_template_parts: parts, ...t }) => ({ ...t, parts: [...parts].sort((a, b) => a.position - b.position) }))
  ```
  and the destructure becomes `const { data: templates, refresh: refreshTemplates } = __ad5`.
  The select has no `rate`: templates carry none (decision 5).
- `LineDraft` gains `part_id: string | null`. `loadEditor` maps
  `part_id: l.part_id`; `addLine` and `draftLinesFromBrief` push
  `part_id: null`; `save()` upserts `part_id: l.part_id`.
- `const partById = computed(() => new Map((templates.value ?? []).flatMap(t => t.parts.map(p => [p.id, p] as const))))`.
- The comment above `pricePlan` (lines 173-176, "One scope line per
  template: ... the template's rate (or the rate already used for that
  task type on this quote) ...") becomes:
  ```ts
  // One scope line per template per part: "6 x Interior pages, Design",
  // the hours of the pages that do not skip the part, at the part's task
  // type's usual rate. It reads the plan and templates fresh first, and
  // run again it updates the same lines instead of adding more. Lines are
  // drafts until Save.
  ```
- `pricePlan()` becomes (it reads the templates fresh with the plan, so a
  part removed or edited in Settings while the quote is open is not
  priced from stale ids or hours):
  ```ts
  async function pricePlan() {
    await Promise.all([refreshPlan(), refreshTemplates()])
    const pages = planData.value?.pages ?? []
    if (!pages.length) {
      toast.add({ title: 'The site plan has no pages yet', color: 'neutral' })
      return
    }
    const tpls = templates.value ?? []
    const byId = new Map(tpls.map(t => [t.id, t]))
    const priced = new Set<string>()
    let made = 0, updated = 0
    for (const g of groupParts(pages, tpls)) {
      const n = g.pages.length
      const desc = `${n} x ${g.template.name} ${n === 1 ? 'page' : 'pages'}, ${g.part.name}`
      const hours = round2(g.hours)
      const line = draftLines.value.find(l => l.template_id === g.template.id && l.part_id === g.part.id)
      if (line) {
        line.description = desc
        line.hours = hours
        priced.add(line.id)
        updated++
        continue
      }
      // The part's task type's usual rate, as picking that task type on a blank line gives (setTask).
      const usual = taskTypes.value?.find(t => t.id === g.part.task_id)?.default_rate
      const id = crypto.randomUUID()
      draftLines.value.push({ id, description: desc, task_id: g.part.task_id, hours, rate: usual ?? '', amount: '', template_id: g.template.id, part_id: g.part.id, assignee_id: null, target_week: '' })
      priced.add(id)
      made++
    }
    // Pages that priced nothing, and part lines this run did not price
    // (every page skips the part now, or the part is gone): they keep
    // their old hours, so say so.
    const left = pages.filter(p => pageHours(p, byId) === 0).length
    const stale = draftLines.value.filter(l => l.part_id && !priced.has(l.id)).length
    const notes = [
      left ? `${left} ${left === 1 ? 'page has' : 'pages have'} no hours (no template, a template with no hours yet, or every part skipped) and ${left === 1 ? 'was' : 'were'} left out.` : '',
      stale ? `${stale} ${stale === 1 ? 'line no longer matches' : 'lines no longer match'} the plan. Delete ${stale === 1 ? 'it' : 'them'} or set the hours.` : '',
      'Check the rates, then save.',
    ].filter(Boolean)
    toast.add({ title: `${made} ${made === 1 ? 'line' : 'lines'} added, ${updated} updated`, description: notes.join(' '), color: stale ? 'warning' : 'success' })
  }
  ```
- `pagesFor(l)`:
  ```ts
  const pagesFor = (l: LineDraft) => {
    const part = l.part_id ? partById.value.get(l.part_id) : undefined
    return part ? (planData.value?.pages ?? []).filter(p => p.template_id === l.template_id && partHours(p, part) > 0).length : 0
  }
  ```
- Site plan heading text: "The pages the site will have. Price the plan
  writes a scope line for each template and part."
- `planGroups` and `planHours` stay (they now add parts up).

### 8.4 Client document (`server/utils/quoteDoc.ts`)

- Import `{ flattenPages, partHours }` from `~~/shared/sitePlan`.
- `loadPages()` becomes:
  ```ts
  type Page = { title: string, path: string | null, template: string | null, template_id: string | null, depth: number, parts: { part_id: string, hours: number }[] }
  const loadPages = async (): Promise<Page[]> => {
    if (quote.status === 'accepted') {
      const { data, error } = await supabase.from('quote_pages').select('title, path, template, template_id, depth, parts').eq('quote_id', quote.id).order('sort_order')
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      return (data ?? []).map(p => ({ ...p, parts: Array.isArray(p.parts) ? p.parts as { part_id: string, hours: number }[] : [] }))
    }
    if (!quote.site_plan_id || quote.site_plans?.client_id !== quote.client_id) return []
    const [pages, parts] = await Promise.all([
      supabase.from('site_plan_pages').select('id, parent_id, title, path, template, template_id, part_hours').eq('plan_id', quote.site_plan_id).order('sort_order').order('created_at'),
      supabase.from('page_template_parts').select('id, template_id, hours'),
    ])
    if (pages.error) throw createError({ statusCode: 500, statusMessage: pages.error.message })
    if (parts.error) throw createError({ statusCode: 500, statusMessage: parts.error.message })
    const byTemplate = new Map<string, { id: string, hours: number }[]>()
    for (const part of parts.data ?? []) byTemplate.set(part.template_id, [...(byTemplate.get(part.template_id) ?? []), part])
    return flattenPages(pages.data ?? []).map(({ page: p, depth }) => ({
      title: p.title, path: p.path, template: p.template, template_id: p.template_id, depth,
      parts: (p.template_id ? byTemplate.get(p.template_id) ?? [] : []).map(part => ({ part_id: part.id, hours: partHours(p, part) })),
    }))
  }
  ```
- Lines select adds `part_id`:
  `'id, description, hours, rate, amount, template_id, part_id, tasks(name)'`.
- `lines[].pages` (a part id is unique across templates, and each page's
  `parts` hold only its own template's parts, so no template match is
  needed; a removed part's id matches nothing on a live plan and still
  matches the frozen copy):
  `l.part_id ? pages.filter(p => p.parts.some(x => x.part_id === l.part_id && Number(x.hours) > 0)).length : 0`.
- The returned `pages` stays `{ title, path, template, depth }`.
- `shared/types/quote.ts` and `app/components/QuoteDocument.vue` do not
  change.

| Quote status | Line page count |
| --- | --- |
| draft, sent, declined while linked | live plan pages whose hours for the line's part are above 0 (none if the part was removed) |
| accepted | `quote_pages` rows whose `parts` entry for the line's part has hours above 0 (unchanged if the part is later removed) |
| any, line without `part_id` | none |

### 8.5 Page templates (`app/pages/admin/page-templates.vue`)

Full new file:

```vue
<script setup lang="ts">
// The kinds of page a site plan is built from. Each is quoted in parts
// (usually Content, Design, Development), in order, each part under a
// task type with the hours one page usually takes. The site plan canvas
// offers the templates; "Price the plan" on a quote makes a scope line
// per template per part, and acceptance makes a subtask per part.
// Templates carry no rate: a part's scope line takes its task type's
// usual rate.
definePageMeta({ middleware: 'can', permission: 'manage_settings' })
useHead({ title: 'Page templates' })

const supabase = useSupabaseClient()
const toast = useToast()

const __ad1 = useAsyncData('admin-page-templates', async () => {
  const { data, error } = await supabase.from('page_templates')
    .select('id, name, description, color, position, is_active, page_template_parts(id, name, task_id, hours, position, tasks(name))')
    .order('position').order('name')
  if (error) throw error
  return data.map(({ page_template_parts: parts, ...t }) => ({ ...t, parts: [...parts].sort((a, b) => a.position - b.position) }))
}, fresh)
const __ad2 = useTaskTypes()
await Promise.all([__ad1, __ad2])
const { data: rows, refresh } = __ad1
const { data: taskTypes } = __ad2

type Row = NonNullable<typeof rows.value>[number]
type PartDraft = { id: string, name: string, task_id: string | undefined, hours: number | string, taskName: string }
const COLORS = ['neutral', 'primary', 'info', 'success', 'warning', 'error']
const hoursOf = (r: Row) => r.parts.reduce((s, p) => s + Number(p.hours), 0)
const partsText = (r: Row) => (r.parts.length ? r.parts.map(p => `${p.name} ${formatHours(p.hours)}`).join(', ') : 'No parts yet')
// Active task types, plus a retired one a part already uses.
const taskOptions = (p: PartDraft) => [
  ...(taskTypes.value ?? []).map(t => ({ label: t.name, value: t.id })),
  ...(p.task_id && !(taskTypes.value ?? []).some(t => t.id === p.task_id) ? [{ label: p.taskName, value: p.task_id }] : []),
]

// A new template starts with Content on Copywriting, Design on
// Design/Production, and Development on Web Development, matched by the
// task type's exact name. A default whose task type is missing or
// retired is left out rather than guessed.
const DEFAULT_PARTS = [
  { name: 'Content', task: 'Copywriting' },
  { name: 'Design', task: 'Design/Production' },
  { name: 'Development', task: 'Web Development' },
]
function defaultParts(): PartDraft[] {
  const types = taskTypes.value ?? []
  return DEFAULT_PARTS.flatMap(({ name, task }) => {
    const t = types.find(x => x.name === task)
    return t ? [{ id: crypto.randomUUID(), name, task_id: t.id, hours: 0, taskName: t.name }] : []
  })
}

const editing = ref<Row | null>(null)
const adding = ref(false)
const form = reactive({ name: '', description: '', color: 'neutral', is_active: true, parts: [] as PartDraft[] })
const removedParts = ref<string[]>([])
function openAdd() {
  Object.assign(form, { name: '', description: '', color: 'neutral', is_active: true, parts: defaultParts() })
  removedParts.value = []
  adding.value = true
}
function openEdit(r: Row) {
  Object.assign(form, {
    name: r.name, description: r.description ?? '', color: r.color, is_active: r.is_active,
    parts: r.parts.map(p => ({ id: p.id, name: p.name, task_id: p.task_id, hours: p.hours, taskName: p.tasks?.name ?? '' })),
  })
  removedParts.value = []
  editing.value = r
}
function close() {
  adding.value = false
  editing.value = null
}
function addPart() {
  form.parts.push({ id: crypto.randomUUID(), name: '', task_id: undefined, hours: 0, taskName: '' })
}
function removePart(i: number) {
  const [p] = form.parts.splice(i, 1)
  if (p && editing.value?.parts.some(x => x.id === p.id)) removedParts.value.push(p.id)
}
function movePart(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= form.parts.length) return
  const [p] = form.parts.splice(i, 1)
  form.parts.splice(j, 0, p!)
}
// A part with no name yet takes the name of the task type picked for it.
function setPartTask(p: PartDraft, id: string) {
  p.task_id = id
  const t = taskTypes.value?.find(x => x.id === id)
  if (!t) return
  p.taskName = t.name
  if (!p.name.trim()) p.name = t.name
}

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const name = form.name.trim()
    if (!name) throw new Error('Give the template a name.')
    if (form.parts.some(p => !p.name.trim())) throw new Error('Every part needs a name.')
    if (form.parts.some(p => !p.task_id)) throw new Error('Every part needs a task type.')
    if (form.parts.some(p => p.hours === '' || !(Number(p.hours) >= 0) || Number(p.hours) > 9999)) throw new Error('Part hours go from 0 to 9999.')
    const seen = new Set<string>()
    for (const p of form.parts) {
      const k = p.name.trim().toLowerCase()
      if (seen.has(k)) throw new Error(`Two parts are both called ${p.name.trim()}.`)
      seen.add(k)
    }
    const values = { name, description: form.description.trim() || null, color: form.color, is_active: form.is_active }
    let id = editing.value?.id
    if (id) {
      const { error } = await supabase.from('page_templates').update(values).eq('id', id)
      if (error) throw error
    } else {
      const { data, error } = await supabase.from('page_templates').insert({ ...values, position: (rows.value?.length ?? 0) + 1 }).select('id').single()
      if (error) throw error
      id = data.id
    }
    // Removed parts first, then the list in its order.
    if (removedParts.value.length) {
      const { error } = await supabase.from('page_template_parts').delete().in('id', removedParts.value)
      if (error) throw error
    }
    if (form.parts.length) {
      const { error } = await supabase.from('page_template_parts').upsert(form.parts.map((p, i) => ({
        id: p.id, template_id: id!, name: p.name.trim(), task_id: p.task_id!, hours: Number(p.hours), position: i + 1,
      })), { onConflict: 'id' })
      if (error) throw error
    }
    close()
    await refresh()
  } catch (e) {
    toast.add({ title: 'Could not save', description: (e as Error).message, color: 'error' })
  } finally {
    saving.value = false
  }
}
async function move(r: Row, dir: -1 | 1) {
  const list = rows.value ?? []
  const i = list.indexOf(r)
  const other = list[i + dir]
  if (!other) return
  await Promise.all([
    supabase.from('page_templates').update({ position: other.position }).eq('id', r.id),
    supabase.from('page_templates').update({ position: r.position }).eq('id', other.id),
  ])
  await refresh()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Page templates</h1>
        <p class="text-sm text-muted">The kinds of page a site plan is built from, and the parts each is quoted in, with the hours each part usually takes.</p>
      </div>
      <UButton class="ml-auto" icon="i-lucide-plus" @click="openAdd">New template</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Template</th>
            <th class="px-2 py-2 text-right font-medium">Hours</th>
            <th class="px-2 py-2 font-medium">Color</th>
            <th class="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="r.id" class="border-b border-default last:border-0 align-top" :class="r.is_active ? '' : 'text-muted'">
            <td class="px-4 py-1.5">
              <div class="font-medium">{{ r.name }}<span v-if="!r.is_active" class="ml-2 text-xs font-normal text-muted">inactive</span></div>
              <div class="text-xs text-muted">{{ r.description }}</div>
              <div class="mt-0.5 text-xs text-muted">{{ partsText(r) }}</div>
            </td>
            <td class="px-2 py-1.5 text-right tabular-nums">{{ formatHours(hoursOf(r)) }}</td>
            <td class="px-2 py-1.5"><UBadge :color="r.color as 'neutral'" variant="subtle" size="sm">{{ r.color }}</UBadge></td>
            <td class="px-4 py-1.5 text-right whitespace-nowrap">
              <UButton icon="i-lucide-chevron-up" variant="ghost" color="neutral" size="xs" aria-label="Move up" :disabled="i === 0" @click="move(r, -1)" />
              <UButton icon="i-lucide-chevron-down" variant="ghost" color="neutral" size="xs" aria-label="Move down" :disabled="i === (rows?.length ?? 0) - 1" @click="move(r, 1)" />
              <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="xs" aria-label="Edit" @click="openEdit(r)" />
            </td>
          </tr>
          <tr v-if="!rows?.length"><td colspan="4" class="px-4 py-8 text-center text-muted">No templates yet.</td></tr>
        </tbody>
      </table>
    </UCard>

    <AppDrawer :open="adding || !!editing" :title="editing ? 'Edit template' : 'New template'" wide @update:open="(v) => { if (!v) close() }">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full" placeholder="Interior" /></UFormField>
          <UFormField label="Description"><UInput v-model="form.description" class="w-full" placeholder="A standard content page on the site template." /></UFormField>
          <div>
            <div class="mb-1 flex flex-wrap items-center gap-x-2">
              <span class="text-sm font-medium">Parts</span>
              <span class="text-xs text-muted">In the order they are quoted and made. Each part is a scope line on the quote and a subtask on each page's task. A page can type over the hours, or 0 to skip a part. A part's scope line takes its task type's usual rate.</span>
            </div>
            <div class="space-y-2">
              <div v-for="(p, i) in form.parts" :key="p.id" class="grid grid-cols-[1fr_11rem_5rem_auto] items-center gap-2">
                <UInput v-model="p.name" size="sm" placeholder="Design" />
                <USelectMenu :model-value="p.task_id" :items="taskOptions(p)" value-key="value" size="sm" placeholder="Task type" @update:model-value="setPartTask(p, $event as string)" />
                <UInput v-model="p.hours" type="number" step="0.25" min="0" size="sm" placeholder="hours" :ui="{ base: 'text-right' }" />
                <div class="flex">
                  <UButton icon="i-lucide-chevron-up" variant="ghost" color="neutral" size="xs" aria-label="Move up" :disabled="i === 0" @click="movePart(i, -1)" />
                  <UButton icon="i-lucide-chevron-down" variant="ghost" color="neutral" size="xs" aria-label="Move down" :disabled="i === form.parts.length - 1" @click="movePart(i, 1)" />
                  <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" aria-label="Remove part" @click="removePart(i)" />
                </div>
              </div>
            </div>
            <div v-if="!form.parts.length" class="flex flex-wrap items-center gap-2">
              <p class="text-sm text-muted">No parts yet. A template with no parts prices nothing, and its pages get a task with no subtasks.</p>
              <UButton v-if="defaultParts().length" size="xs" variant="outline" color="neutral" @click="form.parts = defaultParts()">Add {{ defaultParts().map(p => p.name).join(', ') }}</UButton>
            </div>
            <p v-if="removedParts.length" class="mt-2 text-xs text-warning">Removed parts come off every site plan page on this template when you save. Quote lines already priced for them stay as they are; on quotes not yet accepted they lose their page count.</p>
            <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-plus" class="mt-2" @click="addPart">Add part</UButton>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Color"><USelect v-model="form.color" :items="COLORS" class="w-full" /></UFormField>
          </div>
          <USwitch v-model="form.is_active" label="Offered on site plans" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="close">Cancel</UButton>
          <UButton :loading="saving" @click="save">{{ editing ? 'Save' : 'Add template' }}</UButton>
        </div>
      </template>
    </AppDrawer>
  </div>
</template>
```

Notes: the three writes are not one transaction (the project templates
screen works the same way); a failure part way leaves what was written,
and the toast says why. Part deletes run before the upsert. The Add
button in the empty state only fills the form (the defaults at 0 hours);
nothing is written until Save, so filling the list and canceling changes
nothing. The seven live templates already have the three parts from
migration 1 (decision 7), so the empty state shows only on a template
whose parts were all removed.

The screen no longer reads or writes `page_templates.rate` (decision 5):
no Rate column, no Rate field, and `rate` is gone from the select, the
form and the saved values, so migration 2 can drop the column. The empty
state's button reads "Add Content, Design, Development" when all three
task types exist, and names only those found otherwise.

### 8.6 `shared/types/app.ts`

SETTINGS_PAGES, Page templates `text`:
`'The kinds of page a site plan is built from, and the parts and hours each is quoted in.'`

### 8.7 Planner (`app/pages/planner.vue`)

- `planner-tasks` select adds `parent_id` after `assignee_id`.
- The Nobody up band (lines 214-216) becomes:
  ```ts
  // Nobody up: open tasks with nobody up, whether or not people are on
  // them, leaving out a task with open subtasks (a site plan page's task):
  // its subtasks are what someone takes. Dated first.
  const hasOpenSubtasks = computed(() => new Set((tasks.value ?? []).flatMap(t => (t.parent_id ? [t.parent_id] : []))))
  const unassigned = computed(() => (tasks.value ?? []).filter(t => !t.assignee_id && !hasOpenSubtasks.value.has(t.id) && matches(t)).sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || a.title.localeCompare(b.title)))
  ```
  `tasks` is already filtered to open tasks, so a page task whose
  subtasks are all done shows in the band again.
- Nothing else changes (blocks, drag, hours).

### 8.8 Project page (`app/pages/projects/[id]/index.vue`)

- `__ad4` select adds `parent_id, position`:
  `'id, title, status, due_on, estimate_hours, parent_id, position, work_item_assignees(user_id, profiles(full_name))'`.
- After `visibleItems`:
  ```ts
  // Subtasks tucked under their parent, in their order, when the parent
  // is listed too (as the Tasks page does).
  const listedItems = computed(() => {
    const list = visibleItems.value
    const ids = new Set(list.map(i => i.id))
    const kids = new Map<string, typeof list>()
    for (const i of list) if (i.parent_id && ids.has(i.parent_id)) kids.set(i.parent_id, [...(kids.get(i.parent_id) ?? []), i])
    return list.flatMap(i => (i.parent_id && ids.has(i.parent_id) ? [] : [i, ...(kids.get(i.id) ?? []).sort((a, b) => a.position - b.position)]))
  })
  const tucked = (i: { parent_id: string | null }) => !!i.parent_id && visibleItems.value.some(x => x.id === i.parent_id)
  ```
- The task list row: `v-for="i in listedItems"`, and the `li` class
  `flex items-center gap-3 py-2 pr-4` with
  `:class="tucked(i) ? 'pl-10' : 'pl-4'"`. The header count and the
  empty state stay on `openItems` and `visibleItems`.

## 9. Docs (same change)

### docs/guide.md

- Step 4 ("Plan the site", lines 380-390) becomes:

  4. **Plan the site.** For web work the pages live in a site plan. Start
     one from Site plans (under More in the rail), or with Add site plan on
     the quote. Build the tree there: a card per page with its title and
     path, a child or a sibling from the card, drag a card onto another to
     move it. Give each page a template (Home, Interior, and so on, set up
     in Settings). A template is quoted in parts, usually Content, Design,
     and Development, each with the hours it usually takes, and the card
     shows the page's total. Click the hours on a card to change a part for
     that page, or type 0 to skip it. Save the plan. Then "Price the plan"
     on the quote writes one scope line per template and part ("6 x
     Interior pages, Design", with those pages' Design hours
     and the part's task type's usual rate) and updates
     those same lines when you price again. A draft or sent quote shows
     the plan's pages as they are saved.

- Step 7: "copies each quoted task type and rate into the project's rate
  table" becomes "copies each quoted task type and rate into the
  project's rate table (the highest rate, when lines for one task type
  differ)". The site plan sentence becomes: "With a site plan, each page
  becomes a task on the project with a subtask for each of its parts, the
  plan moves to the project, and the quote keeps a copy of the pages as
  they were accepted."
- Site plans section, new bullet after "The list and the plan":

  - **Parts.** Each page template lists the parts it is quoted in,
    usually Content, Design, and Development, each under a task type with
    the hours one page usually takes (Settings, Page templates). A new
    template starts with those three, on Copywriting, Design/Production,
    and Web Development, leaving out any whose task type is missing. The
    seven built-in templates were given the same three at 0 hours; type
    the hours each part usually takes.
    Templates have no rate: a part's scope line takes its task type's
    usual rate, the same as picking that task type on a blank line.
    On the canvas, a page card shows its hours; click them to see
    its parts and type over any of them for that page. 0 skips the part
    on that page, and clearing the box brings back the template's hours.
    A part at 0 in the template is off unless a page types hours in.
    Changing a page's template clears what it typed.

- "On a quote" bullet, last two sentences become: "Price the plan on the
  quote reads the plan as last saved and writes a scope line per template
  and part. Lines for a template or part you no longer use, or a part
  every page skips, stay until you delete them."
- "Acceptance" bullet becomes: "The plan moves to the new project and
  each page becomes a task, with a subtask under it for each part the
  page does not skip, named for the page and the part ("About us,
  Design"). A subtask's estimate is the part's hours and the person on
  the scope line for that template and part is up on it. Each of those
  people gets one notification for all of theirs ("You have 12 parts on
  Carter's Website"), following their setting for Assigned to a task,
  not one per subtask. The page task itself has no estimate and nobody
  on it,
  so its hours are never counted twice. On the project page the subtasks
  sit under their page task, and Planner's Nobody up band leaves out a
  task that still has open subtasks. If another quote on the same plan
  was accepted first, the plan stays on that project and this quote makes
  no page tasks; the Accept box says so."
- "On a project" bullet becomes: "The plan stays editable. Editing,
  moving, or removing a page never changes its task or a quote. Make
  tasks for new pages adds a task, with its subtasks, for each page that
  has none, including a page whose task was deleted. Each new subtask
  goes to the person on the accepted quote's scope line for that template
  and part, again with one notification per person; with no such
  person (a plan started on a
  project, or a line with nobody) nobody is up on it. A part added to a template later, or a part a page stops
  skipping, does not add a subtask to a page that already has a task; add
  that subtask on the task. Restoring a deleted page task after Make tasks
  leaves the page with two tasks; delete one."
- "Who, week" bullet, last sentence becomes: "When it is accepted, the
  site plan subtasks for that line's template and part are assigned to
  that person."
- Line 648: "page templates and their parts for site plans".
- Schedule and Planner, the Planner bullet: after "Drag a task from
  "Nobody up" onto a person's day and it is planned there ..." sentence,
  add: "A task with open subtasks, like a site plan page's task, stays
  out of Nobody up; its subtasks are listed instead."
- Settings, Page templates (the Parts bullet above): add "Removing a part
  never changes a quote: an accepted quote keeps its lines and page
  counts. Editing a template with no parts offers a button to add the
  usual ones."
- The canvas bullet under the app's general notes ("The canvas on a
  site plan"): add the selected card's action row (add under or beside,
  nest, move out, remove), that a moved page's path follows its new
  parent, and that the canvas opens at 100% on a phone (section 11,
  core).
- "On a quote" bullet: add "When a line no longer matches the plan (every
  page skips its part, for example), Price the plan says so and leaves
  it for you to delete or change."

### CLAUDE.md

Replace the v1 `site_plans` Schema bullet (lines 65-70) with:

```md
- `site_plans` / `site_plan_pages` are a website's live page tree,
  linked from `quotes.site_plan_id` and moved to `site_plans.project_id`
  by `accept_quote()`. A page template is quoted in
  `page_template_parts`; a page types over a part's hours in
  `site_plan_pages.part_hours` (0 skips it). Scope lines carry
  `template_id` and `part_id`. Acceptance copies the pages, parts
  resolved, into `quote_pages`, which the accepted document reads
  forever, and makes a task per page with a subtask per part; the page
  task has no estimate, so hours are not counted twice. Each person put
  on subtasks gets one `assigned` notification per run. Page templates
  have no rate; a part line takes its task type's `default_rate`.
  `site_plan_pages.work_item_id` is the page task; `make_site_plan_tasks()`
  fills gaps and treats a soft-deleted task as none.
```

### docs/site-plans.md

Under the title, add: "Parts (a page quoted as Content, Design,
Development), per-part pricing and page tasks with subtasks replaced this
spec's hours, pricing and acceptance rules; see `docs/site-plan-parts.md`."

### docs/status.md

Append `## Site plan parts (2026-09-15)`: Luke's seven decisions (his
final answers included, seeding the seven templates among them),
migration 1 (the parts table, the seed, `part_hours`,
`part_id`, `quote_pages.parts`, both functions with the summary bell)
and migration 2 after the deploy (the four dropped columns,
`page_templates.rate` among them), the canvas parts drawer, the page
templates parts editor with no rate, the phone canvas fixes (section 11,
core), pricing per part at the task type's
usual rate, the page task with no estimate and subtask assignment with
one bell per person (at acceptance and Make tasks), the Planner band and
project page grouping, the known limitations (section 12), that no
question is open (section 13), and after 10.4 the verification actually done,
saying that acceptance and the bell were checked only in rolled-back
SQL.

`docs/permissions.md` and `docs/structure.md` do not change (no new
screen, file or permission).

## 10. Verification plan

Nothing is left behind. Every SQL check is one `execute_sql` call that
ends by rolling back (below), and nothing in a check may commit. Browser
test rows are named `ZZ TEST parts ...` and removed at the end; v1's own `ZZ TEST` rows are
left to the v1 run. Task types are only read, never changed. ClickUp and
Harvest data are never touched.

No email may go out:

- **Acceptance and the summary bell are tested only inside rolled-back
  SQL transactions** (10.2 checks 8 and 9). Accept is never clicked in
  the browser and `accept_quote` never runs outside a transaction that
  rolls back: accepting a quote emails every billing person. A
  notification row written in a rolled-back transaction never commits,
  so `run_notification_emails()` (every five minutes, pending rows older
  than two minutes) never sees it. No check calls
  `run_notification_emails()`, `net.http_post` or anything else that
  sends.
- Inside those transactions one other active staff member, `<staff>`,
  is put on subtasks so the bell to someone other than the actor can be
  seen; that row rolls back with the rest.
- **Each 10.2 check is one `execute_sql` call, never split across
  calls.** Every call runs on its own, so an `accept_quote` sent in one
  call and a `rollback` in the next would commit the acceptance, and the
  `quote_decision` bell would email every billing person and the
  `assigned` bell `<staff>`. A call returns only its last statement's
  result (on 2026-09-15, `begin; select 1; select 2; rollback;` returned
  only the second select), so write each check as one `do $$ ... $$`
  block: the shared setup, the steps, each read added to one `jsonb`
  variable (`v := v || jsonb_build_object('quote_pages', (select jsonb_agg(...) from ...))`),
  and last `raise exception 'RESULTS %', v::text`. The exception rolls
  the whole block back even if a rollback is forgotten, and its message
  carries the results (a write-free probe that set and reset the role
  inside a DO block came back as `ERROR: P0001: RESULTS {...}`). Inside
  the block, `set local role authenticated` with
  `perform set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)`
  impersonates and `reset role` returns to postgres; function calls are
  `perform` or an assignment; a step that must raise goes in its own
  `begin ... exception when <condition> then ... end` sub-block, which
  is its savepoint, and records that it raised; `now()` is `<t0>`.
- If a call ends in any error other than the RESULTS exception, or its
  output is unclear, run the notifications count below before running
  anything else.
- **Browser flows** (10.4) price, save, and run Make tasks on ZZ TEST
  data with Luke (`acdbde8e-a7a7-452b-9d6d-a7ad9032b83f`) as the only
  assignee. `notify()` never tells the actor, so Luke's own actions write
  no notification for anyone.
- After 10.2, and again after cleanup, this is 0:
  `select count(*) from public.notifications where created_at > now() - interval '1 day' and (title like '%ZZ TEST parts%' or (kind = 'assigned' and link like '/projects/%'))`.

### 10.1 After migration 1 (as postgres, read-only)

- `page_template_parts` has RLS on; policies `read_all`, `manage_settings`.
- `page_template_parts` holds 21 rows: each of the seven templates has
  Content (Copywriting, position 1), Design (Design/Production, 2) and
  Development (Web Development, 3), all at 0 hours.
- `has_table_privilege('anon', 'public.page_template_parts', 'select')`
  is false; `authenticated` has select, insert, update, delete;
  `has_table_privilege('service_role', 'public.page_template_parts', 'select')`
  is true.
- `site_plan_pages.part_hours`, `quote_line_items.part_id`,
  `quote_pages.parts` exist with their defaults and checks; the 9 v1
  pages have `part_hours = '{}'`; `pg_get_constraintdef` of
  `site_plan_pages_part_hours` contains `strict`; no foreign key on
  `quote_line_items` names `part_id`
  (`select conname from pg_constraint where conrelid = 'public.quote_line_items'::regclass and contype = 'f' and pg_get_constraintdef(oid) ~ 'part_id'`
  is empty).
- `pg_get_functiondef` of `accept_quote` and `make_site_plan_tasks` match
  section 4; `accept_quote` still has one overload;
  `has_function_privilege('anon', 'public.make_site_plan_tasks(uuid)', 'execute')`
  is false.
- `get_advisors` security: nothing new.
- Before migration 2:
  `select proname from pg_proc where pronamespace = 'public'::regnamespace and (prosrc ~ 'page_templates' or prosrc ~ 'site_plan_pages')`
  returns only `accept_quote` and `make_site_plan_tasks`, neither reading
  `pt.hours`, `pt.rate`, `task_id` on templates or `p.hours`; no view
  depends on the four columns (`select * from information_schema.view_column_usage
  where table_name in ('page_templates', 'site_plan_pages')` is empty);
  and `grep -rn -e page_templates -e site_plan_pages -e template.rate app server shared`,
  leaving out `shared/types/database.ts`, shows no select that names
  `page_templates`' own `hours`, `rate` or `task_id`, no bare `hours` on
  `site_plan_pages`, and nothing that reads a template rate. Expected and
  fine: `hours`, `task_id` and `position` inside an embedded
  `page_template_parts(...)` (the parts table), and `part_hours` on
  `site_plan_pages`. As a second net before the drop, delete the four
  columns from the `Row`, `Insert` and `Update` types in
  `shared/types/database.ts` by hand, run `npx nuxt typecheck` (no
  `error TS` lines), then restore the file with
  `git checkout shared/types/database.ts`. A leftover reader of any of
  the four then fails in typecheck, not in production after the drop.

### 10.2 RLS and functions by impersonation (Supabase MCP `execute_sql`)

Shared setup, as postgres at the top of each transaction (ids are fixed
test uuids; task types by name):

```sql
do $$
declare v jsonb := '{}'::jsonb;
begin
insert into public.clients (id, name) values ('00000000-0000-4000-8000-0000000000c1', 'ZZ TEST parts client');
insert into public.page_templates (id, name, position) values
  ('00000000-0000-4000-8000-0000000000a1', 'ZZ TEST parts Interior', 99),
  ('00000000-0000-4000-8000-0000000000a2', 'ZZ TEST parts Bare', 100);
insert into public.page_template_parts (id, template_id, position, name, task_id, hours) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 1, 'Content',     (select id from public.tasks where name = 'Copywriting'), 2),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 2, 'Design',      (select id from public.tasks where name = 'Design/Production'), 3),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a1', 3, 'Development', (select id from public.tasks where name = 'Web Development'), 0);
insert into public.site_plans (id, client_id, name) values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 'ZZ TEST parts plan');
insert into public.site_plan_pages (id, plan_id, parent_id, sort_order, title, template_id, part_hours) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1', null, 1, 'Home', '00000000-0000-4000-8000-0000000000a1',
   '{"00000000-0000-4000-8000-0000000000b1": 0, "00000000-0000-4000-8000-0000000000b3": 4}'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e1', 2, 'About', '00000000-0000-4000-8000-0000000000a1', '{}'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000d1', null, 3, 'Contact', '00000000-0000-4000-8000-0000000000a2', '{}'),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000d1', null, 4, 'Blog', null, '{}');
-- impersonate: set local role authenticated;
--   perform set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
-- the check's steps, then reset role for reads as postgres;
-- add every read to v
raise exception 'RESULTS %', v::text;   -- rolls the whole block back
end $$;
```

Checks, each its own `do` block in its own `execute_sql` call (a staff
uuid `<staff>`, active, not a client, not Luke, and with no
`notification_prefs` row for `assigned`, picked first with a read-only
select that also confirms Luke has no such row, so both get the
defaults, bell on and email instant; on 2026-09-15 no
`notification_prefs` row exists for `assigned` at all; no role holds
`manage_quotes` live):

1. Staff: `select count(*) from page_template_parts` sees 24 parts, the
   21 seeded by migration 1 and the 3 test parts.
2. Staff: `insert into page_template_parts (...)` raises a row-level
   security error; `update page_template_parts set hours = 9` updates 0
   rows.
3. Staff with a Quotes override (as postgres first:
   `insert into public.permission_overrides (user_id, key, allowed) values ('<staff>', 'manage_quotes', true)`):
   parts insert still raises; `update site_plan_pages set part_hours = '{}' where id = '...e1'` updates 1 row.
4. Luke: parts insert, update and delete work.
5. Client (as postgres: `update public.profiles set role = 'client', client_id = '...c1' where id = '<staff>'`,
   then impersonate): `page_template_parts` returns 0 rows.
6. anon (`set local role anon`): `select * from page_template_parts`
   raises permission denied.
7. As postgres, each raises a check violation:
   `update public.site_plan_pages set part_hours = '{"x": -1}' where id = '...e1'`;
   the same with `'{"x": "3"}'`, `'{"x": 10000}'`, `'{"x": null}'`,
   `'{"x": [5]}'`, `'{"x": []}'`, `'{"x": {"y": 1}}'` and `'[]'`; and
   `'{"x": 0, "y": 2.5}'` updates 1 row. (The
   `quote_pages.parts` check is probed inside check 8, where a copy
   exists.)
8. The full path, as Luke, in one transaction:
   - Setup (postgres, after the shared setup): quotes
     `ZZ TEST parts quote A` and `B` (`number` 'ZZ-TEST-PARTS-A' and
     '-B', `created_by` Luke, `site_plan_id` '...d1', status draft). Lines
     on A: Content (task Copywriting, hours 2, template a1, part b1, no
     assignee), Design (Design/Production, 6, a1, b2, `<staff>`),
     Development (Web Development, 4, a1, b3, Luke). `now()` is `<t0>`,
     the transaction's timestamp, which every row it writes shares.
   - `perform public.accept_quote('<A>', 'ZZ TEST parts')`, then
     `reset role` and read:
     - `quote_pages` for A: Home (depth 0, hours 7, parts Content 0,
       Design 3, Development 4), About (1, 5, parts 2, 3, 0), Contact (0,
       null, `[]`), Blog (0, null, `[]`), in that order.
     - Page tasks on A's project: 4, every one with `parent_id` null,
       `estimate_hours` null, `assignee_id` null, and no
       `work_item_assignees` rows.
     - Subtasks: "Home, Design" (3, `<staff>`, position 2), "Home,
       Development" (4, Luke, 3), "About, Content" (2, nobody, 1), "About,
       Design" (3, `<staff>`, 2). Contact and Blog have none. Their
       estimates add up to 12, the lines' hours.
     - `work_item_assignees`: `<staff>` on the two Design subtasks, Luke
       on "Home, Development".
     - The bell:
       `select user_id, title, body, link, actor_id, work_item_id, email from public.notifications where kind = 'assigned' and created_at = '<t0>'`
       returns exactly one row: `<staff>`, "You have 2 parts on ZZ TEST
       parts quote A", body "From quote ZZ-TEST-PARTS-A", link
       `/projects/<A's project>`, `actor_id` Luke, `work_item_id` null,
       `email` 'pending' and `read_at` null (the defaults, since neither
       person has a `notification_prefs` row for `assigned`; with one,
       `notify()` writes no row when the bell and the email are both
       off, sets `read_at` when only the bell is off, and writes
       `email` 'none' when only the email is off). Luke, the actor, has
       no row, and no row names a subtask.
     - `quote_decision` rows for the billing people are written too. They
       roll back with everything else, which is why acceptance never runs
       outside this transaction.
     - Every test page's `work_item_id` is its page task; the plan's
       `project_id` is A's project; `project_tasks` on it has the three
       task types, each with `hourly_rate` null (the lines have no rate).
   - As postgres, `update public.quote_pages set parts = '{}' where quote_id = '<A>'`
     raises a check violation (in its own
     `begin ... exception when check_violation then ... end` sub-block,
     which records that it raised).
   - As Luke, `accept_quote('<B>', ...)`: B gets 4 `quote_pages` rows; no
     new work_items and no new `assigned` row; the plan's `project_id` is
     unchanged.
   - As postgres, `delete from public.work_items where id = <About's page task>`:
     it and both its subtasks get `deleted_at`. Insert a page "Team"
     (template a1, `{}`).
   - As Luke, `make_site_plan_tasks('...d1')` returns 2. About and Team
     each get a page task (no estimate, nobody up) with "About, Content"
     (nobody) / "About, Design" (`<staff>`) and "Team, Content" (nobody) /
     "Team, Design" (`<staff>`), taken from quote A's lines, not B's;
     `created_by` Luke. The bell query now returns two rows, both
     `<staff>`: the new one reads "You have 2 parts on ZZ TEST parts
     quote A" (the project's name), body "From site plan ZZ TEST parts
     plan", `actor_id` Luke, the same link. It counts this run's two
     subtasks, not "Home, Design" from acceptance.
   - As postgres, add a part "QA" (b4, a1, position 4, hours 1, any task
     type). As Luke, `make_site_plan_tasks` returns 0, no subtask is
     added, and no `assigned` row is written.
   - As postgres, note quote A's `subtotal` and `updated_at`, then
     `delete from public.page_template_parts where id = '...b2'`: A's
     Design line still has `part_id` '...b2', and A's `subtotal` and
     `updated_at` are unchanged.
   - The RESULTS exception ends the block.
9. The client's path, on a fresh copy of the setup with check 8's quote A
   and its lines: as postgres with no role or claims set (`auth.uid()` is
   null, as on `/q/<token>`), `perform public.accept_quote('<A>', 'ZZ TEST parts')`.
   The bell query returns two rows, `<staff>` "You have 2 parts on ZZ
   TEST parts quote A" and Luke "You have 1 part on ZZ TEST parts quote
   A", both with `actor_id` null, `email` 'pending' and `read_at` null.
   The block ends in the RESULTS exception.
10. As Luke, on a fresh copy of the setup, `decline_quote` on a linked
    draft writes no `quote_pages`.

### 10.3 Types and build

- `generate_typescript_types` into `shared/types/database.ts`;
  `npx nuxt typecheck` shows no `error TS` lines.
- Grep the changed files and docs for the em dash character and British
  spellings; none.
- `grep -rn -e page_templates -e site_plan_pages -e template.rate -e "template's rate" app server shared`
  (leaving out `shared/types/database.ts`): no select names a template
  `rate` or a bare `hours` on `site_plan_pages` (`part_hours`, and
  `hours` inside `page_template_parts(...)`, are expected), nothing reads
  a template's rate, and no comment still says a line takes the
  template's rate.
- Restart `docket-dev` (the shared helper's exports changed).

### 10.4 Browser flows (docket-dev, Luke's Chrome)

1. **Settings, Page templates.** The table has no Rate column and the
   drawer no Rate field. New template: the drawer opens with Content
   (Copywriting), Design (Design/Production) and Development (Web
   Development), in that order, at 0. Name it `ZZ TEST parts Interior`;
   hours Content 1, Design 3, Development 2. Add a part, pick Creative
   Direction, see it named Creative Direction, then remove it. Move
   Development up and back down. Add template. The row shows "Content 1h,
   Design 3h, Development 2h" and 6h. Edit: two parts named Design refuse
   to save ("Two parts are both called Design."); a part with no task
   type refuses. Remove Development: the warning shows; Save; reload:
   gone. Add it back on Web Development, named Development. Make
   `ZZ TEST parts Home` with Content 2, Design 5, Development 4. Open the
   live Home template: Content, Design and Development at 0 on
   Copywriting, Design/Production and Web Development; Cancel. Edit
   `ZZ TEST parts Home` and remove all three parts: the empty list offers
   "Add Content, Design, Development"; click it, see the three rows at 0
   on those task types, then Cancel; reload: ZZ TEST parts Home still
   has Content 2, Design 5, Development 4.
2. **Canvas.** Site plans, New site plan for a new client
   `ZZ TEST parts client`, name `ZZ TEST parts plan`. Pages: Home
   (ZZ TEST parts Home), About, Services, Contact (ZZ TEST parts
   Interior), Blog (no template). Cards show 11h and 6h; Blog has no hours
   button. Hover Home's hours: "Content 2h, Design 5h, Development 4h".
   Click them: the drawer lists the three parts with template hours as
   placeholders. After typing Contact Content 0 below, Contact's hover
   reads "Content skipped, Design 3h, Development 2h". Type Development 6: the button turns primary, 13h. Type
   Content 0: Content strikes through, "Skipped on this page", 11h. The
   undo button on Content brings back 2h. "Use the template's hours"
   clears all. Type Contact Content 0. Change Services to ZZ TEST parts
   Home and back: its typed hours are gone. Save, reload: the typed hours
   persist. Full screen, open a card's hours: the drawer is above the
   canvas; Esc closes only the drawer; a second Esc leaves full screen.
3. **Pricing.** Add to a quote, New quote `ZZ TEST parts quote A`, a
   draft that is never sent or accepted. Price the plan: lines "1 x ZZ
   TEST parts Home page, Content" and so on, the Home template's parts
   first, then "3 x ZZ TEST parts Interior pages, Design" and "2 x ZZ TEST
   parts Interior pages, Content" (Contact skips Content); the toast says
   1 page was left out (Blog). Each line has the part's task type and the
   rate that task type fills in on a blank line (add a blank line and
   pick the same task type to compare; blank while the live task types
   have no usual rate). Type 90 on the Home template's Design line and
   price again: it keeps 90 and only its description and hours update.
   Delete the Interior Design line and price: it comes back with the task
   type's usual rate (blank today), not the 90 on the other
   Design/Production line. Delete the comparison line. Give every line
   Luke; Save.
4. **Preview.** Each line shows its page count ("2 pages" on Interior
   Content, "3 pages" on Interior Design). On the plan, type About
   Design 0, Save; reload the quote preview: Interior Design reads 2
   pages; Price the plan updates that line to "2 x ..., Design" with the
   new hours and adds no line. Type Development 0 on every Interior page
   (About, Services, Contact), Save, Price the plan: the toast is a
   warning saying 1 line no longer matches the plan, and the Interior
   Development line keeps its hours. Delete that line; clear the typed
   Development hours again, Save, and price once more to bring it back.
5. `/api/q/<token>` JSON: `pages` entries have only title, path,
   template, depth; lines carry no `part_id`, `template_id` or page hours.
6. **No Accept.** Accept is never clicked, on quote A or any other
   quote: it emails every billing person. Acceptance, its subtasks, the
   frozen copy and the summary bell are covered by 10.2 checks 8 and 9.
7. **Accepted document, read only.** Open the preview of v1's accepted
   Q-2026-003 "ZZ TEST quote A" and its `/api/q/<token>` JSON: it loads,
   lists its accepted pages as before, and its lines (no `part_id`) show
   no page count. The per-part counts on an accepted quote come from
   `quote_pages.parts`, which check 8 reads; the rest of that branch is
   checked by reading `loadQuoteDoc`, since no quote is accepted in the
   browser.
8. **Make tasks.** Projects, New project `ZZ TEST parts project` for
   `ZZ TEST parts client`; on it, Start a site plan. Pages: Home (ZZ TEST
   parts Home, Development typed 0), About and Contact (ZZ TEST parts
   Interior), Blog (no template). Save. The plan says 4 of 4 pages have
   no task yet. Make tasks for new pages: the modal copy from 8.2. The
   project gets 4 page tasks, each with no estimate and nobody up; Home
   has "Home, Content" and "Home, Design"; About and Contact each have
   Content, Design and Development; Blog has none. Nobody is up on any
   subtask (this plan has no accepted quote) and the bell stays empty.
   The project page lists each page task with its subtasks tucked under
   it, in part order. Open About: its subtasks in order with their
   hours, the About task with no estimate. Planner's Nobody up band lists
   the subtasks and none of the page tasks. Put Luke up on "About,
   Design": it leaves the band, Luke's Home screen lists it, and no bell
   rings (Luke is the actor). Delete Contact's page task on the project:
   its subtasks go with it; the plan shows 1 missing; Make tasks makes it
   again with its subtasks. Add a part to ZZ TEST parts Interior: Make
   tasks says every page already has a task. Remove that part.
9. **View as staff:** no Settings entry and no site plan screens, as
   before.
10. No PGRST201 in the network log on `/admin/page-templates`,
    `/site-plans/<id>`, `/quotes/<id>`, `/projects/<id>` and `/planner`.
11. **Phone width** (a 390px touch frame, on `ZZ TEST parts plan`). The
    canvas opens at 100% and scrolls. Tap a card: its action row shows
    without hover, with buttons at size sm like the toolbar's. Nest
    About under the page above it: it moves, and its path follows its
    new parent; move it out again and the path follows back. Add a page
    under Home and remove it. Do not Save these moves.

Cleanup (as postgres, one transaction, after a select shows only
`ZZ TEST parts` rows):

```sql
begin;
set local docket.purge = 'on';   -- lets the soft delete trigger hard-delete
delete from public.site_plans where name like 'ZZ TEST parts%';
delete from public.work_items where project_id in (select id from public.projects where client_id in (select id from public.clients where name like 'ZZ TEST parts%'));
delete from public.quotes where client_id in (select id from public.clients where name like 'ZZ TEST parts%');
delete from public.projects where client_id in (select id from public.clients where name like 'ZZ TEST parts%');
delete from public.page_templates where name like 'ZZ TEST parts%';   -- parts cascade
delete from public.clients where name like 'ZZ TEST parts%';
commit;
```

Then select again for leftovers (planner rows for the test tasks) and
remove only those, and run the notifications count from the top of this
section: it is 0.

## 11. Implementation packages

Precondition for all: site plans v1 is committed and pushed (met:
0725cae, 7a97da8, both v1 migrations applied); confirm its Vercel deploy
is live. Then migration 1 is applied, schema.sql mirrored (section 5) and
`shared/types/database.ts` regenerated (package `db`). File ownership is
disjoint; the one exception is `db-drop`, which regenerates
`shared/types/database.ts` again and runs strictly after everything else
is deployed. Each package ends with `npx nuxt typecheck` clean for its
files. The whole change is one item: one commit after 10.4, then a small
commit for `db-drop`.

| Key | Files | Depends on |
| --- | --- | --- |
| db | `schema.sql`, `shared/types/database.ts` (migration 1 applied) | none |
| core | `shared/sitePlan.ts`, `app/components/SitemapCanvas.vue` | db |
| templates-admin | `app/pages/admin/page-templates.vue`, `shared/types/app.ts` | db |
| plan-screen | `app/pages/site-plans/[id].vue` | core |
| quote-editor | `app/pages/quotes/[id].vue` | core |
| client-document | `server/utils/quoteDoc.ts` | core |
| docs | `docs/guide.md`, `CLAUDE.md`, `docs/status.md`, `docs/site-plans.md`, `docs/site-plan-parts.md` | none |
| task-lists | `app/pages/planner.vue`, `app/pages/projects/[id]/index.vue` | none |
| db-drop | `shared/types/database.ts` (regenerated after migration 2) | all, after deploy |

- **db**: apply section 4 migration 1; section 5; regenerate types; 10.1
  and 10.2.
- **core**: section 7 and 8.1, plus the canvas problems the phone-width
  check found (docs/status.md, "Phone width", 2026-09-15), fixed in the
  same rewrite of `SitemapCanvas.vue`:
  - **Selected-page action row.** The card buttons showed only on hover,
    so a phone could not reach them. Tapping or clicking a card selects
    it, and the selected card shows its actions in a row (add a page
    under it, add one beside it, nest, move out, remove), on touch and
    with a mouse.
  - **Nest and move out buttons.** A page can be moved without dragging:
    nest puts it under the page above it, and move out puts it one level
    up, beside its parent.
  - **The path follows moves.** A page moved by drag, nest or move out
    gets its path rebuilt under its new parent, the way a new page's
    path follows its title.
  - **100% zoom on phones.** The canvas no longer fits a phone's width
    at 40%; on a phone it opens at 100% and scrolls.
  - **sm buttons.** The toolbar buttons (and the action row) are size
    `sm`, big enough to tap, instead of `xs`.
- **templates-admin**: 8.5 (parts, defaults on Copywriting,
  Design/Production and Web Development, no rate) and 8.6.
- **plan-screen**: 8.2.
- **quote-editor**: 8.3 (a part line's rate from its task type).
- **client-document**: 8.4.
- **docs**: section 9 (status.md's verification paragraph after 10.4).
- **task-lists**: 8.7 and 8.8 (both read `parent_id`, which exists today).
- **db-drop**: the 10.1 pre-drop check, migration 2 (the four columns,
  `page_templates.rate` among them), regenerate types,
  `npx nuxt typecheck`.

## 12. Known limitations

- A part added to a template later, or a part a page stops skipping, adds
  no subtask to a page that already has a task (section 1).
- Removing a part leaves its id on quote lines. Accepted quotes keep
  their counts; a draft or sent quote's line for it shows no page count,
  and a later Price the plan adds a new line if the part is added again
  (a new part has a new id). Retire templates with "Offered on site
  plans" rather than removing parts on templates in use.
- Typed hours for a deleted part stay in `part_hours` and are ignored.
- Re-pricing never removes lines: a part every page now skips keeps its
  old line and hours until someone deletes it. The toast counts such
  lines and turns to a warning.
- One rate per task type on the project: `accept_quote` takes the highest
  quoted rate when lines for one task type differ, which now happens only
  when someone types a different rate on one (section 1).
- A part line prices blank while its task type has no usual rate (true
  of Copywriting, Design/Production and Web Development today), and a
  part on a retired task type always prices blank.
- The summary bell gives a count and a link to the project, not the
  pages. Whoever accepts on a client's behalf or runs Make tasks gets no
  bell for subtasks put on themselves (`notify()` never tells the
  actor).
- A subtask made by Make tasks has nobody up when the plan has no
  accepted quote on its project or the matching line names nobody.
- v1 lines (template, no part) show no page count and are not updated by
  Price the plan. Only test quotes have them.
- The seven live templates' parts start at 0 hours (decision 7). Until
  someone types hours in Settings, those templates price nothing and
  their pages get tasks with no subtasks.
- A quote accepted between migration 1 and the deploy makes page tasks
  without subtasks. v1's per-page hours overrides on the 9 test pages are
  not carried over. No template has a rate today, so dropping
  `page_templates.rate` loses nothing.
- Subtasks do not carry their part's task type (work_items has none), so
  time on "About us, Design" is logged under whatever task type the
  person picks.
- Renaming a page does not rename its task or subtasks (v1 rule).
- Acceptance and the summary bell are verified only in rolled-back SQL,
  never by an Accept in the browser, and the accepted document's
  per-part counts are checked in SQL and by reading `loadQuoteDoc`.

## 13. Open questions for Luke

Luke answered every question on 2026-09-15: Content on Copywriting,
page hours confirmed, rates from the task type, one summary bell per
person, and, after the spec was first written, that migration 1 seeds
the seven live templates with Content, Design and Development at 0
hours. They are decisions 1, 2, 5, 6 and 7 in section 1. No question is
open.
