# Permissions

Luke asked on 2026-09-04 for "a comprehensive view permissions tool":
screens, per-person overrides, view as, and fields. This is what
shipped the same day. The matrix on Settings, Permissions is the tool.

## Keys

Everything is a key in the one `permissions (role, key)` table, and
`has_permission(key)` is the one question the app and RLS ask. Three
kinds:

- `screen:<name>` says a role can open a screen. The rail lists a
  screen only when the role has its key and the global `screens`
  middleware sends anyone else home. Home, a task page opened from a
  link, Account, Notifications, Help, the portal and the public pages
  are always open. A screen that is on still hides what its own
  permissions hide.
- The original action keys (`see_money`, `manage_invoices`, ...) are
  unchanged and still gate the settings pages and the write paths.
- `field:<name>` says which money the screens show: `rates`,
  `amounts`, `budgets`, `cost_margin`. A field also needs `see_money`,
  because that is what the views and RLS null money on; fields cut
  finer inside that, in the UI only.

`permission_overrides (user_id, key, allowed)` grants or revokes one
key for one person. `has_permission()` reads the override first, then
the role, so RLS and the views follow it. Admins keep everything.

Seeds on day one: every non-client role got the everyday screens
(Time, Tasks, Projects, Clients, Schedule, Estimator, Expenses, Time
off, Retainers); gated screens followed the key that gated them
(Reports from see_all_time, Quotes from manage_quotes, Planner from
see_capacity, Approvals from approve_time, Billing and Invoices from
manage_invoices, Settings from manage_settings or manage_people); every
role with see_money got all four fields. So nothing changed for anyone.

## The page

Four tabs on Settings, Permissions: Screens, Actions, Money fields,
People. The first three are role by key grids. People picks a person
and shows every key with what the role says and a Role default,
Allowed, Not allowed choice that writes the override. View as buttons
sit on each role column and on the person.

## View as

An admin can look at Docket as a role or as a person. `useCurrentUser`
keeps a `viewAs` state (also in sessionStorage so a reload keeps it);
`can()` and `isAdmin` then answer for that role plus that person's
overrides, so the rail, the guards and the money fields show what they
would see. The data on screen is still the admin's own: RLS runs as
the admin. A strip across the top says who you are viewing as, with
Back to admin. Sign out clears it.

## Where fields apply

Project page: rates (hourly rate, task type rates), budgets (budget
amount and burn), amounts (quote and invoice totals). Client page:
amounts on the billing card, budgets on the project burn. Quote page
and invoice page: cost and margin. People form: cost rate. Approvals,
the report rollup and the retainer page: amounts. Everything else that
shows money still keys off see_money through the views.

## Money at the database

Since 2026-09-04 the rate columns are not readable off the tables by
anyone signed in through the app's key. `authenticated` has
column-level SELECT on profiles, projects, project_tasks and
time_entries that leaves out `default_rate`, `cost_rate`,
`hourly_rate`, `rate_snapshot` and `cost_snapshot`. Rates come only
through three owner-run views, `profile_rates`, `project_rates` and
`project_task_rates`, each of which keeps its table's row rule and
returns null without see_money. `time_detail` runs as its owner too,
with the time entry read rule inside it (`time_entry_readable()`), and
nulls amount without see_money as before. The trigger that freezes a
rate onto an entry (`set_rate_snapshot`, through `resolve_rate`) runs
as definer, so saving time still resolves a rate the saver cannot read.

Consequences for code: `select('*')` on those four tables fails with
permission denied; use `PROFILE_COLS`, `PROJECT_COLS` and
`TIME_ENTRY_COLS` from `app/utils/columns.ts`, and `.select(...)` after
an insert or update on them must name columns too. A column added to
one of them later needs `grant select (col) on <table> to
authenticated` in the same migration. Invoice line amounts are not
part of this: invoice_lines is already limited by RLS to people with
manage_invoices and to the client on the invoice.
