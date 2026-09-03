# Docket guide

Docket is Gigantic's own app for time, tasks, clients, quotes, and
invoices. It replaces Harvest and ClickUp. This guide covers how to use
each part and, where it matters, why it works the way it does. Open it
any time from the question mark in the left rail, or press `?` for the
keyboard shortcuts alone.

## Getting around

- **Sign in** with your Gigantic Google account. There are no passwords.
- **The rail** on the left holds the everyday screens at the top (Time,
  Tasks, Projects, Clients, Reports) and everything else below. Hover to
  see the names.
- **Search** with `Cmd+K` finds tasks, projects, clients, quotes, and
  invoices as you type. Prefixes narrow it: `t:` tasks, `c:` clients.
- **The Assistant** lives behind the round button in the bottom right,
  or `Cmd+J`. More on it below.
- **Every screen remembers how you left it**: list or cards, grouping,
  filters, the width of the activity panel on a task. That memory is
  per person and follows you between the browser and the Mac app.
  "Reset view" on a screen puts the defaults back.
- **Drawers, not popups.** Forms open from the right so the page behind
  stays in view. Only short confirms (delete, void) use a popup.

## Time

Time is the reason Docket exists, so it is the first screen.

- **The week strip** at the top shows each day's hours; click a day to
  see and add its entries. This week's total against your 30 hour
  target and the month's billable share sit under it.
- **Log time** with New entry: project, task type, hours, notes. Hours
  accept `1.5` or `1:30`.
- **Notes go on invoices.** Keep them short, one line per thing you did,
  starting each with `- `. They are what the client reads.
- **The timer.** Play on an entry starts the clock; stop folds the time
  into the entry's hours. A task has its own Start timer button (on the
  task page, and the play icon on a project's task list), which makes
  the entry for you; a project with several task types asks which one
  first. The clock in the left rail shows a dot while a timer runs, and
  hovering it lists your open tasks with logged against estimate and a
  Stop for whatever is running. One timer runs per person; starting another
  stops nothing, it refuses, so stop the first one. A timer left running
  ten hours gets you an email.
- **Locked entries** (a lock icon) are on a billing batch or an invoice
  and cannot be changed. Ask whoever runs billing to void the batch if
  something is wrong.
- **History** (the clock icon on an entry) shows every change to it, who
  made it and when, and can put an earlier version back.
- **Missing time.** At 9 each weekday morning Docket emails anyone with
  no time logged for the previous workday, unless they had time off.

### How rates work

Every entry freezes its hourly rate the moment it is saved, so old
entries never change value when a rate changes later. The rate comes
from the first of these that is set: the task type's rate on that
project, the project's rate, then your default rate in People. Money
only shows to people with the "see money" permission; everyone else
sees hours.

## Tasks

- **The list** groups tasks by status, project, or due date. Drag a row
  onto another group to move it. Click a status or priority to change it
  in place; with several rows selected (click the checkboxes, or `x` on
  the keyboard) one change applies to all of them.
- **Cards** (the grid icon) show a card per client; open one to see its
  tasks as cards.
- **Everyone** switches between your tasks and the whole team's.
  Completed tasks are hidden until you flip Completed.
- **Unsorted tasks** (the button on the Tasks page, for people who can
  manage tasks) lists every open task still sitting in a client's
  General project, which is where the ClickUp import put a task when it
  could not tell which project it belonged to. Tick the ones that go
  together, pick the project, and they move; Undo has thirty seconds.
  New project makes the project on the spot and moves the ticked tasks
  into it.
- **A task** has a status, priority, assignees, start and due dates, an
  estimate, a description, files, and an activity panel with comments.
  Drag the panel's edge to make it wider; double click to reset.
- **Statuses** are New, Ready to start, In progress, Internal review,
  Client review, Back in our court, Sent to print, On hold, Completed.
  Admins can change these in Settings.
- **Comments** support `@Name` to mention someone; they get a
  notification. A comment can be marked visible to the client, which
  shows it on the client's portal and review page.
- **Files** can be uploads or links to the office server. In the Mac app
  you can drop a folder from Finder and Docket keeps its `smb://` path,
  so anyone in the office can open it.
- **Waits on** links a task to the ones that must finish first. The
  schedule draws the arrows and warns when a task starts before what it
  waits on ends.
- **Share for review** makes a link a client can open without signing
  in to see the task, comment, and approve or request changes. Their
  decision lands in the activity panel and notifies the assignees.
- **Deleting** is safe. A deleted task, comment, time entry, or expense
  can be brought back with Undo in the toast for thirty seconds, and it
  is only removed for good after thirty days.

