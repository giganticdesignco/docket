<script setup lang="ts">
import { WORK_PRIORITIES } from '~~/shared/types/app'

// The task list, ClickUp style: rows in collapsible groups (by status,
// project, or due), status and priority changed in place from small
// menus, and rows dragged onto another group to move them. One shared
// menu serves every row (opened at the click), so hundreds of rows stay
// cheap.
useHead({ title: 'Tasks' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const ws = await useWorkStatuses()

type GroupBy = 'status' | 'project' | 'due'
const groupBy = ref<GroupBy>('status')
// List, or cards: a card per client, then that client's tasks as cards.
// Remembered per browser.
type ViewMode = 'list' | 'cards'
const viewMode = ref<ViewMode>('list')
onMounted(() => { try { viewMode.value = (localStorage.getItem('docket-tasks-view') as ViewMode) || 'list' } catch {} })
watch(viewMode, (v) => { try { localStorage.setItem('docket-tasks-view', v) } catch {} })
const activeClient = ref<string | null>(null)
const everyone = ref(false)
const showCompleted = ref(false)
const search = ref('')
const collapsed = ref(new Set<string>())

const __ad1 = useAsyncData('work-items', async () => {
  const { data, error } = await supabase
    .from('work_items')
    .select('id, title, status, priority, due_on, estimate_hours, project_id, updated_at, projects(id, name, client_id, clients(name)), work_item_assignees(user_id, profiles(full_name))')
    .order('due_on', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(2000)
  if (error) throw error
  return data
}, fresh)

const __ad2 = useAsyncData('projects-for-tasks', async () => {
  const { data, error } = await supabase.from('projects').select('id, name, clients(name)').eq('is_active', true).order('name')
  if (error) throw error
  return data
}, fresh)

const __ad3 = useAsyncData('people-for-tasks', async () => {
  const { data, error } = await supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
  if (error) throw error
  return data
}, fresh)
await Promise.all([__ad1, __ad2, __ad3])
const { data: items, refresh } = __ad1
const { data: projects } = __ad2
const { data: people } = __ad3

type Item = NonNullable<typeof items.value>[number]
type Group = { key: string, label: string, sublabel?: string, color?: string, items: Item[], done?: boolean }
const today = todayString()
const thisMonday = weekDays(today)[0]!
const weekEnd = addDays(thisMonday, 6)
const projectLabel = (i: Item) => (i.projects?.name && i.projects.name !== 'General' ? `${i.projects.clients?.name} / ${i.projects.name}` : i.projects?.clients?.name ?? '')

const visible = computed(() => (items.value ?? []).filter((i) => {
  if (!everyone.value && !i.work_item_assignees.some(a => a.user_id === user.value?.sub)) return false
  if (!showCompleted.value && ws.isDone(i.status)) return false
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    if (!`${i.title} ${projectLabel(i)}`.toLowerCase().includes(q)) return false
  }
  return true
}))

const groups = computed<Group[]>(() => {
  const list = visible.value
  if (groupBy.value === 'status') {
    return ws.statuses.value
      .map(s => ({ key: s.key, label: s.label, color: s.color, done: s.is_done, items: list.filter(i => i.status === s.key) }))
      .filter(g => g.items.length || (ws.byKey.value.get(g.key)?.is_active && !g.done))
  }
  if (groupBy.value === 'project') {
    const map = new Map<string, Group>()
    for (const i of list) {
      const key = i.project_id
      const g = map.get(key) ?? { key, label: i.projects?.clients?.name ?? '', sublabel: i.projects?.name === 'General' ? '' : i.projects?.name ?? '', items: [] }
      g.items.push(i)
      map.set(key, g)
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label) || (a.sublabel ?? '').localeCompare(b.sublabel ?? ''))
  }
  const g: Group[] = [
    { key: 'overdue', label: 'Overdue', color: 'error', items: [] }, { key: 'week', label: 'This week', color: 'primary', items: [] },
    { key: 'later', label: 'Later', items: [] }, { key: 'none', label: 'No due date', items: [] }, { key: 'done', label: 'Completed', color: 'success', done: true, items: [] },
  ]
  for (const i of list) {
    if (ws.isDone(i.status)) g[4]!.items.push(i)
    else if (!i.due_on) g[3]!.items.push(i)
    else if (i.due_on < today) g[0]!.items.push(i)
    else if (i.due_on <= weekEnd) g[1]!.items.push(i)
    else g[2]!.items.push(i)
  }
  return g.filter(x => x.items.length)
})

const toggle = (key: string) => { collapsed.value.has(key) ? collapsed.value.delete(key) : collapsed.value.add(key) }
const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
const priorityIcon = (p: string) => (p === 'urgent' ? 'i-lucide-flame' : p === 'high' ? 'i-lucide-flag' : p === 'low' ? 'i-lucide-arrow-down' : 'i-lucide-minus')
const priorityClass = (p: string) => (p === 'urgent' ? 'text-error' : p === 'high' ? 'text-warning' : 'text-dimmed')
const dotClass = (color?: string) => ({ primary: 'bg-primary', info: 'bg-info', success: 'bg-success', warning: 'bg-warning', error: 'bg-error' }[color ?? ''] ?? 'bg-accented')
const textClass = (color?: string) => ({ primary: 'text-primary', info: 'text-info', success: 'text-success', warning: 'text-warning', error: 'text-error' }[color ?? ''] ?? 'text-muted')

// ---------- in-place edits ----------

async function patch(i: Item, values: { status?: string, priority?: Item['priority'], due_on?: string | null, project_id?: string }) {
  const { error } = await supabase.from('work_items').update(values).eq('id', i.id)
  if (error) toast.add({ title: 'Not saved', description: error.message, color: 'error' })
  else await refresh()
}
// One floating menu for the whole list, placed where the row was clicked.
const menu = ref<{ item: Item, kind: 'status' | 'priority' | 'assignees', x: number, y: number } | null>(null)
function openMenu(i: Item, kind: 'status' | 'priority' | 'assignees', e: MouseEvent) {
  openMenuAt(i, kind, e.currentTarget as HTMLElement)
}
function openMenuAt(i: Item, kind: 'status' | 'priority' | 'assignees', el: HTMLElement) {
  const r = el.getBoundingClientRect()
  menu.value = { item: i, kind, x: Math.min(r.left, window.innerWidth - 220), y: r.bottom + 4 }
}
const closeMenu = () => { menu.value = null }
// A change on a row applies to every selected row when that row is one
// of the selection, so X on a few tasks then S moves them together.
const targets = (i: Item): Item[] => (selected.value.has(i.id) && selected.value.size > 1
  ? (items.value ?? []).filter(x => selected.value.has(x.id))
  : [i])
async function pick(value: string) {
  const m = menu.value
  closeMenu()
  if (!m) return
  const values = m.kind === 'status' ? { status: value } : { priority: value as Item['priority'] }
  const ids = targets(m.item).map(t => t.id)
  const { error } = await supabase.from('work_items').update(values).in('id', ids)
  if (error) toast.add({ title: 'Not saved', description: error.message, color: 'error' })
  else await refresh()
}
// Assignees toggle one at a time and the menu stays open.
async function toggleAssignee(userId: string) {
  const m = menu.value
  if (!m) return
  const has = m.item.work_item_assignees.some(a => a.user_id === userId)
  const ids = targets(m.item).map(t => t.id)
  const q = has
    ? supabase.from('work_item_assignees').delete().in('work_item_id', ids).eq('user_id', userId)
    : supabase.from('work_item_assignees').upsert(ids.filter(id => !(items.value ?? []).find(x => x.id === id)?.work_item_assignees.some(a => a.user_id === userId)).map(id => ({ work_item_id: id, user_id: userId })))
  const { error } = await q
  if (error) {
    toast.add({ title: 'Not saved', description: error.message, color: 'error' })
    return
  }
  await refresh()
  const fresh = (items.value ?? []).find(i => i.id === m.item.id)
  if (fresh && menu.value) menu.value = { ...menu.value, item: fresh }
}
onMounted(() => {
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu() })
  window.addEventListener('scroll', closeMenu, true)
})
const editingDue = ref<string | null>(null)
function saveDue(i: Item, value: string) {
  editingDue.value = null
  if ((value || null) !== i.due_on) patch(i, { due_on: value || null })
}

