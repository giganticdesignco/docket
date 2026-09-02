<script setup lang="ts">
// The schedule: tasks as bars on a timeline, by project or by person.
// Drag a bar to move it, drag an edge to change its length, shift-drag
// to bring the tasks that wait on it along. Arrows show dependencies;
// a task that starts before what it waits on ends gets a warning. The
// person view adds a capacity strip per week from capacity_weekly.
useHead({ title: 'Schedule' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const route = useRoute()
const router = useRouter()

type View = 'project' | 'person'
type Zoom = 'day' | 'week' | 'month'
const q = (k: string) => (typeof route.query[k] === 'string' ? route.query[k] as string : '')
// The URL wins; without one, the schedule opens as this person left it
// (view, zoom, everyone), always starting from this week.
const saved = await useViewState('schedule', { view: 'project' as View, zoom: 'week' as Zoom, everyone: true })
const view = ref<View>((q('view') as View) || saved.view)
const zoom = ref<Zoom>((q('zoom') as Zoom) || saved.zoom)
const from = ref(q('from') || weekDays(todayString())[0]!)
const everyone = ref(q('mine') ? q('mine') !== '1' : saved.everyone)
watch([view, zoom, from, everyone], () => {
  router.replace({ query: { view: view.value, zoom: zoom.value, from: from.value, ...(everyone.value ? {} : { mine: '1' }) } })
  Object.assign(saved, { view: view.value, zoom: zoom.value, everyone: everyone.value })
})

const DAY_PX: Record<Zoom, number> = { day: 36, week: 10, month: 4 }
const WEEKS: Record<Zoom, number> = { day: 6, week: 16, month: 40 }
const colPx = computed(() => DAY_PX[zoom.value])
const days = computed(() => WEEKS[zoom.value] * 7)
const to = computed(() => addDays(from.value, days.value - 1))
const dayList = computed(() => Array.from({ length: days.value }, (_, i) => addDays(from.value, i)))
const weekStarts = computed(() => dayList.value.filter((_, i) => i % 7 === 0))
const today = todayString()
const dayIndex = (d: string) => Math.round((parseDateString(d).getTime() - parseDateString(from.value).getTime()) / 86_400_000)
const x = (d: string) => dayIndex(d) * colPx.value
const width = computed(() => days.value * colPx.value)

// ---------- data ----------

const ws = await useWorkStatuses()
const __ad1 = useAsyncData('schedule-items', async () => {
  const { data, error } = await supabase
    .from('work_items')
    .select('id, title, status, priority, start_on, due_on, estimate_hours, is_milestone, project_id, projects(id, name, clients(name)), work_item_assignees(user_id, profiles(full_name))')
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(2000)
  if (error) throw error
  return data
}, fresh)
const __ad2 = useAsyncData('schedule-deps', async () => {
  const { data, error } = await supabase.from('work_item_dependencies').select('predecessor_id, successor_id')
  if (error) throw error
  return data
}, fresh)
const __ad3 = useAsyncData('schedule-people', async () => {
  const { data, error } = await supabase.from('profiles').select('id, full_name').eq('is_active', true).neq('role', 'client').order('full_name')
  if (error) throw error
  return data
}, fresh)
await Promise.all([__ad1, __ad2, __ad3])
const { data: items, refresh } = __ad1
const { data: deps, refresh: refreshDeps } = __ad2
const { data: people } = __ad3
const capacityKey = computed(() => `${from.value}-${to.value}`)
const { data: capacity } = await useAsyncData('schedule-capacity', async () => {
  const { data, error } = await supabase.from('capacity_weekly').select('user_id, week_start, base_hours, time_off_hours, meeting_hours, booked_hours').gte('week_start', from.value).lte('week_start', to.value)
  if (error) throw error
  // The view's numbers come back nullable in the types; they never are.
  return (data ?? []).map(c => ({ user_id: c.user_id!, week_start: c.week_start!, base_hours: Number(c.base_hours ?? 0), time_off_hours: Number(c.time_off_hours ?? 0), meeting_hours: Number(c.meeting_hours ?? 0), booked_hours: Number(c.booked_hours ?? 0) }))
}, { ...fresh, watch: [capacityKey] })

type Item = NonNullable<typeof items.value>[number]
const open = computed(() => (items.value ?? []).filter(i => !ws.isDone(i.status) && (everyone.value || i.work_item_assignees.some(a => a.user_id === user.value?.sub))))
const scheduled = computed(() => open.value.filter(i => i.due_on))
const unscheduled = computed(() => open.value.filter(i => !i.due_on))
// A bar runs from start_on (or due_on for a one-day task) to due_on.
const barStart = (i: Item) => i.start_on && i.start_on <= i.due_on! ? i.start_on : i.due_on!
const inRange = (i: Item) => i.due_on! >= from.value && barStart(i) <= to.value
const barStyle = (i: Item) => {
  const s = Math.max(0, dayIndex(barStart(i)))
  const e = Math.min(days.value - 1, dayIndex(i.due_on!))
  return { left: `${s * colPx.value}px`, width: `${Math.max(colPx.value, (e - s + 1) * colPx.value - 2)}px` }
}
const predecessorsOf = (id: string) => (deps.value ?? []).filter(d => d.successor_id === id).map(d => d.predecessor_id)
const successorsOf = (id: string) => (deps.value ?? []).filter(d => d.predecessor_id === id).map(d => d.successor_id)
const byId = computed(() => new Map((items.value ?? []).map(i => [i.id, i])))
const lateStart = (i: Item) => predecessorsOf(i.id).some((pid) => { const p = byId.value.get(pid); return !!p?.due_on && barStart(i) <= p.due_on })

type Group = { key: string, label: string, sublabel?: string, items: Item[], userId?: string }
const groups = computed<Group[]>(() => {
  const rows = scheduled.value.filter(inRange)
  if (view.value === 'project') {
    const m = new Map<string, Group>()
    for (const i of rows) {
      const key = i.project_id
      const g = m.get(key) ?? { key, label: i.projects?.name ?? 'Project', sublabel: i.projects?.clients?.name ?? undefined, items: [] }
      g.items.push(i)
      m.set(key, g)
    }
    return [...m.values()].sort((a, b) => `${a.sublabel}${a.label}`.localeCompare(`${b.sublabel}${b.label}`))
  }
  const m = new Map<string, Group>()
  for (const p of people.value ?? []) m.set(p.id, { key: p.id, label: p.full_name, items: [], userId: p.id })
  const nobody: Group = { key: 'nobody', label: 'Unassigned', items: [] }
  for (const i of rows) {
    if (!i.work_item_assignees.length) nobody.items.push(i)
    for (const a of i.work_item_assignees) m.get(a.user_id)?.items.push(i)
  }
  const out = [...m.values()].filter(g => g.items.length || everyone.value)
  if (nobody.items.length) out.push(nobody)
  return out
})
// Rows are laid out per group: each item on its own line.
const rowH = 28
const groupTop = computed(() => {
  let y = 0
  const tops = new Map<string, number>()
  for (const g of groups.value) { tops.set(g.key, y); y += rowH + (view.value === 'person' && g.userId ? 18 : 0) + g.items.length * rowH }
  return { tops, total: y }
})
const itemY = new Map<string, number>()
const layout = computed(() => {
  itemY.clear()
  for (const g of groups.value) {
    let y = groupTop.value.tops.get(g.key)! + rowH + (view.value === 'person' && g.userId ? 18 : 0)
    for (const i of g.items) { itemY.set(`${g.key}:${i.id}`, y); y += rowH }
  }
  return groupTop.value.total
})
// Arrow from the end of a predecessor to the start of a successor,
// drawn only when both are on screen in this view.
const arrows = computed(() => {
  layout.value
  const out: { d: string, late: boolean }[] = []
  for (const g of groups.value) {
    for (const i of g.items) {
      for (const pid of predecessorsOf(i.id)) {
        const p = byId.value.get(pid)
        if (!p?.due_on || !g.items.some(x => x.id === pid)) continue
        const y1 = itemY.get(`${g.key}:${pid}`)! + rowH / 2
        const y2 = itemY.get(`${g.key}:${i.id}`)! + rowH / 2
        const x1 = (Math.min(days.value - 1, dayIndex(p.due_on)) + 1) * colPx.value
        const x2 = Math.max(0, dayIndex(barStart(i))) * colPx.value
        out.push({ d: `M${x1},${y1} C${x1 + 12},${y1} ${x2 - 12},${y2} ${x2},${y2}`, late: barStart(i) <= p.due_on })
      }
    }
  }
  return out
})

// ---------- capacity strip (person view) ----------
const cap = (userId: string, week: string) => capacity.value?.find(c => c.user_id === userId && c.week_start === week)
const capClass = (userId: string, week: string) => {
  const c = cap(userId, week)
  if (!c) return 'bg-elevated'
  const avail = c.base_hours - c.time_off_hours - c.meeting_hours
  const pct = avail > 0 ? c.booked_hours / avail : c.booked_hours > 0 ? 2 : 0
  return pct > 1 ? 'bg-error/60' : pct > 0.8 ? 'bg-warning/60' : pct > 0 ? 'bg-primary/40' : 'bg-elevated'
}
const capTitle = (userId: string, week: string) => {
  const c = cap(userId, week)
  if (!c) return ''
  const avail = c.base_hours - c.time_off_hours - c.meeting_hours
  return `Week of ${shortDate(week)}: ${formatHours(c.booked_hours)} booked of ${formatHours(Math.max(0, avail))} free (${formatHours(c.meeting_hours)} in meetings, ${formatHours(c.time_off_hours)} off)`
}

// ---------- drag ----------
type Drag = { item: Item, mode: 'move' | 'start' | 'end', x0: number, shift: boolean, delta: number }
const drag = ref<Drag | null>(null)
function onPointerDown(i: Item, mode: Drag['mode'], e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  drag.value = { item: i, mode, x0: e.clientX, shift: e.shiftKey, delta: 0 }
}
function onPointerMove(e: PointerEvent) {
  if (!drag.value) return
  drag.value.delta = Math.round((e.clientX - drag.value.x0) / colPx.value)
}
async function onPointerUp() {
  const d = drag.value
  drag.value = null
  if (!d || !d.delta) return
  const i = d.item
  const start = barStart(i)
  const patch: Record<string, { start_on?: string | null, due_on?: string }> = {}
  if (d.mode === 'move') {
    patch[i.id] = { start_on: i.start_on ? addDays(i.start_on, d.delta) : null, due_on: addDays(i.due_on!, d.delta) }
    if (d.shift) {
      const seen = new Set<string>([i.id])
      const walk = (id: string) => {
        for (const sid of successorsOf(id)) {
          const s = byId.value.get(sid)
          if (!s?.due_on || seen.has(sid)) continue
          seen.add(sid)
          patch[sid] = { start_on: s.start_on ? addDays(s.start_on, d.delta) : null, due_on: addDays(s.due_on, d.delta) }
          walk(sid)
        }
      }
      walk(i.id)
    }
  } else if (d.mode === 'start') {
    const ns = addDays(start, d.delta)
    patch[i.id] = { start_on: ns <= i.due_on! ? ns : i.due_on! }
  } else {
    const nd = addDays(i.due_on!, d.delta)
    patch[i.id] = { due_on: nd >= start ? nd : start, ...(i.start_on && i.start_on > nd ? { start_on: nd } : {}) }
  }
  const results = await Promise.all(Object.entries(patch).map(([id, values]) => supabase.from('work_items').update(values).eq('id', id)))
  const err = results.find(r => r.error)?.error
  if (err) toast.add({ title: 'Not saved', description: err.message, color: 'error' })
  else await refresh()
}
const dragOffset = (i: Item) => (drag.value?.item.id === i.id && drag.value.mode === 'move' ? drag.value.delta * colPx.value : 0)
const dragResize = (i: Item) => {
  if (drag.value?.item.id !== i.id || drag.value.mode === 'move') return {}
  const px = drag.value.delta * colPx.value
  return drag.value.mode === 'start' ? { marginLeft: `${px}px`, width: `calc(${barStyle(i).width} - ${px}px)` } : { width: `calc(${barStyle(i).width} + ${px}px)` }
}

// Unscheduled: give it dates from today and its estimate.
async function scheduleNow(i: Item) {
  const daysLong = Math.max(1, Math.ceil((i.estimate_hours ?? 6) / 6))
  const { error } = await supabase.from('work_items').update({ start_on: today, due_on: addDays(today, daysLong - 1) }).eq('id', i.id)
  if (error) toast.add({ title: 'Not saved', description: error.message, color: 'error' })
  else await refresh()
}
async function toggleMilestone(i: Item) {
  const { error } = await supabase.from('work_items').update({ is_milestone: !i.is_milestone }).eq('id', i.id)
  if (error) toast.add({ title: 'Not saved', description: error.message, color: 'error' })
  else await refresh()
}

const printPage = () => window.print()
const step = (dir: -1 | 1) => { from.value = addDays(from.value, dir * 7 * Math.max(1, Math.floor(WEEKS[zoom.value] / 2))) }
const initials = (n: string) => n.split(' ').map(w => w[0]).join('').slice(0, 2)
const statusBar: Record<string, string> = { primary: 'bg-primary', info: 'bg-info', success: 'bg-success', warning: 'bg-warning', error: 'bg-error' }
const barClass = (i: Item) => statusBar[ws.color(i.status) ?? ''] ?? 'bg-accented'
const monthLabel = (d: string) => parseDateString(d).toLocaleDateString('en-US', { month: 'short' })
</script>

<template>
  <div class="space-y-4" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
    <div class="flex flex-wrap items-center gap-3 print:hidden">
      <div>
        <h1 class="text-2xl font-semibold">Schedule</h1>
        <p class="text-sm text-muted">Drag a bar to move it, an edge to stretch it. Hold Shift while dragging to bring what waits on it along.</p>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <div class="flex gap-1 rounded-md bg-elevated p-0.5">
          <UButton size="xs" :variant="view === 'project' ? 'solid' : 'ghost'" :color="view === 'project' ? 'primary' : 'neutral'" @click="view = 'project';">By project</UButton>
          <UButton size="xs" :variant="view === 'person' ? 'solid' : 'ghost'" :color="view === 'person' ? 'primary' : 'neutral'" @click="view = 'person';">By person</UButton>
        </div>
        <div class="flex gap-1 rounded-md bg-elevated p-0.5">
          <UButton v-for="z in (['day', 'week', 'month'] as Zoom[])" :key="z" size="xs" :variant="zoom === z ? 'solid' : 'ghost'" :color="zoom === z ? 'primary' : 'neutral'" @click="zoom = z;">{{ z[0]!.toUpperCase() + z.slice(1) }}</UButton>
        </div>
        <USwitch v-model="everyone" label="Everyone" size="sm" />
        <UButton icon="i-lucide-chevron-left" variant="ghost" color="neutral" size="sm" aria-label="Earlier" @click="step(-1)" />
        <UButton variant="ghost" color="neutral" size="sm" @click="from = weekDays(todayString())[0]!;">Today</UButton>
        <UButton icon="i-lucide-chevron-right" variant="ghost" color="neutral" size="sm" aria-label="Later" @click="step(1)" />
        <UButton variant="outline" color="neutral" size="sm" icon="i-lucide-printer" @click="printPage">Print</UButton>
      </div>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="flex overflow-x-auto">
        <!-- labels -->
        <div class="sticky left-0 z-10 w-60 shrink-0 border-r border-default bg-default text-sm">
          <div class="h-12 border-b border-default" />
          <div v-for="g in groups" :key="g.key">
            <div class="flex h-7 items-center gap-2 px-3 font-semibold" :style="{ height: `${rowH}px` }">
              <span v-if="g.userId" class="grid size-5 place-items-center rounded-full bg-elevated text-[10px] font-medium">{{ initials(g.label) }}</span>
              <span class="truncate">{{ g.label }}</span>
              <span v-if="g.sublabel" class="truncate text-xs font-normal text-muted">{{ g.sublabel }}</span>
            </div>
            <div v-if="view === 'person' && g.userId" class="px-3 text-[10px] text-muted" style="height: 18px">capacity by week</div>
            <div v-for="i in g.items" :key="i.id" class="flex items-center gap-2 px-3" :style="{ height: `${rowH}px` }">
              <NuxtLink :to="`/tasks/${i.id}`" class="min-w-0 flex-1 truncate hover:underline" :title="i.title">{{ i.title }}</NuxtLink>
              <UIcon v-if="lateStart(i)" name="i-lucide-triangle-alert" class="size-3.5 shrink-0 text-error" title="Starts before what it waits on ends" />
              <span v-if="view === 'project' && i.work_item_assignees.length" class="shrink-0 text-[10px] text-muted">{{ i.work_item_assignees.map(a => initials(a.profiles?.full_name ?? '?')).join(' ') }}</span>
            </div>
          </div>
          <p v-if="!groups.length" class="px-3 py-8 text-center text-muted">Nothing scheduled in this range.</p>
        </div>

        <!-- timeline -->
        <div class="relative shrink-0" :style="{ width: `${width}px` }">
          <div class="sticky top-0 z-10 h-12 border-b border-default bg-default">
            <div class="flex h-6 text-[11px] text-muted">
              <div v-for="w in weekStarts" :key="w" class="shrink-0 border-l border-default px-1 leading-6" :style="{ width: `${7 * colPx}px` }">{{ zoom === 'month' ? (parseDateString(w).getDate() <= 7 ? monthLabel(w) : '') : shortDate(w) }}</div>
            </div>
            <div v-if="zoom === 'day'" class="flex h-6 text-[10px] text-dimmed">
              <div v-for="d in dayList" :key="d" class="shrink-0 border-l border-default text-center leading-6" :class="d === today ? 'bg-primary/10 text-primary' : ''" :style="{ width: `${colPx}px` }">{{ dayName(d)[0] }}</div>
            </div>
          </div>
          <div class="relative" :style="{ height: `${layout}px` }">
            <!-- grid -->
            <div v-for="(w, wi) in weekStarts" :key="w" class="absolute inset-y-0 border-l border-default" :class="wi % 2 ? 'bg-elevated/30' : ''" :style="{ left: `${wi * 7 * colPx}px`, width: `${7 * colPx}px` }" />
            <div v-if="today >= from && today <= to" class="absolute inset-y-0 z-0 w-px bg-primary" :style="{ left: `${x(today) + colPx / 2}px` }" />
            <!-- capacity strips -->
            <template v-for="g in groups" :key="`cap-${g.key}`">
              <div v-if="view === 'person' && g.userId" class="absolute flex" :style="{ top: `${groupTop.tops.get(g.key)! + rowH + 3}px`, height: '12px' }">
                <div v-for="w in weekStarts" :key="w" class="shrink-0 rounded-sm" :class="capClass(g.userId, w)" :style="{ width: `${7 * colPx - 2}px`, marginRight: '2px' }" :title="capTitle(g.userId, w)" />
              </div>
            </template>
            <!-- arrows -->
            <svg class="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
              <path v-for="(a, ai) in arrows" :key="ai" :d="a.d" fill="none" :class="a.late ? 'stroke-error' : 'stroke-dimmed'" stroke-width="1.5" />
            </svg>
            <!-- bars -->
            <template v-for="g in groups" :key="`bars-${g.key}`">
              <div
                v-for="i in g.items" :key="i.id"
                class="absolute flex h-5 items-center rounded text-[11px] text-white shadow-sm select-none"
                :class="[barClass(i), i.is_milestone ? 'rotate-45 !w-4 !h-4 rounded-sm' : '', drag?.item.id === i.id ? 'opacity-80 ring-2 ring-primary' : 'cursor-grab']"
                :style="{ top: `${itemY.get(`${g.key}:${i.id}`)! + 4}px`, ...barStyle(i), ...dragResize(i), transform: `translateX(${dragOffset(i)}px)${i.is_milestone ? ' rotate(45deg)' : ''}` }"
                :title="`${i.title}: ${shortDate(barStart(i))} to ${shortDate(i.due_on!)}${i.estimate_hours ? `, ${formatHours(i.estimate_hours)} est.` : ''}`"
                @pointerdown="onPointerDown(i, 'move', $event)" @dblclick="toggleMilestone(i)"
              >
                <span v-if="!i.is_milestone" class="absolute inset-y-0 left-0 w-2 cursor-ew-resize" @pointerdown.stop="onPointerDown(i, 'start', $event)" />
                <span v-if="!i.is_milestone" class="truncate px-2">{{ i.title }}</span>
                <span v-if="!i.is_milestone" class="absolute inset-y-0 right-0 w-2 cursor-ew-resize" @pointerdown.stop="onPointerDown(i, 'end', $event)" />
              </div>
            </template>
          </div>
        </div>
      </div>
    </UCard>

    <UCard v-if="unscheduled.length" class="print:hidden">
      <template #header>
        <div class="flex items-baseline gap-3">
          <h2 class="font-semibold">Unscheduled <span class="font-normal text-muted">{{ unscheduled.length }}</span></h2>
          <span class="text-xs text-muted">Open tasks with no due date. Schedule puts them on today for as many days as the estimate needs; then drag.</span>
        </div>
      </template>
      <ul class="divide-y divide-default text-sm">
        <li v-for="i in unscheduled.slice(0, 50)" :key="i.id" class="flex items-center gap-3 py-1.5">
          <NuxtLink :to="`/tasks/${i.id}`" class="min-w-0 flex-1 truncate hover:underline">{{ i.title }}</NuxtLink>
          <span class="truncate text-xs text-muted">{{ i.projects?.clients?.name }} / {{ i.projects?.name }}</span>
          <span v-if="i.estimate_hours" class="text-xs text-muted tabular-nums">{{ formatHours(i.estimate_hours) }}</span>
          <UButton size="xs" variant="outline" color="neutral" @click="scheduleNow(i)">Schedule</UButton>
        </li>
      </ul>
      <p v-if="unscheduled.length > 50" class="mt-2 text-xs text-muted">Showing the first 50.</p>
    </UCard>
  </div>
</template>

<style scoped>
@media print {
  .sticky { position: static; }
}
</style>
