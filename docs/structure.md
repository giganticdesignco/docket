# Harvest Replacement — App Structure

> Written before the build, kept for the reasoning. It is not kept in
> step with the code: there is no Capacity page any more, crons run on
> Vercel rather than edge functions, and the page list has grown. For
> what exists, read `schema.sql`, `docs/status.md`, and `docs/guide.md`.

Nuxt 4 + Supabase, deployed to Vercel. Two routing zones: authenticated
internal app, and a public token-gated zone for client-facing quotes.

**Hosting:** Vercel (Node runtime, no package compatibility constraints).
Supabase hosts Postgres + Storage. Deliberately NOT on the Plesk client
server: keeps agency rate/retainer/audit data off the box running client
sites, and decouples uptime from client maintenance windows.
Rough cost: Vercel free tier likely sufficient, Supabase ~$25/mo.

---

## Middleware zones

| Zone | Path | Auth |
|---|---|---|
| Internal | everything not listed below | Supabase session required |
| Public quote | `/q/[token]` | none, token is the credential |
| Auth | `/login`, `/callback` | none |

Set `@nuxtjs/supabase` `redirectOptions.exclude: ['/q/**', '/login', '/callback']`.
That is the single config line that makes the public zone work. Get it wrong
and clients get bounced to a login screen.

---

## Routes

```
pages/
  index.vue                    # today: timer, today's entries, week total

  time/
    index.vue                  # my timesheet, week view, the daily driver
    [id].vue                   # edit single entry

  projects/
    index.vue                  # list, filter by client/active
    [id]/
      index.vue                # overview: budget burn, recent entries
      settings.vue             # rates, tasks, budget (admin)

  clients/
    index.vue
    [id].vue                   # projects, retainers, YTD hours

  expenses/
    index.vue                  # mine, with receipt upload
    [id].vue

  timeoff/
    index.vue                  # my PTO + company holidays calendar

  capacity/
    index.vue                  # capacity_weekly view, team grid

  reports/
    index.vue                  # saved_reports list
    builder.vue                # pick view + filters + group by, export CSV

  billing/
    index.vue                  # unbilled time/expenses by client, build a batch
    [id].vue                   # review batch, push to QuickBooks, see QBO status

  quotes/
    index.vue                  # internal list
    [id]/
      index.vue                # edit line items
      sitemap.vue              # the Octopus.do tree builder
      preview.vue              # renders same component as public view

  admin/
    users.vue                  # roles, default_rate, availability
    tasks.vue
    audit.vue                  # audit_log viewer
    archive.vue                # harvest_archive_monthly

  q/
    [token].vue                # PUBLIC client-facing quote + accept

  login.vue
```

---

## Server routes

Only for things that must not run client-side. Everything else goes
straight to Supabase from the browser via RLS.

```
server/api/
  quote/[token].get.ts         # service-role read, bypasses RLS by token
  quote/[token]/accept.post.ts # records acceptance, spawns project
  clickup/sync.post.ts         # ClickUp API key lives here
  qbo/push.post.ts             # build QBO Invoice payload, POST, store ref
  qbo/callback.get.ts          # QuickBooks OAuth2 callback
  qbo/sync-customers.post.ts   # pull QBO customer list for mapping
  calendar/sync.post.ts        # Google OAuth refresh
  reports/export.get.ts        # streams CSV
```

The quote token: random 32-char, stored on `quotes`, not guessable. Add a
`public_token text unique` column to `quotes` and index it. Server route
uses the service role key so the client never needs a Supabase session.

---

## Edge functions (scheduled)

| Function | Cadence | Does |
|---|---|---|
| `timer-watchdog` | hourly | timers running > 10h, email the owner, log to `reminder_log` |
| `missing-time` | daily 9am | no entries yesterday, nudge |
| `clickup-sync` | every 30m | upsert `clickup_assignments` |
| `calendar-sync` | nightly | upsert `calendar_busy` |

Schedule with pg_cron calling the function URL. Resend for email.

---

## Composables

```
composables/
  useTimer.ts        # start/stop/switch, optimistic, handles the
                     # one-running-timer unique index conflict
  useCurrentUser.ts  # profile + role, wraps is_admin checks
  useRates.ts        # display-side rate resolution (server is truth)
  useCsv.ts
```

`useTimer` is the piece that decides whether people adopt this. Starting a
timer should be one tap from anywhere. Put it in the app header, not a page.

---

## Build order

1. Auth + profiles + clients + projects + tasks → verify: admin can create a project, staff can see it
2. Time entries + timer + week view → verify: two users log time, neither sees the other's entries
3. Harvest import (archive rollup + live year) → verify: a known 2025 month matches Harvest's own report
4. Expenses + receipt upload → verify: file lands in Storage, RLS blocks cross-user read
5. Retainers + budget views → verify: burndown matches a hand-calculated month
6. Reminders + email → verify: a timer left running triggers exactly one email
7. Reports + CSV → verify: export matches on-screen totals
8. QuickBooks push → verify: one real client month produces a QBO invoice
   whose total matches the batch subtotal to the cent
9. Capacity + ClickUp sync → verify: booked hours reconcile against ClickUp UI
10. Quoting (phase 3)

Ship after 8. That is the point Harvest can be cancelled.
Run one month in parallel (both systems, same data) before cutting over.

---

## Open decisions

- Quote acceptance is a typed name, not a signature. If legal needs real
  e-sign, keep PandaDoc for that step and link out from `/q/[token]`.
- Invoicing goes to QuickBooks Online, not built here. Confirm QBO is
  Online not Desktop, and map clients.qbo_customer_id before first push.
- QuickBooks OAuth2 tokens refresh every 100 days. Store refresh token in
  Supabase and handle re-auth, or the push silently dies in 3 months.
- ClickUp estimates are often missing in practice. Capacity view will be
  wrong until the team actually fills them in. Worth checking before
  building step 8.
- Watch Vercel usage-based billing. Unlikely to bite at 14 users, but set
  a spend alert rather than finding out from an invoice.
