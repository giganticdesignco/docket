# Handoff

Where Docket stands on 2026-09-04, for whoever picks it up next: a
person, or a fresh Claude session. Read this, then `CLAUDE.md` for the
rules, `docs/guide.md` for what the app does from a user's seat, and
`docs/status.md` for the item-by-item history (newest at the bottom).

## What it is

Gigantic Design Co.'s internal time, task, retainer, expense, quote and
invoice app. It replaced Harvest and ClickUp in September 2026. About
fourteen staff plus client logins for a portal. Not a product, not
multi-tenant. Live at https://docket-wine-one.vercel.app; a push to
`main` deploys it (Vercel tracks `main`). Never run `vercel --prod`.

## Running it

- `npm install`, then `npm run dev` (or the `docket-dev` preview
  server in Claude Code). New pages, components, composables and
  utils need a restart; everything else hot-reloads.
- `.env` holds the keys listed in `.env.example`: Supabase URL and
  publishable key, the Supabase secret key (server only), Harvest,
  ClickUp, the cron secret, Google Calendar OAuth, Anthropic. Resend's
  key lives in Supabase Vault, not in `.env`.
- `npx nuxt typecheck` must be clean before a commit. The volar
  warnings are noise; the exit code is what matters.
- Verify in a real browser, signed in as a staff user, before every
  commit. One item per commit, then push.

## Where things live

- `app/pages` are the screens, `app/components` the pieces, and
  `app/composables` the shared state and queries. `app/utils` holds
  the auto-imported helpers: `format.ts` (money, initials, apiError),
  `columns.ts` (the column lists for the money-gated tables),
  `invoice.ts`, `rollup.ts`, `retainer.ts`, `selectAll.ts`, `time.ts`.
- `shared/types/app.ts` is the source for permissions, screens, money
  fields, settings pages and notification kinds. `shared/types/
  database.ts` is generated from Supabase; regenerate it in the same
  commit as a schema change.
- `schema.sql` mirrors every migration and is the source of truth for
  the database. Change both, always.
- `server/` exists only for secrets, the crons, the public pages, the
  assistant, and the MCP endpoint. Everything else talks to Supabase
  from the browser under RLS.
- `docs/permissions.md` explains the permission model, including the
  money gate at the database.

## What shipped on 2026-09-04

Eighty-five commits. In order of weight:

- **Up now and Following** (`docs/up-now.md`): every task keeps its
  people; one of them is up right now, or nobody is, shown as a state.
  Hand-offs, the Whose turn drawer, nudges, the Planner and Home read
  it. Following is bells only.
- **Roles and permissions**, the full tool: screens, actions, money
  fields, per-person overrides, View as.
- **Retainers** with monthly, quarterly and yearly terms, renewing on
  their own, one Retainer project per client, seeded from the old
  monthly jobs.
- **The feedback tool** (Cmd+Shift+F, or the right rail): pick a thing
  on screen, say what is wrong. Statuses open, approved, on hold, done.
  A Claude session works only from the Approved list, through the MCP
  tools `list_feedback` and `resolve_feedback`.
- **An agentic code review** of the whole app: 78 confirmed findings,
  all fixed, the last one being the money gate at the database
  (rates are unreadable off the base tables without see_money).
- **Live updates** on the task screens through Supabase realtime.
- **The two rails**: pages on the left, tools on the right. Skeletons
  shaped like each page while it loads, and one before the app is up.
- **The assistant** can answer "how does Docket work" from the guide.
- Smaller: subtasks with drag to nest, a personal task order, the
  unsorted tasks page, breadcrumbs everywhere, one action row on every
  document page, searchable long dropdowns, the full-screen sitemap,
  the logo and favicon, the easter eggs.

## The rules that bite

These are in `CLAUDE.md` too; they are the ones a newcomer trips on.

- `select('*')` fails on profiles, projects, project_tasks and
  time_entries. Use the column lists in `app/utils/columns.ts`, and
  take rates from `profile_rates`, `project_rates`,
  `project_task_rates`. A new column on one of those tables needs its
  own `grant select` in the migration.
- A database change that breaks old client code goes in two
  migrations: the readers first, deploy, then the break. Production and
  dev share one database.
- Security definer functions in policies and views are wrapped as
  `(select fn())`, or pages take seconds.
- `useAssistantScreen()` runs its getter at once; call it after the
  refs it reads exist.
- Deletes are soft. Test rows carry an obvious marker (`ZZ TEST`) and
  are purged after with `set local docket.purge = 'on'`.
- No em dashes in UI copy. American spelling. Guide changes go in the
  same commit as the screen they describe.

## Open on Luke's side

- Set department leads and put people in departments. Until then
  approvals fall to whoever has approve_time.
- An Apple Developer account to sign the Mac app (`desktop/`).
- The Harvest admin token, then cancel Harvest.
- Rates: no project, task type or person has a rate yet, so money is
  mostly blank. Set them on Settings, People and on each project's
  Task types page; the frozen rate on new entries follows from there.

## How a Claude session should start

1. Read `CLAUDE.md`, then this file, then the last few sections of
   `docs/status.md`.
2. Call `list_feedback` through the Docket connector. Work only from
   the Approved list, one row per commit, verify in Luke's browser,
   mark the row done, push.
3. If a change touches a screen or a rule, change `docs/guide.md` in
   the same commit and add a section to `docs/status.md`.
