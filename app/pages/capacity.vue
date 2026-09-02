<script setup lang="ts">
// Who has room, week by week. Available = weekly hours minus time off
// (weekdays) minus meetings. Past weeks compare logged time to that;
// coming weeks compare what ClickUp has due, split by assignee.
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Capacity' })

const supabase = useSupabaseClient()
const toast = useToast()

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

const { data: lastSync, refresh: refreshSync } = await useAsyncData('clickup-last-sync', async () => {
  const { data, error } = await supabase.from('clickup_assignments').select('synced_at').order('synced_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data?.synced_at ?? null
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
  isPast(c.week_start!) ? `${h(c.logged_hours)} logged` : `${h(c.booked_hours)} booked in ${c.booked_tasks} ClickUp tasks`,
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
    .from('clickup_assignments')
    .select('id, title, status, estimate_hours, due_on, url, list_name, projects(name)')
    .eq('user_id', open.value.person)
    .gte('due_on', open.value.week)
    .lt('due_on', addDays(open.value.week, 7))
    .order('due_on')
  if (error) throw error
  return data
}, { ...fresh, watch: [open] })
const openName = computed(() => people.value.find(p => p.id === open.value?.person)?.name ?? '')

// ---------- sync ----------

const syncing = ref(false)
async function sync() {
  syncing.value = true
  try {
    const r = await $fetch<{ fetched: number, stored: number, people: number, skippedNoDocketAssignee: number, withoutEstimate: number, unmatchedLists: string[] }>('/api/clickup/sync', { method: 'POST' })
    toast.add({
      title: 'ClickUp synced',
      description: `${r.fetched} open tasks, ${r.stored} assignments for ${r.people} people. ${r.withoutEstimate} tasks have no estimate.${r.unmatchedLists.length ? ` Lists not matched to a client: ${r.unmatchedLists.join(', ')}.` : ''}`,
      color: 'success',
    })
    await Promise.all([refresh(), refreshSync()])
  } catch (e) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Sync failed', description: err.data?.statusMessage ?? err.message, color: 'error' })
  } finally {
    syncing.value = false
  }
}
const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Capacity</h1>
        <p class="text-sm text-muted">Hours available each week after time off and meetings. Past weeks show what was logged; coming weeks show what ClickUp has due.</p>
      </div>
      <div class="ml-auto flex items-center gap-3 text-sm text-muted">
        <span v-if="lastSync">ClickUp synced {{ stamp(lastSync) }}</span>
        <span v-else>ClickUp not synced yet</span>
        <UButton icon="i-lucide-refresh-cw" variant="outline" :loading="syncing" @click="sync">Sync ClickUp</UButton>
      </div>
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
      Weekly hours are set per person on the People page; time off on the Time off page. ClickUp estimates are split evenly between the Docket people assigned. Tasks with no estimate count as zero hours but still show in the list. Meetings are not synced yet.
    </p>

    <UModal :open="!!open" :title="open ? `${openName}, week of ${shortDate(open.week)}` : ''" @update:open="(v) => { if (!v) open = null }">
      <template #body>
        <ul v-if="tasks?.length" class="divide-y divide-default text-sm">
          <li v-for="t in tasks" :key="t.id" class="flex items-start gap-3 py-2">
            <div class="min-w-0 flex-1">
              <a :href="t.url ?? '#'" target="_blank" class="font-medium hover:underline">{{ t.title }}</a>
              <div class="text-muted">{{ t.projects?.name ?? t.list_name }}<span v-if="t.status"> &middot; {{ t.status }}</span></div>
            </div>
            <div class="text-right tabular-nums">
              <div>{{ t.estimate_hours ? h(t.estimate_hours) : 'no estimate' }}</div>
              <div class="text-xs text-muted">due {{ shortDate(t.due_on!) }}</div>
            </div>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">{{ tasksStatus === 'pending' ? 'Loading' : 'Nothing due in ClickUp this week.' }}</p>
      </template>
    </UModal>
  </div>
</template>