### Schedule and capacity

- **Schedule** is the timeline: tasks as bars by project or by person,
  by day, week, or month. Drag a bar to move it, an edge to stretch it,
  hold Shift while dragging to bring along everything that waits on it.
  Unscheduled tasks sit under the chart with a Schedule button. Hover a
  bar or a cut-off name for the full details.
- **Capacity** shows who has room. Each person's available hours are
  their weekly hours minus time off minus meetings from their Google
  Calendar. Past weeks show what was logged against that; this week
  and the coming ones show the hours still free after the tasks due
  that week (estimates split across assignees). Click a cell to see
  the tasks behind it. "Nothing planned" can also mean the tasks have
  no estimates yet.
- **Time off** is logged by each person; admins log anyone's and company
  holidays. There is no approval step. It reduces capacity and silences
  the missing-time email.

- **Quoted hours** show on Capacity as a gray bar under the plan: scope
  lines on draft or sent quotes that name a person and a week. They
  drop off once the quote is decided.

## Clients and projects

- **Project templates** (Settings, Project templates) are a starting set
  of tasks for a kind of job: title, task type, hours, and a suggested
  role. Pick one under "Start from" on the New project form and the
  tasks are made with those hours as estimates once the project exists.
  Quoted websites get their tasks from the sitemap instead.
- **Departments** (Settings, Departments) label a project Web, Creative,
  Photo/Video, and so on. Set one on the project form; the Projects
  list has a filter for it next to the client filter.
- **A client** has projects, contacts who can sign in to the portal,
  retainers, and a year-to-date strip with last year alongside.
- **A project** has a billing method (hourly, fixed, retainer,
  non-billable), an optional rate and budget (hours or dollars), the
  task types it accepts time against with per-project rates, and a
  server folder. The budget bar shows what has been used, including
  Harvest history.
- **A baseline for the budget.** As you type a new project's name, the
  form lists completed projects with similar names, from Docket and the
  Harvest years, with the hours and amount each took, and the typical
  figure across them. "Use as budget" drops that into the budget fields.
- **No client yet?** Type the name into the client picker on a new
  project, quote, or invoice and choose "Create client". It is saved and
  selected without leaving the form (needs the manage reference data
  permission).
- **Task types** (Design, Development, Meeting, and so on) are the
  categories time is logged under. Admins manage the master list; each
  project picks which apply.
- **A retainer's page** (click it on the client page) rolls its
  periods into one contract: how many periods, when it started, the
  current period's burn, and a table of every period. Open a period to
  see the entries behind it, grouped by project for a client-wide
  retainer. Periods from before the cutover only have a total.
- **Retainers** are a monthly (or any period) allotment of hours or
  dollars for a client, optionally rolling over unused amounts with a
  cap. The client page and the portal show the burn for the current
  period.
- **Visible to client** on a project shows all of its tasks on the
  client's portal, read only, without sharing each one.

## From estimate to invoice

This is the path a piece of work takes through Docket. Each step hands
the next one what it needs, so nothing is typed twice.

<div class="flow">
<span>Estimate</span><i></i><span>Quote</span><i></i><span>Sent</span><i></i><span>Accepted</span><i></i><span>Project</span><i></i><span>Time</span><i></i><span>Batch</span><i></i><span>Invoice</span><i></i><span>Paid</span>
</div>

1. **Estimate the job.** For print, vinyl, and signage, open the
   Estimator, set the size and quantity, and pick the materials layer
   by layer (primary material, overlaminate, transfer tape, substrate,
   banner tape, mounting tape). It prices the job from the materials'
   roll cost and the pricing rules in Settings, the same maths as the
   old estimator site, and shows the price per unit and per square foot.
   Add as many jobs as the quote needs. For design and web work there is
   nothing to estimate here; go straight to the quote.
2. **Start a quote.** From Quotes, New quote picks the client and gives
   the quote a number and a title. The title becomes the project's name
   later, so make it the name you want to see on the time sheet.
3. **Fill the lines.** Add to quote on the Estimator drops each priced
   job in as a line with its description and amount. Design and web
   lines are typed by hand, with hours and a rate, or the Assistant can
   draft them from a short brief using what similar work cost before.
   Add an intro, terms, and a valid-until date.
4. **Map the site.** For web work, build the sitemap as a tree on the
   quote: a card per page with its title and path, a child or a sibling
   from the card, drag a card onto another to move it. Give each page a
   template (Home, Landing, Interior, Listing, Detail, Form, Blog post,
   set up in Settings with the hours each usually takes) and the hours
   follow; type over them on a page that is bigger or smaller. "Price
   the sitemap" writes one scope line per template ("6 x Interior
   pages", 18 hours) and keeps those lines in step if the tree changes.
   The client sees the page list on the quote.
