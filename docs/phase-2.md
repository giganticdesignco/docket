# Docket Phase 2 plan

Written 2026-09-02, after the twelve Phase 1 steps shipped. Thirteen asks
from Luke, each with what it is, how it would be built on what exists, what
it depends on, and a rough size. Sizes are working days for one person
building the way Phase 1 was built (schema first, RLS as the security
model, verify in the browser, then commit).

## Suggested order

| Wave | Items | Why this order | Size |
| --- | --- | --- | --- |
| 2a, quick wins | Project server folder; Reports, Harvest layout; Rollups on detail pages; Mac desktop shell; Sidebar navigation rework; Search; Power user shortcuts; Feature walkthrough | Small, independent, useful on day one. Reports first because the data is all there and the team knows the Harvest layout; the walkthrough last so it describes the finished UI | 18 to 22 days |
| 2b, foundations | Roles and permissions; Client logins; Google Calendar | Client logins need real roles; calendar feeds the capacity page that already exists | 15 to 18 days |
| 2c, bigger builds | Gantt; Estimator; AI assistant | Each is its own product surface; the AI work reads best once the data model is stable | 20 to 25 days |

Roughly eleven to thirteen weeks of build if done one after the other.

## 1. Search, ClickUp style

What: one search box (Cmd+K anywhere) that finds tasks, projects, clients,
quotes, invoices, and comments as you type, with a keyboard-driven result
list and a few actions mixed in ("New task", "Log time", "Go to Capacity").

How:
- Postgres full-text search: a generated `tsvector` column on
  `work_items` (title, description), `projects`, `clients`, `quotes`,
  `invoices` (number, subject), and `work_item_comments`, each with a GIN
  index. One security-invoker SQL function `search(q text, limit int)`
  returns typed rows (kind, id, title, subtitle, rank), so RLS keeps
  results to what the caller may see.
- `UCommandPalette` from Nuxt UI as the surface, mounted once in
  `app.vue`, opened by Cmd+K or the sidebar search icon. Groups by kind,
  shows the client and project under each hit, arrow keys and Enter to
  open, recent items remembered in localStorage.
- Prefix filters like `t:` tasks, `c:` clients, `#Q-2026` numbers.

Depends on: nothing. Size: 3 days.

## 2. Gantt for task scheduling and people

What: a timeline of tasks by start and due date, grouped by project or
by person, with bars you drag to move or stretch, dependency arrows, and
a capacity strip per person showing booked hours against their week.

How:
- Data already exists for most of it: `work_items.start_on`, `due_on`,
  `estimate_hours`, assignees, `capacity_weekly`. Add
  `work_item_dependencies (predecessor_id, successor_id)` and a
  `is_milestone` flag.
- Render our own timeline (SVG rows, CSS grid columns per day or week)
  rather than a library, since the task list already has drag and drop
  and the visual needs to match the app. Zoom levels: day, week, month.
- Two views on one page, `/schedule`: by project (rows are tasks under
  project headers) and by person (rows are people, bars are their
  tasks, a bar per week shows booked / available from `capacity_weekly`).
- Dragging a bar updates start_on and due_on with the same inline save
  the task list uses; dragging an edge resizes; shift-drag moves a task's
  successors with it. Dependencies draw as arrows and warn when a
  successor starts before its predecessor ends.
- Print CSS so a project timeline can go in a client deck.

Depends on: nothing hard; better after Google Calendar so meetings show
as busy on the person view. Size: 8 to 10 days.

## 3. Feature walkthrough, skippable

What: a first-run tour that points at the real UI, one page at a time,
with Skip on every step, a "show me again" entry in the sidebar, and
short empty-state hints on pages that start blank.

How:
- driver.js (small, no framework lock-in) for the spotlight and
  step cards. Steps are data: page, element selector, title, text.
- `profiles.tours_seen jsonb` records which tours a person finished or
  skipped, so it runs once per person per tour, not per browser.
- Tours: "Getting around" (sidebar, search, theme), "Logging time"
  (week strip, timer, task link), "Tasks" (groups, drag, share for
  review), "Billing" (batch to invoice) for admins.
- Empty states already exist in most tables; extend them with the one
  action the person should take next.

Depends on: build last in wave 2a so it describes the final UI. Size: 2
to 3 days.

## 4. AI integration

### What it does

Five jobs, all assistive, none autonomous. The person always confirms
before anything is written.

1. **Time entry from a sentence.** "2h CINC website copy this morning"
   becomes a filled-in entry (project, task type, hours, notes, date)
   ready to save. Also parses a pasted list of a whole day.
