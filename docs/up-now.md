# Up now

The build spec below is the winner of a twelve-agent design workflow run
on 2026-09-04, kept verbatim from section 1 onward. Luke said "build it"
the same day. Read section 3 for the ordered list of commits, section 4
for the rules a change has to keep, section 6 for exact UI copy and
section 7 for the verify steps.

## Where this stands (2026-09-04)

Shipped:

- **Stage 1**, the ClickUp assignee bug fix, commit `b994b57`.
- **Section 3 item 1**, the schema, commit `c1c9dbd`. Five migrations
  are applied to Supabase and mirrored in `schema.sql`: `up_now_core`,
  `up_now_backfill_and_dependents`, `up_now_capacity_weekly`,
  `up_now_fix_accept_quote_overload`,
  `up_now_restore_due_hour_guard`.
- **Section 3 item 2**, regenerated `shared/types/database.ts`, in the
  same push. `npx nuxt typecheck` is clean.
- **Section 3 item 3**, the `Claims the task` and `Clears who is up`
  checkboxes on `/admin/task-statuses`, with both flags in the Means
  column. Verified by flipping Sent to print on and back off.

- **Section 3 item 4**, the task page: Up now and Also on it rows,
  Take it, Hand off modal with the note, Nobody yet, the Up now select,
  subtask owner drawn solid. Verified: Take it, Hand off to the other
  person with a note (the note landed as a comment, the receiver became
  up, "Since Sep 4" showed), the select, and Hand off to Nobody.

- **Section 3 item 5**, the task list: Nobody up (open, warning dot,
  Take it per row, Sort these drawer with J, K, 1, 2) and Waiting on
  someone else (folded by default, owner named, rows dimmed), the
  avatar cluster rule, Take it and Nobody in the row menu, `T` on the
  focused row, `?view=unowned`, cards footers, empty copy, and the
  guide section. Verified in Chrome on Luke's own list.
- **Section 3 item 6**, the tour copy.

Not started: section 9 (Following, F1 to F4) which comes next, then
section 3 items 7 through 18. Two notes from item 5: done tasks stay in
the ordinary groups whoever is up, so Completed reads as before; and
`waiting` is folded by default only for people with no saved fold
state, since `user_views` keeps the folds you had. The `turn` bell
for the receiver was not checked from the browser: notifications RLS
is own-rows only, so verify step 3's bell half waits for a second
signed-in person.

The backfill has run. 96 tasks have somebody up (every task with exactly
one person on it, which behaves the same as it did before); 298 have
nobody up, of which 149 are open tasks with two or more people and 129
are open tasks with nobody assigned at all. Nothing in the UI reads
`assignee_id` yet, so every screen still behaves exactly as it did
before the migration. That is deliberate and is verify step 1.

**Added 2026-09-04: Following** (section 9). Luke asked for it the same
day the UI work resumed. It is a third membership layer under "Also on
it": a follower gets the task's comments and status changes and nothing
else, never sees the task on their own lists, and can only follow a task
they can already see. It runs as its own migration after section 3 item
5, so the task page and task list are touched while they are fresh, then
items 6 through 18 continue. Section 9 has its own header block saying
which of its four commits are done.

Two corrections to what the spec says, found while applying it:

- `accept_quote` takes `(p_quote_id uuid, p_name text, p_email text)`,
  not a public token. The spec's line is right, the signature in it was
  not.
- `run_due_notifications()` must keep its
  `if extract(hour from v_local) <> 9 then return 0; end if;` guard.
  `cron.job` runs it at :15 every hour, not once a day.

---

# FINAL BUILD SPEC — "Up now"

## The decision, and the one line for each place the judges split

The judges split 2–2. **Built: "Up now"** — one nullable `work_items.assignee_id`, everyone else stays on the task.