5. **Send it.** Send emails the client a link to the quote page, which
   opens without a sign-in. The quote moves from Draft to Sent. It shows
   as Expired once the valid-until date passes.
6. **The client decides.** On the quote page they type their name and
   accept or decline; a note comes back with a decline. You can also
   accept or decline on their behalf when the answer came by phone or
   email. Either way the quote records who decided and when, and the
   quote's creator gets a notification.
7. **Accepting makes the project.** Docket creates the project under
   the client with the quote's title, sets its budget to the quoted
   hours and amount, and copies each quoted task type and rate into the
   project's rate table. The quote and the project link to each other.
8. **Work and log time.** Time logs against the project like any
   other, at the quoted rates, and the project's budget bar shows how
   much of the quote has been used. Tasks for the job live on the
   project too.
9. **Bill it.** Unbilled shows the project's billable time and
   expenses. A batch locks them, Create invoice turns the batch into an
   invoice with lines summarised by task type, project, or one line,
   and Send emails the client the invoice page. Fixed-fee work that
   should bill the quoted amount rather than hours uses a blank invoice
   with a line for the quote total. Record the payment when it arrives.

Nothing along this path is recomputed later: the estimate is frozen in
the quote line, the quote's rates are frozen in the project, and each
time entry freezes its rate when it is saved.

### The Quotes page

- **List or board.** The list has the status filters and an Owner
  column (who wrote the quote). The board (grid icon) has a column per
  stage, Draft to Declined, each with a count and a total; click a card
  to open the quote. Moving a quote between stages still happens on the
  quote itself, since accepting or declining needs the client's name.
- **The amber dot** on a sent quote means it went out five or more days
  ago with no answer. Past its valid-until date it reads expired instead.

### Rates, people, and margin on a quote

- **Task types carry a default rate and wording** (Settings, Task
  types). Pick a task type on a blank scope line and the rate and
  description fill in; anything already typed stays.
- **Who, week.** A scope line can name the person who will do it and
  the week it should land. The week shows on the Capacity page as
  "quoted" hours, on top of what is already planned, until the quote is
  accepted or declined. When it is accepted, the sitemap pages tied to
  that line become tasks assigned to that person.
- **Margin** (people who see money only) is the line's amount minus its
  hours at the person's cost rate, as last saved. Cost rates are set on
  the People page and never appear anywhere a client can see.

## Billing and invoices

Docket bills directly; QuickBooks and Harvest are not in the path.

- **Unbilled** (under Invoices) lists each client's unbilled billable
  time and expenses. Pick a client and a period, choose entries, and
  create a billing batch. A batch locks its entries so nothing changes
  under the invoice.
- **Create invoice** from a batch and choose how the lines read: one
  line per task type, one per project with a summary of task types, or
  a single summary line. Edit the lines afterwards if needed.
- **Blank invoice** is for fixed fees, deposits, and anything not built
  from time.
- **Send** emails the client a link to the invoice page (`/i/...`),
  which they can open without signing in. Record payments as they come
  in; the invoice moves to Paid on its own when the balance is zero, and
  the sender gets a notification.
- **Overdue invoices** get a reminder email to the client automatically
  and show in red on the list.
- **Void** a batch to release its entries, or void an invoice that
  should not have gone out. Both are permanent, which is why they ask.
- Money on invoices (subtotals, tax, balance) is computed in the
  database from the lines and payments, never by hand.

## Expenses

Log an expense against a project with a category, amount, and whether it
is billable and reimbursable. Attach the receipt; it is stored privately
and only you and billing can open it. Billable expenses join billing
batches next to time. Undo works here too.

## Reports

- **The report** has a timeframe (week, semimonth, month, quarter, year,
  custom), a strip of totals with last year alongside, a chart, and one
  table under four tabs: Clients, Projects, Tasks, Team. Click a row to
  narrow the filters and move to the next tab, so a client leads to its
  projects and a project to its task types and people.
- **Time or expenses** switches what the report covers.
- **Everything is in the URL**, so a view can be bookmarked or sent to
  someone. Without a link, the report opens the way you left it.
- **Detailed report** lists every entry for the filters, with columns
  you choose, and can be saved by name or exported as CSV.
- **History before Docket** comes from the Harvest archive, rolled up by
  month, so year-over-year comparisons work across the cutover.

## Notifications

The bell shows what happened: assigned to a task, mentioned, a status
change, a due date coming up, a client's decision on a quote or review,
an invoice paid, a timer left running, missing time. Each kind can go to
email instantly, in a daily digest, or not at all; set that on the
Notifications page. Comment, status, and due-date emails are off by
default so the bell stays useful without flooding the inbox.