// ---------- drag and drop between groups ----------

const dragging = ref<Item | null>(null)
const over = ref<string | null>(null)
function onDragStart(i: Item, e: DragEvent) {
  dragging.value = i
  e.dataTransfer?.setData('text/plain', i.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
async function onDrop(g: Group) {
  const i = dragging.value
  dragging.value = null
  over.value = null
  if (!i) return
  if (groupBy.value === 'status') {
    if (i.status !== g.key) await patch(i, { status: g.key })
  } else if (groupBy.value === 'project') {
    if (i.project_id !== g.key) await patch(i, { project_id: g.key })
  } else {
    const due = g.key === 'none' ? null : g.key === 'week' ? addDays(thisMonday, 4) : g.key === 'later' ? addDays(thisMonday, 7) : undefined
    if (due !== undefined && due !== i.due_on) await patch(i, { due_on: due })
  }
}

// ---------- cards ----------

type ClientCard = { name: string, count: number, overdue: number, dueSoon: number, projects: number, nextDue: string | null }
const clientCards = computed<ClientCard[]>(() => {
  const m = new Map<string, ClientCard & { projectIds: Set<string> }>()
  for (const i of visible.value) {
    const name = i.projects?.clients?.name ?? 'No client'
    const c = m.get(name) ?? { name, count: 0, overdue: 0, dueSoon: 0, projects: 0, nextDue: null, projectIds: new Set<string>() }
    c.count += 1
    c.projectIds.add(i.project_id)
    if (i.due_on && !ws.isDone(i.status)) {
      if (i.due_on < today) c.overdue += 1
      else if (i.due_on <= weekEnd) c.dueSoon += 1
      if (i.due_on >= today && (!c.nextDue || i.due_on < c.nextDue)) c.nextDue = i.due_on
    }
    m.set(name, c)
  }
  return [...m.values()].map(c => ({ ...c, projects: c.projectIds.size })).sort((a, b) => b.overdue - a.overdue || b.count - a.count || a.name.localeCompare(b.name))
})
const clientTasks = computed(() => visible.value.filter(i => (i.projects?.clients?.name ?? 'No client') === activeClient.value).sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999')))
const clientProjects = computed(() => {
  const m = new Map<string, { name: string, items: Item[] }>()
  for (const i of clientTasks.value) {
    const g = m.get(i.project_id) ?? { name: i.projects?.name ?? 'Project', items: [] }
    g.items.push(i)
    m.set(i.project_id, g)
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
})

// ---------- keyboard ----------

// J and K walk the rows in the order shown, X selects, and the letter
// keys act on the focused row (or the whole selection).
const focused = ref<string | null>(null)
const selected = ref(new Set<string>())
const order = computed(() => groups.value.filter(g => !collapsed.value.has(g.key)).flatMap(g => g.items.map(i => i.id)))
const focusedItem = computed(() => (items.value ?? []).find(i => i.id === focused.value) ?? null)
function move(step: 1 | -1) {
  const ids = order.value
  if (!ids.length) return
  const at = focused.value ? ids.indexOf(focused.value) : -1
  const next = at < 0 ? (step > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, at + step))
  focused.value = ids[next]!
  nextTick(() => document.querySelector(`[data-task="${focused.value}"]`)?.scrollIntoView({ block: 'nearest' }))
}
function toggleSelect() {
  if (!focused.value) return
  const next = new Set(selected.value)
  if (next.has(focused.value)) next.delete(focused.value)
  else next.add(focused.value)
  selected.value = next
}
function menuOnFocused(kind: 'status' | 'priority' | 'assignees') {
  const i = focusedItem.value
  const el = document.querySelector<HTMLElement>(`[data-task="${i?.id}"] [data-menu="${kind}"]`)
  if (i && el) openMenuAt(i, kind, el)
}
const deletingMany = ref(false)
async function deleteSelected() {
  const ids = focusedItem.value ? targets(focusedItem.value).map(t => t.id) : [...selected.value]
  deletingMany.value = false
  if (!ids.length) return
  const { error } = await supabase.from('work_items').delete().in('id', ids)
  if (error) toast.add({ title: 'Could not delete', description: error.message, color: 'error' })
  else {
    toast.add({ title: `Deleted ${ids.length} ${ids.length === 1 ? 'task' : 'tasks'}`, color: 'success' })
    selected.value = new Set()
    focused.value = null
    await refresh()
  }
}
const toDeleteCount = computed(() => (focusedItem.value ? targets(focusedItem.value).length : selected.value.size))
useShortcuts('Tasks', {
  'j': { label: 'Next row', handler: () => move(1) },
  'k': { label: 'Previous row', handler: () => move(-1) },
  'x': { label: 'Select or unselect the row', handler: toggleSelect },
  'e': { label: 'Open the task', handler: () => { if (focused.value) navigateTo(`/tasks/${focused.value}`) } },
  'enter': { label: 'Open the task', handler: () => { if (focused.value && !menu.value && !creating.value) navigateTo(`/tasks/${focused.value}`) } },
  's': { label: 'Change status (selection too)', handler: () => menuOnFocused('status') },
  'a': { label: 'Assign (selection too)', handler: () => menuOnFocused('assignees') },
  'p': { label: 'Change priority (selection too)', handler: () => menuOnFocused('priority') },
  'd': { label: 'Set the due date', handler: () => { if (focused.value) editingDue.value = focused.value } },
  'escape': { label: 'Clear the selection', handler: () => { closeMenu(); selected.value = new Set(); focused.value = null } },
  'delete': { label: 'Delete the task (selection too)', handler: () => { if (toDeleteCount.value) deletingMany.value = true } },
})

// ---------- new task ----------

const creating = ref(false)
// /tasks?new=1 (from search) opens the form straight away.
if (useRoute().query.new) creating.value = true
function created(id: string) {
  creating.value = false
  navigateTo(`/tasks/${id}`)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Tasks</h1>
        <p class="text-sm text-muted">{{ everyone ? 'Everything across the team.' : 'What is on your plate.' }} Drag a row onto another group to move it.</p>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-3">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search" size="sm" class="w-44" />
        <USelect v-if="viewMode === 'list'" v-model="groupBy" :items="[{ label: 'By status', value: 'status' }, { label: 'By project', value: 'project' }, { label: 'By due date', value: 'due' }]" size="sm" class="w-36" data-tour="group-by" />
        <USwitch v-model="everyone" label="Everyone" size="sm" data-tour="everyone" />
        <div class="flex gap-0.5 rounded-md bg-elevated p-0.5">
          <UButton size="xs" icon="i-lucide-list" :variant="viewMode === 'list' ? 'solid' : 'ghost'" :color="viewMode === 'list' ? 'primary' : 'neutral'" aria-label="List" title="List" @click="viewMode = 'list';" />
          <UButton size="xs" icon="i-lucide-layout-grid" :variant="viewMode === 'cards' ? 'solid' : 'ghost'" :color="viewMode === 'cards' ? 'primary' : 'neutral'" aria-label="Cards" title="Cards by client" @click="viewMode = 'cards';" />
        </div>
        <USwitch v-model="showCompleted" label="Completed" size="sm" />
        <UButton icon="i-lucide-plus" data-tour="new-task" @click="creating = true;">New task</UButton>
      </div>
    </div>

    <!-- Cards: clients five across, then the client's tasks -->
    <template v-if="viewMode === 'cards'">
      <div v-if="!activeClient" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <button v-for="c in clientCards" :key="c.name" type="button" class="rounded-lg border border-default bg-default p-4 text-left transition-colors hover:border-primary hover:bg-elevated/40" @click="activeClient = c.name;">
          <div class="truncate font-semibold" :title="c.name">{{ c.name }}</div>
          <div class="mt-1 text-3xl font-semibold tabular-nums">{{ c.count }}</div>
          <div class="text-xs text-muted">{{ c.count === 1 ? 'task' : 'tasks' }} across {{ c.projects }} {{ c.projects === 1 ? 'project' : 'projects' }}</div>
          <div class="mt-3 flex flex-wrap gap-1 text-xs">
            <UBadge v-if="c.overdue" color="error" variant="subtle" size="sm">{{ c.overdue }} overdue</UBadge>
            <UBadge v-if="c.dueSoon" color="warning" variant="subtle" size="sm">{{ c.dueSoon }} due this week</UBadge>
            <span v-if="!c.overdue && !c.dueSoon && c.nextDue" class="text-muted">next {{ shortDate(c.nextDue) }}</span>
          </div>
        </button>
        <p v-if="!clientCards.length" class="col-span-full py-8 text-center text-sm text-muted">{{ everyone ? 'No open tasks.' : 'Nothing assigned to you. Switch to Everyone to see the team.' }}</p>
      </div>
      <div v-else class="space-y-4">
        <div class="flex items-center gap-3">
          <UButton icon="i-lucide-arrow-left" variant="ghost" color="neutral" size="sm" @click="activeClient = null;">All clients</UButton>
          <h2 class="text-lg font-semibold">{{ activeClient }}</h2>
          <span class="text-sm text-muted">{{ clientTasks.length }} {{ clientTasks.length === 1 ? 'task' : 'tasks' }}</span>
        </div>
        <div v-for="p in clientProjects" :key="p.name" class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted">{{ p.name === 'General' ? 'General tasks' : p.name }} <span class="font-normal">{{ p.items.length }}</span></h3>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <NuxtLink v-for="i in p.items" :key="i.id" :to="`/tasks/${i.id}`" class="flex min-h-28 flex-col rounded-lg border border-default bg-default p-3 text-sm transition-colors hover:border-primary hover:bg-elevated/40">
              <div class="flex items-start gap-2">
                <span class="mt-1.5 size-2.5 shrink-0 rounded-full" :class="dotClass(ws.color(i.status))" :title="ws.label(i.status)" />
                <span class="line-clamp-2 font-medium">{{ i.title }}</span>
              </div>
              <div class="mt-auto flex items-center gap-2 pt-3 text-xs text-muted">
                <span :class="i.due_on && i.due_on < today && !ws.isDone(i.status) ? 'text-error' : ''">{{ i.due_on ? shortDate(i.due_on) : 'no date' }}</span>
                <UIcon :name="priorityIcon(i.priority)" class="size-3.5" :class="priorityClass(i.priority)" />
                <span v-if="i.work_item_assignees.length" class="ml-auto flex -space-x-1.5">
                  <span v-for="a in i.work_item_assignees.slice(0, 3)" :key="a.user_id" class="grid size-5 place-items-center rounded-full bg-elevated text-[9px] font-medium ring-2 ring-default">{{ initials(a.profiles?.full_name ?? '?') }}</span>
                </span>
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>
    </template>

    <div
      v-for="g in groups" :key="g.key"
      v-show="viewMode === 'list'"
      class="rounded-lg border border-default transition-colors" :class="over === g.key && dragging ? 'border-primary bg-primary/5' : ''"
      @dragover.prevent="over = g.key" @dragleave="over === g.key && (over = null)" @drop.prevent="onDrop(g)"
    >
      <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm" @click="toggle(g.key)">
        <UIcon :name="collapsed.has(g.key) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="size-4 text-dimmed" />
        <span v-if="groupBy !== 'project'" class="size-2.5 rounded-full" :class="dotClass(g.color)" />
        <span class="font-semibold">{{ g.label }}</span>
        <span v-if="g.sublabel" class="text-muted">/ {{ g.sublabel }}</span>
        <span class="text-muted">{{ g.items.length }}</span>
      </button>

      <table v-if="!collapsed.has(g.key) && g.items.length" class="w-full border-t border-default text-sm">
        <tbody>
          <tr
            v-for="(i, idx) in g.items" :key="i.id" draggable="true" :data-task="i.id" :data-tour="idx === 0 && g === groups[0] ? 'row' : undefined"
            class="border-b border-default last:border-0 hover:bg-elevated/60"
            :class="[dragging?.id === i.id ? 'opacity-40' : '', focused === i.id ? 'bg-elevated/60 shadow-[inset_2px_0_0_0_var(--ui-primary)]' : '', selected.has(i.id) ? 'bg-primary/5' : '']"
            @dragstart="onDragStart(i, $event)" @dragend="dragging = null; over = null" @click="focused = i.id;"
          >
            <td class="w-8 cursor-grab px-2 py-1.5 text-dimmed" @click.stop="focused = i.id; toggleSelect()">
              <UIcon v-if="selected.has(i.id)" name="i-lucide-check-square" class="size-4 text-primary" />
              <UIcon v-else name="i-lucide-grip-vertical" class="size-4" />
            </td>
            <td class="w-6 px-1 py-1.5">
              <button type="button" data-menu="status" class="block size-3 rounded-full ring-2 ring-transparent hover:ring-accented" :class="dotClass(ws.color(i.status))" :title="ws.label(i.status)" @click="openMenu(i, 'status', $event)" />
            </td>
            <td class="min-w-0 px-2 py-1.5">
              <NuxtLink :to="`/tasks/${i.id}`" class="font-medium hover:underline">{{ i.title }}</NuxtLink>
              <span v-if="groupBy !== 'project'" class="ml-2 text-xs text-muted">{{ projectLabel(i) }}</span>
            </td>
            <td class="hidden px-2 py-1.5 sm:table-cell">
              <button type="button" data-menu="assignees" class="flex rounded-full -space-x-1.5 hover:ring-2 hover:ring-accented" :title="i.work_item_assignees.map(a => a.profiles?.full_name).join(', ') || 'Assign'" @click="openMenu(i, 'assignees', $event)">
                <template v-if="i.work_item_assignees.length">
                  <span v-for="a in i.work_item_assignees.slice(0, 4)" :key="a.user_id" class="grid size-6 place-items-center rounded-full bg-elevated text-[10px] font-medium ring-2 ring-default">{{ initials(a.profiles?.full_name ?? '?') }}</span>
                  <span v-if="i.work_item_assignees.length > 4" class="grid size-6 place-items-center rounded-full bg-accented text-[10px] font-medium ring-2 ring-default">+{{ i.work_item_assignees.length - 4 }}</span>
                </template>
                <span v-else class="grid size-6 place-items-center rounded-full border border-dashed border-accented text-dimmed"><UIcon name="i-lucide-plus" class="size-3" /></span>
              </button>
            </td>
            <td class="w-28 px-2 py-1.5 text-right tabular-nums">
              <input v-if="editingDue === i.id" type="date" :value="i.due_on ?? ''" class="w-full rounded border border-default bg-default px-1 text-xs" autofocus @blur="saveDue(i, ($event.target as HTMLInputElement).value)" @keydown.enter="($event.target as HTMLInputElement).blur()">
              <button v-else type="button" class="rounded px-1 hover:bg-elevated" :class="i.due_on && i.due_on < today && !ws.isDone(i.status) ? 'text-error' : i.due_on ? '' : 'text-dimmed'" @click="editingDue = i.id;">{{ i.due_on ? shortDate(i.due_on) : 'no date' }}</button>
            </td>
            <td class="w-10 px-1 py-1.5">
              <button type="button" data-menu="priority" class="rounded p-1 hover:bg-elevated" :title="i.priority" @click="openMenu(i, 'priority', $event)"><UIcon :name="priorityIcon(i.priority)" class="size-4" :class="priorityClass(i.priority)" /></button>
            </td>
            <td class="hidden w-16 px-2 py-1.5 text-right text-xs text-muted tabular-nums md:table-cell">{{ i.estimate_hours ? formatHours(i.estimate_hours) : '' }}</td>
            <td class="hidden w-36 px-3 py-1.5 lg:table-cell">
              <button type="button" class="w-full truncate rounded px-2 py-0.5 text-left text-xs hover:bg-elevated" :class="textClass(ws.color(i.status))" @click="openMenu(i, 'status', $event)">{{ ws.label(i.status) }}</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!collapsed.has(g.key)" class="border-t border-default px-3 py-3 text-xs text-muted">Nothing here. Drop a task to move it.</p>
    </div>
    <div v-if="selected.size" class="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-default bg-default px-4 py-2 text-sm shadow-lg">
      <span class="font-medium tabular-nums">{{ selected.size }} selected</span>
      <span class="text-xs text-muted">S status · A assign · P priority · Delete</span>
      <UButton size="xs" variant="ghost" color="neutral" @click="selected = new Set();">Clear</UButton>
    </div>

    <UModal v-model:open="deletingMany" :title="`Delete ${toDeleteCount} ${toDeleteCount === 1 ? 'task' : 'tasks'}?`">
      <template #body>
        <p class="text-sm">Comments and files go with them. Time logged against them stays, just unlinked.</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deletingMany = false;">Cancel</UButton>
          <UButton color="error" @click="deleteSelected">Delete</UButton>
        </div>
      </template>
    </UModal>

    <p v-if="viewMode === 'list' && !groups.length" class="py-8 text-center text-sm text-muted">{{ everyone ? 'No open tasks.' : 'Nothing assigned to you. Switch to Everyone to see the team.' }}</p>

    <Teleport to="body">
      <div v-if="menu" class="fixed inset-0 z-50" @click="closeMenu">
        <div class="absolute w-52 rounded-md border border-default bg-default p-1 shadow-lg" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }" @click.stop>
          <template v-if="menu.kind === 'status'">
            <button v-for="s in ws.active.value" :key="s.key" type="button" class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-elevated" @click="pick(s.key)">
              <span class="size-2.5 rounded-full" :class="dotClass(s.color)" />
              <span class="flex-1">{{ s.label }}</span>
              <UIcon v-if="s.key === menu.item.status" name="i-lucide-check" class="size-4 text-muted" />
            </button>
          </template>
          <template v-else-if="menu.kind === 'priority'">
            <button v-for="p in WORK_PRIORITIES" :key="p.value" type="button" class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-elevated" @click="pick(p.value)">
              <UIcon :name="priorityIcon(p.value)" class="size-4" :class="priorityClass(p.value)" />
              <span class="flex-1">{{ p.label }}</span>
              <UIcon v-if="p.value === menu.item.priority" name="i-lucide-check" class="size-4 text-muted" />
            </button>
          </template>
          <template v-else>
            <div class="max-h-72 overflow-y-auto">
              <button v-for="p in people ?? []" :key="p.id" type="button" class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-elevated" @click="toggleAssignee(p.id)">
                <span class="grid size-5 place-items-center rounded-full bg-elevated text-[10px] font-medium">{{ initials(p.full_name) }}</span>
                <span class="flex-1">{{ p.full_name }}</span>
                <UIcon v-if="menu.item.work_item_assignees.some(a => a.user_id === p.id)" name="i-lucide-check" class="size-4 text-primary" />
              </button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <UModal v-model:open="creating" title="New task">
      <template #body>
        <WorkItemForm :projects="projects ?? []" :people="people ?? []" @saved="created" @cancel="creating = false;" />
      </template>
    </UModal>
  </div>
</template>
