<script setup lang="ts">
// Who has room, week by week. Available = weekly hours minus time off
// (weekdays) minus meetings. Past weeks compare logged time to that;
// coming weeks compare what tasks have due, estimates split by assignee.
definePageMeta({ middleware: 'can', permission: 'see_capacity' })
useHead({ title: 'Capacity' })

const supabase = useSupabaseClient()
const ws = await useWorkStatuses()

const thisWeek = weekDays(todayString())[0]!
const from = addDays(thisWeek, -14)
const to = addDays(thisWeek, 7 * 8)

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

const available = (c: Cell) => Math.max(0, (c.base_hours ?? 0) - (c.time_off_hours ?? 0) - (c.meeting_hours ?? 0))
const isPast = (week: string) => week < thisWeek
const used = (c: Cell) => (isPast(c.week_start!) ? c.logged_hours ?? 0 : c.booked_hours ?? 0)
const pct = (c: Cell) => (available(c) > 0 ? used(c) / available(c) * 100 : used(c) > 0 ? 200 : 0)
const color = (c: Cell) => (pct(c) > 100 ? 'error' : pct(c) > 85 ? 'warning' : isPast(c.week_start!) ? 'neutral' : 'primary')
const h = (n: number | null | undefined) => formatHours(n ?? 0)
const weekLabel = (w: string) => `${shortDate(w)} to ${shortDate(addDays(w, 4))}`
const tip = (c: Cell) => [
  `${h(c.base_hours)} base`,
  c.time_off_hours ? `${h(c.time_off_hours)} off` : '',
  c.meeting_hours ? `${h(c.meeting_hours)} meetings` : '',
  `${h(available(c))} available`,
  isPast(c.week_start!) ? `${h(c.logged_hours)} logged` : `${h(c.booked_hours)} booked in ${c.booked_tasks} tasks`,
  c.week_start === thisWeek ? `${h(c.logged_hours)} logged so far` : '',
].filter(Boolean).join(', ')

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
        <p class="text-sm text-muted">Hours available each week after time off and meetings. Past weeks show what was logged; coming weeks show what tasks have due.</p>
      </div>
      <UButton to="/tasks" variant="outline" icon="i-lucide-list-todo" class="ml-auto">Tasks</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr class="border-b border-default">
              <th class="sticky left-0 bg-default px-4 py-2 font-medium">Person</th>
              <th v-for="w in weeks" :key="w" class="min-w-32 px-2 py-2 text-center font-medium" :class="w === thisWeek ? 'text-highlighted' : ''">
                {{ weekLabel(w) }}
                <div class="text-xs font-normal">{{ isPast(w) ? 'logged' : 'booked' }} / available</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in people" :key="p.id" class="border-b border-default last:border-0">
              <td class="sticky left-0 bg-default px-4 py-2 font-medium whitespace-nowrap">{{ p.name }}</td>
              <td v-for="w in weeks" :key="w" class="px-2 py-2 align-top" :class="w === thisWeek ? 'bg-elevated/40' : ''">
                <button v-if="p.cells.get(w)" type="button" class="w-full rounded px-1 text-left hover:bg-elevated" :title="tip(p.cells.get(w)!)" @click="open = { person: p.id, week: w };">
                  <div class="flex justify-between tabular-nums">
                    <span :class="pct(p.cells.get(w)!) > 100 ? 'text-error' : ''">{{ h(used(p.cells.get(w)!)) }}</span>
                    <span class="text-muted">{{ h(available(p.cells.get(w)!)) }}</span>
                  </div>
                  <UProgress :model-value="Math.min(pct(p.cells.get(w)!), 100)" :color="color(p.cells.get(w)!)" size="xs" class="mt-1" />
                  <div v-if="w === thisWeek" class="mt-0.5 text-xs text-muted tabular-nums">{{ h(p.cells.get(w)!.logged_hours) }} logged so far</div>
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
              <td v-for="w in weeks" :key="w" class="px-2 py-2 text-center tabular-nums">{{ h(weekTotals[w]?.used) }} / {{ h(weekTotals[w]?.available) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </UCard>

    <p class="text-xs text-muted">
      Weekly hours are set per person on the People page; time off on the Time off page. A task's estimate is split evenly between its assignees and counted in the week it is due; completed and on-hold tasks do not count. Tasks with no estimate show in the list at zero hours. Meetings are not synced yet.
    </p>

    <UModal :open="!!open" :title="open ? `${openName}, week of ${shortDate(open.week)}` : ''" @update:open="(v) => { if (!v) open = null }">
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
    </UModal>
  </div>
</template>
