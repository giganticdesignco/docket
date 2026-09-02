# Status

Last updated: 2026-09-02, end of the cloud session that built step 1.

## Where things stand

Step 1 (auth, profiles, clients, projects, tasks) is coded, typechecked,
built, and pushed on `claude/docket-schema-auth-i7jyom`. Not yet verified
in a real browser with Google sign-in. That is the next thing to do.

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

## Still to do for step 1 sign-off

1. `git pull` on the local clone (the fix above is on GitHub, not yet pulled).
2. As luke@: open project Website, click Tasks, switch Task 1 on, Save.
   Confirm it shows under Tasks on the project page.
3. Sign in as sean@ in a private window: sees clients, projects, tasks,
   no New/Edit/Tasks buttons, no Tasks link in the header, and visiting
   /admin/tasks or /projects/<id>/settings redirects home.
4. Fix full names on both profiles (currently "Luke" and "Sean" from the
   email prefix). No profile page yet; do it in the SQL editor or add one.
5. Then step 1 is done. Step 2 is time entries + timer + week view.

## Local verify commands

- `npm run typecheck`
- `npm run build`
- `npm run schema:check` (needs a local Postgres and PGHOST/PGPORT/PGUSER)

## Open flags

- Nuxt UI is pinned to v3 per CLAUDE.md. v4 is current. Decide before the UI grows.
- See the TODO list at the top of `schema.sql` for schema-level flags.
