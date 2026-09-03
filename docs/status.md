# Status

## Phase 2, wave 2c: AI assistant (2026-09-02)

Item 4 of `docs/phase-2.md`. Migration `ai_events`. Key:
NUXT_ANTHROPIC_API_KEY (Vercel and .env; Luke created a workspace-scoped
key on 2026-09-02).

- `server/utils/ai.ts`: `caller()` (team only, 200 calls a day each),
  `converse()` (Messages API by fetch, tool loop up to six rounds, every
  call logged to `ai_events`), `docketTools()` (search, report_rollup,
  report_time, project_budgets, unbilled, get_task, my_tasks, quote),
  all run through the caller's own Supabase client so RLS decides what
  the model sees. Models: claude-sonnet-5 for chat, drafting, quotes,
  digest; claude-haiku-4-5-20251001 for parsing time.
- Routes: `/api/ai/chat` (drawer, page context), `/api/ai/parse-time`
  (sentence to a proposal matched against the person's projects and
  task types), `/api/ai/draft` (task_description, client_reply,
  quote_intro, invoice_subject, tidy), `/api/ai/quote-draft` (brief to
  scope lines grounded in the client's history), `/api/ai/digest`
  (Monday 13:00 UTC Vercel cron, facts via service role, note by the
  model, Resend to admins).
- UI: `AssistantDrawer.vue` (Cmd+J, sparkle in the rail): suggestions
  per page, chat with links, "log: 2h Hills Bank design" makes a time
  entry card to confirm and save. Draft buttons on the task
  description, the comment composer (client reply), and the quote
  intro; "Draft lines" on the quote page proposes scope lines to insert.
- Nothing is written by the model; every write is a person clicking
  Save. Client names and amounts do go to the API.


## Phase 2, wave 2c: signage estimator (2026-09-02)

Item 10 of `docs/phase-2.md`. Migration `estimator`.

- The old tool (estimator.giganticdesign.com, Vue 2 not Angular) was
  read from its script and data endpoints. Model: a material is a roll
  or sheet (width x length in inches) with a cost and a markup_pct
  (925 = 9.25x); cost per sq in = cost / area. Layer rules: printable
  primary (media + ink 0.0016099/sq in) x material markup; cut vinyl
  x3.5; overlaminate x material markup; transfer tape and banner tape
  x default markup 9.25; substrate x2.5; mounting tape (height x tape
  width x columns) x1.25. `shared/estimator.ts` (`priceJob`,
  `describeJob`) reproduces it; a 3-up 24x36 sticker with overlam and
  transfer tape prices $189.49 in both. One deliberate difference:
  banner and mounting tape are multiplied by quantity (the old tool
  priced one unit).
- Tables `estimator_materials` (71 rows seeded with legacy ids) and
  `estimator_settings` (ink cost and the four markups); read by staff,
  edited with manage_settings on `/admin/estimator` (table, add/edit,
  pricing rules card). `quote_line_items.details` keeps the job.
- `/estimator` (rail: More): six material pickers, quantity, width,
  height, size presets, "Show our cost", details, a jobs list with a
  project total, Print, and for billing people "Add to quote" which
  inserts one flat line per job on a draft quote and opens it. The
  quote page has an "Add signage job" button that opens the estimator
  with the quote picked.
- Luke should compare three real jobs against the old tool before
  retiring it; material prices are as of 2026-09-02.


## Tasks: cards view (2026-09-02)

A co-worker asked for "card based, 5 across by client, then drill in".
The Tasks page has a List / Cards toggle (remembered per browser). Cards
shows a card per client (task count, projects, overdue and due-this-week
badges, next due), five across at xl. Clicking one shows that client's
tasks as cards grouped by project (status dot, title, due, priority,
assignees); a task card opens the task. Everyone, Completed, and search
apply to both views. Keyboard shortcuts stay on the list view.


## Phase 2, wave 2c: schedule (Gantt) (2026-09-02)

Item 2 of `docs/phase-2.md`. Migration `gantt_dependencies`:
`work_items.is_milestone` and `work_item_dependencies (predecessor_id,
successor_id)` with task_visible policies (clients read only).

- `/schedule` (rail: More, Schedule; search action): tasks with a due
  date as bars from start_on (or due_on) to due_on, by project or by
  person, zoom day (36 px/day, 6 weeks), week (10 px, 16 weeks), month
  (4 px, 40 weeks); Everyone switch; earlier/later/today; Print with
  print CSS. State in the URL. Drag moves (pointer events, snapped to
  days), edges resize, Shift-drag walks successors along. Dependency
  arrows drawn per group when both ends are on screen; a successor
  starting on or before its predecessor's due date gets a red arrow
  and a warning icon. Double-click a bar toggles milestone (a rotated
  square). Unscheduled card lists open tasks with no due date; Schedule
  puts them on today for ceil(estimate / 6) days.
- Person view: a capacity strip per week under each name from
  `capacity_weekly` (booked against base minus time off minus
  meetings), coloured by load, with the numbers in the tooltip.
- Task page: "Waits on" row lists predecessors, add from tasks in the
  same project, remove, and warns when the start is too early.
- Not built: proposing the earliest free week for an estimate.


## Phase 2, wave 2b: Google Calendar (2026-09-02)

Item 7 of `docs/phase-2.md`. Migration `google_calendar`. Code is in;
it needs Google credentials from Luke before it can be used.

- Own OAuth flow (not Supabase Auth's Google provider, which has no
  calendar scope): `/api/google/connect` sets a state cookie and sends
  the person to Google with `calendar.readonly` and `email`;
  `/api/google/callback` swaps the code, keeps the refresh token in
  `google_tokens` (RLS on, service role only for the token; the
  `calendar_connections` view exposes who is connected to the person
  and to manage_people), and runs a first sync.
- `syncCalendar()` in `server/utils/google.ts` refreshes an access
  token, calls freeBusy on the primary calendar for the next eight
  weeks, and replaces that person's `calendar_busy` rows (source
  'google'), which `capacity_weekly` already subtracts. Errors land in
  `last_error`.
- `/api/google/sync` (self, or another person with manage_people),
  `/api/google/disconnect`, and `/api/google/sync-all` for the nightly
  Vercel cron in `vercel.json` (10:00 UTC, bearer CRON_SECRET).
- `/account` page: connect, sync now, disconnect, last synced; admins
  see team connections; the rail's name links there.
- Luke's setup: in the Google Cloud project used for Workspace sign-in,
  create an OAuth client (web), add
  `https://docket-wine-one.vercel.app/api/google/callback` and
  `http://localhost:3000/api/google/callback` as redirect URIs, enable
  the Google Calendar API, and set NUXT_GOOGLE_CLIENT_ID and
  NUXT_GOOGLE_CLIENT_SECRET on Vercel (and .env locally). Also set
  CRON_SECRET and NUXT_CRON_SECRET on Vercel for the nightly job.
- Scheduling proposals (earliest free week for an estimate) wait for
  the Gantt in 2c; pushing task dates to calendars is not built.


## Phase 2, wave 2b: notifications and @mentions (2026-09-02)

Item 16 of `docs/phase-2.md`. Migrations `notifications` and
`reminders_in_app`.

- `notifications` (own rows, Realtime on) and `notification_prefs`
  (per kind: in_app, email off | instant | daily; missing rows mean
  bell on and email instant except comment, status, due). `notify()`
  is security definer and skips the actor and clients.