## The Assistant

The round button in the corner (or `Cmd+J`) opens a panel beside the
page. It knows which screen you are on and offers questions that fit
it, with the client or project's real name.

- **Ask** anything about time, tasks, budgets, clients, quotes, and
  invoices. It looks things up through the same rules you have, so it
  never shows you more than the app would.
- **Act.** It can log time, start or stop your timer, change an entry,
  create or update a task, assign people, comment, and add clients and
  projects. It acts only when you clearly ask, asks one question when
  something is missing, and never deletes.
- **Type `/`** in the box to pick a client, project, task, quote, or
  invoice from a list. The pick is highlighted in the box and the
  Assistant works on that exact record.
- **`log:`** at the start of a message turns it into a time entry to
  confirm and save: `log: 2h Hills Bank design this morning`.
- **History** keeps your conversations; New chat starts fresh.
- It is a model, so check numbers before you rely on them, and it has a
  daily limit per person.

## Claude connector

Your own Claude (the app, claude.ai, or Claude Code) can connect to
Docket and do what the Assistant does, signed in as you. The Account
page has the URL and the one-line command. Approve the connection once
on the consent page; disconnect it from the same Account page.

## The Mac app

Docket for Mac is the site in a window, plus what a browser cannot do:
drop folders from Finder onto a task and open server links in Finder.
When a newer build exists a banner offers the download. The app is not
signed yet, so the first launch needs right click, Open.

## Client portal

Clients you invite (Contacts on the client page) sign in the same way
and land on a portal with their projects, the tasks shared with them,
their quotes and invoices, and retainer burn. They can comment on shared
tasks and approve or request changes. They see nothing else.

## Imports and the morning sync

Until Harvest and ClickUp are canceled, Docket pulls from both every
morning: ClickUp's open tasks, and Harvest's time, expenses, and project
budgets for the current month (plus the previous one at the start of a
month). The Imports settings page runs the same imports by hand and
loads history: older months roll up into the archive, invoices copy in
for the billing page.

ClickUp has a list per client but nothing that says which project a
task is for, so the import can only match a task to a project when the
project's name appears in the task's title. The rest go to a General
project for the client; the Unsorted tasks page (from Tasks) is where
they get sorted.

## Settings and permissions

Settings has its own sidebar beside the rail, grouped Team, Work, Money,
and Data, with the page to the right. On a phone it folds into a strip
across the top.

Roles are Admin, Manager, Staff, and Client, plus any you add. Each role
has a set of permissions: see all time, see money, see all tasks, manage
tasks, manage reference data (clients, projects, task types), quotes,
invoices (batches, invoices, payments, Harvest history), retainers,
manage people, manage settings, see capacity. Quotes, invoices, and
retainers used to be one "billing" permission; any of the three opens
the client page's billing card and the portal preview. Admins have all
of them. Staff by default see their own time and expenses, all tasks,
and money. Change the matrix on the Permissions page.

Settings also holds people (add, deactivate, default rates), task
statuses, task types, expense categories, invoice settings (numbering,
terms, tax, notes, the project folder roots), estimator materials and
pricing, and imports.

## Keyboard shortcuts

`Cmd+K` search, `Cmd+J` Assistant, `n` new task, `t` stop the timer or
log time, `g` then `t`/`k`/`p`/`c`/`e`/`r`/`i`/`s` to jump to Time, Tasks,
Projects, Clients, Expenses, Reports, Invoices, Settings. `?` shows the
sheet for the page you are on, including the task list's own keys.
Nothing fires while you are typing in a field.

## How it works, briefly

- **The database enforces who sees what.** Every screen and the
  Assistant read Supabase directly under row-level security. There is no
  middle layer that could show the wrong person the wrong row.
- **Rates are frozen per entry** by a database trigger, so reports and
  invoices agree with what was true at the time.
- **Batches lock entries.** Once time or an expense is on a batch it
  cannot change until the batch is voided. Invoice money is computed by
  the database from lines and payments.
- **Deletes are soft.** Deleted rows are hidden, restorable for thirty
  days, then purged. Every change to a time entry or expense is kept in
  an audit trail.
- **The Harvest archive** holds monthly totals per client, project,
  person, and task type for the years before Docket, so history and
  comparisons keep working after Harvest is gone.
- **Jobs run in the database and on Vercel:** reminders hourly,
  notification emails every five minutes, invoice reminders hourly, the
  morning sync, calendar sync nightly, a Monday digest, the purge.
