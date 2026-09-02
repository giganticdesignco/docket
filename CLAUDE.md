# CLAUDE.md

Internal time / retainer / expense tracking app for Gigantic. Replaces
Harvest. ~14 users. Not a product, not multi-tenant, not public.

## Stack

- Nuxt 4, TypeScript, `<script setup>`
- `@nuxtjs/supabase` for auth and client
- Nuxt UI v3 for components
- Supabase: Postgres, Auth, Storage, Edge Functions
- Deployed to Vercel
- Resend for transactional email

## Non-negotiables

- **RLS is the security model.** Do not build an API layer that bypasses
  it. Client talks to Supabase directly for normal CRUD. Server routes
  exist only for secrets (QuickBooks, ClickUp, Google) and the public
  quote zone.
- **Never use the service role key client-side.** It only appears in
  `server/api/` routes.
- **Rates are frozen per entry.** `time_entries.rate_snapshot` is set by
  a DB trigger. Never recompute a rate at read time in app code.
- **No em dashes in any UI copy.**

## Schema

`schema.sql` in the repo root is the source of truth. Read it before
writing queries. Key things that are not obvious:

- `is_locked` / `batch_id` on time entries and expenses means "claimed by
  a billing batch." Locked entries cannot be edited by staff.
- Rate resolution order: `project_tasks.hourly_rate` → `projects.hourly_rate`
  → `profiles.default_rate`. Handled by `resolve_rate()`, not app code.
- One running timer per user is enforced by a partial unique index. The
  timer UI must handle that conflict, not prevent it optimistically.
- `time_monthly_all` unions live data with `harvest_archive_monthly` so
  year-over-year reporting works across the cutover.
- We do NOT invoice. `billing_batches` groups unbilled work and pushes to
  QuickBooks Online. QBO owns invoice numbers, AR, and payment status.

## Roles

`admin` and `staff` only. `is_admin()` is a security-definer SQL function.
Staff see their own time and expenses plus all reference data. Admins see
everything.

## Conventions

- Composables in `composables/`, prefixed `use`
- Server routes named by method: `foo.get.ts`, `foo.post.ts`
- Dates: `date` columns for anything a human picks, `timestamptz` for
  machine timestamps. Never store a naive timestamp.
- Money is `numeric`, never float

## Working style

- Smallest change that solves the problem. No speculative abstraction.
- State assumptions before implementing. If two interpretations exist,
  ask rather than picking silently.
- Every task gets a verify step. "Add X" becomes "add X, then confirm Y."
- Don't refactor adjacent code that isn't broken.

## Build order

Currently on step 1. Do not skip ahead.

1. Auth + profiles + clients + projects + tasks
2. Time entries + timer + week view
3. Harvest import (archive rollup + current year live)
4. Expenses + receipt upload
5. Retainers + budget views
6. Reminders + email
7. Reports + CSV
8. QuickBooks push  ← Harvest can be cancelled after this
9. Capacity + ClickUp sync
10. Quoting

## Gotchas

- `redirectOptions.exclude: ['/q/**', '/login', '/callback']` in the
  Supabase module config. Without it, client-facing quote links bounce to
  a login screen.
- QuickBooks OAuth refresh tokens expire every 100 days. Handle re-auth
  and alert on failure, or the push dies silently.
- Assume QuickBooks Online. If it turns out to be Desktop, step 8 is a
  CSV/IIF import instead.
