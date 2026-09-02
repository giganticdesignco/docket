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
const everyone = ref(false)
const showCompleted = ref(false)
const search = ref('')
const collapsed = ref(new Set<string>())

const { data: items, refresh } = await useAsyncData('work-items', async () => {
  const { data, error } = await supabase
    .from('work_items')
    .select('id, title, status, priority, due_on, estimate_hours, project_id, updated_at, projects(id, name, client_id, clients(name)), work_item_assignees(user_id, profiles(full_name))')
    .order('due_on', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(2000)
  if (error) throw error
  return data
}, fresh)

const { data: projects } = await useAsyncData('projects-for-tasks', async () => {
  const { data, error } = await supabase.from('projects').select('id, name, clients(name)').eq('is_active', true).order('name')
  if (error) throw error
  return data
}, fresh)

const { data: people } = await useAsyncData('people-for-tasks', async () => {
  const { data, error } = await supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
  if (error) throw error
  return data
}, fresh)

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
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  menu.value = { item: i, kind, x: Math.min(r.left, window.innerWidth - 220), y: r.bottom + 4 }
}
const closeMenu = () => { menu.value = null }
function pick(value: string) {
  const m = menu.value
  closeMenu()
  if (!m) return
  if (m.kind === 'status') patch(m.item, { status: value })
  else patch(m.item, { priority: value as Item['priority'] })
}
// Assignees toggle one at a time and the menu stays open.
async function toggleAssignee(userId: string) {
  const m = menu.value
  if (!m) return
  const has = m.item.work_item_assignees.some(a => a.user_id === userId)
  const q = has
    ? supabase.from('work_item_assignees').delete().eq('work_item_id', m.item.id).eq('user_id', userId)
    : supabase.from('work_item_assignees').insert({ work_item_id: m.item.id, user_id: userId })
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
        <USelect v-model="groupBy" :items="[{ label: 'By status', value: 'status' }, { label: 'By project', value: 'project' }, { label: 'By due date', value: 'due' }]" size="sm" class="w-36" />
        <USwitch v-model="everyone" label="Everyone" size="sm" />
        <USwitch v-model="showCompleted" label="Completed" size="sm" />
        <UButton icon="i-lucide-plus" @click="creating = true;">New task</UButton>
      </div>
    </div>

    <div
      v-for="g in groups" :key="g.key"
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
            v-for="i in g.items" :key="i.id" draggable="true"
            class="border-b border-default last:border-0 hover:bg-elevated/60" :class="dragging?.id === i.id ? 'opacity-40' : ''"
            @dragstart="onDragStart(i, $event)" @dragend="dragging = null; over = null"
          >
            <td class="w-8 cursor-grab px-2 py-1.5 text-dimmed"><UIcon name="i-lucide-grip-vertical" class="size-4" /></td>
            <td class="w-6 px-1 py-1.5">
              <button type="button" class="block size-3 rounded-full ring-2 ring-transparent hover:ring-accented" :class="dotClass(ws.color(i.status))" :title="ws.label(i.status)" @click="openMenu(i, 'status', $event)" />
            </td>
            <td class="min-w-0 px-2 py-1.5">
              <NuxtLink :to="`/tasks/${i.id}`" class="font-medium hover:underline">{{ i.title }}</NuxtLink>
              <span v-if="groupBy !== 'project'" class="ml-2 text-xs text-muted">{{ projectLabel(i) }}</span>
            </td>
            <td class="hidden px-2 py-1.5 sm:table-cell">
              <button type="button" class="flex rounded-full -space-x-1.5 hover:ring-2 hover:ring-accented" :title="i.work_item_assignees.map(a => a.profiles?.full_name).join(', ') || 'Assign'" @click="openMenu(i, 'assignees', $event)">
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
              <button type="button" class="rounded p-1 hover:bg-elevated" :title="i.priority" @click="openMenu(i, 'priority', $event)"><UIcon :name="priorityIcon(i.priority)" class="size-4" :class="priorityClass(i.priority)" /></button>
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
    <p v-if="!groups.length" class="py-8 text-center text-sm text-muted">{{ everyone ? 'No open tasks.' : 'Nothing assigned to you. Switch to Everyone to see the team.' }}</p>

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
