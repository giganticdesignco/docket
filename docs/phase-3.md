# Docket Phase 3 plan

Written 2026-09-02, after Phase 2 shipped. Four asks from Luke, each
with what it is, how it would be built on what exists, what it depends
on, and a rough size in working days, built the way Phases 1 and 2 were
(schema first, RLS as the security model, verify in the browser, then
commit on "commit push").

## Suggested order

| Order | Item | Why | Size |
| --- | --- | --- | --- |
| 1 | View persistence | Small, touches every screen people use daily, no outside setup | 1.5 days |
| 2 | Desktop update notice | Small, but needs a home for the DMG before it means anything | 1 day |
| 3 | Modals become drawers | Mechanical, one component then 32 tag swaps | 1 day |
| 4 | MCP server | Biggest piece; needs the OAuth server switched on in Supabase first | 3 days |

About a week and a half in total.

## 1. View persistence

What: every screen opens the way you left it, on any device. Today only
the tasks list remembers list versus cards, and only in that browser's
localStorage, so the desktop app and Chrome disagree.

What gets remembered, per person:
- Tasks: list or cards, group by, sort, mine or everyone, show completed,
  collapsed groups, project and person filters.
- Reports: tab, date range preset, filters, the columns shown.
- Time: week or day view.
- Schedule: zoom level and the group open.
- Capacity: range.
- Invoices, quotes, expenses: status filter and sort.
- Sidebar: which sections are collapsed.

Not remembered: free-text search boxes, and anything already in the URL
(a shared link with `?tab=` in it still wins over the saved state).

How:
- One table, `user_views (user_id, key, state jsonb, updated_at)`, primary
  key `(user_id, key)`, RLS: own rows only. One row per screen, so
  `('tasks', {"view": "cards", "group": "client"})`.
- A composable `useViewState(key, defaults)` returns a reactive object.
  First use loads every row for the signed-in user into a session store
  (one query, then free); changes write back debounced half a second
  with upsert. Pages replace their local `ref`s with it; the tasks page
  drops its localStorage code.
- A small "Reset view" link on each screen that clears the row.

Depends on: nothing. Size: 1.5 days.

Assumption to confirm: filters persist too, not only layout. If a person
filters tasks to one project on Friday, Monday opens on that project.

## 2. Desktop update notice

What: the Mac app tells you when a newer build exists, with a button to
get it. Today the shell is 0.1.0, unsigned, handed round as a DMG; nobody
would know a new one existed.

How, the plain version (recommended now):
- A public file `desktop/latest.json` on the site
  (`{ "version": "0.2.0", "url": "...Docket-0.2.0.dmg", "notes": "..." }`).
- The shell reads its own version from Tauri and the web app, when it
  runs inside the shell, fetches `latest.json` on launch and once a day.
  If newer, a banner under the top bar: "Docket 0.2.0 is available.
  Download" with the notes. Dismiss remembers per version.
- The DMG lives in a public Supabase Storage bucket, `desktop`, uploaded
  by Luke after `npm run tauri build`. A tiny script in `desktop/`
  bumps the version in `tauri.conf.json` and `Cargo.toml`, builds, and
  prints the two things to upload.

How, the full version (later, once there is an Apple Developer account):
- `tauri-plugin-updater` with a minisign key pair. The app downloads and
  installs the new build in place and relaunches. Needs the private key
  on whichever machine builds, and the signed `latest.json` the plugin
  expects. Without Apple notarisation the replaced app may trip
  Gatekeeper on next launch; not verified, which is why the plain
  version comes first.

Depends on: a public bucket for the DMG. Size: 1 day.

## 3. MCP server

What: Docket as a remote MCP server, so Claude (Claude Code, the Claude
app, claude.ai) can do what the Harvest MCP does today: log time, start
and stop the timer, list your tasks, add a comment, pull a rollup. You
sign in as yourself and Claude only sees and does what you can.

How:
- Auth is Supabase's own OAuth 2.1 server (Authentication, OAuth Server
  in the dashboard; Luke turns it on and enables dynamic client
  registration so Claude clients register themselves). MCP clients
  discover it from `/.well-known/oauth-authorization-server/auth/v1` on
  the project URL. Docket hosts the consent page at `/oauth/authorize`:
  a signed-in team member sees the client's name and approves or
  denies, and Docket calls `supabase.auth.oauth.approveAuthorization`.
  Client-role users are refused.
- The endpoint is `server/api/mcp.post.ts` (plus GET and DELETE for the
  protocol), Streamable HTTP, stateless so it runs on Vercel. It uses
  `@modelcontextprotocol/sdk`. Each request carries the Supabase access
  token as a Bearer token; the route validates it with `auth.getUser`
  and builds a Supabase client as that user, so RLS decides everything.
  Same pattern as `caller()` in `server/utils/ai.ts`, and the read
  tools there (search, report_rollup, report_time, project_budgets,
  unbilled, get_task, my_tasks, quote) are reused as is.
- New write tools: `log_time`, `start_timer`, `stop_timer`,
  `update_time_entry`, `create_task`, `update_task`, `add_comment`,
  `my_week`. No delete tools.
- `/.well-known/oauth-protected-resource` on the Docket domain points
  clients at the Supabase auth server.
- A short page in Settings, "Connect Claude", with the URL to paste and
  the `claude mcp add` command, plus a list of approved clients with
  revoke.

Depends on: Luke enabling the OAuth server in the Supabase dashboard.
Size: 3 days.

Assumptions to confirm: writes are in scope (logging time and commenting
is most of the point); the token check happens on every call, no
long-lived Docket API keys.

## 4. Modals become drawers

What: forms open in a drawer from the right (like the Assistant and the
task detail already do) instead of a centred modal, so you can still see
the list or page you came from while you fill it in. Modals stay only
where a short answer is the whole point.

Inventory, 47 modals today:

Stay modal (15): every "Delete ...?" and "Void this ...?" confirm (time
entry, expense, task, tasks in bulk, retainer, quote draft, invoice,
batch, role), "Save report" (one name field), "Accept or decline on the
client's behalf", "Create invoice" (one choice about line summarising),
"Attach a file", Keyboard shortcuts, Search.

Become drawers (32): new and edit time entry, add time off, new task
(tasks list, project page, admin), share for review, new quote, send
quote, draft scope lines, new and edit project, blank invoice, send
invoice or reminder, record a payment, new and edit expense, new and edit
client, new and edit retainer, invite a contact, capacity week detail,
add and edit person, task type, task status, role, expense category,
estimator material.

How:
- One component, `AppDrawer.vue`, wrapping `USlideover` with the house
  width (`sm:max-w-md`, wider variant for the quote and invoice forms),
  the same `title`, `description`, `open` and `#body` / `#footer` API as
  `UModal`, and a footer that keeps the primary button on the right. So
  each conversion is a tag swap and a check that the footer buttons
  still fit.
- Escape and clicking outside close the drawer as they do the modal
  today; a drawer with unsaved edits asks first, which the modals do not
  do now.
- The Assistant moves to `AppDrawer` too, so there is one look.

Depends on: nothing. Size: 1 day, verified by opening each drawer in the
browser.