- Triggers: assignee insert (assigned), comment insert (mentioned for
  `work_item_comments.mentions`, comment or client_comment for the
  task's people), work_items update (status; client_decision), quotes
  update (accepted or declined, to billing people), invoices update
  (paid). `run_reminders` also drops timer and missing_time rows in
  the bell with email marked sent. `run_due_notifications` (cron, 9am
  Central) makes due tomorrow, today, and overdue rows.
- `run_notification_emails` (cron every 5 min): one email per person
  with pending rows, instant after a two-minute pause, daily at 8am,
  through Resend like reminders.
- UI: `NotificationBell.vue` in the rail (popover, unread badge,
  Realtime refresh, Mark all read), `/notifications` (full list plus
  the per-kind choices), phone menu entry. Task comments: type @ for a
  people picker (arrows, Enter, Tab), names stay in the text and ids go
  to `mentions`; mentions render highlighted.


## Page load speed (2026-09-02)

Luke: "it can take a long time for the pages to load." Two causes found
and fixed, uncommitted with the client-login work:

- Production HTML came from a Vercel serverless function. A cold start
  cost about two seconds before any HTML (measured 2.1 s then 0.2 s on
  /login, which fetches nothing), and then the page's queries ran in
  series on the server. Fix: `routeRules` in nuxt.config now render the
  signed-in app in the browser (`'/**': { ssr: false }`), so the shell
  is static on the CDN and the browser talks to Supabase directly
  (us-east-2). The public `/q`, `/i`, `/r` pages and `/login` keep SSR.
- Pages awaited five to eight `useAsyncData` calls one after another.
  A script turned each run of independent fetches into `const __adN =
  useAsyncData(...)` plus one `await Promise.all([...])`, then the
  original destructuring, across 19 pages; dependent fetches (project
  breakdown, quote and invoice docs) stay after their inputs.
  `useWorkStatuses()` is awaited after the group since it resolves to
  an object.
- Dev measurements (not representative of production, which serves a
  prebuilt bundle): project page TTFB 7.9 s before, 6 ms after; an
  in-app navigation to Clients renders in about 50 ms. Confirm on the
  live site after the next push.


## Phase 2, wave 2b: client logins (2026-09-02)

Item 5 of `docs/phase-2.md`. Migration `client_logins`.

- Role `client` (built in) with `profiles.client_id`; a check keeps the
  two in step. `is_client()` and `my_client_id()` are security definer.
  `handle_new_user` reads role and client_id from the invite metadata
  and skips the agency-domain rule for clients.
- What a client can read: their own client row and projects; quotes
  (not drafts) with lines and sitemap; invoices in sent or paid with
  lines and payments; Harvest invoices; tasks on their projects that
  were shared for review (`task_visible` handles the client case),
  with only client-visible comments and uploaded files. Every other
  read_all policy now carries `not is_client()`. Clients cannot create
  tasks, time, expenses, time off, files, or saved reports; comments
  they add must be client-visible on a visible task.
- Invite: `server/api/clients/invite.post.ts` (needs manage_billing)
  calls `auth.admin.inviteUserByEmail` with role, client_id, and name
  in the metadata; Supabase sends the invite email. For an existing
  contact it sends a magic link instead. Client page has a Contacts
  card (invite, send link again, deactivate).
- Sign in: the login page gains "Email me a sign-in link"
  (`signInWithOtp`, existing users only). `middleware/portal.global.ts`
  sends clients to `/portal` and keeps staff out of it; app.vue renders
  no staff chrome for clients; tours skip them.
- `projects.client_visible` (migration `project_client_visible`, switch
  on the project form, badge on the project page): on, every task on
  the project shows on the portal read-only, grouped by project with
  status and due date; off, only tasks shared for review. `task_visible`
  covers both for clients.
- `/portal`: waiting-on-you and balance strip, retainer burn (current
  period plus the two before, from `retainer_status()`, which now
  returns only the caller's client's rows when the caller is a client;
  migration `retainer_status_for_clients`), tasks for review, quotes,
  invoices, each opening the existing public page (`/r`, `/q`, `/i`) so
  approving, accepting, and paying stay as built. Staff with the
  billing permission preview it from the client page (View as client,
  `/portal?as=<client id>`).
- Review page (`/r/<token>`): a signed-in client contact needs no name
  box ("Commenting as ..."), and `reviewer(event, typedName)` in
  `server/utils/reviewDoc.ts` stores their profile id and name on
  comments and decisions; the bare link still works with a typed name.
- Supabase Auth: Email provider is enabled (checked 2026-09-02); Luke
  to turn "Allow new users to sign up" off. Google stays for staff.
- Live timings after the push (curl, time to first byte): /login,
  /projects, /tasks all about 0.2 s on repeated tries; before, 2.1 s on
  a cold start.


## Phase 2, wave 2b: roles and permissions (2026-09-02)

Item 8 of `docs/phase-2.md`. Migrations `roles_manager_contractor`
(enum values), `permissions`, `budgets_hide_money`.

- Roles are rows in `roles` (key, label, description, is_builtin,
  position), not an enum; migration `custom_roles` converted
  `profiles.role` and `permissions.role` to text with foreign keys and
  dropped `user_role` (a 'contractor' value had been added and removed
  in the same session; Luke: "we don't really have contractors").
  Built-in: admin, manager, staff. Admins add their own roles on
  /admin/permissions (New role, rename, delete when nobody has it;
  `protect_roles` trigger guards built-ins and roles in use). A client
  role will be added there with client logins.
- `useRoles()` reads the table for the People form and the matrix. `permissions`
  (role, key) holds what a role may do; admin needs no rows.
  `has_permission(key)` is security definer; `is_admin()` stays the
  short circuit. Keys and defaults are listed in schema.sql above the
  table and in `PERMISSIONS` / `ROLES` in `shared/types/app.ts`.
- Policies moved off is_admin(): reference data (manage_reference),
  expense categories, statuses, invoice settings, reminders, audit
  (manage_settings), batches, invoices, quotes, retainers, Harvest
  history (manage_billing), profiles, availability, time off
  (manage_people), other people's time and expenses (see_all_time),
  calendar busy (see_capacity). Tasks, assignees, comments, and files
  use `task_visible(id)`: see_all_tasks, or made it, or assigned.
  Deleting any task or comment needs manage_tasks. With every offered
  role holding see_all_tasks the task visibility rule is dormant until
  someone unticks it.
- Money: `time_detail.amount` is null without see_money, so the report
  functions show 0 and the UI hides money; `project_budget(s)` return a
  null amount. A person's own rate_snapshot stays readable on their rows
  through the API (column level), noted on the page.
- Billing RPCs (create_billing_batch, void_billing_batch,
  create_invoice, void_invoice, create_quote) and the profile guard
  now check has_permission instead of is_admin (rewritten in place via
  pg_get_functiondef; schema.sql mirrors the result).
- UI: `useCurrentUser().can(key)` from the permissions rows for the
  person's role; `middleware/can.ts` with `definePageMeta({ middleware:
  'can', permission })` on every gated page (the old `admin` middleware
  remains for the matrix). Sidebar, search actions, shortcuts, settings
  strip, ReportRollup, client and project pages, expenses, time off,
  and task delete buttons all key off can(). People form offers all
  four roles. `/admin/permissions` is the matrix (admins only).
- Verified with SQL impersonation (set_config + set local role
  authenticated, rolled back): staff sees own time only, all tasks, no
  invoices, amounts visible; a role with nothing ticked (tested by
  flipping a staff profile to the unused contractor value inside the
  rolled-back transaction) sees own time, only the 7 tasks assigned, no
  comments on others, no amounts, budget money null.


## Phase 2, wave 2a: feature walkthrough (2026-09-02)

Item 3 of `docs/phase-2.md`. driver.js 1.8 (`npm install driver.js`).
Migration `profile_tours_seen`: `profiles.tours_seen jsonb` maps a tour
id to "done <iso>" or "skipped <iso>"; staff can update it (the
protect trigger only guards role, rate, active, email).

- `app/composables/useTour.ts` holds the tours as data (id, title,
  route match, steps with a `data-tour` selector). Steps whose element
  is missing are dropped. `maybeStart()` runs from app.vue on every
  route change: first the "Getting around" tour, then the page's own
  tour on the next visit, each once per person. Every popover has Skip
  tour, Back, Next (Done on the last), and a close x; skipping is
  recorded too, so it never nags.
- Tours: Getting around (rail, search, help, theme), Logging time
  (week strip, pace line, New entry, play button), Tasks (group by,
  Everyone, first row, New task), Billing for admins (New batch, list).
- The rail has a Help entry above the theme toggle: replay the current
  page's tour, replay Getting around, or open the keyboard shortcuts
  sheet (its open state is now `useState('shortcut-sheet-open')`).
- Popover styling in `main.css` uses the app's color tokens.
- Verified in the browser: auto-start, all five steps of Getting
  around anchored correctly, tours_seen saved, Tasks tour auto-started
  on the next page and Skip closed it. Luke's tours_seen reset to {} so
  he sees them fresh.


## Phase 2, wave 2a: power user shortcuts (2026-09-02)

Item 9 of `docs/phase-2.md`. No migration.

- `useShortcuts(scope, defs)` in `app/composables/useShortcuts.ts` wraps
  Nuxt UI's defineShortcuts (same key syntax: `meta_k`, `g-t` chords,
  `arrowleft`), never fires while typing in a field, and keeps a
  registry in `useState('shortcut-registry')` so the sheet lists what
  is active on the current page. A page's set unregisters on unmount.
- `AppShortcuts.vue` (mounted from app.vue): Everywhere set, Cmd+K
  search, N new task, T stop the running timer or go log time, G then
  T/K/P/C/E (Time, Tasks, Projects, Clients, Expenses), admins also G
  then R/I/S (Reports, Invoices, Settings), and "?" for the sheet modal.
- Tasks page: J/K move a focus bar through the rows in the order shown,
  X selects (check mark replaces the grip; a bottom bar counts the
  selection), E or Enter opens, S/A/P open the status, assignee, or
  priority menu anchored on the focused row, D edits the due date,
  Delete asks then deletes, Escape clears. Status, priority, assignee,
  and delete apply to the whole selection when the focused row is part
  of it (`targets()`); the floating menu's pick/toggle now update by
  id list.
- Time page: arrows move a day (left/right) or a week (up/down), Enter
  opens a new entry, "." copies the most recent earlier day's entries
  onto the selected day (`copyPreviousDay`).
- SearchPalette no longer registers Cmd+K itself; AppShortcuts does.


## Invoice detail level (2026-09-02)

Luke: "there are times when we'd like to summarize the work done instead
of a large line-item list." `create_invoice(p_client_id, p_batch_id,
p_detail)` now takes `task` (one line per project, task type, and rate,
as before), `project` (one line per project, hours by task type in the
text, quantity 1), or `summary` (one "Design and development, <period>
(n hours)" line plus one expenses line). Migrations
`invoice_detail_level` and `invoice_detail_hours_text` (`hours_text()`
prints 1.25, 0.5, 8). The batch page asks which on Create invoice; lines
stay editable on the invoice. Verified with a Visit Galena test batch
in all three modes; batch and invoices deleted, counter reset to 1.


## Phase 2, wave 2a: search (2026-09-02)

Item 1 of `docs/phase-2.md`. Migrations `search` and
`search_status_label`.

- Generated `search tsvector` columns ('simple' config) with GIN indexes
  on work_items (title, description), projects (name, code), clients
  (name), quotes (number, title), invoices (number, subject), and
  work_item_comments (body).
- `search(p_q, p_kind, p_limit)`: security invoker, every word must
  match with the last as a prefix, quote and invoice numbers also match
  by substring; returns kind, id, title, subtitle, rank. Comments come
  back as kind 'comment' with the task id. Task subtitles carry the
  status label.
- `SearchPalette.vue`: UModal plus UCommandPalette, mounted from
  `app.vue`, opened by Cmd+K (`defineShortcuts`), the search button at
  the top of the rail, or the phone bar. State is `useState('search-open')`.
  Debounced 150 ms, results grouped by kind, prefixes t: p: c: q: i:
  narrow the kind, Recent (last ten opened, localStorage) and Actions
  (New task, Log time, Go to pages) show on an empty term. `/tasks?new=1`
  and `/time?new=1` open the create dialogs.
- Verified in the browser: typing, grouping, click to open, Recent,
  prefix filter, and ArrowDown plus Enter through dispatched keyboard
  events (the browser tool's own key presses did not reach the list).


## Phase 2, wave 2a: sidebar rework (2026-09-02)

Item 14 of `docs/phase-2.md`. `AppSidebar.vue` now has two groups: the
daily five (Time, Tasks, Projects, Clients, Reports for admins) and a
"More" group under a divider (Expenses, Time off, then Quotes, Capacity,
Billing, Invoices for admins). Settings is one gear at the bottom of the
rail, admin only, leading to `/admin`.

- `/admin` (`app/pages/admin/index.vue`) is a card per settings page.
- `SettingsNav.vue` is a strip across the top of every `/admin` page,
  rendered from `app.vue` when the route is under /admin: People,
  Projects, Task statuses, Task types, Expense categories, Invoices and
  quotes, Imports.
- `/admin/imports` links the Harvest and ClickUp pages, which keep their
  URLs and highlight Imports in the strip.
- Staff rail: Time, Tasks, Projects, Clients, More: Expenses, Time off.
- Phone slideover mirrors the groups and the Settings entry.


## Phase 2: Mac desktop shell (2026-09-02)

`desktop/` is a Tauri 2 app that opens the live site in a webview. Luke
asked for it so dropped folders carry real paths (a browser only gives
the name). See `desktop/README.md` for building and signing.

- Rust command `share_url(path)` maps `/Volumes/SHARE/...` to
  `smb://host/SHARE/...` from the `mount` table (unit tests in
  `src-tauri/src/lib.rs`). Opener plugin opens smb, afp, file links and
  `/Volumes` paths in Finder.
- Web side: `useDesktop()` (isDesktop, shareUrl, open) and
  `app/plugins/desktop.client.ts`, which turns Tauri's drag-drop event
  into a `desktop-drop` DOM event on the element under the cursor and
  routes smb/afp/file link clicks to Finder. ProjectForm and the task
  Attach dialog listen with `@desktop-drop` and take the full mapped
  path; in a browser the name-only drop keeps working.