- **Up now vs Whose turn (2–2 tie):** Up now, because it is the only one that solves the sentence Luke actually wrote (Whose turn leaves Eric Holdridge at 18 rows out of 18 until Luke hand-creates a status), and because `assignee_id` is a scalar on `work_items` while Whose turn needs every assignee of every row on four surfaces that inner-join and filter the embedded array — the engineer's no-op flaw is structural, not a bug to fix.
- **The rename to `work_item_followers`: dropped.** Table stays `work_item_assignees`. It bought nothing and cost ~35 call sites, the MCP tool schemas and regenerated types. UI says "Up now" and "Also on it".
- **Day one leaving 147 ownerless (PM's fatal flaw): fixed by not hiding them.** Unowned tasks are a visible band with real rows and a Take it button on `/tasks` and Home, not a muted count. Relief on day one comes from clearing the *dated buckets*, not from work going quiet.
- **`time_entry_claims_task` RLS hole: fixed.** It claims only when the person is already on the task, so it cannot self-grant read access to a task by id.
- **Status claiming ownership: fixed.** Only fires when the mover is already on the task, so Marissa moving a card does not silently take the designer's work.
- **Client review clearing the owner: dropped.** 18 live tasks where the account person is still chasing. Only On hold clears.
- **The designer's guard refusing to leave a task unowned: rejected.** "Nobody up" is a legitimate, visible state here (147 of them on day one); the nudge sweep, the visible band and the everyone-gets-the-bell rule cover it instead.
- **Discipline argmax to preselect the handoff: dropped.** With two assignees the other one is already preselected; it only helps on 46 tasks and costs a whole subsystem.
- **Auto-chain subtasks / split by discipline / per-assignment stage: out.** See section 8.

**This ships in two stages. Stage 1 is a live bug fix that ships first, alone, today.**

---

## 1. What changes for the designer and the developer

Kylee and Eric both stay on the task and both keep every comment, mention, status change and client decision, exactly as today. What is new is that the task says who is **up now**: while it is Kylee's, it sits in Eric's "Waiting on someone else" group instead of in his buckets, on his Home, in his brief and in his timer picker; when she is done she presses **Hand off**, picks Eric, types an optional note, and it lands on his list with a bell that says she handed it to him. If nobody is up, the task is not hidden from anyone — it sits in a **Nobody up** band with a one-click **Take it**, it nags every person on it when it goes overdue, and it nags again if it has not moved in two weeks.

---

# STAGE 1 — ships first, alone, today

Independent of this feature and true right now: `server/utils/clickupImport.ts` deletes every `work_item_assignees` row for each synced task and re-inserts it, `/api/sync/morning` runs it daily, and `work_item_plans` has a composite FK onto that table with `on delete cascade` (schema.sql:3572). Every Planner hour on every ClickUp-linked task is destroyed each morning, and `notify_on_assignee` (schema.sql:1995) fires for all ~555 rows nightly. Stage 2's `work_item_assignee_removed` trigger would null every owner every morning on top of that.

**File 1 — `server/utils/clickupImport.ts`**, replacing lines 168–171.

Before the per-task loop, load the existing assignments once, beside `existingByClickup`:

```ts
const existingIds = [...existingByClickup.values()]
const assigneeByItem = new Map<string, Set<string>>()
if (existingIds.length) {
  const rows = await all<{ work_item_id: string, user_id: string }>(
    supabase.from('work_item_assignees').select('work_item_id, user_id').in('work_item_id', existingIds))
  for (const r of rows) {
    const s = assigneeByItem.get(r.work_item_id) ?? new Set<string>()
    s.add(r.user_id); assigneeByItem.set(r.work_item_id, s)
  }
}
```

Then, in place of the blanket delete and insert:

```ts
const have = assigneeByItem.get(itemId) ?? new Set<string>()
const want = new Set(people)
const gone = [...have].filter(u => !want.has(u))
const added = [...want].filter(u => !have.has(u))
if (gone.length) {
  const del = await supabase.from('work_item_assignees').delete().eq('work_item_id', itemId).in('user_id', gone)
  if (del.error) throw createError({ statusCode: 500, statusMessage: del.error.message })
}
if (added.length) {
  const ins = await supabase.from('work_item_assignees').insert(added.map(user_id => ({ work_item_id: itemId!, user_id })))
  if (ins.error) throw createError({ statusCode: 500, statusMessage: ins.error.message })
}
```

**File 2 — `schema.sql`**, in `run_due_notifications()` (schema.sql:2131): add the missing soft-delete filter. `where w.deleted_at is null and not s.is_done and ...`. Soft-deleted tasks are being nagged about today.

**Verify:** `/api/sync/morning?dry=1` returns the same `assignments` count as before. Run the real sync; `select count(*) from notifications where kind = 'assigned' and created_at::date = current_date` is in single digits, not ~554. Seed two `work_item_plans` rows on a ClickUp-linked task, run the sync, confirm both rows survive, delete the seeds.

Commit: `Stop the ClickUp import deleting and recreating every assignee`. Push. Confirm on the live site the next morning before starting Stage 2.

---

# STAGE 2 — Up now

## 2. Schema

One migration, mirrored into `schema.sql`.

```sql
-- ============================================================
-- UP NOW
-- A task belongs to several people across its life, but at any moment
-- one of them is up. work_items.assignee_id is that person, and null
-- means nobody is up yet. work_item_assignees is unchanged and still
-- means "on this task": RLS visibility, comments, mentions, status
-- bells, avatars, the client page team column, search. Only the person
-- up now sees the task on their own lists. Nothing is hidden from
-- Everyone, Planner, Schedule, search, the project page or the portal.
-- ============================================================

alter table work_items
  add column assignee_id uuid references profiles(id) on delete set null,
  add column assigned_at timestamptz,
  add column assigned_by uuid references profiles(id) on delete set null;
create index work_items_assignee on work_items (assignee_id);

-- Statuses that hand the task over. Checkboxes on /admin/task-statuses,
-- so the mapping retunes the same afternoon with no deploy.
-- Only In progress claims, and only On hold clears: Client review still
-- means "mine to chase", which is what the account people mean by it.
alter table work_statuses
  add column claims_owner boolean not null default false,
  add column clears_owner boolean not null default false;
update work_statuses set claims_owner = true where key = 'in_progress';
update work_statuses set clears_owner = true where key = 'on_hold';

-- The status carries the handoff, so it is not a second chore. Claiming
-- requires the mover to already be on the task: an account person moving
-- a card for a maker must never silently take it off the maker's list.
create or replace function public.work_item_owner_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_clears boolean; v_claims boolean; v_me uuid := auth.uid();
begin
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.assignee_id is not distinct from old.assignee_id then
    select s.clears_owner, s.claims_owner into v_clears, v_claims
      from public.work_statuses s where s.key = new.status;
    if coalesce(v_clears, false) then
      new.assignee_id := null;
    elsif coalesce(v_claims, false) and new.assignee_id is null and v_me is not null
      and exists (select 1 from public.work_item_assignees a
                  where a.work_item_id = new.id and a.user_id = v_me) then
      new.assignee_id := v_me;
    end if;
  end if;
  if new.assignee_id is distinct from (case when tg_op = 'UPDATE' then old.assignee_id else null end) then
    new.assigned_at := case when new.assignee_id is null then null else now() end;
    new.assigned_by := case when new.assignee_id is null then null else v_me end;
  end if;
  return new;
end $$;
create trigger work_item_owner_stamp before insert or update on work_items
  for each row execute function public.work_item_owner_stamp();

-- Whoever is up is always on the task, so task_visible() and every
-- notification keep working without a second membership rule.
create or replace function public.work_item_owner_follows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id is not null then
    insert into public.work_item_assignees (work_item_id, user_id)
    values (new.id, new.assignee_id) on conflict do nothing;
  end if;
  return null;
end $$;
create trigger work_item_owner_follows after insert or update of assignee_id on work_items
  for each row execute function public.work_item_owner_follows();

-- Taking somebody off the task clears them from "up now", nothing else.
create or replace function public.work_item_assignee_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.work_items set assignee_id = null
  where id = old.work_item_id and assignee_id = old.user_id;
  return null;
end $$;
create trigger work_item_assignee_removed after delete on work_item_assignees
  for each row execute function public.work_item_assignee_removed();

-- Starting a timer on a task nobody is up on puts you up on it. One
-- trigger covers the timer popover, the inline timer and MCP start_timer.
-- It only ever claims for someone already on the task, so it cannot be
-- used to join a task you cannot see. Harvest's importer never sets
-- work_item_id, so the nightly sync cannot fire it.
create or replace function public.time_entry_claims_task() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.work_item_id is null or new.user_id is null then return null; end if;
  update public.work_items w set assignee_id = new.user_id
  where w.id = new.work_item_id
    and w.assignee_id is null
    and w.deleted_at is null
    and exists (select 1 from public.work_item_assignees a
                where a.work_item_id = w.id and a.user_id = new.user_id)
    and exists (select 1 from public.work_statuses s
                where s.key = w.status and not s.is_done);
  return null;
end $$;
create trigger time_entry_claims_task after insert on time_entries
  for each row execute function public.time_entry_claims_task();

-- Take it, Hand off, and Nobody, in one call. p_to null means nobody is
-- up. A note is posted as a comment so the reason stays with the work.
create or replace function public.hand_off(p_item uuid, p_to uuid default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_title text; v_from uuid; v_note text;
begin
  if v_me is null then raise exception 'Sign in first'; end if;
  if (select public.is_client()) then raise exception 'Not allowed'; end if;
  if not ((select public.task_visible(p_item)) or (select public.has_permission('see_all_tasks')))
    then raise exception 'Task not found'; end if;
  select w.title, w.assignee_id into v_title, v_from
    from public.work_items w where w.id = p_item and w.deleted_at is null;
  if v_title is null then raise exception 'Task not found'; end if;
  if p_to is not null and not exists (select 1 from public.profiles
       where id = p_to and is_active and role <> 'client')
    then raise exception 'Pick someone on the team'; end if;
  v_note := nullif(btrim(coalesce(p_note, '')), '');

  -- assignee_id first, so work_item_owner_follows adds the row while the
  -- owner is already set and notify_on_assignee stays quiet for them.
  update public.work_items set assignee_id = p_to, updated_at = now() where id = p_item;

  if v_note is not null then
    insert into public.work_item_comments (work_item_id, author_id, body) values (p_item, v_me, v_note);
  end if;
  if p_to is not null and p_to <> v_me then
    perform public.notify(p_to, 'turn', public.actor_name() || ' handed you: ' || v_title,
                          v_note, '/tasks/' || p_item, v_me, p_item);
  end if;
end $$;
revoke execute on function public.hand_off(uuid, uuid, text) from public, anon;
grant   execute on function public.hand_off(uuid, uuid, text) to authenticated;

-- Being added to a task is still worth a bell, but the person just
-- handed it gets the 'turn' bell instead, and somebody added to a task
-- that already has an owner is told it is not on their own list yet.
create or replace function public.notify_on_assignee() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_title text; v_owned boolean;
begin
  if exists (select 1 from public.work_items w
             where w.id = new.work_item_id and w.assignee_id = new.user_id) then
    return new;
  end if;
  select w.title, w.assignee_id is not null into v_title, v_owned
    from public.work_items w where w.id = new.work_item_id;
  perform public.notify(new.user_id, 'assigned',
    public.actor_name() || ' assigned you: ' || v_title,
    case when v_owned then 'Someone else is up on it, so it is not on your own list yet.' end,
    '/tasks/' || new.work_item_id, auth.uid(), new.work_item_id);
  return new;
end $$;

-- A nag is a bell, never an email.
create or replace function public.notification_email_default(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case when p_kind in ('comment', 'status', 'due', 'unowned') then 'off' else 'instant' end;
$$;

-- An open task with people on it and nobody up, that has not moved in
-- two weeks, goes back in front of every one of them. Over-showing is
-- the only direction this errs in.
create or replace function public.nudge_unowned_tasks() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0;
begin
  for r in
    select w.id, w.title, a.user_id
    from public.work_items w
    join public.work_statuses s on s.key = w.status
    join public.work_item_assignees a on a.work_item_id = w.id
    where w.deleted_at is null and w.assignee_id is null
      and not s.is_done and not s.is_paused
      and w.updated_at < now() - interval '14 days'
      and not exists (select 1 from public.notifications n
                      where n.user_id = a.user_id and n.work_item_id = w.id
                        and n.kind = 'unowned' and n.created_at > now() - interval '7 days')
  loop
    perform public.notify(r.user_id, 'unowned', 'Nobody is up on: ' || r.title,
      'It has not moved in two weeks. Take it, or hand it to someone.',
      '/tasks/' || r.id, null, r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- The 9am bell goes to whoever is up. If nobody is up, it goes to
-- everyone on the task. And an overdue task is everyone's again even
-- when someone IS up, so a stale or wrong claim cannot bury work.
create or replace function public.run_due_notifications() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_local timestamp := now() at time zone 'America/Chicago';
  v_today date := v_local::date;
  r record; v_n int := 0;
begin
  if extract(hour from v_local) <> 9 then return 0; end if;
  perform public.nudge_unowned_tasks();
  for r in
    select w.id, w.title, w.due_on, u.user_id
    from public.work_items w
    join public.work_statuses s on s.key = w.status
    cross join lateral (
      select w.assignee_id as user_id where w.assignee_id is not null
      union
      select a.user_id from public.work_item_assignees a
      where a.work_item_id = w.id and (w.assignee_id is null or w.due_on < v_today)
    ) u
    where w.deleted_at is null and not s.is_done
      and w.due_on is not null and w.due_on <= v_today + 1
      and not exists (select 1 from public.notifications n
                      where n.user_id = u.user_id and n.work_item_id = w.id
                        and n.kind = 'due' and n.created_at::date = v_today)
  loop
    perform public.notify(r.user_id, 'due',
      case when r.due_on > v_today then 'Due tomorrow: ' || r.title
           when r.due_on = v_today then 'Due today: ' || r.title
           else 'Overdue: ' || r.title || ' (due ' || to_char(r.due_on, 'FMMon FMDD') || ')' end,
      null, '/tasks/' || r.id, null, r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
```

**`capacity_weekly`** (schema.sql:1344). Only the two estimate terms of `booked_hours` and `booked_tasks` change. The person up books whatever is left of the estimate; everyone else books only hours someone actually set for them on Planner. This removes two correlated `count(*)` subqueries, so the app's slowest read path gets cheaper, not dearer. Replace the second and third `coalesce(...)` terms and `booked_tasks` with:

```sql
  ), 0) + coalesce((
    select sum(greatest(0, coalesce(wi.estimate_hours, 0)
      - coalesce((select sum(p1.hours) from work_item_plans p1 where p1.work_item_id = wi.id), 0)))
    from work_items wi
    join work_statuses s on s.key = wi.status
    where wi.assignee_id = pr.id
      and wi.deleted_at is null and not s.is_done and not s.is_paused
      and wi.due_on >= w.week_start and wi.due_on < w.week_start + 7
      and not exists (select 1 from work_item_plans pl where pl.work_item_id = wi.id and pl.user_id = pr.id)
  ), 0) + coalesce((
    select sum(
      greatest(0, coalesce(wi.estimate_hours, 0)
        - coalesce((select sum(p2.hours) from work_item_plans p2 where p2.work_item_id = wi.id), 0))
      * u.in_week / u.total)
    from work_items wi
    join work_statuses s on s.key = wi.status
    cross join lateral (
      select count(*) filter (where d >= w.week_start and d < w.week_start + 7) as in_week, count(*) as total
      from generate_series(
        (case when wi.start_on is not null and wi.start_on <= wi.due_on then wi.start_on else wi.due_on end)::timestamp,
        wi.due_on::timestamp, interval '1 day') d
      where extract(isodow from d) < 6
        and not exists (select 1 from work_item_plans p3 where p3.work_item_id = wi.id and p3.user_id = pr.id and p3.day = d::date)
    ) u
    where wi.assignee_id = pr.id
      and wi.deleted_at is null and not s.is_done and not s.is_paused
      and wi.due_on is not null and u.total > 0
      and exists (select 1 from work_item_plans p4 where p4.work_item_id = wi.id and p4.user_id = pr.id)
  ), 0) as booked_hours,
  coalesce((
    select count(*) from work_items wi
    join work_statuses s on s.key = wi.status
    where wi.assignee_id = pr.id
      and wi.deleted_at is null and not s.is_done and not s.is_paused
      and wi.due_on >= w.week_start and wi.due_on < w.week_start + 7
  ), 0) as booked_tasks,
```

**Project templates** (`accept_quote`, schema.sql:2540): after the assignee insert, add

```sql
      update public.work_items set assignee_id = r.assignee_id where id = v_item;
```

**Day one backfill.** Triggers off so nothing bells; a task with exactly one person on it puts that person up, which is identical to today.

```sql
alter table work_items disable trigger user;
update work_items w
set assignee_id = f.user_id, assigned_at = now()
from (select work_item_id, min(user_id::text)::uuid as user_id
      from work_item_assignees group by work_item_id having count(*) = 1) f
where f.work_item_id = w.id;
alter table work_items enable trigger user;
```

No RLS or grant changes. `assignee_id` is a column on `work_items`, covered by the existing `work_items` policies; letting anyone who can edit assignment also say who is up matches how assignment already works. Rollback is `update work_items set assignee_id = null;` plus dropping the column, which restores today's behavior exactly.

---

## 3. Every file that changes, in order

Each numbered item is one verified commit, in this order. `package-lock.json` stays out.

1. **`schema.sql`** — everything in section 2, appended and mirrored into the migration. Apply the migration to Supabase.
2. **`shared/types/database.ts`** — regenerate.
3. **`app/pages/admin/task-statuses.vue`** — add `claims_owner` and `clears_owner` to `form` (lines 18, 29, 33, 44), two `UCheckbox`es after line 154, and both to the `flags()` summary at line 96. This ships before any consumer so the mapping is tunable from the first minute.
4. **`app/pages/tasks/[id].vue`** — split the Assignees row (line 594) into "Up now" and "Also on it"; add the Hand off modal and Take it button; add `assignee_id` and the owner profile to the selects at lines 23 and 62; `saveAssignees` (line 183) unchanged.
5. **`app/pages/tasks/index.vue`** — add `assignee_id` and the owner's name to both selects (lines 42, 80); the avatar cluster (line 566) draws the owner solid; the shared menu (line 634) gains Take it / Nobody above the people list; `groups` gains the two trailing groups; `?view=unowned`; empty states; tour copy.
6. **`app/composables/useTour.ts`** line 43 — copy change.
7. **`app/pages/index.vue`** — Home: `assignee_id` in the select (line 37), `mine` / `unowned` split, `openCount`, the Nobody up section, empty copy.
8. **`app/components/HomeAgenda.vue`** — `assignee_id` in the select (line 23), dim and drop rules.
9. **`app/components/TimeClockPopover.vue`** — `assignee_id` in the select (line 18), the two-group list, empty copy.
10. **`app/components/WorkItemForm.vue`** — "Up now" single select defaulting to you, "Also on it" multi select, estimate help text.
11. **`app/pages/planner.vue`** — `assignee_id` in the select (line 39); `hoursOn` (line 124); the block loop (line 151); the "Nobody up" band (line 183, 410); the drag handler (lines 214–261) sets the owner and stops deleting the previous person's assignee row.
12. **`app/pages/schedule.vue`** — the `open` computed (line 77) and person rows (lines 108–113).
13. **`app/pages/notifications.vue`** — two rows in `KINDS`, `EMAIL_DEFAULT` gains `unowned`.
14. **`app/components/NotificationBell.vue`** — two icons in `ICON` (line 41).
15. **`server/api/ai/brief.get.ts`** — `assignee_id` in the select (line 41), the `open` filter, the `nobodyUp` fact, one prompt line.
16. **`server/utils/ai.ts`** — `my_tasks` (line 142), `get_task` (line 135).
17. **`server/utils/mcp.ts`** — `create_task` and `update_task` (lines 190–223) gain `assignee_id`.
18. **`docs/guide.md`** — the "Up now" section, in the same commit as item 5 per CLAUDE.md; and **`docs/status.md`** at the end.

### The changes, precisely

**4. `app/pages/tasks/[id].vue`.** Select at line 23 gains `assignee_id, up:profiles!work_items_assignee_id_fkey(id, full_name)`; line 62 gains `assignee_id`. The property grid's Assignees row becomes two rows:

- `Up now` — a single `USelectMenu` over `peopleOptions` showing one avatar and the name, or the muted placeholder; under the name when set, `Since Sep 3`. To its right one `UButton`: `Take it` when you are not up, `Hand off` when you are, `Take it` when nobody is.
- `Also on it` — the existing multi select, unchanged behavior, placeholder `Nobody yet`, with help text beneath.

`Hand off` opens a `UModal` (a short confirm, so not a drawer): a person picker labeled `To` listing the task's other people first then everyone else, preselected when there is exactly one other person, plus a `Nobody yet` option; a one-line `Note (optional)`; `Cancel` and `Hand off`. Both buttons call `supabase.rpc('hand_off', { p_item, p_to, p_note })` then refresh. `Take it` is `hand_off(id, me)` with no dialog. The subtasks list (line 673) shows the child's owner as a solid avatar ahead of the rest.

**5. `app/pages/tasks/index.vue`.** Selects gain `assignee_id, up:profiles!work_items_assignee_id_fkey(id, full_name)`. `visible` (line 100) is unchanged, so nothing leaves the page. Inside `groups`, when `!focusMode`, split `visible` before grouping:

```ts
const me = user.value?.sub
const list = everyone.value ? visible.value : visible.value.filter(i => i.assignee_id === me)
const unowned = everyone.value ? [] : visible.value.filter(i => !i.assignee_id)
const waiting = everyone.value ? [] : visible.value.filter(i => i.assignee_id && i.assignee_id !== me)
```

`list` goes through the existing status / project / due grouping untouched. Then append, in this order:

```ts
if (unowned.length) out.push({ key: 'unowned', label: 'Nobody up', color: 'warning', items: unowned })
if (waiting.length) out.push({ key: 'waiting', label: 'Waiting on someone else', items: waiting })
```

`'waiting'` joins the default `collapsed` array in `useViewState('tasks', ...)`; `'unowned'` does **not** — it ships open, because that is the whole answer to work going dark. Every row in `unowned` carries a small `Take it` button; every row in `waiting` shows its owner's name as the sublabel and renders at `opacity-60`. The `unowned` group header carries a `Sort these` button opening an `AppDrawer` titled `Whose turn`: one row per unowned task of yours with title, project and the other people, and two buttons `Take it` and `Skip`; `j` and `k` move, `1` takes, `2` skips. `?view=unowned` opens the page with Everyone off and every group but `unowned` collapsed, the way `?view=focus` already works. The avatar cluster (line 566): owner solid, the rest at `opacity-50` behind, a dashed empty circle when nobody is up. The shared menu (line 634) gains, above the people list and a divider, `Take it` and `Nobody`, both calling `hand_off`. Cards mode `clientCards` and `clientTasks` (lines 356, 372) read `list`, and each client card footer gains `+3 nobody up` when there are any. Focus mode is untouched.

**7. `app/pages/index.vue`.** The `home-tasks` select gains `assignee_id`; the inner join and `.eq` stay, so this still returns every task you are on. After line 42:

```ts
const mineNow = computed(() => (tasks.value ?? []).filter(t => t.assignee_id === user.value?.sub))
const unowned = computed(() => (tasks.value ?? []).filter(t => !t.assignee_id))
```

`rest`, the three buckets and `openCount` read `mineNow`. `taskCountByProject` and My projects keep reading the unfiltered `tasks`, so a project stays reachable before your turn. A fourth section under the buckets, above the "N more" link: heading `Nobody up`, up to 3 rows each with a `Take it` button, then `See all 61` linking to `/tasks?view=unowned`. Tasks where someone else is up appear nowhere on Home.

**11. `app/pages/planner.vue`.** A block is drawn in a person's row when they are the owner, or when they have `work_item_plans` rows for that task; a planned-but-not-owner block draws with a dashed border and the title `Not their turn yet`, so a PM can still plan the developer's week three. `hoursOn` (line 124) drops the assignee-count divisor: if you are the owner your share is `estimate_hours` minus every hour planned for anyone on that task; if you are only planned, your hours are exactly what was set. The `unassigned` band (line 183) becomes `!t.assignee_id`, catching both tasks with nobody on them and tasks with people but nobody up, and is renamed. The drop handler (lines 214–261) sets `assignee_id` and upserts the assignee row; **the `work_item_assignees` delete at line 229 and line 251 is removed**, so a reassignment stops cascade-deleting the previous person's plan hours.

**12. `app/pages/schedule.vue`.** Line 77 becomes `!ws.isDone(i.status) && (everyone.value || i.assignee_id === me || (!i.assignee_id && i.work_item_assignees.some(a => a.user_id === me)))`. Person rows (line 110) put the bar in the owner's row plus the row of anyone with plan hours; a bar for a task where someone else is up renders at `opacity-50` when Everyone is on.

**15. `server/api/ai/brief.get.ts`.** Line 41 gains `assignee_id`. `open` (line 51) becomes `(mine ?? []).filter(w => !done.has(w.status) && w.assignee_id === p.id)`. A new fact `nobodyUp`, counting tasks this person is on that are not done or paused, have nobody up, and are overdue or due within seven days. One prompt line: `If anything has nobody up on it, say so in one clause at the end, only when the count is above zero.` `plainBrief` appends `4 tasks you are on have nobody up.`

**16. `server/utils/ai.ts`.** `my_tasks` becomes `.eq('assignee_id', c.userId)` with the done and paused filter it lacks today, description `Open tasks the person asking is up on right now, with due dates and projects.`, and it returns `{ tasks, nobody_up: <count> }`. `get_task` returns `assignee_id` and the owner's name alongside the people list.

**17. `server/utils/mcp.ts`.** `create_task` takes `assignee_id` (and `assign_me` sets both it and the assignee row). `update_task` keeps `add_assignee_ids` / `remove_assignee_ids` and gains `assignee_id`, where the string `"nobody"` clears it, routed through `hand_off`.

---

## 4. The rules

- **One assignee.** The backfill puts that person up. Identical to today on every surface. Removing them clears the owner; adding a second person changes nothing about who is up.
- **Three assignees.** Whoever is up is up; the other two see it under "Waiting on someone else", collapsed, one click away, with the owner's name on the row. Everything else — comments, mentions, status bells, client decisions, Everyone, search, project page, client page, Planner, Schedule — is unchanged for all three.
- **Nobody up.** Nothing is hidden. The task sits in the "Nobody up" group on `/tasks` (open by default) with a Take it button, in the Nobody up section on Home, and in the Nobody up band on Planner. It is out of the dated buckets and out of "N open", and absent from the timer picker's main list and the morning brief's overdue / due lists, but counted in the brief's closing clause. The 9am due bell goes to **everyone** on it. If it has not moved in fourteen days, `nudge_unowned_tasks` bells everyone on it, at most weekly.
- **Back from client review.** Client review never clears the owner, so the account person who sent it out is still up when it returns to Back in our court, and hands it on in one click. That is the correct owner for a client reply, and it means `is_return` needs no special case.
- **A subtask.** An ordinary task with its own owner. Setting a child's owner never changes the parent's, and neither hides the other. Parent and child both appear on their owners' lists.
- **The PM.** Everyone mode, the Gantt, the project page, the client page, search and the client portal are byte for byte unchanged. Planner draws every block, dimmed rather than missing. The Nobody up band and count are the new supervision surface, and are why nothing goes quiet.
- **Planner and capacity with the estimate.** The person up books whatever is left of the estimate after everyone's planned hours; anyone else books only hours someone set for them. `booked_tasks` counts tasks you are up on. So a designer who shipped in July stops booking half an estimate against a week-four due date, which is a live overbooking bug on all 147 today. On day one no number moves: 0 of the 147 carry an `estimate_hours` and `work_item_plans` is empty, so both the old and the new expressions are zero.
- **Notifications.** Unchanged for `assigned`, `mentioned`, `comment`, `client_comment`, `status`, `client_decision`, `quote_decision` — every one of them still reaches every person on the task, because `task_people` is unchanged. Two new kinds: `turn` ("Sean handed you: ...", email instant) and `unowned` ("Nobody is up on: ...", bell only). The `assigned` bell gains a body line when the task already has an owner. The `due` bell is the only one that narrows, and it widens again the moment the task is overdue or unowned. A handoff with a note produces a `turn` bell and a `comment` bell for the receiver; that is accepted, because losing the reason is worse.

---

## 5. The 147, the morning after, with no manual cleanup

Nothing is edited and no judgment is made on anyone's behalf. The 78 open solo tasks (and every closed one with a single person) get that person up, which is exactly today. The 147 multi-assignee tasks get nobody up, because there is no signal to pick from: 2 of 9,817 time entries carry a `work_item_id`, `projects.lead_id` is null on all 377 active projects, and `profiles.department_id` is set for nobody.

What each person sees:

- **Their dated buckets on Home, the brief, and the timer picker** hold only their solo work plus anything they are up on. Sean's three date buckets go from 66 rows to his 5 solo tasks. That is the day-one relief, and it costs nobody a decision.
- **Directly below, on the same card**, a "Nobody up" section with the first three of his 61 and `See all 61`. On `/tasks` the same 61 are an open group with a Take it on every row and a `Sort these` button that clears them at two keys each. Nothing is behind a collapsed header, nothing is behind a muted number, and nothing is invisible.
- **Overdue tasks still bell everyone.** 39 of the 147 have a due date, and 15 of the In progress ones are already an average of 76 days past due, so the first 9am run puts them in front of every person on them.
- **The other 108 are caught by the nudge.** They are all older than 14 days, so the first sweep bells everyone on them, then at most weekly after that until somebody takes one.
- **They drain from four ordinary acts**: moving a task to In progress (the single most used control on the list), starting a Docket timer on it, being dragged onto a day on Planner, or pressing Take it. Nobody is asked to do a cleanup pass.

If drainage stalls, the lever is the two checkboxes on `/admin/task-statuses`, no deploy.

---

## 6. UI copy

Task page
- `Up now` / `Also on it`
- `Nobody yet`
- `Since Sep 3`
- `Take it` / `Hand off`
- Help under Also on it: `Everyone here gets comments, status changes, and mentions. Only the person up now sees it on their own list.`
- Modal title `Hand off`; fields `To` and `Note (optional)`, placeholder `Anything they need to know?`; option `Nobody yet`; buttons `Cancel` and `Hand off`
- Toasts: `Handed to Marissa` / `Yours now` / `Nobody is up on this now`

Task list
- Groups: `Nobody up` and `Waiting on someone else`
- Row sublabel in the waiting group: `Kylee Rueber is up`
- Group header button: `Sort these`
- Drawer title `Whose turn`; buttons `Take it` and `Skip`; footer hint `J and K move, 1 takes it, 2 skips.`
- Row menu items: `Take it` and `Nobody`
- Cards footer: `+3 nobody up`
- Empty state (list and cards): `Nothing is on you right now. Open Nobody up to take something, or switch to Everyone.`
- Tour step: `Off shows what is on you. On shows the whole team.`

Home
- Section heading `Nobody up`, row button `Take it`, link `See all 61`
- Empty state: `Nothing is on you right now. Enjoy it, or pick something up on Planner.`

Home agenda
- Tag on an unowned due task: `Nobody up`

Timer popover
- Second group heading: `Nobody up`
- Empty state: `Nothing is on you right now.`

Planner
- Band heading: `Nobody up`
- Block tooltip: `Not their turn yet`

New task drawer
- Fields `Up now` and `Also on it`
- Estimate help: `Spread across the task's days on Planner for the person up on it.`

Admin, task statuses
- `Claims the task`, description `Moving a task here puts the person who moved it up on it, when nobody is up yet.`
- `Clears who is up`, description `Moving a task here leaves nobody up on it.`

Notifications page
- `A task handed to you` (kind `turn`)
- `Nobody is up on a task you are on` (kind `unowned`)
- Bell body when added to an owned task: `Someone else is up on it, so it is not on your own list yet.`
- Nudge body: `It has not moved in two weeks. Take it, or hand it to someone.`

Errors surfaced from `hand_off`: `Sign in first`, `Task not found`, `Pick someone on the team`.

Guide section title: `Up now and who else is on it`.

---

## 7. Verify, in Luke's Chrome, on `docket-dev` (restart after items 4, 5, 10)

1. **Nothing moved.** Before the migration, screenshot Home's "N open" and `/tasks` grouped by status. After the migration and before any UI change, both are identical.
2. **Solo task.** Open one of your own single-assignee tasks. Up now shows you. It is in Home's buckets and the timer picker. Unchanged.
3. **The handoff.** On a two-person task, Take it, confirm it lands in your buckets and leaves the other person's. Hand off to them with the note `Copy is final, ready for build.` Confirm: they get one `turn` bell titled `Luke David handed you: ...`, the note is a comment on the task, the task is in their buckets and in your Waiting on someone else group with the sublabel naming them, and you did **not** get an `assigned` bell.
4. **Status claims.** Move a task you are on from Ready to start to In progress. You are up. Now, as a second signed-in person who is **not** on that task, move another task to In progress: nobody is claimed, the owner stays null. This is the Marissa case and it must not fire.
5. **On hold clears; client review does not.** Move an owned task to On hold: nobody up, it appears in the Nobody up group. Move another to Client review: you are still up and it is still in your buckets.
6. **Timer claims.** Start a timer from the popover's Nobody up group on a task you are on. You become the owner. Then, in the browser console as a signed-in non-admin, insert a time entry naming a task id you are **not** on and confirm the owner does not change: `await supabase.from('time_entries').insert({ work_item_id: '<id you are not on>', ... })`. Delete the test entry afterward; it must carry an obvious marker while it exists.
7. **Work goes dark check.** Pick one of the 147 with no due date. Confirm it is visible, with a Take it button, in: the Nobody up group on `/tasks` (open, not collapsed), the Nobody up section on Home, and the Nobody up band on Planner. Confirm it is still in Everyone, in Cmd+K search, on the project page, on the client page and on the Gantt. Then `select public.nudge_unowned_tasks();` and confirm every person on it has an `unowned` bell and no email; run it twice and confirm the second run adds nothing.
8. **Overdue reaches everyone.** Set a task you are on to due yesterday, with someone else up. `select public.run_due_notifications();` at 9am Central, or temporarily relax the hour guard on a branch: you get the bell even though you are not up.
9. **Removal.** Take yourself off a task you are up on from the Also on it select. The owner clears and the task lands in the Nobody up group rather than vanishing.
10. **Planner.** Drag a block from one person to another. Confirm the new person is up and on the task, and confirm `select count(*) from work_item_plans where work_item_id = '<id>'` is unchanged for the original person, which is the bug this fixes.
11. **Capacity.** Seed one task with `estimate_hours = 8`, an owner, a due date inside a week, and two `work_item_plans` rows of 2h for a second person. `capacity_weekly` books 4h to the owner and 4h across the planned person's days, and `booked_tasks` counts it once, for the owner only. Remove the seeds.
12. **Client portal.** Sign in as a client contact. `/portal` and a `/r/<token>` review link are unchanged; no owner name and no Up now anywhere.
13. **MCP and the assistant.** Ask the assistant "what am I working on" and confirm it answers with your owned tasks plus "and 61 have nobody up", excluding done and paused. Through MCP, `update_task` with `assignee_id: "nobody"` clears the owner.
14. **Morning sync.** `/api/sync/morning?dry=1`, then the real run. Time it before and after. Confirm no owner on any ClickUp-linked task changed: `select count(*) from work_items where clickup_id is not null and assignee_id is not null` is the same either side.
15. **Brief.** `/api/ai/brief` for yourself. Overdue / due today / due soon contain only tasks you are up on, and the closing clause names the Nobody up count.

---

## 8. Out of scope

- **Splitting tasks into per-discipline subtasks, auto-chaining them, or the `Your turn: Build` dependency bell.** Subtasks and `work_item_dependencies` both already exist and are the right tool for the rare task that genuinely is two deliverables with their own dates and estimates. They are the wrong tool applied to 131 tasks overnight.
- **A per-assignment stage column.** Its state lives on the one table the importer rewrites, and its load-bearing act cannot be inferred from anything in this data.
- **Deriving turn from status crossed with a person's discipline**, `tasks.work_kind`, `profiles.discipline_id`, and the argmax over logged time. Not built, not even as a handoff preselect.
- **A parent with open subtasks stepping off personal lists.** Real, but `parent_id` has zero rows, so it is not biting anything today. Its own item, later.
- **The 127 open tasks with nobody assigned at all.** 36% of the open list and arguably a bigger hole than this one. Nothing here touches them, and the nudge sweep deliberately skips them because it has nobody to nudge. Own item.
- **Settling `is_paused` across the eight surfaces.** Home, Planner, the brief and the timer drop On hold; `/tasks`, Schedule, HomeAgenda and `my_tasks` keep it. On hold now clears the owner, so those 22 tasks land in the visible Nobody up band either way, which is an improvement, but the four-way inconsistency itself is Luke's call and stays untouched.
- **Anything that lets you ask "who still has a piece of this left."** One nullable column cannot distinguish the designer who finished from the developer who has not started. Today nothing can answer that either; this does not add it, and does not pretend to.
- **Departments, department leads, and `projects.lead_id`.** All empty, and nothing here reads them.

Effort: half a day for Stage 1, four days for Stage 2.

---

# STAGE 3 — Following

## 9. Following

### Where this stands (2026-09-04)

F1 shipped 2026-09-04: migration `following` applied through the
Supabase MCP, mirrored at the end of `schema.sql`, types regenerated.
Nothing in the UI reads it yet. Next: F2, the task page row.

### What it is

Following is for the person who is not doing the work but wants to
know how it is going: the PM watching a build, the account person
watching a task after they handed it on, an admin watching a task on a
project they are not staffed on. A follower gets comments, client
comments, status changes and client decisions on the task, the same
bells the people on it get, and nothing else. It never puts the task on
their own lists, Home, the timer picker, Planner, Schedule, capacity,
the brief or the assistant's "what am I working on". It never changes
who is up.

Three decisions, made with Luke:

- **It is a third layer, under Also on it.** Up now is who is doing it
  right now. Also on it is everyone the task belongs to. Following is
  everyone else who wants the bells.
- **You can only follow what you can already see.** Following grants no
  read access; `task_visible()` is untouched. In practice that makes
  Follow a tool for people with `see_all_tasks` (admins, managers, and
  any custom role given it), because a staff member without it can only
  see tasks they are on or created, and those already bell them.
- **Explicit only.** The Follow button is the only way in. Commenting,
  being mentioned, moving a status, or logging time never makes you a
  follower. Unfollow is the only way out, apart from losing sight of the
  task.

Dropped: a follow button on the task list rows and in the shared row
menu (the task page is enough for a first cut), following a project or
a person, an MCP `follow_task` tool, and a `following` view on `/tasks`.

### Schema

One migration, `following`, mirrored into `schema.sql` after the Up now
block.

```sql
-- ============================================================
-- FOLLOWING
-- A third layer under work_item_assignees. A follower gets the task's
-- comment, status and client-decision bells and nothing else. It is not
-- membership: task_visible() does not read it, so you can only follow a
-- task you can already see, and a follower who can no longer see the
-- task (taken off it, without see_all_tasks) stops getting bells
-- without anyone having to tidy the row.
-- ============================================================

create table work_item_followers (
  work_item_id uuid not null references work_items(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (work_item_id, user_id)
);
create index work_item_followers_user on work_item_followers (user_id);

alter table work_item_followers enable row level security;

-- Everyone who can see the task can see who follows it.
create policy visible_select on work_item_followers for select to authenticated
  using (case when (select public.has_permission('see_all_tasks')) then true else public.task_visible(work_item_id) end);
-- You follow and unfollow only as yourself, only on a task you can see.
create policy own_write on work_item_followers for all to authenticated
  using (user_id = (select auth.uid()) and not (select public.is_client()))
  with check (user_id = (select auth.uid()) and not (select public.is_client())
              and case when (select public.has_permission('see_all_tasks')) then true else public.task_visible(work_item_id) end);

-- Followers join the fan-out for comment, client_comment, status and
-- client_decision. Nothing else reads task_people, so the due bell, the
-- unowned nudge, assigned, turn and mentions are all unchanged.
-- A follower is included only while their role can still see the task
-- from the outside; people on the task or who created it are already
-- in the first two branches.
create or replace function public.task_people(p_item uuid) returns setof uuid
language sql stable set search_path = '' as $$
  select a.user_id from public.work_item_assignees a where a.work_item_id = p_item
  union
  select w.created_by from public.work_items w where w.id = p_item and w.created_by is not null
  union
  select f.user_id from public.work_item_followers f
  join public.profiles pr on pr.id = f.user_id and pr.is_active and pr.role <> 'client'
  where f.work_item_id = p_item
    and (pr.role = 'admin' or exists (select 1 from public.permissions p where p.role = pr.role and p.key = 'see_all_tasks'));
$$;
```

No new notification kinds, no email default change, no change to
`notify_on_comment` or `notify_on_item_change`: both already loop over
`task_people`. `task_visible()`, `hand_off`, `work_item_owner_follows`,
`work_item_assignee_removed`, `time_entry_claims_task`,
`capacity_weekly`, `search`, the soft-delete triggers and the client
portal are untouched. Deleting a task cascades the follower rows with
it, and `restore_deleted()` needs no change because the rows were never
touched by a soft delete. Rollback is dropping the table and putting
`task_people` back to its two branches.

### The commits

Each one is verified, committed and pushed on its own. `package-lock.json`
stays out.

- **F1. `schema.sql`** and the `following` migration, applied to
  Supabase, plus `shared/types/database.ts` regenerated in the same
  commit so the task page can select the new embed. `npx nuxt typecheck`
  clean. Nothing in the UI reads it yet.
- **F2. `app/pages/tasks/[id].vue`.** The task select gains
  `work_item_followers(user_id, profiles(full_name))`. A third row in
  the property grid, after Also on it: `dt` `Following`, `dd` an avatar
  cluster at `opacity-50` drawn the same way the Also on it cluster is,
  names beside it using the same "Kylee and 2 others" rule, or the
  muted `Nobody yet`; to the right one ghost `UButton`, `Follow` when
  you are not in the list and `Unfollow` when you are. Follow inserts
  `{ work_item_id, user_id: me }`; Unfollow deletes by both keys; both
  refresh the item and toast. The whole row is hidden for clients,
  which never reach this page anyway, and the button is hidden when the
  task is done. Help text beneath the cluster, the same size as the
  Also on it help.
- **F3. `app/pages/notifications.vue`.** Two labels change so the page
  says who a bell reaches: `comment` and `status`. `EMAIL_DEFAULT` is
  unchanged.
- **F4. `docs/guide.md`** gains a "Following" paragraph inside the
  "Up now and who else is on it" section, and the Notifications
  section's first sentence mentions following; **`docs/status.md`** gets
  the entry.

### UI copy

Task page
- Row label `Following`
- Empty: `Nobody yet`
- Button: `Follow` / `Unfollow`
- Help under the row: `Followers get comments and status changes, nothing else. Following never puts a task on your list.`
- Toasts: `Following` / `Unfollowed`

Notifications page
- `comment`: `Comment on a task you are on, made, or follow`
- `status`: `Status change on a task you are on or follow`

Guide paragraph, under "Up now and who else is on it":

> **Following.** Follow a task from its page to get its comments and
> status changes without being on it. It is for keeping an eye on work
> that is not yours: a build you are managing, a task you handed on.
> Following never puts a task on your list, on Home, in the timer, or
> on Planner, and it never changes who is up. You can only follow a
> task you can already see, and Unfollow is the only way to stop.

### Verify, in Luke's Chrome, on `docket-dev` (restart after F2)

1. **Nothing moved.** After F1 and before F2, Home, `/tasks`, the task
   page and the Notifications page look exactly as they did.
2. **Follow.** As Luke (admin, so `see_all_tasks`), open a task you are
   not on and not the creator of. Follow. The row shows your avatar and
   name and the button reads `Unfollow`. Confirm the task is still
   absent from Home's buckets and "N open", from `/tasks` with Everyone
   off, from the timer popover, from your Planner row and from the
   brief's lists.
3. **The bells.** As the person up on that task, in a second signed-in
   window, add a comment and move the status. As Luke: one `comment`
   bell and one `status` bell, no email (both default off). Set a due
   date of today on that task and run
   `select public.run_due_notifications();` at 9am Central or on a
   branch with the hour guard relaxed: Luke gets **no** `due` bell.
   `select public.nudge_unowned_tasks();` on an unowned followed task:
   Luke gets no `unowned` bell.
4. **Mentions still explicit.** As the other person, comment
   `@Luke David` on a task Luke does not follow. Luke gets `mentioned`
   and nothing else, and is not made a follower.
5. **Unfollow.** Unfollow. Another comment from the other person: no
   bell. The row reads `Nobody yet`.
6. **Only what you can see.** As a staff member without
   `see_all_tasks`, in the browser console:
   `await supabase.from('work_item_followers').insert({ work_item_id: '<a task they are not on>', user_id: '<their id>' })`
   returns an RLS error. Then the same insert with a task they are on
   but `user_id` set to Luke's id: RLS error. Then a task they are on
   with their own id: succeeds, delete it afterward. Nothing they
   follow this way changes what they can see: `select` on
   `work_items` for a task they only follow returns no row.
7. **Losing sight.** A staff member without `see_all_tasks` follows a
   task they are on, then is removed from it. A comment on that task
   bells them no longer, and the follower row still exists, which is
   fine.
8. **Everything else byte for byte.** Everyone mode, the Gantt, the
   project page, the client page, Cmd+K search, `/portal` and a
   `/r/<token>` review page as a client contact: no follower names, no
   Follow button.
