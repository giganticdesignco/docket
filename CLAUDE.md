# CLAUDE.md

Internal time, task, retainer, expense, quote, and invoice app for
Gigantic Design Co. Replaces Harvest and ClickUp. ~14 team users plus
client logins for a portal. Not a product, not multi-tenant.

Live at https://docket-wine-one.vercel.app. A git push deploys it; never
run `vercel --prod` (it once uploaded the 2 GB desktop build).

## Stack

- Nuxt 4, TypeScript, `<script setup>`, Nuxt UI v3 (Tailwind v4)
- `@nuxtjs/supabase` for auth and client
- Supabase: Postgres, Auth (Google sign-in, OAuth 2.1 server for MCP),
  Storage, pg_cron + pg_net
- Vercel (crons in `vercel.json`), Resend for email (key in Vault)
- Anthropic API for the assistant (`server/utils/ai.ts`)
- `desktop/`: a Tauri 2 Mac shell around the live site

## Non-negotiables

- **RLS is the security model.** The client talks to Supabase directly
  for normal CRUD. Server routes exist only for secrets (Harvest,
  ClickUp, Google, Anthropic, Resend), the cron jobs, the public quote,
  invoice, and review pages, and the MCP endpoint, which runs as the
  caller through RLS.
- **Never use the service role key client-side.** It only appears in
  `server/`.
- **Rates are frozen per entry.** `time_entries.rate_snapshot` is set by
  a DB trigger. Never recompute a rate at read time in app code.
- **No em dashes in any UI copy.** American spelling (color, gray,
  canceled), in the app and the docs.
- **Never delete real data in tests.** ClickUp tasks and Harvest entries
  are live. Test rows carry an obvious marker and are removed after.
- **Commit and push after each verified item** (Luke authorized this
  2026-09-03 while the app is in development). One item per commit.
  Leave `package-lock.json` out of commits.

## Schema

`schema.sql` in the repo root is the source of truth and mirrors every
migration; change both. Read it before writing queries. Not obvious:

- `is_locked` / `batch_id` on time entries and expenses means "claimed by
  a billing batch." Locked entries cannot be edited by staff.
- Rate resolution: `project_tasks.hourly_rate`, then `projects.hourly_rate`,
  then `profiles.default_rate`, by `resolve_rate()`, not app code.
- One running timer per user, enforced by a partial unique index. The
  timer UI and the MCP tool handle the conflict; they do not prevent it.
- `time_monthly_all` and `report_*` union live data with
  `harvest_archive_monthly` so reporting works across the cutover.
- Invoicing is in Docket. `billing_batches` groups and locks unbilled
  work; `create_invoice()` turns a batch into `invoices` with lines.
  Money columns on invoices come from `recalc_invoice()` triggers.
  Public pages: `/i/<token>` invoice, `/q/<token>` quote, `/r/<token>`
  task review.
- **Security definer functions in policies and views must be wrapped**
  as `(select public.fn())` so they run once per query, not per row.
  Per-row `has_permission()` and `task_visible()` made pages take
  seconds. In `for all` policies put the cheap check first with CASE.
- `user_views (user_id, key, state)` remembers how each person left each
  screen. `useViewState(key, defaults)` and `persisted(view, field)`.
- **Deletes are soft** on tasks, time entries, expenses, and comments: a
  BEFORE DELETE trigger sets `deleted_at`, RLS hides the row,
  `restore_deleted()` brings it back within thirty days, pg_cron purges
  after. App code still calls `.delete()` and then `useUndo().offerRestore`.
  Any new security definer function that reads those tables must filter
  `deleted_at is null` itself.

## Roles and permissions

`roles` table: admin, manager, staff, client are built in; custom roles
allowed. `permissions (role, key)`; `has_permission(key)` and
`is_client()` are security definer. In the app: `useCurrentUser().can(key)`
and `definePageMeta({ middleware: 'can', permission })`. Clients see only
their own client's projects, tasks marked visible, quotes, and invoices,
through `/portal`. Staff see their own time and expenses unless they have
`see_all_time`; `see_money` gates amounts (views return null without it).