- `capabilities/default.json` grants the remote origin (the Vercel URL
  and localhost:3000) access to the shell's commands. The window uses a
  Safari user agent so Google sign-in accepts the webview.
- Rust installed via rustup (user-local) on Luke's machine on
  2026-09-02. Unsigned builds run locally; team distribution needs an
  Apple Developer account for signing and notarization.


## Phase 2, wave 2a: rollups on detail pages (2026-09-02)

Item 13 of `docs/phase-2.md`. No migration; everything reads the
report functions from the reports step.

- `ReportRollup.vue`: the strip from the report page for one client,
  project, or person (props from, to, client, project, person). Calls
  `report_rollup` now and for the same days last year; hours for
  everyone, money only for admins; "Full report" link opens `/reports`
  with the same filters.
- Client page: This year strip; admin Billing card (invoiced and paid
  this year, outstanding) from Docket plus Harvest invoices; projects
  table gains Hours and Budget used columns from `project_budgets()`.
- Project page: This year strip and a "Where the time went" card,
  lifetime by task type and by person with share bars, plus the date of
  the last entry.
- Time page: a line under the week strip, "This week h:mm of target,
  n% billable. This month h:mm, n% billable", target from
  `availability` (30 when unset).
- People page: a This month column per person with billable share.
- Verified in the browser on Hills Bank, its Retainer (2/26) project,
  the Time page, and People. Typecheck passes.


## Phase 2, wave 2a: reports in the Harvest layout (2026-09-02)

Items 11 and 12 of `docs/phase-2.md`. Migration `harvest_style_reports`
adds three security-invoker SQL functions (staff would see their own
time; the page is admin only):

- `report_time(from, to, group, client, project, person, task, billable)`
  returns key, label, sublabel, hours, billable_hours, billable_amount,
  uninvoiced_amount per group. group is client, project, task, person,
  day, week, or month. Live rows come from `time_detail` (frozen rates;
  uninvoiced = billable and not `is_locked`, which the Harvest import set
  from Harvest's billed flag), archive months from
  `harvest_archive_monthly` with no uninvoiced amount. The data splits
  cleanly: archive through 2025-12, live from 2026-01.
- `report_expenses(...)` is the same shape for expenses with category in
  place of task.
- `report_rollup(...)` returns one row of totals (hours, billable hours,
  billable amount, uninvoiced, expenses) under the same filters.

Pages:

- `/reports` (`app/pages/reports/index.vue`) is the new report. Time or
  Expenses; timeframe bar (Week, Semimonth, Month, Quarter, Year, Custom,
  with arrows); rollup strip with "vs last year" (an in-progress period
  compares to the same days last year, labeled "to date"); an SVG bar
  chart by day, week, or month depending on the span (billable stacked
  over total); tabs Clients, Projects, Tasks (Categories for expenses),
  Team; filters for client, project, task or category, person, and
  billable. Clicking a row drills down (client to projects, project to
  tasks, task to team, team to projects) and the filters show as chips
  with a Clear. All state is in the URL. Export CSV downloads the table
  shown with a totals row.
- The old builder moved to `/reports/detailed` unchanged apart from a
  title and back link; saved reports still work there.


## Phase 2, wave 2a: project server folder (2026-09-02)

First 2a item from `docs/phase-2.md`. Migration `project_server_folder`:
`projects.server_path text` and
`invoice_settings.project_folder_template text`.

- New admin page `/admin/project-settings` (sidebar: Project settings)
  holds the template; the column stays on the one-row `invoice_settings`
  table. The template
  (`{client}`, `{code}`, `{name}`; a missing value drops out with its
  space, doubled slashes collapse). `fillFolderTemplate()` in
  `app/utils/folder.ts`. Luke still needs to set the real template.
- ProjectForm has a "Server folder" field. New projects prefill it from
  the template as client, code, and name change; a hand edit stops the
  prefill. "Choose" opens the browser folder dialog and "drop the
  folder here" works too; both only give the folder's *name* (browsers
  hide absolute paths), so the name goes under the client's folder from
  the template (`folderBase()`): a template that stops at `{client}` is
  used whole, one naming the project folder contributes its directory.
  Gigantic's folders are per client, then free-form, so the roots stop
  at `{client}`. The setting holds one root per line (`folderRoots()`),
  one per volume; with more than one the project form shows a volume
  picker (CLIENTS, WEB). Saved for real on 2026-09-02:
  `smb://OVEN._smb._tcp.local/CLIENTS/{client}` and
  `smb://OVEN._smb._tcp.local/WEB/{client}`.
- Project page shows a Server folder card with Copy and, for smb://,
  afp://, or file:// paths, Open (`folderHref()`).
- Task Attach dialog prefills the link path with the project folder plus
  a slash; Choose or drop a file appends its name.
- Verified in the browser with a test project and task, both deleted.
  `npm run typecheck` passes.


Last updated: 2026-09-02, local session, step 7 done and the 2026 Harvest sync run.

## Deployed (2026-09-02)

Production is on Vercel, project `docket` under the Gigantic Design
Company team, deployed with `vercel --prod` from this branch (the repo's
default branch, so Git pushes deploy too). Public URL:
https://docket-wine-one.vercel.app. The team-named alias and the
per-deployment URLs sit behind Vercel's deployment protection (Vercel
SSO), so give clients and staff the wine-one URL until a custom domain
(docket.giganticdesign.com) is added; that also fixes the Resend sender
domain. The five env vars from .env.example are set on Vercel. Vault
`app_url` now points at the wine-one URL so cron emails link there.

Signed-out checks on the live URL: /login 200 with the Google button,
protected pages redirect to /login, /api/i/<bad token> 404 and a real
token 200 (service role env var works), send route 403. Luke added
https://docket-wine-one.vercel.app/callback to Supabase Auth Redirect
URLs and Google sign-in worked in his Chrome: /time, /billing
(unbilled total renders), /invoices, /projects (budget bars), and
/admin/harvest all load with data, and a "Sync project details" dry run
from the live server fetched 1,021 Harvest projects in about 30 s, so
the Harvest env vars are right and the function limit is not 10 s. A
receipt-heavy expense month is still the slowest call; if one ever
times out, run that sync locally.

## Where things stand

Step 1 (auth, profiles, clients, projects, tasks) is signed off.

Step 2 (time entries + timer + week view) is built on
`claude/docket-schema-auth-i7jyom` and verified in a real browser as luke@.
Shape chosen with Luke: Harvest's day view with a Monday-to-Sunday strip,
not the week grid. Pieces:

- `/time` is the home page (`/` redirects). Week strip with per-day and
  week totals, selected day lists entries, prev/next/Today, `?date=` in
  the URL.
- `TimeEntryForm`: project (Client / Project), task (from project_tasks,
  active only), notes, hours as h:mm or decimal, billable switch defaulting
  from the task and forced off for non-billable projects. New entries have
  a Start timer button next to Save.
- `useTimer`: Harvest-style duration timers. `hours` accumulates on stop,
  started_at is set only while running. Starting a timer stops the running
  one first; a 23505 from the partial unique index (another tab or device)
  is resolved by reloading, stopping, and retrying once. Verified by
  starting a timer in SQL behind the tab's back, then starting another in
  the UI.
- Banner at the top when the running timer is on a day other than the one
  shown, with Go to day and Stop.
- Locked entries (billing batch) show a lock and lose their buttons.
- `/time` is rendered client-only (routeRules in nuxt.config) so "today"
  and the ticking counter use the browser clock, not Vercel's UTC.
- `shared/types/database.ts` is now the generated Supabase types (from the
  MCP `generate_typescript_types` tool). App helpers (`BILLING_METHODS`,
  `BillingMethod`, `UserRole`) moved to `shared/types/app.ts`. Regenerate
  database.ts after every schema change.

Conventions copied from the Harvest account settings: week starts Monday,
time shows as h:mm, timers are durations not clock-in/out, notes optional,
no rounding.

## Supabase

- Project: `docket`, ref `cnnrtsnevmjqhfgpolfo`, org Gigantic Design Co., free tier, Postgres 17.
- `schema.sql` applied as migrations `initial_schema` and `lock_down_function_grants`.
  Object counts match the local check exactly. Security advisor is clean apart
  from `is_admin()` being callable by signed-in users, which RLS requires.
- Auth: Google provider on, self-signup off (done by Luke in the dashboard).
- Users created directly in `auth.users` (no invite email, Google links by email):
  luke@giganticdesign.com is admin, sean@giganticdesign.com is staff.
- RLS smoke test run on the real project as both users: all pass.
- `.env` values: `SUPABASE_URL=https://cnnrtsnevmjqhfgpolfo.supabase.co`,
  `SUPABASE_KEY` is the publishable key from Project Settings > API.

## Verified in a real browser so far (Luke, local dev server)

- Google sign-in works, admin badge shows, redirect URL is configured.
- Created client "Cinc", project "Website" ($140/h), task "Task 1".
- Bug found and fixed (commit 2c3569f): pages reused stale data on
  client-side navigation, so the project settings page never showed the
  new task. Every useAsyncData now passes the `fresh` helper from
  `app/utils/fresh.ts`. Use it on every future fetch too.
- Project Website > Tasks: switched Task 1 on, saved, "Tasks saved" toast,
  back arrow to the project page shows Task 1 at "Project rate". No console
  errors. (Verified via Claude driving Chrome as luke@.)
- Profile full names fixed in SQL: "Luke David" (admin), "Sean Murphy"
  (staff), taken from Harvest's user list. Header and home page show the
  new name.
- Staff UI checked by temporarily setting luke@ to role staff in SQL (Sean
  was not available to sign in), then restoring admin. As staff: clients,
  projects, project page with its task list, and client page all render;
  no New client, New project, Edit, or Tasks buttons; no Tasks header link;
  no admin badge; /admin/tasks and /projects/<id>/settings both redirect
  to the home page. Restored to admin afterwards and confirmed in the header.

## People page (added 2026-09-02)

`/admin/users` (Admin menu > People): name, role, default rate, hours per
week, active flag, edit through `UserForm`. Hours per week writes
`availability` history (closes the current row, opens one from today).
You cannot change your own role or deactivate yourself.

"Add person" creates the account through `server/api/people.post.ts`,
which uses Supabase's Admin API (`auth.admin.createUser` with the email
confirmed so Google links on first sign-in) and lets the profile trigger
build the profile. That route is the one place the project secret key is
used: set `SUPABASE_SECRET_KEY` (Project Settings > API keys > Secret
keys) in `.env` and on Vercel. Without it the button returns a clear
error. No email is sent; tell the person to sign in with Google.
Verified by creating and deleting a throwaway account.

## Step 12: quoting (2026-09-02)

The last item on the original build order. Migration `quoting`, mirrored
in schema.sql; schema TODO 6 resolved, TODO 2 (no e-signature, a typed
name and email are the record) restated.

