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
const focusList = useFocusList()

type GroupBy = 'status' | 'project' | 'due'
// List, or cards: a card per client, then that client's tasks as cards.
type ViewMode = 'list' | 'cards'
// How you left the list is remembered per person (user_views), so the
// desktop app and the browser agree.
const view = await useViewState('tasks', {
  groupBy: 'status' as GroupBy, viewMode: 'list' as ViewMode, activeClient: null as string | null,
  everyone: false, showCompleted: false, collapsed: ['waiting'] as string[],
})
const groupBy = persisted(view, 'groupBy')
const viewMode = persisted(view, 'viewMode')
const activeClient = persisted(view, 'activeClient')
const everyone = persisted(view, 'everyone')
const showCompleted = persisted(view, 'showCompleted')
// Focus is a mode you step into, not a view you are left in, so it is
// not persisted. /tasks?view=focus opens straight into it.
const focusMode = ref(useRoute().query.view === 'focus')
// /tasks?view=unowned opens on what has nobody up: Everyone off and every
// other group folded, without touching the folds you keep. The first
// fold you click makes the layout yours again.
const onlyUnowned = ref(useRoute().query.view === 'unowned')
if (onlyUnowned.value) everyone.value = false
const search = ref('')
const collapsed = ref(new Set<string>(view.collapsed))
watch(collapsed, (s) => { view.collapsed = [...s] }, { deep: true })
const isCollapsed = (key: string) => (onlyUnowned.value ? key !== 'unowned' : collapsed.value.has(key))
function resetView() { view.$reset(); collapsed.value = new Set(['waiting']); onlyUnowned.value = false }

