<script setup lang="ts">
// Planner: people as rows, weekdays as columns, and a block for every
// task on each day it is planned for. Drag a task from the left onto a
// person's day to plan it there; drag a block to move it to another
// day or person. An estimate spreads evenly across the weekdays of a
// task's span and across its assignees. Meetings and time off sit in
// the cell too, so the footer is honest about what is left.
definePageMeta({ middleware: 'can', permission: 'see_capacity' })
useHead({ title: 'Planner' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const undo = useUndo()
const ws = await useWorkStatuses()
const view = await useViewState('planner', { zoom: 'week' as 'week' | 'weeks', who: 'everyone' as 'everyone' | 'me' })
const zoom = persisted(view, 'zoom')
const who = persisted(view, 'who')

const today = todayString()
const anchor = ref(weekDays(today)[0]!)
const weekCount = computed(() => (zoom.value === 'week' ? 1 : 3))
const days = computed(() => Array.from({ length: weekCount.value }, (_, i) => weekDays(addDays(anchor.value, 7 * i)).slice(0, 5)).flat())
const from = computed(() => days.value[0]!)
const to = computed(() => days.value[days.value.length - 1]!)
const move = (n: number) => { anchor.value = addDays(anchor.value, 7 * n * weekCount.value) }

const __ad1 = useAsyncData('planner-capacity', async () => {
  const { data, error } = await supabase.from('capacity_weekly').select('user_id, user_name, week_start, base_hours').gte('week_start', from.value).lte('week_start', to.value).order('user_name')
  if (error) throw error
  return data
}, { ...fresh, watch: [from, to] })
// Every open task, not just the visible range, so the left list is
// complete and a task can be dragged into view from anywhere.
const __ad2 = useAsyncData('planner-tasks', async () => {
  const { data, error } = await supabase
    .from('work_items')
    .select('id, title, status, priority, start_on, due_on, estimate_hours, is_milestone, project_id, projects(id, name, clients(name)), work_item_assignees(user_id)')
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
await Promise.all([__ad1, __ad2, __ad3, __ad4])
const { data: cap } = __ad1
const { data: tasks, refresh: refreshTasks } = __ad2
const { data: off } = __ad3
const { data: busyRows } = __ad4

type Task = NonNullable<typeof tasks.value>[number]
type Busy = NonNullable<typeof busyRows.value>[number]
type Person = { id: string, name: string, base: Map<string, number> }

// ---------- people and their days ----------
const people = computed<Person[]>(() => {
  const m = new Map<string, Person>()
  for (const c of cap.value ?? []) {
    const p = m.get(c.user_id!) ?? { id: c.user_id!, name: c.user_name ?? '', base: new Map() }
    p.base.set(c.week_start!, c.base_hours ?? 0)
    m.set(c.user_id!, p)
  }
  return [...m.values()].filter(p => who.value === 'everyone' || p.id === user.value?.sub).sort((a, b) => a.name.localeCompare(b.name))
})
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
// The weekdays a task is planned on; the due day itself if its span has none.
function plannedDays(t: Task): string[] {
  if (!t.due_on) return []
  const out: string[] = []
  for (let d = barStart(t); d <= t.due_on; d = addDays(d, 1)) if (isWeekday(d)) out.push(d)
  return out.length ? out : [t.due_on]
}
const perDay = (t: Task, n: number) => (t.estimate_hours ? t.estimate_hours / Math.max(t.work_item_assignees.length, 1) / n : 0)
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
type Block = { t: Task, hours: number, due: boolean, span: number }
const blocks = computed(() => {
  const m = new Map<string, Block[]>()
  for (const t of tasks.value ?? []) {
    if (!t.due_on || t.due_on < from.value || barStart(t) > to.value || !matches(t)) continue
    const ds = plannedDays(t)
    for (const d of ds) {
      if (d < from.value || d > to.value) continue
      for (const a of t.work_item_assignees) {
        const k = key(a.user_id, d)
        m.set(k, [...(m.get(k) ?? []), { t, hours: perDay(t, ds.length), due: d === t.due_on, span: ds.length }])
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

// Needs a person: open tasks with nobody on them. Dated first.
const unassigned = computed(() => (tasks.value ?? []).filter(t => !t.work_item_assignees.length && matches(t)).sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || a.title.localeCompare(b.title)))

// ---------- drag to plan ----------
const dragging = ref<{ task: Task, fromUser: string | null } | null>(null)
const over = ref<string | null>(null)
function onDragStart(t: Task, fromUser: string | null, e: DragEvent) {
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
// there; the person replaces whoever it was dragged from.
async function plan(t: Task, fromUser: string | null, uid: string, day: string) {
  const before = { start_on: t.start_on, due_on: t.due_on }
  const after = { start_on: day, due_on: t.due_on ? addDays(day, daysBetween(barStart(t), t.due_on)) : day }
  const sameDates = !!t.due_on && barStart(t) === day && t.due_on === after.due_on
  const samePerson = fromUser === uid || (!fromUser && t.work_item_assignees.some(a => a.user_id === uid))
  if (sameDates && samePerson) return
  busy.value = t.id
  try {
    if (!sameDates) {
      const { error } = await supabase.from('work_items').update(after).eq('id', t.id)
      if (error) throw error
    }
    if (!samePerson) {
      if (fromUser) {
        const { error } = await supabase.from('work_item_assignees').delete().eq('work_item_id', t.id).eq('user_id', fromUser)
        if (error) throw error
      }
      if (!t.work_item_assignees.some(a => a.user_id === uid)) {
        const { error } = await supabase.from('work_item_assignees').insert({ work_item_id: t.id, user_id: uid })
        if (error) throw error
      }
    }
    await refreshTasks()
    const name = people.value.find(p => p.id === uid)?.name ?? 'them'
    undo.offer(`${t.title}: ${name}, ${shortDate(day)}`, async () => {
      if (!sameDates) {
        const { error } = await supabase.from('work_items').update(before).eq('id', t.id)
        if (error) throw error
      }
      if (!samePerson) {
        const del = await supabase.from('work_item_assignees').delete().eq('work_item_id', t.id).eq('user_id', uid)
        if (del.error) throw del.error
        if (fromUser) {
          const ins = await supabase.from('work_item_assignees').insert({ work_item_id: t.id, user_id: fromUser })
          if (ins.error) throw ins.error
        }
      }
    }, () => refreshTasks())
  } catch (e) {
    toast.add({ title: 'Could not plan that', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = null
  }
}
// Assign without touching dates, for a task that should keep them.
async function assignOnly(t: Task, uid: string) {
  busy.value = t.id
  try {
    const { error } = await supabase.from('work_item_assignees').insert({ work_item_id: t.id, user_id: uid })
    if (error) throw error
    await refreshTasks()
    const name = people.value.find(p => p.id === uid)?.name ?? 'them'
    undo.offer(`${t.title} assigned to ${name}`, async () => {
      const { error: back } = await supabase.from('work_item_assignees').delete().eq('work_item_id', t.id).eq('user_id', uid)
      if (back) throw back
    }, () => refreshTasks())
  } catch (e) {
    toast.add({ title: 'Could not assign', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = null
  }
}
const assignMenu = (t: Task) => [people.value.map(p => ({ label: p.name, onSelect: () => { assignOnly(t, p.id) } }))]
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Planner</h1>
        <p class="text-sm text-muted">Who is doing what on which day. Drag a task onto a person's day to plan it there, or drag a block to move it. Estimates spread across the days of a task.</p>
      </div>
      <div class="ml-auto flex gap-2">
        <UButton to="/capacity" variant="outline" color="neutral" icon="i-lucide-gauge">Capacity</UButton>
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
        <div class="flex gap-0.5 rounded-md bg-elevated p-0.5">
          <UButton size="xs" :variant="who === 'everyone' ? 'solid' : 'ghost'" :color="who === 'everyone' ? 'primary' : 'neutral'" @click="who = 'everyone';">Everyone</UButton>
          <UButton size="xs" :variant="who === 'me' ? 'solid' : 'ghost'" :color="who === 'me' ? 'primary' : 'neutral'" @click="who = 'me';">Me</UButton>
        </div>
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
              <span class="font-semibold">Needs a person</span>
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
                <UDropdownMenu :items="assignMenu(t)"><UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-user-plus" :loading="busy === t.id" aria-label="Assign without changing dates" title="Assign without changing dates" /></UDropdownMenu>
              </div>
              <div class="truncate text-xs text-muted">{{ projectLabel(t) }}</div>
              <div class="mt-1 flex items-center gap-2 text-xs tabular-nums">
                <span v-if="t.estimate_hours" class="text-muted">{{ h(t.estimate_hours) }}</span>
                <span v-if="t.due_on" :class="t.due_on < today ? 'text-error' : 'text-muted'">{{ t.start_on && t.start_on < t.due_on ? `${shortDate(t.start_on)} to ` : 'due ' }}{{ shortDate(t.due_on) }}</span>
                <span v-else class="text-dimmed">no date</span>
              </div>
            </div>
          </div>
          <p v-else class="px-2 py-6 text-center text-xs text-muted">Every open task has someone.</p>
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
                    </div>
                  </div>
                </td>
                <td
                  v-for="d in days" :key="d" class="p-1 align-top" :class="d === today ? 'bg-primary/5' : ''"
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
                      v-for="b in cellBlocks(p.id, d)" :key="b.t.id" draggable="true"
                      class="cursor-grab rounded-md border border-default border-l-2 bg-default px-1.5 py-1 text-xs hover:bg-elevated active:cursor-grabbing"
                      :class="[projectColor(b.t.project_id), dragging?.task.id === b.t.id ? 'opacity-40' : '']"
                      @dragstart="onDragStart(b.t, p.id, $event)" @dragend="reset"
                    >
                      <NuxtLink :to="`/tasks/${b.t.id}`" class="block truncate font-medium hover:underline" :title="b.t.title" @click.stop>{{ b.t.title }}</NuxtLink>
                      <div v-if="zoom === 'week'" class="truncate text-[11px] text-muted">{{ projectLabel(b.t) }}</div>
                      <div class="flex items-center gap-1 text-[11px] text-muted tabular-nums">
                        <UIcon v-if="b.t.is_milestone" name="i-lucide-flag" class="size-3" />
                        <span v-if="b.hours">{{ h(b.hours) }}</span>
                        <span v-else-if="!b.t.is_milestone" class="text-dimmed" title="No estimate on this task">no estimate</span>
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
