<script setup lang="ts">
// Planner: open tasks nobody is on, beside who has room, week by week.
// Drag a dated task onto a person's cell for its week and they are
// assigned; nothing here changes dates (that is Schedule's job).
// Undated tasks get a plain assign menu until they have a week.
definePageMeta({ middleware: 'can', permission: 'see_capacity' })
useHead({ title: 'Planner' })

const supabase = useSupabaseClient()
const toast = useToast()
const undo = useUndo()
const ws = await useWorkStatuses()

const thisWeek = weekDays(todayString())[0]!
const from = thisWeek
const to = addDays(thisWeek, 7 * 6)

const __ad1 = useAsyncData('planner-capacity', async () => {
  const { data, error } = await supabase.from('capacity_weekly').select('*').gte('week_start', from).lte('week_start', to).order('user_name').order('week_start')
  if (error) throw error
  return data
}, fresh)
const __ad2 = useAsyncData('planner-tasks', async () => {
  const { data, error } = await supabase
    .from('work_items')
    .select('id, title, status, priority, due_on, estimate_hours, projects(name, clients(name)), work_item_assignees(user_id)')
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(2000)
  if (error) throw error
  return data.filter(w => !w.work_item_assignees.length && !ws.isDone(w.status) && !ws.isPaused(w.status))
}, fresh)
await Promise.all([__ad1, __ad2])
const { data: cells, refresh: refreshCells } = __ad1
const { data: open, refresh: refreshTasks } = __ad2

type Cell = NonNullable<typeof cells.value>[number]
type Task = NonNullable<typeof open.value>[number]
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
// Same arithmetic as the Capacity page, forward weeks only.
const available = (c: Cell) => Math.max(0, (c.base_hours ?? 0) - (c.time_off_hours ?? 0) - (c.meeting_hours ?? 0))
const used = (c: Cell) => (c.week_start === thisWeek ? Math.max(c.logged_hours ?? 0, c.booked_hours ?? 0) : c.booked_hours ?? 0)
const free = (c: Cell) => available(c) - used(c)
const pct = (c: Cell) => (available(c) > 0 ? used(c) / available(c) * 100 : used(c) > 0 ? 200 : 0)
const color = (c: Cell) => (pct(c) > 100 ? 'error' : pct(c) > 85 ? 'warning' : 'primary')
const h = (n: number | null | undefined) => formatHours(n ?? 0)
const weekLabel = (w: string) => `${shortDate(w)} to ${shortDate(addDays(w, 4))}`

// The task's week: the Monday of its due date. Dated tasks due before
// this week count as this week (they are late, and still need a person).
const projectLabel = (t: Task) => `${t.projects?.clients?.name ?? ''} / ${t.projects?.name ?? ''}`
const weekOf = (t: Task) => (t.due_on ? (t.due_on < thisWeek ? thisWeek : weekDays(t.due_on)[0]!) : null)
const search = ref('')
const matches = (t: Task) => { const q = search.value.trim().toLowerCase(); return !q || t.title.toLowerCase().includes(q) || projectLabel(t).toLowerCase().includes(q) }
const dated = computed(() => (open.value ?? []).filter(t => t.due_on && matches(t)).sort((a, b) => a.due_on!.localeCompare(b.due_on!)))
const undated = computed(() => (open.value ?? []).filter(t => !t.due_on && matches(t)))
const beyond = (t: Task) => !!weekOf(t) && weekOf(t)! > to