- `quotes` gains public_token, subtotal (trigger from the lines),
  accepted_email, declined_at / _by / _reason, updated_at.
  `quote_line_items.amount` is hours x rate when both are set, otherwise
  the typed flat amount (trigger `quote_line_amount`). Numbers read
  Q-2026-001 from `invoice_settings.next_quote_number`; that row also
  holds `quote_valid_days` and `quote_terms` (Invoice settings page,
  Quotes card).
- `create_quote(client, title)`, `accept_quote(quote, name, email)`:
  creates the project (name = title, hourly, budget_hours = summed line
  hours, budget_amount = subtotal) and assigns each line's task type to
  it at the quoted rate; `decline_quote(quote, name, reason)`. Both
  decision functions allow the service role (no session) or an admin.
- `/quotes` (admin, Manage menu): out-with-clients and won-this-year
  totals, filters, New quote (client + title). `/quotes/[id]`: title,
  valid until, intro, terms; scope lines with task type, hours, rate,
  amount (flat when hours or rate is blank); a sitemap of pages (nested
  with Add child, path, template, "priced by" a scope line, which then
  shows its page count); Save upserts lines and nodes by id; Preview,
  Copy link, Send (email via `server/api/quotes/send.post.ts`, moves to
  sent), Mark as sent, Accept and Decline on the client's behalf, Delete
  draft. Accepted quotes link to their project. Client page has a Quotes
  card.
- Public `/q/<token>` (excluded from the auth redirect; service-role
  routes under `server/api/q/`): `QuoteDocument.vue` on a white sheet
  with Download PDF (print), then an accept form (full name, optional
  email, "I accept" tick) and a decline option with a reason. Expired
  quotes (sent, past valid_until) show a note instead. The quote's
  author is emailed on accept or decline.

Verified as luke@ and with curl: created Q-2026-001 for Dupaco, two
scope lines (40 h x $150, $500 flat) and a two-page sitemap saved with
subtotal $6,500; the public route returned them with no session, bad
name 400; accepting from the public route made the project with
budget_hours 40 and budget_amount 6,500, set accepted_by and email, and
a second accept was refused. Test quote and project deleted afterwards.

Not built: line-item discounts or tax on quotes, converting a quote's
sitemap into tasks, duplicating a quote, PDF attachment on the email.

## Step 11: client review links, editable statuses, ClickUp-style list (2026-09-02)

Migrations `client_review`, `work_statuses_table`, mirrored in schema.sql.

Client review link:

- `/r/<public_token>` (excluded from the auth redirect, service-role
  route `server/api/r/[token].get.ts` via `server/utils/reviewDoc.ts`):
  the task title, description, due date, a readable status, uploaded
  files with one-hour signed URLs (server links never appear), and only
  comments marked `visible_to_client` plus all client comments. Clients
  give a name (remembered in localStorage), comment, approve, or request
  changes; changes need a note. `comment.post.ts` and `decision.post.ts`
  store the comment with author_id null and author_name, record
  client_decision / _by / _at on the task, move it to the status flagged
  is_return on "changes requested", and email the task's assignees and
  creator through `server/utils/notify.ts` (Resend key from Vault).
- Task page: "Share for review" shows the link with Copy, emails it
  (`server/api/tasks/share.post.ts`, any team member, reply-to the
  sender) and can set the status flagged is_client_review; shared_at is
  kept. A banner shows the client's decision. Team comments have a
  "Visible to client" checkbox and a "Client can see" badge.
- Verified with curl and in the browser: GET with no session returns the
  doc, bad token 404, client comment posted and emailed, missing name
  400, "request changes" moved the task to Back in our court and recorded
  the decision; the internal comment stayed hidden.

Editable statuses (Luke's ask):

- `work_statuses` table replaces the enum: key, label, color, position,
  and flags is_done (completed_at, hidden from open lists and capacity),
  is_paused (hidden from capacity), is_client_review, is_return,
  is_active. `work_items.status` is text with a FK (on update cascade).
  The trigger and the capacity view read the flags. Seeded with the nine
  ClickUp statuses.
- `useWorkStatuses()` (awaited in setup, cached in useState) feeds every
  status menu, label, and color. `/admin/task-statuses` (Settings) adds,
  edits, reorders, deactivates, and deletes unused statuses.

Task list rebuilt like ClickUp (`/tasks`): collapsible groups by status,
project, or due date; a coloured dot, title, project, stacked assignees,
due (click to edit), priority, estimate, status; one shared floating
menu for status, priority, and assignees (tick people on and off), so
rows stay cheap; drag a row onto another group to change its status,
move it to that project, or shift its due date. The task page also has a
Project picker. The "ClickUp import" catch-all projects were renamed
"General" and are hidden in row subtitles. Assignees on the task page
stack with a "+N" past five.

## Step 10: task management (2026-09-02)

Luke reframed the scope: ClickUp is being canceled, so Docket takes over
tasks. Client review links are step 11 (a link is enough, but clients
may comment). Migrations `work_items` and `work_item_file_links`,
mirrored in schema.sql.

Data:

- `work_items` under projects: title, description, status (`work_status`:
  new, ready_to_start, in_progress, internal_review, client_review,
  back_in_our_court, sent_to_print, on_hold, completed, the flow the
  ClickUp workspace used), priority, start, due, estimate_hours,
  public_token (for step 11), clickup_id, created_by, completed_at
  (trigger `work_item_touch` keeps it and updated_at).
- `work_item_assignees` (many per task), `work_item_comments`
  (author_id nullable plus author_name, so a client can post from a
  review link later), `work_item_files`.
- Files are either `kind = 'upload'` (a copy in the private `work-files`
  bucket, 25 MB, path <task id>/<uuid>.<ext>) or `kind = 'link'` (a path
  or smb:// link to the file on the office server, nothing copied). A
  co-worker asked for the link option so files are not stored twice;
  links cannot be opened from outside the office or from a review link,
  uploads can. The attach dialog offers both, link first (Luke's ask).
  A link row has an "Upload a copy to share" action: pick the file, the
  row flips to an upload (path, size, type set) and keeps the server path,
  shown as "Shareable copy, also on the server: ...". Anyone on the team
  may do that (`team_update` policy, migration
  `work_item_files_team_update`). Verified: linked convert-me.pdf, then
  converted it with a real upload; the object landed in the bucket and
  the row kept the smb:// link.
- `time_entries.work_item_id`: an entry can be logged against a task.
- `capacity_weekly` books from work_items due that week (estimate split
  across assignees, completed and on_hold excluded) and
  `clickup_assignments` is dropped.
- RLS: the whole team reads and writes tasks and assignees; delete is the
  creator's or an admin's; comments and files are edited by their author
  or an admin. Storage: team reads and uploads, uploader or admin deletes.
- Labels live in `shared/types/app.ts` (WORK_STATUSES, WORK_PRIORITIES,
  workStatusLabel, workStatusColor).

App:

- `/tasks`: mine by default, Everyone switch, Completed switch, status
  filter, search; grouped Overdue, This week, Later, No due date; inline
  status select per row; New task.
- `/tasks/[id]`, laid out like ClickUp at Luke's request: breadcrumb
  (client, project) and Log time / Delete up top; status select; the
  title as an inline input; a property grid edited in place (assignees
  multi-select with initials, priority, start and due dates, estimate,
  logged, created) that saves on change; description as an inline
  textarea saving on blur; files (Attach: link to server file or upload a
  copy; open, copy path, upload a copy to share, remove); and an Activity
  column on the right with comments and a composer pinned at the bottom
  (Cmd+Enter posts). No edit modal; WorkItemForm is only for creating.
- Project page: Tasks card (open count, Show completed, New task). The
  billing task-type card and button are now labeled "Task types".
- Capacity: drill-down lists the person's tasks due that week with the
  split estimate; no ClickUp button.
- `/admin/clickup` + `server/api/clickup/import.post.ts`: one-time import
  of ClickUp's open tasks into work_items (dry run first). List -> client,
  task name -> the client's project (else a "ClickUp import" project is
  made for the client), assignees by email, statuses mapped. Keyed on
  clickup_id so it can be re-run. Untested with real data: no token.
- `WorkItemForm.vue` is the task form; `TaskForm.vue` stays the billing
  task-type form. Time entry form takes an optional workItem prop.

Navigation is now a Supabase-style sidebar (`AppSidebar.vue`, replaces
AppHeader): an icon rail that widens on hover with sections Work,
Accounts, Manage, Settings; theme toggle and sign out at the bottom; a
top bar with a slide-in menu on phones. `app.vue` offsets the page by the
rail width; print CSS hides the rail.

Verified as luke@: created a task on a Dupaco project from /tasks (title,
project, assignee, due, estimate, description), landed on it, changed
status to In progress, posted a comment, attached an smb:// server link
(shown as "On the server: ..." with copy), Log time opened /time with the
project and notes prefilled and the saved entry carried work_item_id,
capacity booked 3:00 for that week, the project page listed the task;
ClickUp import page reports the missing token cleanly. Test task and
entry deleted. Sidebar checked collapsed, expanded, dark, and on a
390px viewport.

Not built (step 11 material): client review link page under
/r/<token> with comments as a named client, email notifications on
status change or comment, task templates, subtasks, drag ordering
(`position` exists), calendar sync.

## Step 9: capacity + ClickUp sync (2026-09-02)

Built the same day as step 8. Migration `capacity_clickup`, mirrored in
schema.sql; schema TODO 5 is resolved.

- `clickup_assignments` is now keyed on (task id, ClickUp user id) with
  a `list_name` column, because ClickUp tasks there carry several
  assignees. Estimates are split evenly across the Docket people on a
  task; guests and client staff are dropped.
- `capacity_weekly` counts time off on weekdays only and gained
  `booked_tasks`. Available = weekly hours (People page, default 30
  since 2026-09-02; it was 40)
  minus time off minus meetings (calendar_busy, not synced yet).
- `/capacity` (admin): people x weeks (2 back, 8 ahead). Past weeks show
  logged / available, this week and later show ClickUp booked /
  available, with a bar that goes warning over 85% and error over 100%.
  Click a cell for that person's ClickUp tasks due that week. "Sync
  ClickUp" runs the route by hand and shows the last sync time.
- `/time-off` (everyone): log your own PTO, sick, unpaid, or holiday
  with hours per day; admins log anyone's and company holidays
  (no person). Delete your own. Header links: Time off for all,
  Capacity for admins.
- `server/api/clickup/sync.ts`: replaces the mirror with every open task
  in the workspace (`GET /team/{id}/task`, 100 a page). Assignee ->
  profile by email; list -> client by name (" - Shared" and punctuation
  ignored, partial match allowed); task -> project whose name appears in
  the task name, longest wins. Auth: admin session, or
  `Authorization: Bearer <CRON_SECRET>` from the Vercel cron in
  vercel.json (daily at 11:00 UTC, 6am Central). Reads NUXT_CLICKUP_TOKEN,
  NUXT_CLICKUP_TEAM_ID (workspace 8666791), NUXT_CRON_SECRET.
- ClickUp shape, from the connector: one workspace, lists named after
  clients (Hills Bank - Shared, CheckAlt, Manatts, CINC/TresRE, ful.
  Health, Gigantic Print Shop), tasks named like Docket projects, many
  assignees per task, client staff as guests.

Verified as luke@: capacity renders 16 people over 11 weeks with last
two weeks' logged hours (Luke over 40 shows red); "Sync ClickUp" with no
token fails with a clear message; adding two days of PTO on /time-off
showed 16:00 and dropped that week's available hours to 24:00 on
/capacity; the entry was deleted afterwards.

SUPERSEDED by step 10: ClickUp is being canceled, so the sync and the
clickup_assignments mirror are gone; capacity books from Docket tasks.
What remains of ClickUp is the one-time import on /admin/clickup, which
needs NUXT_CLICKUP_TOKEN and NUXT_CLICKUP_TEAM_ID=8666791 once, before
the account closes. Meetings (calendar_busy) are scaffolding only.

## Step 8: invoicing, Docket owns it (2026-09-02)

Luke picked option 1: Docket invoices end to end. Built and verified the
same day. Migrations `billing_batch_invoiced_status` (enum value) and
`invoicing`, mirrored in schema.sql (type in section 0, tables after
Expenses, functions before section 4, policies in 4, grants in 5, the
reminder function and cron in 7). CLAUDE.md's "we do NOT invoice" is
rewritten.

Data:

- `invoice_settings` (one row): company block, payment instructions,
  default terms and tax rate, default notes, `next_invoice_number`,
  `remind_overdue`, `remind_every_days`. Admin page
  `/admin/invoice-settings` (Admin menu). Set the next number once so
  numbering continues from Harvest's last invoice.
- `invoices`: number (text, unique, editable while draft), client,
  optional `batch_id` (a batch has one live invoice; a voided one can be
  redone), status draft / sent / paid / void, subject, notes, dates, tax
  rate, subtotal / tax / total / paid / due (maintained by
  `recalc_invoice()` from triggers on lines, payments, and tax rate),
  `public_token` (64 hex chars), sent_at, sent_to[], last_reminded_at,
  paid_at.
- `invoice_lines` (kind service / expense / other, quantity, unit price,
  generated amount, taxable, project) and `invoice_payments` (date,
  amount, method, reference, notes).
- `create_invoice(client, batch default null)`: numbers the draft from the
  settings counter, and from a draft batch makes one line per project,
  task, and rate (hours x rate) plus one per project and expense
  category, then marks the batch `invoiced`. `void_invoice()` refuses if
  payments exist, otherwise voids and puts the batch back to draft.
- RLS: all four tables admin only. Staff see nothing.

App:

- `/invoices`: outstanding, overdue, and draft counts; filters; blank
  invoice for a client (fixed fees, deposits).
- `/invoices/[id]`: draft editor (number, dates, tax rate, subject, notes,
  lines with add and remove; Save rewrites the lines), Preview (public
  page), Copy link, Send, Mark as sent, Void. Once sent: the document,
  payments (record and remove), Send again, Send reminder, Void. Paid:
  document and payments only.
- Batch page: Create invoice (draft batches) or a link to its invoice.
  Client page: Docket invoices card above the Harvest one.
- Public page `/i/<token>` (excluded from the auth redirect, service role
  route `server/api/i/[token].get.ts` that returns only that invoice):
  white printable sheet from `InvoiceDocument.vue` with a Download PDF
  button that calls the browser's print. The batch detail (every time
  entry and expense) prints after the totals.
- Email: `server/api/invoices/send.post.ts`, admin only, reads
  `resend_api_key` and `resend_from` from Vault through `vault_secret()`
  (now granted to service_role), sends text plus HTML with a View invoice
  button, links to the request origin so local and live both work,
  reply-to is the company email. First send flips draft to sent and
  records sent_to; a reminder stamps last_reminded_at. Resend's test
  sender only delivers to luke@ until the domain is verified.
- Overdue reminders: `run_invoice_reminders(dry_run, force)` on a second
  pg_cron job (`docket-invoice-reminders`, :10 hourly, acts in the 9am
  Central hour) when `remind_overdue` is on; emails each sent, unpaid,
  past-due invoice's recipients every `remind_every_days` with the public
  link and payment instructions.

Verified as luke@ in Chrome: saved settings; batch for Dupaco, Create
invoice gave draft #1 with two lines from the batch ($37.50 time at
$150/h, $6.00 expense), subject saved and shown in the preview; Send to
luke@ returned Resend 200 and the invoice went to sent with sent_to; the
public page loaded with no session (curl 200, bad token 404, signed-out
send route 403); recorded a $43.50 check and the invoice went to paid
with paid_at; removed the payment and it went back to sent (overdue,
since the dates were pushed back for the reminder test); the reminder
dry run listed invoice 1 for luke@; Void put the batch back to draft; the
invoices list and the client card showed it as void. Test invoice and
batch deleted, counter reset to 1, reminders left off.

