# Status

Last updated: 2026-09-02, local session, step 7 done and the 2026 Harvest sync run.

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

Step 8 needs a decision first (2026-09-02). Luke learned that Gigantic
does all billing through Harvest, invoices and payment follow-up
included, not QuickBooks. CLAUDE.md's "we do NOT invoice, QBO owns
invoice numbers, AR, and payment status" was the wrong premise, so a
QBO push alone would not let Harvest be cancelled. Options, for Luke to
pick:

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
  progress bars, colour at 80% and 100%) and Recent entries (last 10 from
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
