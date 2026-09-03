<script setup lang="ts">
// Who has room, week by week. Available = weekly hours minus time off
// (weekdays) minus meetings. Past weeks compare logged time to that;
// coming weeks compare what tasks have due, estimates split by assignee.
definePageMeta({ middleware: 'can', permission: 'see_capacity' })
useHead({ title: 'Capacity' })

const supabase = useSupabaseClient()
const ws = await useWorkStatuses()

const thisWeek = weekDays(todayString())[0]!
// Two weeks back for the recent record, six ahead for planning.
const from = addDays(thisWeek, -14)
const to = addDays(thisWeek, 7 * 6)

const { data: cells, refresh } = await useAsyncData('capacity', async () => {
  const { data, error } = await supabase
    .from('capacity_weekly')
    .select('*')
    .gte('week_start', from)
    .lte('week_start', to)
    .order('user_name')
    .order('week_start')
  if (error) throw error
  return data
}, fresh)

type Cell = NonNullable<typeof cells.value>[number]
const weeks = computed(() => [...new Set((cells.value ?? []).map(c => c.week_start!))].sort())
const people = computed(() => {
  const byId = new Map<string, { id: string, name: string, cells: Map<string, Cell> }>()
  for (const c of cells.value ?? []) {
    const p = byId.get(c.user_id!) ?? { id: c.user_id!, name: c.user_name ?? '', cells: new Map() }
    p.cells.set(c.week_start!, c)
    byId.set(c.user_id!, p)
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
})

// Each week answers one question. Past: how much did they log against
// what they had? This week: how much is left, given what is logged and
// what is still planned? Coming weeks: how much room is there after the
// tasks due that week? "Available" is base hours minus time off minus
// meetings from their calendar.
const available = (c: Cell) => Math.max(0, (c.base_hours ?? 0) - (c.time_off_hours ?? 0) - (c.meeting_hours ?? 0))
const isPast = (week: string) => week < thisWeek
const kind = (week: string) => (isPast(week) ? 'past' : week === thisWeek ? 'now' : 'coming')
// What fills the week: logged hours in the past, the larger of logged
// and planned this week, planned (task estimates due that week) ahead.
const used = (c: Cell) => {
  const k = kind(c.week_start!)
  if (k === 'past') return c.logged_hours ?? 0
  if (k === 'now') return Math.max(c.logged_hours ?? 0, c.booked_hours ?? 0)
  return c.booked_hours ?? 0
}
const free = (c: Cell) => available(c) - used(c)
const pct = (c: Cell) => (available(c) > 0 ? used(c) / available(c) * 100 : used(c) > 0 ? 200 : 0)
// Past weeks are a record, not a warning; only the weeks you can still
// change go amber and red.
const color = (c: Cell) => (kind(c.week_start!) === 'past' ? 'neutral' : pct(c) > 100 ? 'error' : pct(c) > 85 ? 'warning' : 'primary')
const h = (n: number | null | undefined) => formatHours(n ?? 0)
const weekLabel = (w: string) => `${shortDate(w)} to ${shortDate(addDays(w, 4))}`
const headline = (c: Cell) => {
  const k = kind(c.week_start!)
  if (k === 'past') return `${h(c.logged_hours)} logged`
  const f = free(c)
  return f >= 0 ? `${h(f)} free` : `${h(-f)} over`
}
const detail = (c: Cell) => {
  const k = kind(c.week_start!)
  if (k === 'past') return `of ${h(available(c))}`
  if (k === 'now') return `${h(c.logged_hours)} logged, ${h(c.booked_hours)} planned`
  return c.booked_hours ? `${h(c.booked_hours)} planned in ${c.booked_tasks} ${c.booked_tasks === 1 ? 'task' : 'tasks'}` : 'nothing planned yet'
}
// Hours on quotes not yet won, named to this person for this week. Shown
// on top of the plan, not in it: the tasks arrive if the quote does.
const forecast = (c: Cell) => (kind(c.week_start!) === 'past' ? 0 : c.forecast_hours ?? 0)
const forecastPct = (c: Cell) => (available(c) > 0 ? Math.min((used(c) + forecast(c)) / available(c) * 100, 100) : 0)
const tip = (c: Cell) => [
  `${h(c.base_hours)} a week`,
  c.time_off_hours ? `${h(c.time_off_hours)} off` : '',
  c.meeting_hours ? `${h(c.meeting_hours)} in meetings` : '',
  `${h(available(c))} available`,
  `${h(c.logged_hours)} logged`,
  `${h(c.booked_hours)} planned from ${c.booked_tasks} tasks due this week`,
  forecast(c) ? `${h(forecast(c))} quoted but not yet won` : '',
].filter(Boolean).join(', ')
const baseNote = (p: { cells: Map<string, Cell> }) => { const c = p.cells.get(thisWeek) ?? [...p.cells.values()][0]; return c ? `${h(c.base_hours)} a week` : '' }

// Column totals, so the week as a whole has a number too.
const weekTotals = computed(() => Object.fromEntries(weeks.value.map((w) => {
  const cs = people.value.map(p => p.cells.get(w)).filter((c): c is Cell => !!c)
  return [w, { available: cs.reduce((s, c) => s + available(c), 0), used: cs.reduce((s, c) => s + used(c), 0) }]
})))

// ---------- task drill-down ----------

const open = ref<{ person: string, week: string } | null>(null)
const { data: tasks, status: tasksStatus } = await useAsyncData('capacity-tasks', async () => {
  if (!open.value) return []
  const { data, error } = await supabase
    .from('work_item_assignees')
    .select('work_items(id, title, status, estimate_hours, due_on, projects(name, clients(name)), work_item_assignees(user_id))')
    .eq('user_id', open.value.person)
  if (error) throw error
  const week = open.value.week
  return (data ?? [])
    .map(r => r.work_items)
    .filter((w): w is NonNullable<typeof w> => !!w && !!w.due_on && w.due_on >= week && w.due_on < addDays(week, 7) && !ws.isDone(w.status) && !ws.isPaused(w.status))
    .sort((a, b) => a.due_on!.localeCompare(b.due_on!))
}, { ...fresh, watch: [open] })
const openName = computed(() => people.value.find(p => p.id === open.value?.person)?.name ?? '')

</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Capacity</h1>
        <p class="text-sm text-muted">Who has room. Past weeks show what was logged; this week and the coming ones show the hours still free after time off, meetings, and the tasks due that week.</p>
      </div>
      <UButton to="/tasks" variant="outline" icon="i-lucide-list-todo" class="ml-auto">Tasks</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr class="border-b border-default">
              <th class="sticky left-0 bg-default px-4 py-2 font-medium">Person</th>
              <th v-for="w in weeks" :key="w" class="min-w-36 px-2 py-2 text-center font-medium" :class="w === thisWeek ? 'text-highlighted' : ''">
                <div class="text-[10px] font-semibold uppercase tracking-wider" :class="kind(w) === 'now' ? 'text-primary' : 'text-dimmed'">{{ kind(w) === 'past' ? 'Logged' : kind(w) === 'now' ? 'This week' : 'Coming up' }}</div>
                {{ weekLabel(w) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in people" :key="p.id" class="border-b border-default last:border-0">
              <td class="sticky left-0 bg-default px-4 py-2 whitespace-nowrap">
                <div class="font-medium">{{ p.name }}</div>
                <div class="text-xs text-muted">{{ baseNote(p) }}</div>
              </td>
              <td v-for="w in weeks" :key="w" class="px-2 py-2 align-top" :class="w === thisWeek ? 'bg-elevated/40' : ''">
                <button v-if="p.cells.get(w)" type="button" class="w-full rounded px-1 text-left hover:bg-elevated" :title="tip(p.cells.get(w)!)" @click="open = { person: p.id, week: w };">
                  <div class="tabular-nums" :class="kind(w) !== 'past' && free(p.cells.get(w)!) < 0 ? 'font-medium text-error' : kind(w) === 'past' ? '' : 'font-medium'">{{ headline(p.cells.get(w)!) }}</div>
                  <UProgress :model-value="Math.min(pct(p.cells.get(w)!), 100)" :color="color(p.cells.get(w)!)" size="xs" class="mt-1" />
                  <UProgress v-if="forecast(p.cells.get(w)!)" :model-value="forecastPct(p.cells.get(w)!)" color="neutral" size="xs" class="mt-0.5 opacity-60" />
                  <div class="mt-0.5 truncate text-xs text-muted tabular-nums">{{ detail(p.cells.get(w)!) }}<span v-if="forecast(p.cells.get(w)!)"> + {{ h(forecast(p.cells.get(w)!)) }} quoted</span></div>
                </button>
              </td>
            </tr>
            <tr v-if="!people.length">
              <td :colspan="weeks.length + 1" class="px-4 py-8 text-center text-muted">No active people.</td>
            </tr>
          </tbody>
          <tfoot v-if="people.length" class="text-muted">
            <tr class="border-t border-default">
              <td class="sticky left-0 bg-default px-4 py-2 font-medium">Team</td>
              <td v-for="w in weeks" :key="w" class="px-2 py-2 text-center tabular-nums">
                <template v-if="kind(w) === 'past'">{{ h(weekTotals[w]?.used) }} logged of {{ h(weekTotals[w]?.available) }}</template>
                <template v-else>{{ h(Math.max(0, (weekTotals[w]?.available ?? 0) - (weekTotals[w]?.used ?? 0))) }} free of {{ h(weekTotals[w]?.available) }}</template>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </UCard>

    <details class="text-xs text-muted">
      <summary class="cursor-pointer select-none">How the numbers are worked out</summary>
      <ul class="mt-2 list-disc space-y-1 pl-4">
        <li><span class="font-medium">Available</span> is a person's weekly hours (People page) minus time off (Time off page, weekdays only) minus meetings from their connected Google Calendar.</li>
        <li><span class="font-medium">Planned</span> is the estimate of each open task due that week, split evenly between its assignees. Completed and on-hold tasks do not count, and a task with no estimate counts as zero, so "nothing planned" can also mean "no estimates yet". Click a cell to see the tasks.</li>
        <li><span class="font-medium">This week</span> uses the larger of what is logged so far and what is planned.</li>
        <li><span class="font-medium">Quoted</span> is hours on draft or sent quotes whose scope lines name this person and this week. The grey bar underneath adds them to the plan. They drop off when the quote is accepted (its pages become real tasks) or declined.</li>
        <li>Amber means over 85% full, red means over. Past weeks are a record and are not coloured.</li>
      </ul>
    </details>

    <AppDrawer :open="!!open" :title="open ? `${openName}, week of ${shortDate(open.week)}` : ''" @update:open="(v) => { if (!v) open = null }">
      <template #body>
        <ul v-if="tasks?.length" class="divide-y divide-default text-sm">
          <li v-for="t in tasks" :key="t.id" class="flex items-start gap-3 py-2">
            <div class="min-w-0 flex-1">
              <NuxtLink :to="`/tasks/${t.id}`" class="font-medium hover:underline">{{ t.title }}</NuxtLink>
              <div class="text-muted">{{ t.projects?.clients?.name }} / {{ t.projects?.name }} &middot; {{ ws.label(t.status) }}</div>
            </div>
            <div class="text-right tabular-nums">
              <div>{{ t.estimate_hours ? h(t.estimate_hours / Math.max(t.work_item_assignees.length, 1)) : 'no estimate' }}<span v-if="t.estimate_hours && t.work_item_assignees.length > 1" class="text-xs text-muted"> of {{ h(t.estimate_hours) }}</span></div>
              <div class="text-xs text-muted">due {{ shortDate(t.due_on!) }}</div>
            </div>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">{{ tasksStatus === 'pending' ? 'Loading' : 'No tasks due this week.' }}</p>
      </template>
    </AppDrawer>
  </div>
</template>