2. **Ask Docket.** Questions in plain language over the reporting data:
   "how many hours on Hills Bank in August", "which projects are over
   budget", "what is unbilled for CheckAlt". Answers with numbers and a
   link to the report that backs them.
3. **Quote drafting.** From a short brief (and optionally a URL to
   crawl for a sitemap), propose scope lines with hours estimated from
   similar past projects (time by task type on projects of the same
   client or kind), and a page list. Lands in the quote editor as a
   draft to edit.
4. **Writing help where the team writes for clients.** Draft or tidy a
   task description, a client-visible comment or reply, an invoice
   subject, a quote introduction. Tone is the company's; inputs are the
   task or quote on screen.
5. **Weekly digest.** Monday morning email per admin: missing time,
   timers left running, projects past 80 percent of budget, invoices
   overdue, tasks due this week with nobody assigned, quotes about to
   expire. Written as short prose with links, not a table dump.

### What it looks like

- An **Assistant drawer** on the right (Cmd+J, or the sparkle icon at
  the bottom of the sidebar). It knows the page you are on: on a task it
  offers "summarise", "draft a client reply"; on Time it offers "log
  from a sentence"; on Reports it is Ask Docket. Answers stream in; any
  proposed write shows as a card with a Save button.
- **Inline "Draft" buttons** next to the big text fields (task
  description, quote intro, comment composer) that open the drawer with
  the right job selected.
- **Digest email** through the existing Resend path and the reminders
  cron.

### How it is built

- Server routes only, `server/api/ai/*`; the Anthropic key lives in
  Vault like the Resend key. The browser never talks to the model.
- Claude Sonnet 5 for drafting and Ask Docket, Claude Haiku 4.5 for
  parsing sentences into entries (cheap and fast). Tool use for data:
  the model calls a small set of read-only tools (`report_time_monthly`,
  `project_budgets`, `unbilled_summary`, task and quote lookups) that run
  through the caller's own Supabase session, so RLS decides what it can
  see, same as the UI.
- `ai_events` table: who asked, which job, prompt, response, tokens,
  and what was saved, for audit and cost. A per-person daily cap.
- No training on the data; standard API data handling. Client names and
  amounts do leave the building to the API, which is worth a line in the
  client agreements if that matters.

Depends on: nothing hard; Ask Docket benefits from Roles (a contractor
should not be able to ask about rates). Size: MVP with jobs 1, 2, and 4
in 6 to 8 days; quote drafting and the digest 4 to 5 more.

## 5. Client logins

What: clients sign in and see their own world: open quotes to accept,
invoices with what is due, tasks waiting on their review, files shared
with them, and the comment threads they are part of.

How:
- Needs Roles and permissions first (item 8): a `client` role and a
  `client_id` on the profile.
- Sign-in by email magic link (Supabase Auth), since clients are not on
  the Google Workspace. Invited from the client page ("Invite a contact");
  `client_contacts` table for names, emails, and which of them can accept
  quotes.
- RLS: client-role policies on quotes, invoices, invoice_payments,
  work_items flagged shared (the review link's public_token stays for
  people without a login), comments visible_to_client, uploaded files.
  Everything else stays admin or staff only.
- A `/portal` layout with no admin chrome: dashboard, quotes, invoices,
  reviews. The public `/q`, `/i`, `/r` pages keep working for people who
  never sign in.
- Notifications: email on new invoice, new quote, task ready for review.

Depends on: Roles and permissions. Size: 7 to 8 days.

## 6. Local server folder per project

What: each project knows its folder on the office server; the project
page shows it with Copy and Open; new task file links default to it.

