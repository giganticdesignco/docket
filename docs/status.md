# Status

Last updated: 2026-09-01, local session finishing step 1 sign-off.

## Where things stand

Step 1 (auth, profiles, clients, projects, tasks) is coded, typechecked,
built, and pushed on `claude/docket-schema-auth-i7jyom`. Admin and staff
flows are verified in a real browser. Step 1 is signed off.

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

## Step 1 sign-off

Done. Next is step 2: time entries + timer + week view.

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
