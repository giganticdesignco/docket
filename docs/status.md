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

## Still to do for step 1 sign-off

1. Supabase dashboard > Authentication > URL Configuration: add
   `http://localhost:3000/callback` to Redirect URLs.
2. `npm run dev`, sign in as luke@ with Google, create a client, project,
   task, assign the task to the project.
3. Sign in as sean@ in a private window: sees all of it, no edit buttons.
4. Fix full names on both profiles (currently "Luke" and "Sean" from the
   email prefix). No profile page yet; do it in the SQL editor or add one.

## Local verify commands

- `npm run typecheck`
- `npm run build`
- `npm run schema:check` (needs a local Postgres and PGHOST/PGPORT/PGUSER)

## Open flags

- Nuxt UI is pinned to v3 per CLAUDE.md. v4 is current. Decide before the UI grows.
- See the TODO list at the top of `schema.sql` for schema-level flags.
