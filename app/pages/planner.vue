<script setup lang="ts">
// Planner: people as rows, weekdays as columns, and a block for every
// task on each day it is planned for. Drag a task from the left onto a
// person's day to plan it there; drag a block to move it to another
// day or person. A block sits in the row of whoever is up on the task,
// and in the row of anyone with hours set for it; the estimate's
// remainder goes to the person up. Meetings and time off sit in the
// cell too, so the footer is honest about what is left.
definePageMeta({ middleware: 'can', permission: 'see_capacity' })
useHead({ title: 'Planner' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const undo = useUndo()
const ws = await useWorkStatuses()
const view = await useViewState('planner', { zoom: 'week' as 'week' | 'weeks', people: [] as string[] })
const zoom = persisted(view, 'zoom')
// Empty means everyone.
const peopleFilter = persisted(view, 'people')

const today = todayString()
const anchor = ref(weekDays(today)[0]!)
const weekCount = computed(() => (zoom.value === 'week' ? 1 : 3))
const days = computed(() => Array.from({ length: weekCount.value }, (_, i) => weekDays(addDays(anchor.value, 7 * i)).slice(0, 5)).flat())
const from = computed(() => days.value[0]!)
const to = computed(() => days.value[days.value.length - 1]!)
const move = (n: number) => { anchor.value = addDays(anchor.value, 7 * n * weekCount.value) }

const __ad1 = useAsyncData('planner-capacity', async () => {
  const { data, error } = await supabase.from('capacity_weekly').select('user_id, user_name, week_start, base_hours, forecast_hours').gte('week_start', from.value).lte('week_start', to.value).order('user_name')
  if (error) throw error
  return data
}, { ...fresh, watch: [from, to] })
// Every open task, not just the visible range, so the left list is
// complete and a task can be dragged into view from anywhere.
const __ad2 = useAsyncData('planner-tasks', async () => {
  const { data, error } = await supabase
    .from('work_items')
    .select('id, title, status, priority, start_on, due_on, estimate_hours, is_milestone, project_id, assignee_id, projects(id, name, clients(name)), work_item_assignees(user_id)')
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(3000)
  if (error) throw error
  return data.filter(w => !ws.isDone(w.status) && !ws.isPaused(w.status))
}, fresh)
const __ad3 = useAsyncData('planner-off', async () => {
  const { data, error } = await supabase.from('time_off').select('user_id, starts_on, ends_on, hours_per_day').lte('starts_on', to.value).gte('ends_on', from.value)
  if (error) throw error
  return data
}, { ...fresh, watch: [from, to] })
const __ad4 = useAsyncData('planner-busy', async () => {
  const { data, error } = await supabase.from('calendar_busy').select('id, user_id, starts_at, ends_at, hours')
    .gte('starts_at', new Date(`${from.value}T00:00:00`).toISOString())
    .lt('starts_at', new Date(`${addDays(to.value, 1)}T00:00:00`).toISOString())
    .order('starts_at')
  if (error) throw error
  return data
}, { ...fresh, watch: [from, to] })
// Hours people set per day. Small table, so all of it.
const __ad5 = useAsyncData('planner-plans', async () => {
  const { data, error } = await supabase.from('work_item_plans').select('work_item_id, user_id, day, hours').limit(10000)
  if (error) throw error
  return data
}, fresh)
// Who is in which department, so a lead can look at just their team.
const __ad6 = useAsyncData('planner-departments', async () => {
  const { data, error } = await supabase.from('profiles').select('id, department_id').eq('is_active', true).neq('role', 'client')
  if (error) throw error
  return data
}, fresh)
await Promise.all([__ad1, __ad2, __ad3, __ad4, __ad5, __ad6])
const { data: cap } = __ad1
const { data: deptRows } = __ad6
const { data: tasks, refresh: refreshTasks } = __ad2
const { data: plans, refresh: refreshPlans } = __ad5
const refreshAll = () => Promise.all([refreshTasks(), refreshPlans()])
const { data: off } = __ad3
const { data: busyRows } = __ad4

type Task = NonNullable<typeof tasks.value>[number]
type Busy = NonNullable<typeof busyRows.value>[number]
type Person = { id: string, name: string, base: Map<string, number>, quoted: number }

// ---------- people and their days ----------
const allPeople = computed<Person[]>(() => {
  const m = new Map<string, Person>()
  for (const c of cap.value ?? []) {
    const p = m.get(c.user_id!) ?? { id: c.user_id!, name: c.user_name ?? '', base: new Map(), quoted: 0 }
    p.base.set(c.week_start!, c.base_hours ?? 0)
    p.quoted += c.forecast_hours ?? 0
    m.set(c.user_id!, p)
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
})
const people = computed(() => allPeople.value.filter(p => !peopleFilter.value.length || peopleFilter.value.includes(p.id)))
const peopleItems = computed(() => allPeople.value.map(p => ({ label: p.name, value: p.id })))
const me = computed(() => user.value?.sub ?? '')
const onlyMe = computed(() => peopleFilter.value.length === 1 && peopleFilter.value[0] === me.value)
// My team: the departments you lead, or failing that the one you are in.
const { profile, leads } = useCurrentUser()
const teamDepts = computed(() => (leads.value.length ? leads.value.map(d => d.id) : profile.value?.department_id ? [profile.value.department_id] : []))
const myTeam = computed(() => (deptRows.value ?? []).filter(p => p.department_id && teamDepts.value.includes(p.department_id)).map(p => p.id).sort())
const onlyTeam = computed(() => myTeam.value.length > 0 && [...peopleFilter.value].sort().join() === myTeam.value.join())
const teamLabel = computed(() => (leads.value.length === 1 ? leads.value[0]!.name : 'My team'))
const key = (uid: string, d: string) => `${uid}|${d}`
const weekOf = (d: string) => weekDays(d)[0]!
const isWeekday = (d: string) => { const n = parseDateString(d).getDay(); return n >= 1 && n <= 5 }
const busyByKey = computed(() => {
  const m = new Map<string, Busy[]>()
  for (const b of busyRows.value ?? []) { const k = key(b.user_id, toDateString(new Date(b.starts_at))); m.set(k, [...(m.get(k) ?? []), b]) }
  return m
})
const busyOn = (uid: string, d: string) => busyByKey.value.get(key(uid, d)) ?? []
const offOn = (uid: string, d: string) => (off.value ?? []).filter(o => (o.user_id === uid || o.user_id === null) && o.starts_on <= d && o.ends_on >= d).reduce((s, o) => s + o.hours_per_day, 0)
const availableOn = (p: Person, d: string) => Math.max(0, (p.base.get(weekOf(d)) ?? 0) / 5 - offOn(p.id, d) - busyOn(p.id, d).reduce((s, b) => s + b.hours, 0))

// ---------- tasks on days ----------
const barStart = (t: Task) => (t.start_on && t.due_on && t.start_on <= t.due_on ? t.start_on : t.due_on!)
// While a block is being stretched, its due date follows the pointer.
const resizing = ref<{ task: Task, due: string } | null>(null)
const dueOf = (t: Task) => (resizing.value?.task.id === t.id ? resizing.value.due : t.due_on)
// The weekdays a task is planned on; the due day itself if its span has none.
function plannedDays(t: Task): string[] {
  const due = dueOf(t)
  if (!due) return []
  const out: string[] = []
  for (let d = barStart(t); d <= due; d = addDays(d, 1)) if (isWeekday(d)) out.push(d)
  return out.length ? out : [due]
}
const planKey = (tid: string, uid: string, d: string) => `${tid}|${uid}|${d}`
const planMap = computed(() => new Map((plans.value ?? []).map(p => [planKey(p.work_item_id, p.user_id, p.day), p.hours])))
const setHours = (t: Task, uid: string, d: string) => planMap.value.get(planKey(t.id, uid, d))
// Hours anyone has set on a task, and who has set hours on it.
const plannedByTask = computed(() => {
  const hours = new Map<string, number>()
  const users = new Map<string, Set<string>>()
  for (const p of plans.value ?? []) {
    hours.set(p.work_item_id, (hours.get(p.work_item_id) ?? 0) + p.hours)
    users.set(p.work_item_id, (users.get(p.work_item_id) ?? new Set()).add(p.user_id))
  }
  return { hours, users }
})
// A person's hours on a task on a day: what they set. The person up on
// the task also books whatever is left of the estimate after everyone's
// set hours, spread across their unset days. Anyone else books only
// what was set for them.
function hoursOn(t: Task, uid: string, d: string, ds: string[]) {
  const set = setHours(t, uid, d)
  if (set != null) return set
  if (t.assignee_id !== uid) return 0
  const left = Math.max(0, (t.estimate_hours ?? 0) - (plannedByTask.value.hours.get(t.id) ?? 0))
  const unset = ds.filter(x => setHours(t, uid, x) == null)
  return unset.length ? left / unset.length : 0
}
// Whose rows a task shows in: the person up, plus anyone with hours set.
const peopleOn = (t: Task) => {
  const out = new Set<string>(plannedByTask.value.users.get(t.id) ?? [])
  if (t.assignee_id) out.add(t.assignee_id)
  return [...out]
}
const search = ref('')
const projectId = ref('all')
const projectLabel = (t: Task) => `${t.projects?.clients?.name ?? ''} / ${t.projects?.name ?? ''}`
const matches = (t: Task) => {
  if (projectId.value !== 'all' && t.project_id !== projectId.value) return false
  const q = search.value.trim().toLowerCase()
  return !q || t.title.toLowerCase().includes(q) || projectLabel(t).toLowerCase().includes(q)
}
const projectItems = computed(() => {
  const m = new Map<string, string>()
  for (const t of tasks.value ?? []) if (t.project_id && t.projects) m.set(t.project_id, `${t.projects.clients?.name ?? ''} / ${t.projects.name}`)
  return [{ label: 'All projects', value: 'all' }, ...[...m.entries()].map(([value, label]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label))]
})
type Block = { t: Task, hours: number, due: boolean, span: number, set: boolean, theirs: boolean }
const blocks = computed(() => {
  const m = new Map<string, Block[]>()
  for (const t of tasks.value ?? []) {
    const due = dueOf(t)
    if (!due || due < from.value || barStart(t) > to.value || !matches(t)) continue
    const ds = plannedDays(t)
    for (const d of ds) {
      if (d < from.value || d > to.value) continue
      for (const uid of peopleOn(t)) {
        const k = key(uid, d)
        m.set(k, [...(m.get(k) ?? []), { t, hours: hoursOn(t, uid, d, ds), due: d === due, span: ds.length, set: setHours(t, uid, d) != null, theirs: t.assignee_id === uid }])
      }
    }
  }
  return m
})
const cellBlocks = (uid: string, d: string) => blocks.value.get(key(uid, d)) ?? []
const plannedOn = (uid: string, d: string) => cellBlocks(uid, d).reduce((s, b) => s + b.hours, 0)
const freeOn = (p: Person, d: string) => availableOn(p, d) - plannedOn(p.id, d)
const rangePlanned = (p: Person) => days.value.reduce((s, d) => s + plannedOn(p.id, d), 0)
const rangeAvailable = (p: Person) => days.value.reduce((s, d) => s + availableOn(p, d), 0)
const rangePct = (p: Person) => (rangeAvailable(p) > 0 ? Math.round(rangePlanned(p) / rangeAvailable(p) * 100) : rangePlanned(p) > 0 ? 200 : 0)
const pctColor = (n: number) => (n > 100 ? 'text-error' : n > 85 ? 'text-warning' : 'text-muted')
const h = (n: number) => formatHours(n)
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
const rangeLabel = computed(() => `${shortDate(from.value)} to ${shortDate(to.value)}`)
function dayFoot(p: Person, d: string) {
  const a = availableOn(p, d)
  const used = plannedOn(p.id, d)
  if (a === 0 && offOn(p.id, d) > 0 && used === 0) return 'off'
  const f = a - used
  return f < 0 ? `${h(used)} of ${h(a)}, ${h(-f)} over` : `${h(used)} of ${h(a)}`
}

// Same palette every visit, one color per project.
const PALETTE = ['border-l-sky-500', 'border-l-violet-500', 'border-l-emerald-500', 'border-l-amber-500', 'border-l-rose-500', 'border-l-teal-500', 'border-l-indigo-500', 'border-l-orange-500']
const projectColor = (id: string | null) => { let n = 0; for (const ch of id ?? '') n = (n * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[n % PALETTE.length] }

// Nobody up: open tasks with nobody up, whether or not people are on
// them. Dated first.
const unassigned = computed(() => (tasks.value ?? []).filter(t => !t.assignee_id && matches(t)).sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || a.title.localeCompare(b.title)))

// ---------- drag to plan ----------
const dragging = ref<{ task: Task, fromUser: string | null } | null>(null)
const over = ref<string | null>(null)
function onDragStart(t: Task, fromUser: string | null, e: DragEvent) {
  if (resizing.value) { e.preventDefault(); return }
  dragging.value = { task: t, fromUser }
  e.dataTransfer?.setData('text/plain', t.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
const reset = () => { dragging.value = null; over.value = null }
function onDragOver(uid: string, d: string, e: DragEvent) {
  if (!dragging.value) return
  e.preventDefault()
  over.value = key(uid, d)
}
async function onDrop(uid: string, d: string) {
  const g = dragging.value
  reset()
  if (g) await plan(g.task, g.fromUser, uid, d)
}
const daysBetween = (a: string, b: string) => Math.round((parseDateString(b).getTime() - parseDateString(a).getTime()) / 86400000)
const busy = ref<string | null>(null)
// Plan a task on a person's day: the span keeps its length and starts
// there, and that person is up on it. Whoever it was dragged from stays
// on the task, so their plan hours are not cascade-deleted with them.
const plansFor = (tid: string, uid: string) => (plans.value ?? []).filter(p => p.work_item_id === tid && p.user_id === uid)
async function plan(t: Task, fromUser: string | null, uid: string, day: string) {
  const before = { start_on: t.start_on, due_on: t.due_on }
  const after = { start_on: day, due_on: t.due_on ? addDays(day, daysBetween(barStart(t), t.due_on)) : day }
  const sameDates = !!t.due_on && barStart(t) === day && t.due_on === after.due_on
  const samePerson = fromUser === uid || (!fromUser && t.assignee_id === uid)
  if (sameDates && samePerson) return
  // The set hours travel with the task: same offsets from its start, new person.
  const delta = t.due_on ? daysBetween(barStart(t), day) : 0
  const owner = fromUser ?? uid
  const prevOwner = t.assignee_id
  const kept = plansFor(t.id, owner)
  const shifted = kept.map(r => ({ work_item_id: t.id, user_id: uid, day: addDays(r.day, delta), hours: r.hours }))
  busy.value = t.id
  try {
    const patch = { ...(sameDates ? {} : after), ...(samePerson ? {} : { assignee_id: uid }) }
    if (Object.keys(patch).length) {
      const { error } = await supabase.from('work_items').update(patch).eq('id', t.id)
      if (error) throw error
    }
    if (kept.length && (!sameDates || !samePerson)) {
      const del = await supabase.from('work_item_plans').delete().eq('work_item_id', t.id).eq('user_id', uid)
      if (del.error) throw del.error
      const ins = await supabase.from('work_item_plans').insert(shifted)
      if (ins.error) throw ins.error
    }
    await refreshAll()
    const name = allPeople.value.find(p => p.id === uid)?.name ?? 'them'
    undo.offer(`${t.title}: ${name}, ${shortDate(day)}`, async () => {
      const back = { ...(sameDates ? {} : before), ...(samePerson ? {} : { assignee_id: prevOwner }) }
      if (Object.keys(back).length) {
        const { error } = await supabase.from('work_items').update(back).eq('id', t.id)
        if (error) throw error
      }
      if (kept.length) {
        const del = await supabase.from('work_item_plans').delete().eq('work_item_id', t.id).eq('user_id', uid)
        if (del.error) throw del.error
        const ins = await supabase.from('work_item_plans').insert(kept.map(r => ({ work_item_id: t.id, user_id: owner, day: r.day, hours: r.hours })))
        if (ins.error) throw ins.error
      }
    }, () => refreshAll())
  } catch (e) {
    toast.add({ title: 'Could not plan that', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = null
  }
}
// ---------- stretch a block across days ----------
// The handle on a block's right edge drags the due date along the day
// columns. Pointer events, not HTML5 drag, so the block's own drag is
// left alone; the day under the pointer comes from the cell's data-day.
function startResize(t: Task, e: PointerEvent) {
  if (!t.due_on) return
  resizing.value = { task: t, due: t.due_on }
  const onMove = (ev: PointerEvent) => {
    const cell = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-day]')
    const day = cell?.dataset.day
    if (day && resizing.value && day >= barStart(t)) resizing.value.due = day
  }
  const onUp = async () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    const r = resizing.value
    resizing.value = null
    if (r && r.due !== t.due_on) await stretch(t, r.due)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
async function stretch(t: Task, due: string) {
  const before = { start_on: t.start_on, due_on: t.due_on }
  const after = { start_on: barStart(t), due_on: due }
  const dropped = (plans.value ?? []).filter(p => p.work_item_id === t.id && p.day > due)
  busy.value = t.id
  try {
    const { error } = await supabase.from('work_items').update(after).eq('id', t.id)
    if (error) throw error
    if (dropped.length) {
      const del = await supabase.from('work_item_plans').delete().eq('work_item_id', t.id).gt('day', due)
      if (del.error) throw del.error
    }
    await refreshAll()
    undo.offer(`${t.title}: ${shortDate(after.start_on)} to ${shortDate(due)}`, async () => {
      const { error: back } = await supabase.from('work_items').update(before).eq('id', t.id)
      if (back) throw back
      if (dropped.length) {
        const ins = await supabase.from('work_item_plans').insert(dropped)
        if (ins.error) throw ins.error
      }
    }, () => refreshAll())
  } catch (e) {
    toast.add({ title: 'Could not change the dates', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = null
  }
}
// ---------- hours on a day ----------
// Click the hours on a block to type what that person does that day.
// Empty puts the day back on the even split.
const editing = ref<{ tid: string, uid: string, day: string, text: string, initial: string } | null>(null)
function startEdit(b: Block, uid: string, day: string) {
  const text = b.hours ? formatHours(b.hours) : ''
  editing.value = { tid: b.t.id, uid, day, text, initial: text }
}
const focusEl = (v: { el: HTMLInputElement | null }) => v.el?.select()
async function commitEdit() {
  const e = editing.value
  editing.value = null
  if (!e) return
  const text = e.text.trim()
  // Clicking in and out again pins nothing.
  if (text === e.initial.trim()) return
  const hours = text ? parseHours(text) : null
  if (text && hours == null) { toast.add({ title: 'Hours like 2:30 or 2.5', color: 'error', duration: 2500 }); return }
  const was = planMap.value.get(planKey(e.tid, e.uid, e.day))
  if ((hours ?? undefined) === was) return
  busy.value = e.tid
  try {
    const q = supabase.from('work_item_plans')
    const { error } = hours == null
      ? await q.delete().eq('work_item_id', e.tid).eq('user_id', e.uid).eq('day', e.day)
      : await q.upsert({ work_item_id: e.tid, user_id: e.uid, day: e.day, hours })
    if (error) throw error
    await refreshPlans()
  } catch (err) {
    toast.add({ title: 'Could not save the hours', description: (err as Error).message, color: 'error' })
  } finally {
    busy.value = null
  }
}
// Put someone up on it without touching dates, for a task that should
// keep them. The owner trigger adds them to the task.
async function assignOnly(t: Task, uid: string) {
  busy.value = t.id
  const prevOwner = t.assignee_id
  try {
    const { error } = await supabase.from('work_items').update({ assignee_id: uid }).eq('id', t.id)
    if (error) throw error
    await refreshTasks()
    const name = allPeople.value.find(p => p.id === uid)?.name ?? 'them'
    undo.offer(`${t.title}: ${name} is up`, async () => {
      const { error: back } = await supabase.from('work_items').update({ assignee_id: prevOwner }).eq('id', t.id)
      if (back) throw back
    }, () => refreshTasks())
  } catch (e) {
    toast.add({ title: 'Could not assign', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = null
  }
}
const assignMenu = (t: Task) => [allPeople.value.map(p => ({ label: p.name, onSelect: () => { assignOnly(t, p.id) } }))]
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Planner</h1>
        <p class="text-sm text-muted">Who is doing what on which day. Drag a task onto a person's day to plan it there and put them up on it, or drag a block to move it. What is left of an estimate spreads across the days for the person up.</p>
      </div>
      <div class="ml-auto flex gap-2">
        <UButton to="/schedule" variant="outline" color="neutral" icon="i-lucide-gantt-chart">Schedule</UButton>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UButton icon="i-lucide-chevron-left" variant="ghost" color="neutral" size="sm" aria-label="Earlier" @click="move(-1)" />
      <UButton variant="outline" color="neutral" size="sm" @click="anchor = weekDays(today)[0]!;">Today</UButton>
      <UButton icon="i-lucide-chevron-right" variant="ghost" color="neutral" size="sm" aria-label="Later" @click="move(1)" />
      <span class="text-sm font-medium">{{ rangeLabel }}</span>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <div class="flex gap-0.5 rounded-md bg-elevated p-0.5">
          <UButton size="xs" :variant="zoom === 'week' ? 'solid' : 'ghost'" :color="zoom === 'week' ? 'primary' : 'neutral'" @click="zoom = 'week';">Week</UButton>
          <UButton size="xs" :variant="zoom === 'weeks' ? 'solid' : 'ghost'" :color="zoom === 'weeks' ? 'primary' : 'neutral'" @click="zoom = 'weeks';">3 weeks</UButton>
        </div>
        <USelectMenu v-model="peopleFilter" :items="peopleItems" value-key="value" multiple size="sm" placeholder="Everyone" class="w-48" />
        <UButton size="sm" :variant="onlyMe ? 'solid' : 'outline'" :color="onlyMe ? 'primary' : 'neutral'" @click="peopleFilter = onlyMe ? [] : [me];">Me</UButton>
        <UButton v-if="myTeam.length > 1" size="sm" :variant="onlyTeam ? 'solid' : 'outline'" :color="onlyTeam ? 'primary' : 'neutral'" icon="i-lucide-users" :title="leads.length ? 'The people in the departments you lead' : 'The people in your department'" @click="peopleFilter = onlyTeam ? [] : [...myTeam];">{{ teamLabel }}</UButton>
        <USelect v-model="projectId" :items="projectItems" value-key="value" size="sm" class="w-56" />
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search tasks" size="sm" class="w-48" />
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <!-- Left: what needs a person. Sticky and scrolls on its own so a task deep in the list can still reach the grid. -->
      <div class="lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
        <UCard :ui="{ body: 'p-2 sm:p-2' }">
          <template #header>
            <div class="flex items-baseline gap-2">
              <span class="size-2.5 rounded-full bg-warning" />
              <span class="font-semibold">Nobody up</span>
              <span class="text-xs text-muted">{{ unassigned.length }}</span>
            </div>
          </template>
          <div v-if="unassigned.length" class="space-y-1.5">
            <div
              v-for="t in unassigned" :key="t.id" draggable="true"
              class="cursor-grab rounded-md border border-default border-l-2 bg-default p-2 text-sm hover:bg-elevated active:cursor-grabbing"
              :class="[projectColor(t.project_id), dragging?.task.id === t.id ? 'opacity-40' : '']"
              @dragstart="onDragStart(t, null, $event)" @dragend="reset"
            >
              <div class="flex items-start gap-1">
                <NuxtLink :to="`/tasks/${t.id}`" class="min-w-0 flex-1 truncate font-medium hover:underline" @click.stop>{{ t.title }}</NuxtLink>
                <UDropdownMenu :items="assignMenu(t)"><UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-user-plus" :loading="busy === t.id" aria-label="Put someone up on it without changing dates" title="Put someone up on it without changing dates" /></UDropdownMenu>
              </div>
              <div class="truncate text-xs text-muted">{{ projectLabel(t) }}</div>
              <div class="mt-1 flex items-center gap-2 text-xs tabular-nums">
                <span v-if="t.estimate_hours" class="text-muted">{{ h(t.estimate_hours) }}</span>
                <span v-if="t.due_on" :class="t.due_on < today ? 'text-error' : 'text-muted'">{{ t.start_on && t.start_on < t.due_on ? `${shortDate(t.start_on)} to ` : 'due ' }}{{ shortDate(t.due_on) }}</span>
                <span v-else class="text-dimmed">no date</span>
              </div>
            </div>
          </div>
          <p v-else class="px-2 py-6 text-center text-xs text-muted">Someone is up on every open task.</p>
        </UCard>
      </div>

      <!-- Right: people by day -->
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <div class="overflow-x-auto">
          <table class="table-fixed text-sm" :class="zoom === 'week' ? 'w-full' : ''" :style="zoom === 'weeks' ? { width: `${11 + days.length * 7}rem` } : undefined">
            <thead class="text-left text-muted">
              <tr class="border-b border-default">
                <th class="sticky left-0 z-10 w-44 bg-default px-3 py-2 font-medium">Person</th>
                <th v-for="d in days" :key="d" class="px-1 py-2 text-center font-medium" :class="[zoom === 'week' ? '' : 'w-28', d === today ? 'text-primary' : '']">
                  <div class="text-[10px] font-semibold uppercase tracking-wider" :class="d === today ? 'text-primary' : 'text-dimmed'">{{ dayName(d) }}</div>
                  {{ shortDate(d) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in people" :key="p.id" class="border-b border-default last:border-0">
                <td class="sticky left-0 z-10 bg-default px-3 py-2 align-top whitespace-nowrap">
                  <div class="flex items-center gap-2">
                    <span class="inline-grid size-7 shrink-0 place-items-center rounded-full bg-elevated text-[10px] font-medium">{{ initials(p.name) }}</span>
                    <div>
                      <div class="font-medium">{{ p.name }}</div>
                      <div class="text-xs tabular-nums" :class="pctColor(rangePct(p))">{{ rangePct(p) }}% <span class="text-dimmed">{{ h(rangePlanned(p)) }} of {{ h(rangeAvailable(p)) }}</span></div>
                      <div v-if="p.quoted" class="text-[11px] tabular-nums text-dimmed" title="Scope lines on draft or sent quotes that name this person and a week in view">{{ h(p.quoted) }} quoted</div>
                    </div>
                  </div>
                </td>
                <td
                  v-for="d in days" :key="d" class="p-1 align-top" :class="d === today ? 'bg-primary/5' : ''" :data-day="d"
                  @dragover="onDragOver(p.id, d, $event)" @dragleave="over === key(p.id, d) && (over = null)" @drop.prevent="onDrop(p.id, d)"
                >
                  <div
                    class="flex min-h-24 flex-col gap-1 rounded-md border p-1 transition-colors"
                    :class="over === key(p.id, d) ? 'border-primary bg-primary/10' : dragging ? 'border-dashed border-primary/40' : 'border-transparent'"
                  >
                    <div v-if="offOn(p.id, d) > 0" class="rounded bg-elevated/70 px-1.5 py-1 text-[11px] text-muted">Off {{ h(offOn(p.id, d)) }}</div>
                    <div v-for="b in busyOn(p.id, d)" :key="b.id" class="flex items-center gap-1 overflow-hidden whitespace-nowrap rounded bg-elevated/70 px-1.5 py-1 text-[11px] text-muted">
                      <UIcon name="i-lucide-calendar" class="size-3 shrink-0" />
                      <span class="tabular-nums">{{ clock(b.starts_at) }}</span>
                      <span class="truncate">Busy {{ h(b.hours) }}</span>
                    </div>
                    <div
                      v-for="b in cellBlocks(p.id, d)" :key="b.t.id" :draggable="!resizing && !editing"
                      class="relative cursor-grab rounded-md border border-l-2 bg-default px-1.5 py-1 pr-2.5 text-xs hover:bg-elevated active:cursor-grabbing"
                      :class="[projectColor(b.t.project_id), b.theirs ? 'border-default' : 'border-dashed border-accented opacity-80', dragging?.task.id === b.t.id ? 'opacity-40' : '', resizing?.task.id === b.t.id ? 'border-primary bg-primary/10' : '']"
                      :title="b.theirs ? undefined : 'Not their turn yet'"
                      @dragstart="onDragStart(b.t, p.id, $event)" @dragend="reset"
                    >
                      <span class="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md hover:bg-primary/30" title="Drag to change the due date" @pointerdown.stop.prevent="startResize(b.t, $event)" />
                      <NuxtLink :to="`/tasks/${b.t.id}`" class="block truncate font-medium hover:underline" :title="b.t.title" @click.stop>{{ b.t.title }}</NuxtLink>
                      <div v-if="zoom === 'week'" class="truncate text-[11px] text-muted">{{ projectLabel(b.t) }}</div>
                      <div class="flex items-center gap-1 text-[11px] text-muted tabular-nums">
                        <UIcon v-if="b.t.is_milestone" name="i-lucide-flag" class="size-3" />
                        <input
                          v-if="editing && editing.tid === b.t.id && editing.uid === p.id && editing.day === d"
                          v-model="editing.text" class="w-12 rounded border border-primary bg-default px-1 py-0 text-[11px] text-highlighted outline-none" placeholder="h:mm"
                          @vue:mounted="focusEl" @keydown.enter.prevent="commitEdit" @keydown.esc.prevent="editing = null" @blur="commitEdit" @pointerdown.stop @click.stop
                        >
                        <button v-else-if="!b.t.is_milestone" type="button" class="inline-flex items-center rounded px-0.5 hover:bg-primary/10 hover:text-highlighted" :class="b.set ? 'font-medium text-highlighted' : ''" :title="b.set ? 'Hours set for this day. Click to change; clear to go back to the even split.' : 'Click to set the hours for this day'" @click.stop="startEdit(b, p.id, d)">
                          <template v-if="b.hours">{{ h(b.hours) }}</template>
                          <UIcon v-else name="i-lucide-clock" class="size-3 text-dimmed" />
                        </button>
                        <span v-if="b.due && b.span > 1" class="ml-auto">due</span>
                      </div>
                    </div>
                    <div class="mt-auto px-1 pt-1 text-[11px] tabular-nums" :class="freeOn(p, d) < 0 ? 'font-medium text-error' : 'text-muted'">{{ dayFoot(p, d) }}</div>
                  </div>
                </td>
              </tr>
              <tr v-if="!people.length">
                <td :colspan="days.length + 1" class="px-4 py-8 text-center text-muted">No active people.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </div>
  </div>
</template>