// ---------- drag to assign ----------
const dragging = ref<Task | null>(null)
const over = ref<string | null>(null) // `${personId}|${week}`
function onDragStart(t: Task, e: DragEvent) {
  dragging.value = t
  e.dataTransfer?.setData('text/plain', t.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
const canDrop = (personId: string, week: string) => !!dragging.value && weekOf(dragging.value) === week
function onDragOver(personId: string, week: string, e: DragEvent) {
  if (!canDrop(personId, week)) return
  e.preventDefault()
  over.value = `${personId}|${week}`
}
async function onDrop(personId: string, week: string) {
  const t = dragging.value
  dragging.value = null
  over.value = null
  if (!t || weekOf(t) !== week) return
  await assign(t, personId)
}
const busy = ref<string | null>(null)
async function assign(t: Task, personId: string) {
  busy.value = t.id
  try {
    const { error } = await supabase.from('work_item_assignees').insert({ work_item_id: t.id, user_id: personId })
    if (error) throw error
    await Promise.all([refreshTasks(), refreshCells()])
    const who = people.value.find(p => p.id === personId)?.name ?? 'them'
    undo.offer(`${t.title} assigned to ${who}`, async () => {
      const { error: back } = await supabase.from('work_item_assignees').delete().eq('work_item_id', t.id).eq('user_id', personId)
      if (back) throw back
    }, () => Promise.all([refreshTasks(), refreshCells()]))
  } catch (e) {
    toast.add({ title: 'Could not assign', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = null
  }
}
const assignMenu = (t: Task) => [people.value.map(p => ({ label: p.name, onSelect: () => { assign(t, p.id) } }))]

// Tasks landing in a cell, for a preview of the week after the drop.
const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Planner</h1>
        <p class="text-sm text-muted">Open tasks nobody is on, beside who has room. Drag a task onto a person in its week to assign it. Dates stay as they are; change those on Schedule.</p>
      </div>
      <div class="ml-auto flex gap-2">
        <UButton to="/capacity" variant="outline" color="neutral" icon="i-lucide-gauge">Capacity</UButton>
        <UButton to="/schedule" variant="outline" color="neutral" icon="i-lucide-gantt-chart">Schedule</UButton>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <!-- Left: what needs a person. Stays put and scrolls on its own so a task deep in the list can still reach the grid. -->
      <div class="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search tasks" size="sm" class="w-full" />
        <UCard :ui="{ body: 'p-2 sm:p-2' }">
          <template #header>
            <div class="flex items-baseline gap-2">
              <span class="font-semibold">Needs a person</span>
              <span class="text-xs text-muted">{{ dated.length }} with a date</span>
            </div>
          </template>
          <div v-if="dated.length" class="space-y-1.5">
            <div
              v-for="t in dated" :key="t.id" draggable="true"
              class="cursor-grab rounded-md border border-default bg-default p-2 text-sm hover:bg-elevated active:cursor-grabbing"
              :class="dragging?.id === t.id ? 'opacity-40' : ''"
              @dragstart="onDragStart(t, $event)" @dragend="dragging = null; over = null"
            >
              <NuxtLink :to="`/tasks/${t.id}`" class="block truncate font-medium hover:underline" @click.stop>{{ t.title }}</NuxtLink>
              <div class="truncate text-xs text-muted">{{ projectLabel(t) }}</div>
              <div class="mt-1 flex items-center gap-2 text-xs">
                <span class="tabular-nums" :class="t.due_on! < todayString() ? 'text-error' : 'text-muted'">due {{ shortDate(t.due_on!) }}</span>
                <span v-if="t.estimate_hours" class="tabular-nums text-muted">{{ h(t.estimate_hours) }}</span>
                <span v-if="beyond(t)" class="ml-auto text-dimmed" title="Past the weeks shown; assign from the task page or with the menu">later</span>
                <span v-else class="ml-auto text-dimmed">week of {{ shortDate(weekOf(t)!) }}</span>
                <UDropdownMenu v-if="beyond(t)" :items="assignMenu(t)"><UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-user-plus" :loading="busy === t.id" aria-label="Assign" /></UDropdownMenu>
              </div>
            </div>
          </div>
          <p v-else class="px-2 py-6 text-center text-xs text-muted">Every dated task has someone.</p>
        </UCard>

        <UCard :ui="{ body: 'p-2 sm:p-2' }">
          <template #header>
            <div class="flex items-baseline gap-2">
              <span class="font-semibold">No date yet</span>
              <span class="text-xs text-muted">{{ undated.length }}</span>
            </div>
          </template>
          <div v-if="undated.length" class="space-y-1.5">
            <div v-for="t in undated" :key="t.id" class="flex items-center gap-2 rounded-md border border-default p-2 text-sm">
              <div class="min-w-0 flex-1">
                <NuxtLink :to="`/tasks/${t.id}`" class="block truncate font-medium hover:underline">{{ t.title }}</NuxtLink>
                <div class="truncate text-xs text-muted">{{ projectLabel(t) }}</div>
              </div>
              <UDropdownMenu :items="assignMenu(t)"><UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-user-plus" :loading="busy === t.id" aria-label="Assign" title="Assign. Give it a date on the task or Schedule to drag it instead." /></UDropdownMenu>
            </div>
          </div>
          <p v-else class="px-2 py-6 text-center text-xs text-muted">Nothing undated.</p>
        </UCard>
      </div>

      <!-- Right: who has room -->
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="text-left text-muted">
              <tr class="border-b border-default">
                <th class="sticky left-0 bg-default px-4 py-2 font-medium">Person</th>
                <th v-for="w in weeks" :key="w" class="min-w-32 px-2 py-2 text-center font-medium" :class="dragging && weekOf(dragging) === w ? 'text-primary' : w === thisWeek ? 'text-highlighted' : ''">
                  <div class="text-[10px] font-semibold uppercase tracking-wider" :class="w === thisWeek ? 'text-primary' : 'text-dimmed'">{{ w === thisWeek ? 'This week' : 'Coming up' }}</div>
                  {{ weekLabel(w) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in people" :key="p.id" class="border-b border-default last:border-0">
                <td class="sticky left-0 bg-default px-4 py-2 whitespace-nowrap">
                  <span class="mr-2 inline-grid size-6 place-items-center rounded-full bg-elevated text-[10px] font-medium align-middle">{{ initials(p.name) }}</span>
                  <span class="font-medium">{{ p.name }}</span>
                </td>
                <td
                  v-for="w in weeks" :key="w" class="px-1.5 py-1.5 align-top"
                  @dragover="onDragOver(p.id, w, $event)" @dragleave="over === `${p.id}|${w}` && (over = null)" @drop.prevent="onDrop(p.id, w)"
                >
                  <div
                    v-if="p.cells.get(w)"
                    class="rounded-md border px-2 py-1.5 transition-colors"
                    :class="over === `${p.id}|${w}` ? 'border-primary bg-primary/10' : canDrop(p.id, w) ? 'border-dashed border-primary/50' : dragging ? 'border-transparent opacity-40' : 'border-transparent'"
                  >
                    <div class="tabular-nums" :class="free(p.cells.get(w)!) < 0 ? 'font-medium text-error' : 'font-medium'">{{ free(p.cells.get(w)!) >= 0 ? `${h(free(p.cells.get(w)!))} free` : `${h(-free(p.cells.get(w)!))} over` }}</div>
                    <UProgress :model-value="Math.min(pct(p.cells.get(w)!), 100)" :color="color(p.cells.get(w)!)" size="xs" class="mt-1" />
                    <div class="mt-0.5 truncate text-xs text-muted tabular-nums">{{ p.cells.get(w)!.booked_hours ? `${h(p.cells.get(w)!.booked_hours)} in ${p.cells.get(w)!.booked_tasks} ${p.cells.get(w)!.booked_tasks === 1 ? 'task' : 'tasks'}` : 'nothing planned' }}</div>
                  </div>
                </td>
              </tr>
              <tr v-if="!people.length">
                <td :colspan="weeks.length + 1" class="px-4 py-8 text-center text-muted">No active people.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </div>
  </div>
</template>