## Conventions

- Composables in `app/composables/`, prefixed `use`
- Server routes named by method: `foo.get.ts`, `foo.post.ts`
- Pages: start every `useAsyncData` first, then `await Promise.all([...])`,
  then destructure. The app is `ssr: false`; only `/q`, `/i`, `/r`, and
  `/login` render on the server.
- Forms open in `AppDrawer` (a right-hand slideover). `UModal` only for
  short confirms: delete, void, one-field prompts.
- Dates: `date` columns for anything a human picks, `timestamptz` for
  machine timestamps. Never store a naive timestamp.
- Money is `numeric`, never float. Hours may display as h:mm.
- Tailwind v4: a CSS variable width is `w-(--x)`, not `w-[var(--x)]`.

## Working style

- Smallest change that solves the problem. No speculative abstraction.
- State assumptions before implementing. If two interpretations exist,
  ask rather than picking silently.
- Every task gets a verify step, in the browser (the dev server is
  `docket-dev`; new pages, components, and composables need a restart).
- Don't refactor adjacent code that isn't broken.
- Notes for the next session go in `docs/status.md`; plans in
  `docs/phase-2.md` and `docs/phase-3.md`.
- `docs/guide.md` is the user guide, rendered in the app at `/help`.
  When a screen or rule changes, change the guide in the same commit.

## Where the build stands

Steps 1 to 10 of the original order are done (auth through quoting,
invoicing in Docket, capacity, ClickUp import). Phase 2 shipped
2026-09-02: search, Gantt schedule, roles and permissions, client
logins and portal, notifications and @mentions, Google Calendar,
keyboard shortcuts, walkthrough, estimator, Harvest-style reports and
rollups, sidebar rework, Mac desktop shell, AI assistant. Phase 3
shipped 2026-09-02: view persistence, desktop update notice, modals to
drawers, MCP server (`/api/mcp`, OAuth through Supabase, consent page at
`/oauth/consent`, Claude card on the Account page). Phase 4 (the PM's
Scoro notes, `docs/phase-4.md`) shipped 2026-09-03: project page
upgrade, quote catalog and margins, quotes board, project templates,
departments, inline timer, finer permissions, retainer page, Planner,
Home dashboard, timesheet approvals, invoice cost and margin. Same day,
after Phase 4: Planner laid out like Scoro (people by weekday, drag to
plan, stretch, hours per day in `work_item_plans`), Capacity page
removed, approvals routed to department leads, arrangeable table
columns (`useColumns` + `TableHead`), Clients list money and team
columns, client page team and tasks, Estimator to new quote, the
morning brief (`/api/ai/brief`). `docs/status.md` has the detail per
item, newest at the bottom.

Open on Luke's side: set department leads and put people in
departments (approvals fall to approve_time holders until then), an
Apple Developer account to sign the Mac app, the Harvest admin token for
invoice history, cancelling Harvest. MCP is live and verified.

## Gotchas

- `redirectOptions.exclude: ['/q/**', '/i/**', '/r/**', '/login', '/callback']`.
  Without it, client-facing links bounce to the login screen.
  `saveRedirectToCookie` sends a signed-out person back where they were
  headed (the OAuth consent page needs this).
- Vercel crons send `CRON_SECRET` as a bearer token; cron routes check
  `runtimeConfig.cronSecret` and nothing else may call them. Crons:
  `/api/google/sync-all` (calendars, nightly), `/api/ai/digest` (Monday),
  `/api/sync/morning` (ClickUp tasks and Harvest time, expenses, and
  project budgets, every morning; `?dry=1` for a no-write check).
- QuickBooks is not in the billing path. The `qbo_*` columns on clients,
  tasks, and billing_batches are unused scaffolding.
- The desktop shell is unsigned until there is an Apple Developer
  account; `desktop/release.sh` cuts a build and the app shows a banner
  from `public/desktop/latest.json`.