Not built: online card or ACH payment, attaching the PDF to the email
(the link is the PDF), a Harvest-style client portal listing all their
invoices, per-line tax rates, credit notes. Harvest invoice history is
still waiting on an administrator token.

## Billing batches UI and Harvest invoice import (added 2026-09-02)

Built after Luke learned billing runs through Harvest (see step 7's
"Next"). Both fit any of the three invoicing options.

Billing (`/billing`, admin only, "Billing" link in the header):

- Unbilled per client from a new security definer `unbilled_summary()`:
  hours, time amount (hours x rate_snapshot), expense amount, oldest and
  newest dates. Locked rows (Harvest-invoiced) and batched rows are out.
  Verified against a direct Harvest pull of uninvoiced 2026 time and
  expenses: 136 clients, $1,222,508.53 total, top clients to the cent.
- `/billing/new?client=`: client, optional project, period (defaults to
  last month), then every unbilled time entry and expense in range with
  checkboxes (all ticked), totals, and a warning when a picked entry has
  no rate. Creating calls `create_billing_batch(p_client_id,
  p_period_start, p_period_end, p_time_entry_ids, p_expense_ids,
  p_project_id default null)`: inserts the draft batch and sets
  batch_id + is_locked on exactly the rows given, all or nothing. Rows
  that are not that client's, not billable, already claimed, locked, or
  running make the whole call fail with a reload message. Subtotals:
  `subtotal_hours` and `subtotal_amount` (time amount plus expenses).
- `/billing/[id]`: header, locked rows, CSV export of the lines, and Void
  (draft or failed only) via `void_billing_batch()`, which releases the
  rows and keeps the batch as `void`. `unbilled_expenses` now excludes
  `is_locked` like `unbilled_time` (the view had to be dropped and
  recreated because `expenses` gained `harvest_id` after it was made).
- Migrations `billing_batches_ui` and
  `create_billing_batch_optional_project`, mirrored in schema.sql; the
  schema TODO 1 and the billing_batches comment now describe the reopened
  invoicing question.

Verified as luke@: created a batch for Dupaco (May to July: one entry,
one expense, $43.50), DB showed both rows locked with batch_id set and
subtotals 0.25 h / 43.50, voided it, both rows returned to unbilled and
the list showed the batch as void. The test batch was then deleted.

Harvest invoices (`invoices` mode on the import, Invoices card on
`/admin/harvest`, table `harvest_invoices`, admin-only RLS):

- Copies every invoice (number, client, subject, state, issue/due/period
  dates, amount, due_amount, tax and discount amounts, sent/paid/closed
  timestamps, line items as JSON) keyed on harvest_id, whole history each
  run so paid state stays current. Client linked by harvest_id then name;
  unmatched client names are listed on the page.
- Client page gets a "Harvest invoices" card (admins) with an overdue
  badge for open invoices past due.
- NOT VERIFIED WITH DATA: Luke's token is a Harvest Manager token and
  `/v2/invoices` returns 403 (the Harvest connector in Claude sees zero
  invoices for him too). The page shows a clear "This Harvest token
  cannot see invoices" message, which is what was tested. Run it with a
  personal access token from a Harvest administrator (Sean or Tom), or
  after an admin grants Luke invoice access; the field mapping follows
  the API docs and may need a tweak on first real run.

## Harvest expense import (added 2026-09-02)

Luke asked "can we import expenses?". New `expenses` mode on
`/api/harvest/import` and an Expenses card on `/admin/harvest` with a
From year field and "Sync expenses" (one call per month, same log).

- Upserts into `expenses` on a new `harvest_id` column (migration
  `harvest_expenses`, mirrored in schema.sql). Also adds `harvest_id` to
  `expense_categories`; the 24 seeded categories matched Harvest by name
  and adopted their ids, so nothing was created.
- Mapping: spent_date, total_cost (rounded to cents), notes, billable,
  and `is_locked = is_billed` (invoiced in Harvest). Harvest has no
  reimbursable flag, so `is_reimbursable` keeps whatever Docket has.
  Clients and projects are matched or created the same way as time
  entries; the ensure* helpers moved out of importLive into a shared
  `ensurers()` factory so both modes use them.
- Receipts: downloaded from Harvest with the API token (Harvest redirects
  to a signed file link) and uploaded to
  `receipts/<owner>/harvest-<expense id>.<ext>` with upsert, so re-runs
  skip anything already filed. The storage insert policy now lets admins
  write to any folder (was owner only); read, update, and delete already
  did. Files the bucket cannot take (not image or PDF, over 10 MB) or that
  fail to download are listed on the page as "Receipts not copied" and
  the expense still comes in without one.
- Expenses deleted in Harvest are deleted here (with their receipt file)
  unless batched. People without a profile are skipped and listed.
- Per month it is slow: about 30 to 45 seconds for 40 receipts. Fine
  locally; on Vercel keep the function timeout in mind if a month has many
  receipts (a re-run resumes where the receipts left off).

Verified as luke@ in Chrome: a dry run for 2026 then the real run.
Every month matched a direct pull of `/v2/expenses` (745 expenses,
$260,160.88, 334 receipts, 253 PDF / 69 PNG / 12 JPEG), no receipt
errors, 334 objects in the bucket with sizes and mime types set, no
expense pointing at a missing file, 381 expenses locked as invoiced. The
import created 4 clients and 69 projects that had expenses but no 2026
time. `/expenses` shows Luke's 15 with paperclips and a receipt opened
as a signed PNG in a new tab.

## Data state after the 2026 Harvest sync (2026-09-02)

- All 16 people now have auth users and profiles (14 created by SQL the
  same way sean@ was, with full_name in raw_user_meta_data so the trigger
  named them). They can sign in with Google; Google links by email.
- The hand-made "Cinc" client and its "Website" project were deleted so
  Harvest's "CINC/TresRE" would not duplicate them.
- "Sync January to 09" imported 9,956 entries for Jan to Sep 2026, and
  created the clients, projects, tasks, and project_tasks Harvest uses
  this year. Harvest-invoiced entries are locked. See the counts in the
  verification below.
