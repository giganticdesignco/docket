# Status

Last updated: 2026-09-01, local session, step 2 built and browser-verified.

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