How:
- `projects.server_path` (an smb:// link or a path) and a template in
  Invoice settings, e.g. `smb://gigantic-server/Jobs/{client}/{code} {name}`,
  filled in when a project is created and editable per project.
- Project page card with the path, Copy, and an Open link (smb:// opens
  Finder on a Mac; Windows needs the UNC form, keep both).
- The task "Link to server file" dialog pre-fills the project folder so
  people only type the file name.

Depends on: nothing. Size: 1 day.

## 7. Google Calendar for availability and scheduling

What: each person's calendar busy time subtracts from their capacity, and
the schedule can propose slots.

How:
- Google OAuth per person (calendar.readonly), consent screen on the
  Workspace project already used for sign-in. Tokens in a
  `google_tokens` table encrypted with Vault, refreshed server-side.
- Nightly cron plus a "Sync now" button: read the next eight weeks of
  events marked busy into `calendar_busy` (already in the schema and
  already subtracted by `capacity_weekly`).
- Optional push: a task's start and due dates as an all-day event on the
  assignee's calendar, updated when the task moves.
- Scheduling: on the Gantt person view, propose the earliest week with
  enough free hours for a task's estimate.

Depends on: nothing for the busy-time part; Gantt for the scheduling
part. Size: 5 days.

## 8. Roles and permissions

What: more than admin and staff. Proposed roles: **admin** (everything),
**manager** (everyone's time and tasks, budgets and capacity, no
billing), **staff** (own time and expenses, all tasks), **contractor**
(own time and assigned tasks only, no rates or client money),
**client** (portal only, item 5).

How:
- Keep `profiles.role` but widen the enum, and add a `permissions`
  table (role, permission key) with `has_permission(key)` as a
  security-definer SQL function. RLS policies that today call
  `is_admin()` switch to the specific permission (`see_all_time`,
  `see_money`, `manage_billing`, `manage_people`, `manage_settings`,
  `manage_tasks`, `see_capacity`). The UI hides what a person cannot do
  through the same function.
- A Settings page to view the matrix; editing per role is admin only.
- Rates: `time_detail.amount` and `rate_snapshot` become null for
  people without `see_money`, so contractors never see dollars.

Depends on: nothing; unlocks client logins and contractors. Size: 5 to
6 days, most of it re-checking every policy.

## 9. Power user shortcuts

What: keyboard-first use for the people who live in it all day.

How:
- Global: Cmd+K search, N new task, T start or stop the timer, G then T
  / E / P / C / I to go to Time, Expenses, Projects, Clients, Invoices,
  ? for the shortcut sheet.
- Task list: J / K move, X select, S status, A assignee, D due date, E
  open, Space quick look; multi-select then S or A or Delete acts on all.
- Time page: arrow keys move days, Enter opens a new entry, . duplicates
  yesterday's entry.
- One `useShortcuts()` composable with a scope stack so a modal owns
  the keys while open; the sheet is generated from the registered list.

Depends on: Search for Cmd+K. Size: 3 to 4 days.

## 10. Bring the signage and vinyl estimator into Docket

What the current tool does (estimator.giganticdesign.com): an
Angular.js app where a job is a size in inches, a quantity, and a stack
of materials (primary vinyl, overlaminate, transfer tape, banner tape,
substrate, mounting tape); it prices each layer per square inch or foot,
sums per unit, multiplies by quantity, groups jobs under a project, and
prints an estimate with a letterhead. Shipping and tax are excluded.

How it fits:
- Data: `estimator_materials` (name, category, cost per square foot,
  waste factor, active), `estimator_labor_rates` (cut, print, weed, apply
  per square foot or per unit), a settings card for markup. Import the
  current material list once.
- A calculator on the quote page ("Add signage job") and on a standalone
  `/estimates/signage` page: width, height, quantity, material per
  layer, finishing options, and the per-unit and total cost with the
  breakdown the current tool shows.
- Output lands as a quote scope line ("3 x 24in x 36in coroplast yard
  signs, printed and laminated", flat amount, breakdown kept in a
  `details` json on the line) so it flows into acceptance, the project
  budget, and later the invoice. The print view is the quote itself.
- Keep the old tool running until the material list and three real
  jobs price the same in both.

Depends on: quoting (done). Size: 5 to 6 days, plus a day with whoever
owns the material prices.

## 11. Reports, laid out like Harvest

What: a Time report that reads like Harvest's. A timeframe bar across the
top (This week, Semimonth, Month, Quarter, Year, Custom, with arrows to
step back and forward), a rollup strip of the totals for the period, a
chart of hours by day or week, then four tabs: Clients, Projects, Tasks,
Team. Every tab is the same table: name, Hours, Billable hours, Billable
amount, Uninvoiced amount, with a totals row. Filters for client,
project, task type, person, and billable or not sit in a row under the
timeframe. Clicking a row drills in: a client shows its projects, a
project shows its tasks and people, a person shows their projects.
Expenses get the same treatment on a second report with Clients,
Projects, Categories, Team tabs. Export the table shown as CSV, and a
Detailed report export of every entry behind it.

How:
- `report_time_monthly` already does most of the grouping. Add a
  `report_time(from, to, client, project, person, task, billable)`
  function that returns one row per group with hours, billable hours,
  billable amount (rate_snapshot times hours), and uninvoiced amount
  (billable rows not yet on a sent invoice), grouped by the tab. Uses
  `time_entries` for the live year and `harvest_archive_monthly` when the
  range reaches back past the cutover, so year over year still works.
- One page, `/reports/time`, with the tabs in `UTabs`, the timeframe
  bar as its own component (`ReportTimeframe`), and the table shared
  across tabs. The current report builder stays as the "Detailed" tab,
  since its saved reports and CSV already work.
- The rollup strip is four cards from the totals row; the chart is a
  bar per day (week, semimonth, month) or per week (quarter, year),
  drawn in SVG to match the app.
- Drilldown is a breadcrumb on the same page: Clients > Hills Bank >
  Projects, with the filters carried in the URL so a view can be
  bookmarked or saved.

Depends on: nothing; data and rate snapshots already exist. Size: 4 to
5 days.

## 12. Report rollup, like Harvest's

What: the summary that sits above every report and on the dashboard.
For the period chosen: Total hours, Billable hours, Billable amount,
Uninvoiced amount, and Expenses, each with the same period last year
underneath for comparison, plus a stacked bar of billable against
non-billable by week.

How:
- A `report_rollup(from, to, filters)` function returning one row, the
  same filters as the time report so the strip and the table always
  agree. Last-period comparison is a second call with the dates shifted.
- Component `ReportRollup` used on Reports, on the dashboard (this
  month, everyone), and on the client, project, and person pages (that
  record, this year).

Depends on: shares the SQL with item 11, so build them together. Size:
included in item 11's 4 to 5 days.

## 13. Rollups on detail pages

What: the client, project, and person pages open with their numbers,
not just their lists. Client page: hours this year, billable amount,
invoiced, paid, outstanding, unbilled, and a table of its projects with
hours and budget used. Project page: hours against budget, billable and
unbilled amounts, a breakdown by task type and by person, and the last
time anyone logged to it. Person page (People, and each person's own
Time page header): hours this week and month against their weekly
target, billable share, and a breakdown by project.

How:
- The client and project numbers come from `project_budget_status`,
  `unbilled_time`, `invoices`, and `invoice_payments`, which already
  exist; add two small views, `client_rollup` and `project_rollup`, so
  each page is one query. The per-person breakdown reuses `report_time`
  from item 11 with the record as the filter.
- Each page gets a rollup card row at the top (the `ReportRollup`
  component from item 12 with a page-specific set of figures) and a
  breakdown card with a link that opens the full report already
  filtered to that record.
- Staff see their own numbers only; rates and amounts follow the money
  permission once Roles ship, until then admin only.

Depends on: items 11 and 12. Size: 2 to 3 days.

## 14. Sidebar navigation rework

Added 2026-09-02 by Luke: "it's getting long, needs better
organization."

What: the rail has grown to nineteen entries in four sections (Work,
Accounts, Manage, Settings), and Settings alone is seven. Reorganise so
the daily items are one click and the rest are one hop away.

How:
- Top of the rail, always visible: Time, Tasks, Projects, Clients,
  Reports, plus Search once it exists. These are the five to six things
  people open every day.
- A "More" group for the weekly and monthly items: Expenses, Quotes,
  Capacity, Time off, Billing, Invoices.
- Settings collapses to a single gear entry that opens a settings page
  with its own left nav (People, Project settings, Task statuses, Task
  types, Expense categories, Invoice settings, Imports). The two import
  pages go under one "Imports" entry since they are used once.
- Role aware: staff never see Billing, Invoices, Quotes, or Settings at
  all, so their rail is short by default.
- Keep the collapsed icon rail and the hover labels; on hover or focus
  the rail can expand to show labels, the way Supabase's does.
- Same treatment on the mobile slideover.

Depends on: nothing; better done before the walkthrough so the tour
describes the final layout. Size: 1 to 2 days.

## 15. Mac desktop shell

Built 2026-09-02, ahead of the rest of 2a, at Luke's request. A Tauri 2
shell in `desktop/` around the live site, so dropped folders and files
carry real paths, mapped from the mounted volume back to the smb://
share, and smb links open in Finder. Unsigned until there is an Apple
Developer account; see `desktop/README.md`.

## Not in this list but worth a word

- **Custom domain** (docket.giganticdesign.com) and Resend domain
  verification, so client emails come from the company and links are
  clean. Half a day, mostly DNS.
- **Harvest invoice history import** still needs an administrator
  token before the Harvest account closes.