const __ad1 = useAsyncData('work-items', async () => {
  const { data, error } = await supabase
    .from('work_items')
    .select('id, title, status, priority, due_on, estimate_hours, project_id, parent_id, updated_at, assignee_id, up:profiles!work_items_assignee_id_fkey(id, full_name), projects(id, name, client_id, clients(name)), work_item_assignees(user_id, profiles(full_name))')
    .order('due_on', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(2000)
  if (error) throw error
  return data
}, fresh)

const __ad2 = useActiveProjects()

const __ad3 = useActivePeople()
// Open tasks still in a client's General project, from the ClickUp
// import. A button points at /tasks/triage while there are any.
const { can } = useCurrentUser()
const __ad4 = useAsyncData('unsorted-count', async () => {
  const done = ws.statuses.value.filter(s => s.is_done).map(s => s.key)
  let q = supabase.from('work_items').select('id, projects!inner(name)', { count: 'exact', head: true }).eq('projects.name', 'General')
  if (done.length) q = q.not('status', 'in', `(${done.join(',')})`)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}, fresh)
// The focus list, fetched by id, so a task shows here even when it is
// outside the 2000 rows the list loads. Ids whose task did not come back
// are reported to her, never deleted.
const __ad5 = useAsyncData('focus-items', async () => {
  const fids = await focusList.load(true)
  if (!fids.length) return { rows: [], stale: [] as string[] }
  const { data, error } = await supabase
    .from('work_items')
    .select('id, title, status, priority, due_on, estimate_hours, project_id, parent_id, updated_at, assignee_id, up:profiles!work_items_assignee_id_fkey(id, full_name), projects(id, name, client_id, clients(name)), work_item_assignees(user_id, profiles(full_name))')
    .in('id', fids)
  if (error) throw error
  const found = new Map((data ?? []).map(d => [d.id, d]))
  return { rows: fids.map(id => found.get(id)).filter(Boolean) as NonNullable<typeof data>, stale: fids.filter(id => !found.has(id)) }
}, fresh)
// Where you have put rows: your own order, one position per task you
// have dragged. Tasks without one follow in due-date order.
const __ad6 = useAsyncData('task-order', async () => {
  if (!user.value) return []
  const { data, error } = await supabase.from('work_item_order').select('work_item_id, position').eq('user_id', user.value.sub)
  if (error) throw error
  return data
}, fresh)
await Promise.all([__ad1, __ad2, __ad3, __ad4, __ad5, __ad6])
const { data: items, refresh } = __ad1
const { data: orderRows } = __ad6
const orderMap = ref(new Map<string, number>())
watch(orderRows, rows => { orderMap.value = new Map((rows ?? []).map(r => [r.work_item_id, r.position])) }, { immediate: true })
const { data: projects } = __ad2
const { data: people } = __ad3
const { data: unsorted } = __ad4
const { data: focusData, refresh: refreshFocus } = __ad5

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

// Up now: with Everyone off, your list is what you are up on. What has
// nobody up sits in its own open group with a Take it, and what someone
// else is up on waits in a folded group with their name. Done tasks stay
// in the ordinary groups whoever is up, so Completed reads as before.
const me = computed(() => user.value?.sub ?? null)
const mine = computed(() => (everyone.value ? visible.value : visible.value.filter(i => ws.isDone(i.status) || i.assignee_id === me.value)))
const unowned = computed(() => (everyone.value ? [] : visible.value.filter(i => !ws.isDone(i.status) && !i.assignee_id)))
const waiting = computed(() => (everyone.value ? [] : visible.value.filter(i => !ws.isDone(i.status) && i.assignee_id && i.assignee_id !== me.value)))

const focusRows = computed(() => focusData.value?.rows ?? [])
const staleIds = computed(() => focusData.value?.stale ?? [])
const finished = computed(() => focusRows.value.filter(i => ws.isDone(i.status)))
const refreshAll = () => (focusMode.value ? Promise.all([refresh(), refreshFocus()]) : refresh())
// Someone else's change lands here without a reload.
useLive(['work_items', 'work_item_assignees', 'work_item_followers'], refreshAll)

const groups = computed<Group[]>(() => {
  // Search, Everyone and Completed do not apply in Focus mode: it is a
  // short list, and filtering it would make a drag ambiguous.
  if (focusMode.value) {
    const open = focusRows.value.filter(i => !ws.isDone(i.status))
    const out: Group[] = []
    if (open.length) out.push({ key: 'focus', label: 'Focus', color: 'primary', items: open })
    if (finished.value.length) out.push({ key: 'focus-done', label: 'Finished', color: 'success', done: true, items: finished.value })
    return out
  }
  const out = grouped(mine.value)
  if (unowned.value.length) out.push({ key: 'unowned', label: 'Nobody up', color: 'warning', items: unowned.value })
  if (waiting.value.length) out.push({ key: 'waiting', label: 'Waiting on someone else', items: waiting.value })
  for (const g of out) g.items = arrange(g.items)
  return out
})
function grouped(list: Item[]): Group[] {
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
}

// ---------- up now: Take it, Nobody, and Whose turn ----------

// Every path goes through hand_off(), which keeps the receiver on the
// task and bells them. A selection hands off each task in turn.
const handingOff = ref(false)
async function handOff(rows: Item[], to: string | null) {
  if (!rows.length) return
  handingOff.value = true
  try {
    const results = await Promise.all(rows.map(r => supabase.rpc('hand_off', { p_item: r.id, p_to: to ?? undefined })))
    const failed = results.find(r => r.error)
    if (failed?.error) throw failed.error
    await refreshAll()
    const name = to && to !== me.value ? (people.value ?? []).find(p => p.id === to)?.full_name.split(' ')[0] : null
    toast.add({ title: !to ? 'Nobody is up on this now' : to === me.value ? 'Yours now' : `Handed to ${name}` })
  } catch (e) {
    toast.add({ title: 'Not handed off', description: (e as Error).message, color: 'error' })
  } finally {
    handingOff.value = false
  }
}
const takeIt = (i: Item) => handOff(targets(i), me.value)
function handOffFromMenu(to: string | null) {
  const m = menu.value
  closeMenu()
  if (m) handOff(targets(m.item), to)
}
// Owner first and solid, the rest dimmed behind; a dashed ring when the
// task has people but nobody is up.
const cluster = (i: Item) => [...i.work_item_assignees].sort((a, b) => Number(b.user_id === i.assignee_id) - Number(a.user_id === i.assignee_id))
const peopleTitle = (i: Item) => cluster(i).map(a => (a.profiles?.full_name ?? '?') + (a.user_id === i.assignee_id ? ' (up now)' : '')).join(', ')
const otherNames = (i: Item) => i.work_item_assignees.filter(a => a.user_id !== me.value).map(a => a.profiles?.full_name?.split(' ')[0]).filter(Boolean).join(', ')

// Whose turn: one unowned task at a time. Skip only hides it for this
// pass; it is still in the Nobody up group when the drawer closes.
const sorting = ref(false)
const skipped = ref(new Set<string>())
const sortAt = ref(0)
const sortRows = computed(() => unowned.value.filter(i => !skipped.value.has(i.id)))
function openSort() { skipped.value = new Set(); sortAt.value = 0; sorting.value = true }
const clampSort = () => { sortAt.value = Math.max(0, Math.min(sortAt.value, sortRows.value.length - 1)) }
async function sortTake(i = sortRows.value[sortAt.value]) {
  if (!i) return
  await handOff([i], me.value)
  clampSort()
}
function sortSkip(i = sortRows.value[sortAt.value]) {
  if (!i) return
  skipped.value.add(i.id)
  clampSort()
}
function sortKeys(e: KeyboardEvent) {
  if (!sorting.value || handingOff.value) return
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  if (e.key === 'j') { sortAt.value = Math.min(sortRows.value.length - 1, sortAt.value + 1) }
  else if (e.key === 'k') { sortAt.value = Math.max(0, sortAt.value - 1) }
  else if (e.key === '1') { e.preventDefault(); sortTake() }
  else if (e.key === '2') { e.preventDefault(); sortSkip() }
  else return
  nextTick(() => document.querySelector(`[data-sort="${sortRows.value[sortAt.value]?.id}"]`)?.scrollIntoView({ block: 'nearest' }))
}
onMounted(() => window.addEventListener('keydown', sortKeys))
onBeforeUnmount(() => window.removeEventListener('keydown', sortKeys))

// A group's rows in your order, placed ones first, then subtasks tucked
// under their parent when the parent is in the same group.
function arrange(list: Item[]): Item[] {
  const pos = (i: Item) => orderMap.value.get(i.id) ?? Number.POSITIVE_INFINITY
  const sorted = [...list].sort((a, b) => pos(a) - pos(b))
  const ids = new Set(sorted.map(i => i.id))
  const kids = new Map<string, Item[]>()
  for (const i of sorted) if (i.parent_id && ids.has(i.parent_id)) kids.set(i.parent_id, [...(kids.get(i.parent_id) ?? []), i])
  const out: Item[] = []
  for (const i of sorted) {
    if (i.parent_id && ids.has(i.parent_id)) continue
    out.push(i, ...(kids.get(i.id) ?? []))
  }
  return out
}
const toggle = (key: string) => {
  if (onlyUnowned.value) { collapsed.value = new Set(groups.value.filter(g => g.key !== 'unowned').map(g => g.key)); onlyUnowned.value = false }
  collapsed.value.has(key) ? collapsed.value.delete(key) : collapsed.value.add(key)
}
// A subtask shows its parent's title beside it.
const parentTitle = (i: { parent_id: string | null }) => (i.parent_id ? items.value?.find(x => x.id === i.parent_id)?.title ?? '' : '')
// A subtask sits tucked under its parent when the parent is in the same
// group; then the indent and the elbow say it all and the "in ..." note
// is only needed when the parent is somewhere else.
const underParent = (i: Item, g: Group) => !!i.parent_id && g.items.some(x => x.id === i.parent_id)
const priorityIcon = (p: string) => (p === 'urgent' ? 'i-lucide-flame' : p === 'high' ? 'i-lucide-flag' : p === 'low' ? 'i-lucide-arrow-down' : 'i-lucide-minus')
const priorityClass = (p: string) => (p === 'urgent' ? 'text-error' : p === 'high' ? 'text-warning' : 'text-dimmed')

// ---------- in-place edits ----------

async function patch(i: Item, values: { status?: string, priority?: Item['priority'], due_on?: string | null, project_id?: string }) {
  const { error } = await supabase.from('work_items').update(values).eq('id', i.id)
  if (error) toast.add({ title: 'Not saved', description: error.message, color: 'error' })
  else await refreshAll()
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
  const rows = targets(m.item)
  const ids = rows.map(t => t.id)
  const before = rows.map(t => ({ id: t.id, status: t.status, priority: t.priority }))
  const { error } = await supabase.from('work_items').update(values).in('id', ids)
  if (error) toast.add({ title: 'Not saved', description: error.message, color: 'error' })
  else {
    await refreshAll()
    if (ids.length > 1) undo.offer(`Changed ${ids.length} tasks`, () => putBack(before), refreshAll)
  }
}
// Undo for bulk changes writes each row's old values back.
const undo = useUndo()
async function putBack(rows: { id: string, status?: string, priority?: Item['priority'], due_on?: string | null, project_id?: string, parent_id?: string | null }[]) {
  for (const r of rows) {
    const { id, ...values } = r
    const { error } = await supabase.from('work_items').update(values).eq('id', id)
    if (error) throw error
  }
}
// ---------- the focus list ----------

// F, or the star. A mixed selection ADDS the ones that are missing and
// removes nothing, so one keystroke can never quietly empty the list.
async function toggleFocus(i: Item) {
  const ids = targets(i).map(t => t.id)
  try {
    if (ids.every(id => focusList.has(id))) {
      const before = ids.map(id => ({ work_item_id: id, position: focusList.ids.value.indexOf(id) + 1 }))
      await focusList.remove(ids)
      if (ids.length > 1) undo.offer(`Took ${ids.length} tasks off your focus list`, () => focusList.put(before), refreshFocus)
    } else {
      const n = await focusList.add(ids)
      if (n > 1) undo.offer(`Added ${n} tasks to your focus list`, () => focusList.remove(ids), refreshFocus)
    }
    await refreshFocus()
  } catch (e) {
    toast.add({ title: 'Not saved', description: (e as Error).message, color: 'error' })
  }
}
async function clearFinished() {
  const ids = finished.value.map(i => i.id)
  if (!ids.length) return
  const before = ids.map(id => ({ work_item_id: id, position: focusList.ids.value.indexOf(id) + 1 }))
  try {
    await focusList.remove(ids)
    undo.offer(`Cleared ${ids.length} finished ${ids.length === 1 ? 'task' : 'tasks'}`, () => focusList.put(before), refreshFocus)
    await refreshFocus()
  } catch (e) { toast.add({ title: 'Not saved', description: (e as Error).message, color: 'error' }) }
}
async function dropStale() {
  try { await focusList.remove(staleIds.value); await refreshFocus() }
  catch (e) { toast.add({ title: 'Not saved', description: (e as Error).message, color: 'error' }) }
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
  await refreshAll()
  const fresh = (items.value ?? []).find(i => i.id === m.item.id)
  if (fresh && menu.value) menu.value = { ...menu.value, item: fresh }
}
const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu() }
onMounted(() => {
  window.addEventListener('keydown', closeOnEscape)
  window.addEventListener('scroll', closeMenu, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', closeOnEscape)
  window.removeEventListener('scroll', closeMenu, true)
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
// What landing in a group means for the task, by grouping. Returns the
// values to write, or nothing when it is already there.
function groupPatch(i: Item, g: Group): { status?: string, project_id?: string, due_on?: string | null } | null {
  if (g.key === 'unowned' || g.key === 'waiting') return null
  if (groupBy.value === 'status') return i.status !== g.key ? { status: g.key } : null
  if (groupBy.value === 'project') return i.project_id !== g.key ? { project_id: g.key } : null
  const due = g.key === 'none' ? null : g.key === 'week' ? addDays(thisMonday, 4) : g.key === 'later' ? addDays(thisMonday, 7) : undefined
  return due !== undefined && due !== i.due_on ? { due_on: due } : null
}
async function onDrop(g: Group) {
  if (focusMode.value) return
  const i = dragging.value
  dragging.value = null
  over.value = null
  if (!i) return
  const was = { id: i.id, status: i.status, project_id: i.project_id, due_on: i.due_on }
  const values = groupPatch(i, g)
  if (!values) return
  await patch(i, values)
  undo.offer(`Moved ${i.title}`, () => putBack([was]), refreshAll)
}

// ---------- drag onto rows: reorder, nest, un-nest ----------
// Between two rows puts the task there, in your order only, and makes
// it a subtask of whatever its new neighbor is a subtask of (or a task
// of its own between top-level rows). Onto a row's middle nests it
// under that row, moving it into that row's project first if it must.
// Nesting and project moves are the task's own facts, so everyone sees
// them; the order is yours. The group container is itself a drop
// target, so these stop propagation.
const dropAt = ref<{ id: string, mode: 'before' | 'after' | 'onto' } | null>(null)
function onRowDragOver(i: Item, e: DragEvent) {
  if (!dragging.value || dragging.value.id === i.id) return
  e.preventDefault(); e.stopPropagation()
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const y = (e.clientY - r.top) / r.height
  if (focusMode.value) { dropAt.value = { id: i.id, mode: y > 0.5 ? 'after' : 'before' }; return }
  dropAt.value = { id: i.id, mode: y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'onto' }
}
const hasChildren = (id: string) => (items.value ?? []).some(x => x.parent_id === id)
async function onRowDrop(e: DragEvent) {
  e.preventDefault(); e.stopPropagation()
  const from = dragging.value, at = dropAt.value
  dragging.value = null; dropAt.value = null; over.value = null
  if (!from || !at || at.id === from.id) return
  if (focusMode.value) {
    const shown = groups.value.find(g => g.key === 'focus')?.items.map(i => i.id) ?? []
    const next = shown.filter(id => id !== from.id)
    const idx = next.indexOf(at.id)
    if (idx < 0) return
    next.splice(idx + (at.mode === 'after' ? 1 : 0), 0, from.id)
    // Everything else on the list, finished and stale rows included, keeps
    // its relative order after the open ones, so 1..n stays dense.
    const rest = focusList.ids.value.filter(id => !next.includes(id))
    try { await focusList.reorder([...next, ...rest]); await refreshFocus() }
    catch (err) { toast.add({ title: 'Order not saved', description: (err as Error).message, color: 'error' }); await refreshFocus() }
    return
  }
  const target = (items.value ?? []).find(x => x.id === at.id)
  const g = groups.value.find(x => x.items.some(i => i.id === at.id))
  if (!target || !g) return
  const was = { id: from.id, status: from.status, project_id: from.project_id, due_on: from.due_on, parent_id: from.parent_id }
  const values: { status?: string, project_id?: string, due_on?: string | null, parent_id?: string | null } = { ...(groupPatch(from, g) ?? {}) }
  if (at.mode === 'onto') {
    if (target.parent_id) return fail('Subtasks go one level deep. Drop it beside the other subtasks instead.')
    if (hasChildren(from.id)) return fail('A task with subtasks cannot become a subtask.')
    if (target.parent_id === from.id) return
    values.parent_id = target.id
    if (target.project_id !== from.project_id) values.project_id = target.project_id
  } else if (target.parent_id !== from.parent_id) {
    // Follow the neighbor: into its parent, or out to the top level.
    if (!target.parent_id) values.parent_id = null
    else if (!hasChildren(from.id) && (target.project_id === from.project_id || !values.project_id)) { values.parent_id = target.parent_id; if (target.project_id !== from.project_id) values.project_id = target.project_id }
  }
  if (Object.keys(values).length) {
    const { error } = await supabase.from('work_items').update(values).eq('id', from.id)
    if (error) return fail(error.message)
  }
  // Your order: the target group's rows with the task where you dropped it.
  const ids = g.items.map(i => i.id).filter(id => id !== from.id)
  const idx = ids.indexOf(at.id)
  ids.splice(idx + (at.mode === 'before' ? 0 : 1), 0, from.id)
  await saveOrder(ids)
  await refreshAll()
  if (Object.keys(values).length) undo.offer(values.parent_id !== undefined ? (values.parent_id ? `${from.title} is now a subtask of ${target.title}` : `${from.title} is a task of its own again`) : `Moved ${from.title}`, () => putBack([was]), refreshAll)
}
const fail = (message: string) => { toast.add({ title: 'Not moved', description: message, color: 'error' }) }
async function saveOrder(ids: string[]) {
  if (!user.value) return
  const rows = ids.map((work_item_id, i) => ({ user_id: user.value!.sub, work_item_id, position: i + 1 }))
  const next = new Map(orderMap.value)
  for (const r of rows) next.set(r.work_item_id, r.position)
  orderMap.value = next
  const { error } = await supabase.from('work_item_order').upsert(rows, { onConflict: 'user_id,work_item_id' })
  if (error) toast.add({ title: 'Order not saved', description: error.message, color: 'error' })
}
// Inline, because the focused row and the drop line both set box-shadow
// at the same specificity and class order does not decide which wins.
function rowStyle(i: Item) {
  const parts: string[] = []
  if (focused.value === i.id) parts.push('inset 2px 0 0 0 var(--ui-primary)')
  if (dropAt.value?.id === i.id) parts.push(dropAt.value.mode === 'after' ? 'inset 0 -2px 0 0 var(--ui-primary)' : dropAt.value.mode === 'before' ? 'inset 0 2px 0 0 var(--ui-primary)' : 'inset 0 0 0 2px var(--ui-primary)')
  return parts.length ? { boxShadow: parts.join(', ') } : undefined
}

// ---------- the add box ----------
const adding = ref('')
const suggestions = computed(() => {
  const q = adding.value.trim().toLowerCase()
  if (!q) return []
  return (items.value ?? [])
    .filter(i => !ws.isDone(i.status) && !focusList.has(i.id) && `${i.title} ${projectLabel(i)}`.toLowerCase().includes(q))
    .slice(0, 8)
})
async function addFromBox(i: Item) {
  adding.value = ''
  try { await focusList.add([i.id]); await refreshFocus() }
  catch (e) { toast.add({ title: 'Not saved', description: (e as Error).message, color: 'error' }) }
}

// ---------- cards ----------

type ClientCard = { name: string, count: number, overdue: number, dueSoon: number, projects: number, nextDue: string | null, nobodyUp: number }
const clientCards = computed<ClientCard[]>(() => {
  const m = new Map<string, ClientCard & { projectIds: Set<string> }>()
  for (const i of unowned.value) {
    const name = i.projects?.clients?.name ?? 'No client'
    const c = m.get(name) ?? { name, count: 0, overdue: 0, dueSoon: 0, projects: 0, nextDue: null, nobodyUp: 0, projectIds: new Set<string>() }
    c.nobodyUp += 1
    m.set(name, c)
  }
  for (const i of mine.value) {
    const name = i.projects?.clients?.name ?? 'No client'
    const c = m.get(name) ?? { name, count: 0, overdue: 0, dueSoon: 0, projects: 0, nextDue: null, nobodyUp: 0, projectIds: new Set<string>() }
    c.count += 1
    c.projectIds.add(i.project_id)
    if (i.due_on && !ws.isDone(i.status)) {
      if (i.due_on < today) c.overdue += 1
      else if (i.due_on <= weekEnd) c.dueSoon += 1
      if (i.due_on >= today && (!c.nextDue || i.due_on < c.nextDue)) c.nextDue = i.due_on
    }
    m.set(name, c)
  }
  return [...m.values()].filter(c => c.count || c.nobodyUp).map(c => ({ ...c, projects: c.projectIds.size })).sort((a, b) => b.overdue - a.overdue || b.count - a.count || a.name.localeCompare(b.name))
})
const clientTasks = computed(() => [...mine.value, ...unowned.value].filter(i => (i.projects?.clients?.name ?? 'No client') === activeClient.value).sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999')))
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
const order = computed(() => groups.value.filter(g => !isCollapsed(g.key)).flatMap(g => g.items.map(i => i.id)))
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
    undo.offerRestore(`Deleted ${ids.length} ${ids.length === 1 ? 'task' : 'tasks'}`, 'work_items', ids, refreshAll)
    selected.value = new Set()
    focused.value = null
    await refreshAll()
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
  'f': { label: 'Add to your focus list, or take it off (selection too)', handler: () => { if (focusedItem.value) toggleFocus(focusedItem.value) } },
  'u': { label: 'Take it: put yourself up on the task (selection too)', handler: () => { if (focusedItem.value && !handingOff.value) takeIt(focusedItem.value) } },
  'escape': { label: 'Clear the selection', handler: () => { closeMenu(); selected.value = new Set(); focused.value = null } },
  'delete': { label: 'Delete the task (selection too)', handler: () => { if (toDeleteCount.value) deletingMany.value = true } },
})

// ---------- new task ----------

const creating = ref(false)
// /tasks?new=1 (from search, or N) opens the form straight away, and
// ?view=focus / ?view=unowned switch modes, even when already here.
const route = useRoute()
watch(() => route.query, (q) => {
  if (q.new) { creating.value = true }
  if (q.view === 'focus') { focusMode.value = true; onlyUnowned.value = false }
  if (q.view === 'unowned') { focusMode.value = false; onlyUnowned.value = true; everyone.value = false }
}, { immediate: true })
function created(id: string) {
  creating.value = false
  navigateTo(`/tasks/${id}`)
}
// List, cards, or the focus list, as one choice for the view strip.
const viewChoice = computed<'list' | 'cards' | 'focus'>({
  get: () => (focusMode.value ? 'focus' : viewMode.value),
  set: (v) => { if (v === 'focus') { focusMode.value = true } else { focusMode.value = false; viewMode.value = v } },
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Tasks</h1>
        <p class="text-sm text-muted">{{ focusMode ? 'The short list you keep for yourself, in the order you mean to work it. Drag a row to move it. Only you see it.' : `${everyone ? 'Everything across the team.' : 'What is on your plate.'} Drag a row to put it where you want it, onto another task to make it a subtask, or onto another group to move it.` }}</p>
      </div>
      <UButton icon="i-lucide-plus" data-tour="new-task" class="ml-auto" @click="creating = true;">New task</UButton>
    </div>
    <!-- Controls, left to right: how you look at it, what is in it, then the odd jobs. -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <SegmentedControl v-model="viewChoice" :items="[{ value: 'list', icon: 'i-lucide-list', title: 'List' }, { value: 'cards', icon: 'i-lucide-layout-grid', title: 'Cards by client' }, { value: 'focus', icon: 'i-lucide-star', title: 'Just your focus list' }]" />
      <USelect v-if="!focusMode && viewMode === 'list'" v-model="groupBy" :items="[{ label: 'By status', value: 'status' }, { label: 'By project', value: 'project' }, { label: 'By due date', value: 'due' }]" size="sm" class="w-36" data-tour="group-by" />
      <div v-if="!focusMode" class="flex items-center gap-4">
        <USwitch v-model="everyone" label="Everyone" size="sm" data-tour="everyone" />
        <USwitch v-model="showCompleted" label="Completed" size="sm" />
      </div>
      <UInput v-if="!focusMode" v-model="search" icon="i-lucide-search" placeholder="Search" size="sm" class="w-44" />
      <div class="flex items-center gap-2">
        <UButton v-if="focusMode && finished.length" size="xs" variant="ghost" color="neutral" @click="clearFinished">Clear finished</UButton>
        <UButton v-if="!focusMode" size="xs" variant="ghost" color="neutral" title="Back to the default list" @click="resetView">Reset view</UButton>
        <UButton v-if="!focusMode && unsorted && can('manage_tasks')" to="/tasks/triage" size="xs" variant="outline" color="neutral" icon="i-lucide-folder-input" title="Tasks the ClickUp import could not tie to a project">{{ unsorted }} unsorted</UButton>
      </div>
    </div>

    <!-- Cards: clients five across, then the client's tasks -->
    <template v-if="!focusMode && viewMode === 'cards'">
      <div v-if="!activeClient" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <button v-for="c in clientCards" :key="c.name" type="button" class="rounded-lg border border-default bg-default p-4 text-left transition-colors hover:border-primary hover:bg-elevated/40" @click="activeClient = c.name;">
          <div class="truncate font-semibold" :title="c.name">{{ c.name }}</div>
          <div class="mt-1 text-3xl font-semibold tabular-nums">{{ c.count }}</div>
          <div class="text-xs text-muted">{{ c.count === 1 ? 'task' : 'tasks' }} across {{ c.projects }} {{ c.projects === 1 ? 'project' : 'projects' }}</div>
          <div class="mt-3 flex flex-wrap gap-1 text-xs">
            <UBadge v-if="c.overdue" color="error" variant="subtle" size="sm">{{ c.overdue }} overdue</UBadge>
            <UBadge v-if="c.dueSoon" color="warning" variant="subtle" size="sm">{{ c.dueSoon }} due this week</UBadge>
            <span v-if="!c.overdue && !c.dueSoon && c.nextDue" class="text-muted">next {{ shortDate(c.nextDue) }}</span>
            <UBadge v-if="c.nobodyUp" color="warning" variant="outline" size="sm" title="Tasks you are on that nobody is up on">+{{ c.nobodyUp }} nobody up</UBadge>
          </div>
        </button>
        <p v-if="!clientCards.length" class="col-span-full py-8 text-center text-sm text-muted">{{ everyone ? 'No open tasks.' : 'Nothing is on you right now. Open Nobody up to take something, or switch to Everyone.' }}</p>
      </div>
      <div v-else class="space-y-4">
        <div class="flex items-center gap-3">
          <button type="button" class="text-sm text-muted hover:text-highlighted" @click="activeClient = null;">All clients</button>
          <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed" />
          <h2 class="text-lg font-semibold">{{ activeClient }}</h2>
          <span class="text-sm text-muted">{{ clientTasks.length }} {{ clientTasks.length === 1 ? 'task' : 'tasks' }}</span>
        </div>
        <div v-for="p in clientProjects" :key="p.name" class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted">{{ p.name === 'General' ? 'General tasks' : p.name }} <span class="font-normal">{{ p.items.length }}</span></h3>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <NuxtLink v-for="i in p.items" :key="i.id" :to="`/tasks/${i.id}`" class="flex min-h-28 flex-col rounded-lg border border-default bg-default p-3 text-sm transition-colors hover:border-primary hover:bg-elevated/40">
              <div class="flex items-start gap-2">
                <span class="mt-1.5 size-2.5 shrink-0 rounded-full" :class="ws.dot(i.status)" :title="ws.label(i.status)" />
                <span class="line-clamp-2 font-medium">{{ i.title }}</span>
              </div>
              <div v-if="i.parent_id" class="mt-1 truncate text-xs text-dimmed"><UIcon name="i-lucide-corner-down-right" class="inline-block size-3 align-[-2px]" /> {{ parentTitle(i) }}</div>
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
      v-show="focusMode || viewMode === 'list'"
      class="rounded-lg border border-default transition-colors" :class="over === g.key && dragging ? 'border-primary bg-primary/5' : ''"
      @dragover.prevent="over = g.key" @dragleave="over === g.key && (over = null)" @drop.prevent="onDrop(g)"
    >
      <div class="flex items-center">
        <button type="button" class="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm" @click="toggle(g.key)">
          <UIcon :name="isCollapsed(g.key) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="size-4 text-dimmed" />
          <span v-if="focusMode || groupBy !== 'project' || g.key === 'unowned' || g.key === 'waiting'" class="size-2.5 rounded-full" :class="ws.dotFor(g.color)" />
          <span class="font-semibold">{{ g.label }}</span>
          <span v-if="g.sublabel" class="text-muted">/ {{ g.sublabel }}</span>
          <span class="text-muted">{{ g.items.length }}</span>
        </button>
        <UButton v-if="g.key === 'unowned'" size="xs" variant="outline" color="neutral" icon="i-lucide-list-checks" class="mr-2" title="Go through these one at a time" @click="openSort">Sort these</UButton>
      </div>

      <table v-if="!isCollapsed(g.key) && g.items.length" class="w-full table-fixed border-t border-default text-sm">
        <tbody>
          <tr
            v-for="(i, idx) in g.items" :key="i.id" :draggable="!focusMode || !ws.isDone(i.status)" :data-task="i.id" :data-tour="idx === 0 && g === groups[0] ? 'row' : undefined"
            class="border-b border-default last:border-0 hover:bg-elevated/60"
            :class="[dragging?.id === i.id ? 'opacity-40' : g.key === 'waiting' ? 'opacity-60' : '', focused === i.id ? 'bg-elevated/60' : '', selected.has(i.id) ? 'bg-primary/5' : '', dropAt?.id === i.id && dropAt.mode === 'onto' ? 'bg-primary/10' : '']"
            :style="rowStyle(i)"
            @dragstart="onDragStart(i, $event)" @dragend="dragging = null; over = null; dropAt = null" @dragover="onRowDragOver(i, $event)" @drop="onRowDrop($event)" @click="focused = i.id;"
          >
            <td class="w-8 cursor-grab px-2 py-1.5 text-dimmed" @click.stop="focused = i.id; toggleSelect()">
              <UIcon v-if="selected.has(i.id)" name="i-lucide-check-square" class="size-4 text-primary" />
              <UIcon v-else name="i-lucide-grip-vertical" class="size-4" />
            </td>
            <td class="w-6 px-1 py-1.5">
              <button
                type="button" class="grid size-6 place-items-center rounded hover:bg-elevated"
                :aria-pressed="focusList.has(i.id)"
                :title="focusList.has(i.id) ? 'Take it off your focus list' : 'Add it to the end of your focus list. Only you see it.'"
                @click.stop="toggleFocus(i)"
              >
                <UIcon name="i-lucide-star" class="size-4" :class="focusList.has(i.id) ? 'text-primary' : 'text-dimmed'" />
              </button>
            </td>
            <td class="w-6 px-1 py-1.5">
              <button type="button" data-menu="status" class="block size-3 rounded-full ring-2 ring-transparent hover:ring-accented" :class="ws.dot(i.status)" :title="ws.label(i.status)" @click="openMenu(i, 'status', $event)" />
            </td>
            <td class="min-w-0 px-2 py-1.5">
              <UIcon v-if="i.parent_id" name="i-lucide-corner-down-right" class="mr-1.5 inline-block size-4 align-[-3px] text-muted" :title="`Subtask of ${parentTitle(i)}`" />
              <NuxtLink :to="`/tasks/${i.id}`" class="font-medium hover:underline" :class="focusMode && ws.isDone(i.status) ? 'text-dimmed line-through' : ''">{{ i.title }}</NuxtLink>
              <span v-if="i.parent_id && !underParent(i, g)" class="ml-2 text-xs text-dimmed">in {{ parentTitle(i) }}</span>
              <span v-if="focusMode || groupBy !== 'project'" class="ml-2 text-xs text-muted">{{ projectLabel(i) }}</span>
              <span v-if="g.key === 'waiting' && i.up" class="ml-2 text-xs text-muted">{{ i.up.full_name }} is up</span>
              <UButton v-if="g.key === 'unowned'" size="xs" variant="outline" icon="i-lucide-hand" class="ml-2 align-middle" :disabled="handingOff" @click.stop="takeIt(i)">Take it</UButton>
            </td>
            <td class="hidden w-40 px-2 py-1.5 sm:table-cell">
              <button type="button" data-menu="assignees" class="flex rounded-full -space-x-1.5 hover:ring-2 hover:ring-accented" :title="peopleTitle(i) || 'Assign'" @click="openMenu(i, 'assignees', $event)">
                <template v-if="i.work_item_assignees.length">
                  <span v-if="!i.assignee_id" class="relative z-10 grid size-6 place-items-center rounded-full border border-dashed border-warning bg-default ring-2 ring-default" title="Nobody is up"><UIcon name="i-lucide-hand" class="size-3 text-warning" /></span>
                  <span v-for="a in cluster(i).slice(0, 4)" :key="a.user_id" class="grid size-6 place-items-center rounded-full text-[10px] font-medium ring-2 ring-default" :class="a.user_id === i.assignee_id ? 'relative z-10 bg-primary text-inverted' : 'bg-elevated opacity-50'">{{ initials(a.profiles?.full_name ?? '?') }}</span>
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
              <button type="button" class="max-w-full rounded hover:ring-2 hover:ring-accented" title="Change status" @click="openMenu(i, 'status', $event)"><UBadge :color="ws.color(i.status)" variant="subtle" size="sm" class="max-w-full truncate">{{ ws.label(i.status) }}</UBadge></button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!isCollapsed(g.key)" class="border-t border-default px-3 py-3 text-xs text-muted">Nothing here. Drop a task to move it.</p>

      <div v-if="focusMode && g.key === 'focus'" class="border-t border-default">
        <ul v-if="suggestions.length" class="divide-y divide-default">
          <li v-for="sug in suggestions" :key="sug.id">
            <button type="button" class="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-elevated" @click="addFromBox(sug)">
              <span class="size-2.5 shrink-0 rounded-full" :class="ws.dot(sug.status)" />
              <span class="min-w-0 flex-1 truncate">{{ sug.title }}</span>
              <span class="truncate text-xs text-muted">{{ projectLabel(sug) }}</span>
            </button>
          </li>
        </ul>
        <form class="flex items-center gap-2 px-3 py-2" @submit.prevent="suggestions[0] && addFromBox(suggestions[0])">
          <UIcon name="i-lucide-plus" class="size-4 text-dimmed" />
          <UInput v-model="adding" variant="none" size="sm" class="flex-1" placeholder="Add a task to your focus list" :ui="{ base: 'px-0' }" @keydown.escape="adding = ''" />
        </form>
      </div>
    </div>

    <p v-if="focusMode && staleIds.length" class="flex items-center gap-2 px-1 text-xs text-muted">
      {{ staleIds.length === 1 ? '1 task on your focus list was deleted or is no longer yours to see.' : `${staleIds.length} tasks on your focus list were deleted or are no longer yours to see.` }}
      <UButton size="xs" variant="ghost" color="neutral" @click="dropStale">{{ staleIds.length === 1 ? 'Remove it' : 'Remove them' }}</UButton>
    </p>

    <div v-if="selected.size" class="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-default bg-default px-4 py-2 text-sm shadow-lg">
      <span class="font-medium tabular-nums">{{ selected.size }} selected</span>
      <span class="text-xs text-muted">S status · A assign · P priority · F focus · Delete</span>
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

    <p v-if="focusMode ? !groups.length : (viewMode === 'list' && !groups.length)" class="py-8 text-center text-sm text-muted">{{ focusMode ? 'Your focus list is empty. Click the star on a task, here or on the task itself, and it lands on the bottom of this list. Drag to put it in the order you want to work. Only you see it.' : (everyone ? 'No open tasks.' : 'Nothing is on you right now. Open Nobody up to take something, or switch to Everyone.') }}</p>

    <Teleport to="body">
      <div v-if="menu" class="fixed inset-0 z-50" @click="closeMenu">
        <div class="absolute w-52 rounded-md border border-default bg-default p-1 shadow-lg" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }" @click.stop>
          <template v-if="menu.kind === 'status'">
            <button v-for="s in ws.active.value" :key="s.key" type="button" class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-elevated" @click="pick(s.key)">
              <span class="size-2.5 rounded-full" :class="ws.dotFor(s.color)" />
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
            <button v-if="menu.item.assignee_id !== me" type="button" class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-elevated" @click="handOffFromMenu(me)">
              <UIcon name="i-lucide-hand" class="size-4 text-primary" />
              <span class="flex-1">Take it</span>
            </button>
            <button v-if="menu.item.assignee_id" type="button" class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-elevated" @click="handOffFromMenu(null)">
              <UIcon name="i-lucide-circle-dashed" class="size-4 text-muted" />
              <span class="flex-1">Nobody</span>
            </button>
            <div class="my-1 border-t border-default" />
            <div class="max-h-72 overflow-y-auto">
              <div v-for="p in people ?? []" :key="p.id" class="group flex items-center rounded hover:bg-elevated">
                <button type="button" class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm" :title="menu.item.work_item_assignees.some(a => a.user_id === p.id) ? 'Take them off it' : 'Put them on it'" @click="toggleAssignee(p.id)">
                  <span class="grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-medium" :class="menu.item.assignee_id === p.id ? 'bg-primary text-inverted' : 'bg-elevated'">{{ initials(p.full_name) }}</span>
                  <span class="min-w-0 flex-1 truncate">{{ p.full_name }}<span v-if="menu.item.assignee_id === p.id" class="ml-1 text-xs text-muted">up now</span></span>
                  <UIcon v-if="menu.item.work_item_assignees.some(a => a.user_id === p.id)" name="i-lucide-check" class="size-4 shrink-0 text-primary" />
                </button>
                <button v-if="menu.item.assignee_id !== p.id" type="button" class="mr-1 grid size-6 shrink-0 place-items-center rounded text-dimmed opacity-0 hover:bg-accented hover:text-highlighted focus:opacity-100 group-hover:opacity-100" :title="`Hand it to ${p.full_name.split(' ')[0]}`" :aria-label="`Hand it to ${p.full_name}`" @click="handOffFromMenu(p.id)">
                  <UIcon name="i-lucide-hand" class="size-3.5" />
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <AppDrawer v-model:open="sorting" title="Whose turn" description="Tasks you are on that nobody is up on. Take the ones that are yours to do next; skip the rest.">
      <template #body>
        <ul v-if="sortRows.length" class="divide-y divide-default text-sm">
          <li v-for="(i, idx) in sortRows" :key="i.id" :data-sort="i.id" class="flex items-center gap-3 py-2" :class="idx === sortAt ? '-mx-2 rounded bg-elevated/60 px-2' : ''" @click="sortAt = idx;">
            <div class="min-w-0 flex-1">
              <NuxtLink :to="`/tasks/${i.id}`" class="block truncate font-medium hover:underline">{{ i.title }}</NuxtLink>
              <div class="truncate text-xs text-muted">{{ projectLabel(i) }}<span v-if="otherNames(i)"> · with {{ otherNames(i) }}</span></div>
            </div>
            <UButton size="xs" variant="outline" icon="i-lucide-hand" :disabled="handingOff" @click.stop="sortTake(i)">Take it</UButton>
            <UButton size="xs" variant="ghost" color="neutral" @click.stop="sortSkip(i)">Skip</UButton>
          </li>
        </ul>
        <p v-else class="py-8 text-center text-sm text-muted">Nothing left to sort.</p>
      </template>
      <template #footer>
        <p class="text-xs text-muted">J and K move, 1 takes it, 2 skips.</p>
      </template>
    </AppDrawer>

    <AppDrawer v-model:open="creating" title="New task">
      <template #body>
        <WorkItemForm :projects="projects ?? []" :people="people ?? []" @saved="created" @cancel="creating = false;" />
      </template>
    </AppDrawer>
  </div>
</template>