- First-run gotcha, now handled: the archive relink after a live month
  updates tens of thousands of rows the first time and tripped
  PostgREST's 8 s statement timeout for the authenticated role, which
  aborted January after its rows were written and hid the log. The relink
  is now non-fatal (reported as `relinkError`) and failed months stay in
  the page log. The full relink was run once by SQL.
- Re-run the sync whenever Harvest changes during the parallel month; it
  is idempotent and deletes entries removed in Harvest unless batched.
- Rates bug found and fixed on this run: every imported entry had a null
  rate_snapshot. Postgres runs BEFORE INSERT triggers on an upsert's
  proposed row before the conflict check, so ON CONFLICT's EXCLUDED values
  carried the trigger's resolve_rate() result (null, since projects have no
  rate and people have no default). The route now fixes rates with plain
  UPDATEs grouped by rate. While there, `set_rate_snapshot()` gained a
  guard (migration `rate_snapshot_guard`): staff can no longer change a
  frozen rate on update, admins can, which is what the import relies on.
- New `projects` mode (also run automatically at the end of "Sync
  January to ..."): copies budget, rate, billing method, code, and active
  flag from Harvest onto every Docket project that came from Harvest.
  Harvest's `budget_by = project` is hours, `project_cost` is dollars;
  this account bills by person, so projects have no flat hourly rate and
  per-entry rates come from Harvest's billable_rate. 953 projects updated,
  225 with a dollar budget, 647 inactive.

## Step 7: reports + CSV

- `/reports`, admin only (staff would see their own live time but the
  whole Harvest archive through time_monthly_all, which is misleading, so
  the page is behind the admin middleware and the Reports link is admin
  only). One page instead of the index + builder pair in structure.md.
- Sources: "Time by month" (time_monthly_all, live + archive, grouped in
  SQL by `report_time_monthly()` on any of month / client / project /
  person / task; migration `report_functions`), "Time entries"
  (time_detail rows), "Expenses" (expenses with joins). Filters: date
  range, client, project, person. Filter options come from live tables,
  so archive-only clients show in results but cannot be picked as a
  filter. Totals row for hours, billable hours, amount.
- CSV is built in the browser from exactly the rows on screen
  (`useCsv`), plain numbers, plus a Total line. No server route.
- Saved reports store source, filters, and grouping in `saved_reports`
  (own or shared); load from a dropdown, save with a name, delete your
  own. Dates are saved as picked, not relative.
- Reports typing note: `saved_reports.filters` is the recursive `Json`
  type; hold rows in `shallowRef`, a deep `ref` makes vue-tsc blow up with
  "type instantiation is excessively deep".

Verified: June 2025 by client returned 91 rows with totals 1,713.40 h,
1,648.80 billable, $197,380.35, the same figures as Harvest's own report
and the archive import. The exported CSV had the 91 rows plus a Total
line, and summing its rows reproduced the total line exactly. Saved and
deleted a report.

Not built: capacity_weekly and project_budget_status as report sources,
relative date ranges ("this month"), scheduled or emailed reports.

Step 8 (2026-09-02): Luke learned that Gigantic does all billing through
Harvest, invoices and payment follow-up included, not QuickBooks, and
chose option 1 below. See "Step 8: invoicing, Docket owns it" above. The
options as they were put to him:

1. Docket owns invoicing: invoice numbers, line items from a batch, PDF,
   email through Resend, sent/paid/overdue status, and overdue reminders
   riding on the step 6 reminder cron. QBO gets nothing, or a later
   summary push for the books. Largest build, no new credentials.
2. Move billing to QuickBooks Online: the batch pushes an invoice and QBO
   sends it, tracks payment, and nags. Needs the Intuit app credentials
   (NUXT_QBO_CLIENT_ID / NUXT_QBO_CLIENT_SECRET, callback
   /api/qbo/callback) and whoever does billing works in QBO from then on.
3. Keep Harvest for invoicing only. Cheapest, but Harvest stays paid for.

Either way, import Harvest's invoice history before cancelling so AR
history survives. Both the batch UI and the invoice import are now
built (see "Billing batches UI and Harvest invoice import" above); the
invoice import is waiting on a token that can see invoices.

## Step 6: reminders + email

Built entirely in Postgres, not as an Edge Function (a deliberate change
from docs/structure.md: fewer moving parts, nothing to deploy or
authenticate, and everything stays in schema.sql). Section 7 of
schema.sql, migration `reminders`.

- pg_cron job `docket-reminders` runs `run_reminders()` at five past every
  hour. It sends through Resend with pg_net (`net.http_post`) using
  `resend_api_key` from Vault. Optional Vault entries: `resend_from`
  (default `Docket <onboarding@resend.dev>`, Resend's test sender, which
  only delivers to the Resend signup address) and `app_url` (default
  https://docket.giganticdesign.com) used in the email links.
- Kinds: `timer_left_running` for timers over 10 hours, checked every
  run; `missing_time` for no entries yesterday, only in the 9am hour
  Central on weekdays, skipping anyone with time_off (or a company
  holiday) that day. `timesheet_nudge` exists in the enum but is unused.
- Once per person per kind per day is enforced by reminder_log's unique
  key: `send_reminder()` inserts the log row first and only sends when the
  insert happened. Without the Vault key it raises a warning and logs
  nothing, so the first send happens as soon as the key is added.
- Admins can call `run_reminders(true)` over the API for a dry run
  (returns what would send); staff get "Admins only". No UI for this yet.
- Time zone is hardcoded to America/Chicago in the function.

Verified: inserted an 11-hour running timer for luke@, dry run listed it,
the real run returned sent=true with one reminder_log row, a second run
in the same minute returned sent=false with still one row, and pg_net
recorded Resend's response for the request. Test timer and log row
deleted afterwards. The cron job's own hourly runs are not observed yet;
check `cron.job_run_details` after the first :05.

To move off the test sender: verify giganticdesign.com in Resend, then
`select vault.create_secret('Docket <docket@giganticdesign.com>', 'resend_from');`.

Next is step 7: reports + CSV.

## Step 5: retainers + budget views

- The schema's `project_budget_status` and `retainer_burndown` views run
  as the caller, so staff would see burn counting only their own hours.
  The app reads two security definer functions instead, which return
  totals only: `project_budget(p_project_id)` and `retainer_status()`.
  Both count everyone's time, skip running timers, and include the
  Harvest archive where its rows are linked to a Docket project/client.
  Migration `budget_functions`, mirrored in schema.sql after the views.
- Rollover (schema TODO 3, now resolved): retainer periods chain when they
  share client, project, and name and one starts the day after the
  previous ends. Leftover carries forward when the earlier period has
  rollover on, capped by its rollover_cap. Archive months count when the
  first of the month falls inside the period.
- `relink_harvest_archive()` points archive rows at clients, projects,
  and people that now exist (matching on name). The live Harvest import
  calls it after creating projects, so history feeds budgets after the
  2026 sync runs.
- Project page: Budget card (hours and billable amount used vs budget,
  progress bars, color at 80% and 100%) and Recent entries (last 10 from
  time_detail; staff see their own). Client page: Retainers card with
  used / available, carried in, left or over, progress bar, and admin
  New / Edit / Delete through `RetainerForm`.

Verified: seeded two chained 10 h retainers on Cinc (Aug with 3 billable
hours, Sep with 3.5 billable and 1 non-billable) and a $1,000 Sep retainer
on Website. `retainer_status()` returned Aug 3.00 used / 7.00 left, Sep
carried_in 7.00, available 17.00, used 3.50, remaining 13.50, dollars
$490 used / $510 left, matching the hand calculation ($140 x 3.5). Both
pages showed the same numbers; the project page showed 7:30 of 265:00
and $910 billable. Created and deleted a retainer through the form. Test
rows deleted afterwards.

Not done: a cross-client retainers overview page (the client page is the
only place), and client YTD hours (reports, step 7).

Next is step 6: reminders + email.

## Step 4: expenses + receipts

- `/expenses`: the signed-in user's expenses for one year, newest first,
  with a total. Admins get an "Everyone" switch. New/edit through
  `ExpenseForm` (project, category, date, amount, notes, billable,
  reimbursable, receipt). Delete asks first and removes the receipt file.
- Receipts: private Storage bucket `receipts`, path
  `<user_id>/<uuid>.<ext>`, 10 MB, images and PDF. Policies: owner reads
  and writes own folder, admins read and delete any. Viewing uses a
  5-minute signed URL opened in a new tab (`useReceipts`). Migration
  `receipts_storage`, mirrored as section 5 of schema.sql; the local
  check stub now includes a storage schema.
- `/admin/expense-categories`: same shape as tasks. 24 categories were
  seeded from Harvest's list (trailing space trimmed on "GDCO - Apparel").
- Header: admin pages moved into an Admin dropdown (Tasks, Expense
  categories, Harvest import) so the bar stays short.

Verified in Chrome as luke@: added an expense with a PNG receipt, the
object landed at `receipts/<luke>/<uuid>.png` with owner set, the
paperclip opened the signed URL, delete removed row and file. RLS checked
in SQL by switching to the authenticated role with each user's JWT claims:
Sean sees 0 expenses and 0 receipt objects, Luke (admin) sees 1 and 1.
Not exercised in the browser: editing an expense and replacing its
receipt, though the code path is the same upload plus a best-effort delete
of the old file.

Next is step 5: retainers + budget views.

## Step 3: Harvest import

Server route `server/api/harvest/import.post.ts` plus admin page
`/admin/harvest`. One call imports one calendar month, so a long run shows
progress and never hits a Vercel timeout. Runs as the signed-in admin
through RLS; no service role key. The only secret is the Harvest personal
access token: `NUXT_HARVEST_ACCESS_TOKEN` and `NUXT_HARVEST_ACCOUNT_ID`
(runtimeConfig, so the NUXT_ prefix is required). Set both on Vercel too.

- archive mode (years before this one): rolls the month up by
  client / project / user / task into `harvest_archive_monthly`, replacing
  that month's rows. Soft-links client_id / project_id / user_id where a
  Docket row matches.
- live mode (this year): upserts entries into `time_entries` on the new
  `harvest_id` column. Creates missing clients, projects, tasks, and
  project_tasks (matching on harvest_id, then name). `rate_snapshot` is
  Harvest's billable_rate, not resolve_rate(); the rate trigger overwrites
  it on insert so the route re-upserts mismatches. Harvest-invoiced entries
  come in `is_locked` so they never enter a QuickBooks batch;
  `unbilled_time` now excludes locked rows. Entries deleted in Harvest are
  deleted here unless already batched. Running Harvest timers are skipped.
- Migration `harvest_import`: `harvest_id bigint unique` on clients,
  projects, tasks, time_entries; `unbilled_time` excludes `is_locked`;
  new view `harvest_archive_yearly` for the page. Mirrored in schema.sql.
- expenses mode (added later, see "Harvest expense import" above):
  every expense for a year range into `expenses`, receipts included.
- Luke's Harvest token is a Manager token, so `/v2/users` returns 403. The
  route tolerates that and matches people to profiles by full name instead
  of email. Time entries are visible in full (June 2025 matched the
  account-wide report).

Verified: June 2025 dry run and real import both give 1713.40 hours,
558 rollup rows, $197,380.35, matching Harvest's own report total and the
per-client figures (Hillcrest 141.85, HODGE 123, Everforth 102, Hills
Bank 95.5). September 2020 matched per person. Full 2015 to 2025 archive
imported from the page in about eight minutes: 37,132 rows, 2016 to 2025
(Harvest has nothing for 2015 and almost nothing before 2018).

Live sync blocked on profiles: only luke@ and sean@ exist, so a 2026 dry
run imports 130 of 1195 August entries and skips 13 people. Create the
other users in Supabase Auth (same as sean@) and run "Sync January to
current month". It would also create 24 clients, 33 projects, 7 tasks from
Harvest names; note Harvest's "CINC/TresRE" will not merge with the
hand-made "Cinc" client.

Next is step 4: expenses + receipt upload.

## Step 2 sign-off

Verified in Chrome as luke@: create entry (1:30), start and stop the timer
on a row, timer conflict recovery, edit notes while running, delete with
confirm, timer banner on another day with Stop, prev week, Today, day
buttons. `npm run typecheck` passes. Test entries were deleted afterwards,
so the timesheet is empty.

Not done in step 2, on purpose:
- No week grid (rows by project/task, columns by day). Add later if wanted.
- No admin view of other people's time. That is reports, step 7.
- No header indicator for a running timer when you are off the /time page.
- Vue-tsc prints a "Resolve plugin path failed: vue-router/volar/sfc-route-blocks"
  stack on every typecheck. Harmless, exit code is 0.

Next is step 3: Harvest import (archive rollup + current year live).

Optional later: have sean@ sign in once with Google so the account links
and the staff view is seen on a second real account. Not blocking.

## Local verify commands

- `npm run dev` (or the `docket-dev` entry in `.claude/launch.json`, which
  the Claude Code browser pane uses to start it on port 3000)
- `npm run typecheck`
- `npm run build`
- `npm run schema:check` (needs a local Postgres and PGHOST/PGPORT/PGUSER)

## Open flags

- Nuxt UI is pinned to v3 per CLAUDE.md. v4 is current. Decide before the UI grows.
- See the TODO list at the top of `schema.sql` for schema-level flags.

## Speed pass (2026-09-02)

Luke still felt the app was slow after the static-shell change. Fetch
timing in the browser showed three causes, all in Postgres:

- `time_detail` called `has_permission('see_money')` per row; security
  definer functions are not inlined, so every report paid for it ten
  thousand times. Now a scalar subquery, evaluated once per query.
- `report_rollup` ran `report_time` four times plus `report_expenses`.
  Rewritten as one pass over live time, one over the archive, one over
  expenses. Year rollup went from ~600 ms of server time to ~120 ms.
- RLS policies called `is_client()`, `has_permission()` and
  `task_visible()` per row. Read policies now use `(select fn())` so the
  planner runs them once. The task tables' `for all` write policies also
  apply to reads, and their per-row `task_visible()` ran before the
  cheap check; they now use `case when (select has_permission(...))
  then true else task_visible(...) end` so the cheap branch wins.

Measured in the dev browser (slowest Supabase call per page, before
and after): client page 3203 ms to 168, time page 4355 to 109, project
page 1155 to 145, tasks list 992 to 246, reports 1500 to 250. Migrations
`policy_and_report_speed` and `task_write_policies_cheap`, mirrored in
`schema.sql`. No app code changed.

## Phase 3: view persistence (2026-09-02)

Screens open the way you left them, per person, on any device. Table
`user_views (user_id, key, state jsonb)`, own rows only, mirrored in
`schema.sql`. `app/composables/useViewState.ts`:
`await useViewState(key, defaults)` returns a reactive object; the first
call in a session loads all of the person's rows, each change upserts
its row half a second later. `persisted(view, 'field')` gives a writable
ref so pages keep their existing `x.value` code. `view.$reset()` puts
the defaults back.

Wired: tasks (group, list or cards, everyone, completed, collapsed
groups, drilled-in client, plus a Reset view button), reports (kind,
range preset, tab, filters; a preset range recentres on today, custom
keeps its dates; a URL with a query still wins), schedule (view, zoom,
everyone; always opens on this week), invoices and quotes (status
filter), expenses (everyone), and the task page's activity panel width.

The task page's activity panel resizes by dragging its left edge, 320 to
720 px, double-click to reset to 420. Class is `lg:w-(--panel)`; the
Tailwind v3 form `w-[var(--panel)]` did not compile under v4.

Not wired, because the screens have no such state yet: sidebar sections
(not collapsible), time (no week or day toggle), capacity (fixed range).

Verified in the dev browser: toggles on Tasks survive a reload and Reset
view clears them; the panel drag persists across reload and clamps at
720. Rows checked in `user_views`.

## Phase 3: desktop update notice (2026-09-02)

The Mac app shows a banner when the site has a newer build. Pieces:
`public/desktop/latest.json` (version, DMG url, notes),
`app/composables/useDesktopUpdate.ts` (reads the shell's version from
Tauri, fetches latest.json on launch and daily, compares, remembers
"Not now" per version in localStorage), `DesktopUpdateBanner.vue`
mounted in app.vue above the page, and `desktop/release.sh` which bumps
the version in the three files, builds, copies the DMG to the Desktop,
and rewrites latest.json. The DMG goes in the public Storage bucket
`desktop` (created; read for anyone, write for manage_settings). Luke
uploads it in the dashboard, then commits and pushes.

Verified in the dev browser with the dev-only hook
`window.__docketUpdate('0.0.1')`: banner appears, Not now hides it and
keeps it hidden for that version. Not verified inside the real shell;
the version read uses `window.__TAURI__.app.getVersion`, which
`core:default` allows. In-place auto-update waits for Apple signing.

## Phase 3: modals to drawers (2026-09-02)

Forms open in a drawer from the right so the page behind stays in view.
`app/components/AppDrawer.vue` wraps `USlideover` with the same title,
description, open, `#body` and `#footer` API as `UModal`, a `wide` prop
for bigger forms, and a `dirty` prop that asks before an accidental
close (mechanism only; no form sets it yet). 32 modals became drawers
by tag swap; 15 stay modals: every delete and void confirm, Save report,
accept or decline for the client, the create-invoice line choice,
Attach a file, Keyboard shortcuts, Search. The Assistant uses AppDrawer
too. Verified in the dev browser: New task, Edit client, Invite a
contact, and the Assistant open as drawers and close on Escape.

## Phase 3: MCP server (2026-09-02)

Docket is a remote MCP server at `/api/mcp` (Streamable HTTP, stateless,
JSON responses, `@modelcontextprotocol/sdk`). `server/utils/mcp.ts`:
`bearerCaller()` validates the Supabase access token in the Authorization
header and builds a client with it, so RLS decides everything; clients
of the agency are refused. Tools: the assistant's eight read tools plus
list_projects, project_task_types, people, log_time, start_timer,
running_timer, stop_timer, update_time_entry, my_week, create_task,
update_task, add_comment. No deletes. A missing or bad token gets 401
with `WWW-Authenticate: Bearer resource_metadata=...`;
`server/middleware/oauth-metadata.ts` serves
`/.well-known/oauth-protected-resource` pointing at Supabase Auth.

Sign-in is Supabase's OAuth 2.1 server. `app/pages/oauth/consent.vue`
is the authorization page (`getAuthorizationDetails`, approve, deny);
`saveRedirectToCookie` is on so a signed-out person comes back to it
after login (callback.vue plucks the cookie). The Account page has a
Claude card with the connector URL, the `claude mcp add` command, and
connected apps with Disconnect (`listGrants`, `revokeGrant`).

Verified locally with a real session token: metadata, 401 without a
token, initialize, tools/list (20 tools), and every write tool round
trip on the internal Admin project (entries, timer start, refuse second
timer, stop, task, update, comment), then the test rows were deleted.

Not verified: the OAuth flow itself. The project's OAuth server is off
(`/.well-known/oauth-authorization-server/auth/v1` says
feature_disabled). Luke: Authentication, OAuth Server in the dashboard:
enable it, set Authorization Path to `/oauth/consent`, allow dynamic
client registration, and check Site URL is the live site. Then add the
connector in Claude and approve it.

## Morning sync cron (2026-09-02)

`/api/sync/morning` runs daily at 11:00 UTC (6 AM Central in summer)
from `vercel.json`, guarded by CRON_SECRET like the other crons. It
pulls ClickUp's open tasks and Harvest's time and expenses for the
current month (plus the previous month during the first three days),
then Harvest project budgets and rates. The import code moved from the
two POST routes into `server/utils/clickupImport.ts` and
`server/utils/harvestImport.ts`; the Imports page routes are thin
wrappers that check the admin and call the same functions. The cron
runs with the service role; ClickUp-created tasks are owned by the
first active admin. `?dry=1` exercises it without writes. Results are
returned and logged (`[sync/morning]` in Vercel logs); nothing is
stored yet.

## Schedule hover card (2026-09-02)

Bars on the schedule show a card near the pointer with the full title,
client / project, dates, estimate, and people; the left column's names
show the same card only when the column cut them off. Replaces the
native title tooltips. `tipBar`, `tipIfCut`, and a teleported card in
`app/pages/schedule.vue`.

Update, later on 2026-09-02: Luke enabled the OAuth server, set the
Authorization Path, turned on dynamic registration, and set Site URL to
the live site. Discovery answers, and dynamic registration was checked
with a throwaway client (then deleted with the admin API). Luke then
connected Claude for real: the Docket tools showed up in the Claude Code
session and my_week returned his week through the connector, so the
OAuth round trip works end to end.

## Undo (2026-09-02)

Deletes on tasks, time entries, expenses, and comments are soft. A
BEFORE DELETE trigger (`soft_delete_row`) turns the delete into
`deleted_at = now(), deleted_by = auth.uid()` after the delete policy
has already allowed it, so app code still calls `.delete()`. Select
policies hide marked rows; security definer aggregates
(`project_budget(s)`, `retainer_status`, `unbilled_summary`,
`create_billing_batch`, `create_invoice`, `run_reminders`) filter
`deleted_at` themselves; security invoker views get it from RLS. The
running-timer unique index ignores deleted rows. `restore_deleted(table,
id)` clears the mark within thirty days for the deleter or someone with
manage_tasks (tasks, comments) or see_all_time (time, expenses).
`purge_deleted()` hard-deletes after thirty days from pg_cron at 09:30
UTC, with `docket.purge` set so the trigger lets it through.

App: `useUndo()` shows a toast with Undo for thirty seconds.
`offerRestore` after deletes on Time, Expenses, the task page (task and
comments), and the task list's bulk delete; `offer` with a hand-written
put-back after a bulk status or priority change and after a drag onto
another group on the task list. `EntryHistory.vue` (History button on a
time entry row) lists the audit trail through `entry_history()`, with
"Restore this" on an edit that writes the old values back through a
normal update. Deletes and put-backs show as such. Migrations
`undo_soft_delete`, `undo_filter_aggregates_1`, `undo_filter_aggregates_2`.

Verified in the dev browser: delete a time entry, Undo puts it back;
History shows created, deleted, put back, and an edit with Restore this
returning the hours; delete a task from its page, Undo on the Tasks
page reopens it. Bulk task undo and expense undo share the same code
paths and were not clicked through. Test rows purged afterwards.

Also today: the Assistant renders its markdown (bold, bullets, links)
instead of showing it raw, the model is asked to name every link
([Title](/tasks/id)), and the chips under a reply use those names.

## Assistant: corner button, history, screen awareness (2026-09-02)

The Assistant's button moved from the rail to a round button in the
bottom right corner (`AssistantButton.vue`; toasts now sit top right so
the two never overlap). Cmd+J still works. Conversations are kept per
person in `assistant_conversations` and `assistant_messages` (own rows
only); the drawer has History (pick one up, remove one) and New chat.
"log:" time entries are not kept. Pages announce what they show with
`useAssistantScreen()` (client, project, task, quote, invoice, report
period), the drawer's suggested questions use those names, and the
chat route tells the model what is on screen.

## Assistant can act (2026-09-02)

The chat route now hands the model the same tools as the MCP connector
(`mcpTools`), so from the drawer it can log time, start or stop the
timer, change a time entry, create or update a task, and comment, as
the caller through RLS. It is told to act only on a clear ask, to ask
one question when a project, task type, hours, or task is missing, and
never to delete. `converse()` returns the tool names that ran; the
route returns `acted` when a write tool ran and the drawer calls
`refreshNuxtData()` so the page behind shows the change. Deletes stay
out of reach on purpose.

Later: the Assistant is a side panel, not an overlay. `AssistantDrawer.vue`
renders a fixed `aside` on the right with no backdrop; app.vue gives the
page `lg:pr-[26rem]` while it is open so both stay readable, and the
page keeps working behind it. Escape inside the panel or Cmd+J closes
it. The suggested questions follow the page while no chat is going;
`useAssistantScreen` only clears its announcement if a newer page has
not already replaced it (Nuxt sets up the next page before unmounting
the old one). The assistant can also add clients and projects
(`list_clients`, `create_client`, `create_project`, also on the MCP
connector), gated by the manage reference data permission through RLS.

Later: typing "/" in the Assistant box opens a picker over the full-text
`search` RPC (clients, projects, tasks, quotes, invoices). Arrow keys,
Enter or Tab, or a click puts the name in the message; the id travels
with the request as a mention so the model acts on that exact record.
Input and keydown are caught on the form, not the UTextarea, because
listeners on the component did not reach the box.

## User guide (2026-09-02)

`docs/guide.md` is the guide to using the app and the logic behind it
(rates, locking, soft deletes, the archive, the jobs). `app/pages/help.vue`
renders it with `marked` from a `?raw` import, with a contents list from
the h2 headings, and the rail's question mark menu links to it as "User
guide". Keep the guide current when a screen changes; it is the same
file in the repo and in the app.

## Capacity page reworked (2026-09-02)

Each cell now answers one question with a label: past weeks "33:30
logged of 30:00" (neutral, a record), this week and coming weeks "24:00
free" or "3:00 over" with what is logged and planned under it. Column
headers say Logged, This week, Coming up. Two weeks back, six ahead. The
Team row reads the same way. The footnote became a "How the numbers are
worked out" disclosure, and the stale "meetings are not synced" line is
gone. Guide updated.

## Similar projects on the New project form (2026-09-02)

`project_history()` (security invoker) returns every finished project with time
on it (inactive live ones and Harvest-only history), with hours, amount (null without
see_money), and first and last activity. `SimilarProjects.vue` sits
under the budget fields of a new project: as the name is typed it
scores past projects by shared words (dates and job-number suffixes
stripped, same client boosted), shows the typical hours and amount
across the matches with the top matches listed, and "Use as budget"
fills the budget fields. Nothing is stored; it is a hint at typing time.

## Create a client from any picker (2026-09-02)

`ClientPicker.vue` wraps USelectMenu with `create-item`: a name that is
not in the list offers "Create client", inserts it (RLS: manage
reference data), selects it, and emits `created` so the parent's list
gains the row. Used on the project form, New quote, and Blank invoice.

## Sitemap canvas, page templates, pages to tasks (2026-09-02)

The quote's sitemap is now a tree on a canvas (`SitemapCanvas.vue`):
a card per page (title, path, template, hours), tidy top-down layout
with elbow connectors, add child or sibling from the card, Enter and
Tab on the keyboard, drag a card onto another to reparent, zoom and
fit. `page_templates` (Settings, Page templates: name, hours, rate,
task type, color) give a page its hours unless overridden
(`quote_sitemap_nodes.template_id`, `hours`). "Price the sitemap" on
the quote makes or updates one scope line per template
(`quote_line_items.template_id`) and links the pages to it.
`accept_quote()` now also creates a task per page on the new project
with the page's hours as the estimate. Guide updated.

## Project page upgrade, Phase 4 item 1 (2026-09-03)

`projects.lead_id` (one person, optional; Lead on the project form and
info card). The project page gained a Quotes and Invoices card (behind
manage_billing; invoices found through `invoice_lines.project_id`),
hours remaining per task next to the estimate, and a clock button per
task row that opens `TimeEntryForm` in a drawer. The task page's Log
time does the same instead of sending people to /time. Plan and specs
for the rest of the phase are in `docs/phase-4.md`.

## Unsorted tasks (2026-09-03)

538 of the 693 ClickUp tasks landed in a per-client "General" project:
ClickUp's list is the client and nothing below it names a project, so
the import can only match on the project name appearing in the title.
`/tasks/triage` (manage_tasks; a button on Tasks while any remain)
lists them by client with checkboxes, a "Move selected to" picker of
the client's active projects, Undo, and New project via `ProjectForm`.

## Quote catalog, margins, capacity forecast, Phase 4 item 2 (2026-09-03)

`tasks.default_rate` and `default_description` prefill a scope line
when its task type is picked. `profiles.cost_rate` (People, shown with
see_money; admin-only to write via `protect_profile_columns`).
`quote_line_items.assignee_id` and `target_week` (a Monday): the quote
editor has a "Who, week" column, and `quote_line_margins(p_quote_id)`
(security definer, see_money) feeds a Margin column and total from the
saved lines so cost rates never leave Postgres. `accept_quote()` assigns
each page's task to its line's person. `capacity_weekly.forecast_hours`
sums those lines on draft or sent quotes; the capacity page draws them
as a gray bar under the plan. Guide updated.

## Quotes board, owner, stale dot, Phase 4 item 3 (2026-09-03)

`/quotes` remembers `layout` (list or board) in its view state. The
board is four columns by status with count and subtotal per column,
cards linking to the quote; expired-by-date quotes stay in Sent with
the red badge (the enum's `expired` is never written). Both layouts
show the owner (`quotes.created_by` initials) and an amber dot on sent
quotes five or more days old with no decision. Threshold is a constant
in the page. Guide updated.

## Deploy fix (2026-09-03)

Vercel builds failed from the help page commit on: `.vercelignore`
dropped `docs`, and `/help` imports `docs/guide.md?raw`. Now only
`desktop` is ignored. The committed `package-lock.json` is behind
`package.json` (marked, driver.js, the MCP SDK); Vercel's npm install
copes, but a `npm ci` would not.

## Project templates, Phase 4 item 4 (2026-09-03)

`project_templates` and `project_template_items` (title, task type,
hours, suggested role; RLS like page_templates). Settings, Project
templates: CRUD with the items edited inline, rewritten whole on save.
`apply_project_template(project, template)` (security definer,
manage_reference) adds the task types to the project and one task per
item; `ProjectForm` calls it after a create when "Start from" is set.
Applying to an existing project is not built. Guide updated.

## Departments on projects, Phase 4 item 5 (2026-09-03)

`departments` lookup (name, is_active; RLS like expense_categories),
seeded with ClickUp's Department field values, and
`projects.department_id`. Settings, Departments is the CRUD page; the
project form has a Department select; the Projects list has a
department filter and column. Existing projects start unassigned.
Guide updated.

## Inline task timer and rail clock, Phase 4 item 6 (2026-09-03)

`TaskTimerControl.vue` (task page top bar; compact on the project's
task rows) starts a timer on the task through `useTimer().startNew`
with the project's one active task type, or asks which when there are
several; shows the live count and Stop when that task's timer runs.
`TimeClockPopover.vue` replaces the rail's Time link on desktop: same
link, a dot while a timer runs, and a hover popover with the running
timer plus Stop and the person's open assigned tasks with logged of
estimate. No schema change. Guide updated.

## Settings sidebar (2026-09-03)

Luke: "when there is subnav make it layout like Supabase does."
`SubNav.vue` is a fixed second sidebar right of the rail (title, grouped
links) that folds to a strip on phones; `SettingsNav.vue` uses it with
Team, Work, Money, Data groups, and `app.vue` pads the shell by the
extra 14rem on settings routes. Reports' tabs are content tabs on one
page, not a subnav, so they stay as they are. Also this commit: all UI
copy and docs moved to American spelling (rule added to CLAUDE.md).

## manage_billing split, Phase 4 item 7 (2026-09-03)

`manage_billing` is now `manage_quotes` (quotes, lines, sitemaps),
`manage_invoices` (batches, invoices, lines, payments, Harvest archive
and invoices), and `manage_retainers`. The ten RLS policies were
renamed and wrapped as `(select has_permission(...))`; the five
function checks moved to their key; the billing-recipient query uses
manage_invoices. The client page's billing card, the portal preview,
and the client invite accept any of the three. No role held the old
key, so nothing was fanned out. Guide updated.

## Retainer page, Phase 4 item 8 (2026-09-03)

`/retainers/[id]` (any period's id) groups `retainer_status()` rows by
the same chain key the function uses (client, project, name) and shows
the contract: summary strip, then a period table where a row expands
to `retainer_period_detail(p_retainer_id)`, a security definer that
returns the billable entries behind the period (amount with see_money;
nothing for pre-cutover periods). The client page groups periods per
contract, links to the page, and keeps the per-period edit and delete.
Portal untouched. Guide updated.

## Planner, Phase 4 item 9 (2026-09-03)

`/planner` (see_capacity): unassigned open tasks on the left (dated,
sorted by due date, and undated), the capacity grid on the right (same
arithmetic as Capacity, this week plus six). Native drag of a dated
task lights up its due week's cells; dropping inserts a
`work_item_assignees` row with an Undo. Undated or far-off tasks get a
dropdown of people. No schema change. Guide updated.
