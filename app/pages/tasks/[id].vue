<script setup lang="ts">
import type { Database } from '~~/shared/types/database'
import { WORK_PRIORITIES } from '~~/shared/types/app'

// One task, laid out like ClickUp: breadcrumb and an inline title up top,
// a property grid edited in place, description and files below, and the
// activity (comments) in a column on the right with the composer at the
// bottom. Everything saves on change; there is no edit modal.
const route = useRoute()
const id = route.params.id as string
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { can } = useCurrentUser()
const isAdmin = computed(() => can('manage_tasks'))
const files = useWorkFiles()
const toast = useToast()
const focusList = useFocusList()
const __ad1 = useWorkStatuses()

const __ad2 = useAsyncData(`task-${id}`, async () => {
  const { data, error } = await supabase
    .from('work_items')
    .select('*, projects(id, name, server_path, clients(id, name)), profiles!work_items_created_by_fkey(full_name), up:profiles!work_items_assignee_id_fkey(id, full_name), work_item_assignees(user_id, profiles(full_name)), work_item_followers(user_id, profiles(full_name))')
    .eq('id', id)
    .single()
  if (error) throw createError({ statusCode: 404, statusMessage: 'Task not found' })
  return data
}, fresh)

const __ad3 = useAsyncData(`task-${id}-comments`, async () => {
  const { data, error } = await supabase.from('work_item_comments').select('*, profiles!work_item_comments_author_id_fkey(full_name)').eq('work_item_id', id).order('created_at')
  if (error) throw error
  return data
}, fresh)

const __ad4 = useAsyncData(`task-${id}-files`, async () => {
  const { data, error } = await supabase.from('work_item_files').select('*, profiles(full_name)').eq('work_item_id', id).order('created_at')
  if (error) throw error
  return data
}, fresh)

// time_entries under RLS: admins see everyone's, staff their own.
const __ad5 = useAsyncData(`task-${id}-time`, async () => {
  const { data, error } = await supabase.from('time_entries').select('hours').eq('work_item_id', id)
  if (error) throw error
  return (data ?? []).reduce((s, r) => s + r.hours, 0)
}, fresh)

const __ad6 = useActivePeople()

const __ad7 = useActiveProjects()
// Subtasks: the children of this task, and the parent if this is one.
const __ad8 = useAsyncData(`task-${id}-children`, async () => {
  const { data, error } = await supabase.from('work_items').select('id, title, status, due_on, estimate_hours, assignee_id, work_item_assignees(user_id, profiles(full_name))').eq('parent_id', id).order('position').order('created_at')
  if (error) throw error
  return data
}, fresh)
const __ad9 = useAsyncData('focus-ids', () => focusList.load(true), fresh)
await Promise.all([__ad1, __ad2, __ad3, __ad4, __ad5, __ad6, __ad7, __ad8, __ad9])
const ws = await __ad1
const { data: children, refresh: refreshChildren } = __ad8
const { data: item, refresh } = __ad2
const { data: parent } = await useAsyncData(`task-${id}-parent`, async () => {
  if (!item.value?.parent_id) return null
  const { data } = await supabase.from('work_items').select('id, title').eq('id', item.value.parent_id).maybeSingle()
  return data
}, fresh)
const childrenDone = computed(() => (children.value ?? []).filter(c => ws.isDone(c.status)).length)
const newChild = ref('')
const addingChild = ref(false)
async function addChild() {
  const title = newChild.value.trim()
  if (!title || !item.value || !user.value) return
  addingChild.value = true
  try {
    const { error } = await supabase.from('work_items').insert({ project_id: item.value.project_id, parent_id: item.value.id, title, created_by: user.value.sub })
    if (error) throw error
    newChild.value = ''
    await refreshChildren()
  } catch (e) {
    toast.add({ title: 'Could not add the subtask', description: (e as Error).message, color: 'error' })
  } finally {
    addingChild.value = false
  }
}
const { data: comments, refresh: refreshComments } = __ad3
// The task, its people, subtasks and comments follow other people's changes.
useLive(['work_items', 'work_item_assignees', 'work_item_followers', 'work_item_comments'], () => Promise.all([refresh(), refreshChildren(), refreshComments()]))
const { data: attachments, refresh: refreshFiles } = __ad4
const { data: timeLogged, refresh: refreshTimeLogged } = __ad5
const { data: people } = __ad6
const { data: projects } = __ad7
const projectOptions = computed(() => (projects.value ?? []).map(p => ({ label: `${p.clients?.name ?? ''} / ${p.name}`, value: p.id })))

// Task types and rates for whichever project this task is on, so time can
// be logged inline without leaving the page.
const { data: itemProjectTasks, refresh: refreshItemProjectTasks } = await useAsyncData(`task-${id}-project-tasks`, async () => {
  const projectId = item.value?.project_id
  if (!projectId) return []
  const { data, error } = await supabase.from('project_tasks').select('project_id, task_id, tasks(id, name, is_billable_default, is_active)').eq('project_id', projectId)
  if (error) throw error
  return data
}, fresh)
const setProject = (projectId: string) => {
  if (!projectId || projectId === item.value?.project_id) return
  patch({ project_id: projectId }).then(() => refreshItemProjectTasks())
}

// ---------- inline time entry ----------
const loggingTime = ref(false)
const timeFormProjects = computed(() => (projects.value ?? []).filter(p => p.id === item.value?.project_id))
function timeSaved() {
  loggingTime.value = false
  refreshTimeLogged()
}

useHead({ title: () => item.value?.title ?? 'Task' })
useAssistantScreen(() => ({ task: item.value?.title, project: item.value?.projects?.name, client: item.value?.projects?.clients?.name }))

type Item = NonNullable<typeof item.value>
const canDelete = computed(() => isAdmin.value || item.value?.created_by === user.value?.sub)
const overdue = computed(() => !!item.value?.due_on && item.value.due_on < todayString() && !ws.isDone(item.value.status))

// ---------- inline editing ----------

const draft = reactive({ title: '', description: '', start_on: '', due_on: '', estimate_hours: '' as string | number, assignees: [] as string[] })
function loadDraft() {
  const i = item.value
  if (!i) return
  draft.title = i.title
  draft.description = i.description ?? ''
  draft.start_on = i.start_on ?? ''
  draft.due_on = i.due_on ?? ''
  draft.estimate_hours = i.estimate_hours ?? ''
  draft.assignees = i.work_item_assignees.map(a => a.user_id)
}
loadDraft()
watch(item, loadDraft)

async function patch(values: Database['public']['Tables']['work_items']['Update']) {
  const { error } = await supabase.from('work_items').update(values).eq('id', id)
  if (error) {
    toast.add({ title: 'Not saved', description: error.message, color: 'error' })
    loadDraft()
    return
  }
  await refresh()
}
const saveTitle = () => {
  const t = draft.title.trim()
  if (!t) {
    draft.title = item.value!.title
    return
  }
  if (t !== item.value?.title) patch({ title: t })
}
const saveDescription = () => {
  const d = draft.description.trim() || null
  if (d !== (item.value?.description ?? null)) patch({ description: d })
}
const saveDates = () => {
  if (draft.start_on && draft.due_on && draft.due_on < draft.start_on) {
    toast.add({ title: 'Due date is before the start', color: 'error' })
    loadDraft()
    return
  }
  patch({ start_on: draft.start_on || null, due_on: draft.due_on || null })
}
const saveEstimate = () => {
  const n = draft.estimate_hours === '' ? null : Number(draft.estimate_hours)
  if (n !== item.value?.estimate_hours) patch({ estimate_hours: n })
}
const setStatus = (status: string) => patch({ status })
const setPriority = (priority: string) => patch({ priority: priority as Item['priority'] })

async function saveAssignees(ids: string[]) {
  const before = new Set(item.value?.work_item_assignees.map(a => a.user_id) ?? [])
  const after = new Set(ids)
  const add = [...after].filter(x => !before.has(x))
  const drop = [...before].filter(x => !after.has(x))
  try {
    if (drop.length) {
      const { error } = await supabase.from('work_item_assignees').delete().eq('work_item_id', id).in('user_id', drop)
      if (error) throw error
    }
    if (add.length) {
      const { error } = await supabase.from('work_item_assignees').insert(add.map(user_id => ({ work_item_id: id, user_id })))
      if (error) throw error
    }
    await refresh()
  } catch (e) {
    toast.add({ title: 'Not saved', description: (e as Error).message, color: 'error' })
    loadDraft()
  }
}
const peopleOptions = computed(() => (people.value ?? []).map(p => ({ label: p.full_name, value: p.id })))

// ---------- up now ----------
// Everyone on the task stays on it; assignee_id is whoever is up right now.
// Take it, Hand off and the Up now select all go through hand_off(), which
// keeps the owner on the task and bells the receiver.
const me = computed(() => user.value?.sub ?? null)
const imUp = computed(() => !!item.value?.assignee_id && item.value.assignee_id === me.value)
const sinceText = computed(() => item.value?.assigned_at ? `Since ${new Date(item.value.assigned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '')
const handingOff = ref(false)
const NOBODY = '__nobody__'
const handOffTo = ref<string>(NOBODY)
const handOffNote = ref('')
// The task's other people first, then everyone else, then Nobody yet.
const handOffOptions = computed(() => {
  const onIt = new Set((item.value?.work_item_assignees ?? []).map(a => a.user_id))
  const others = peopleOptions.value.filter(o => onIt.has(o.value) && o.value !== me.value)
  const rest = peopleOptions.value.filter(o => !onIt.has(o.value) || o.value === me.value)
  return [...others, ...rest, { label: 'Nobody yet', value: NOBODY }]
})
function openHandOff() {
  const others = (item.value?.work_item_assignees ?? []).map(a => a.user_id).filter(u => u !== me.value)
  handOffTo.value = others.length === 1 ? others[0]! : NOBODY
  handOffNote.value = ''
  handingOff.value = true
}
const handingOffBusy = ref(false)
async function handOff(to: string | null, note?: string) {
  const target = to === NOBODY ? null : to
  handingOffBusy.value = true
  try {
    const { error } = await supabase.rpc('hand_off', { p_item: id, p_to: target ?? undefined, p_note: note?.trim() || undefined })
    if (error) throw error
    handingOff.value = false
    await Promise.all([refresh(), refreshComments()])
    const name = target ? peopleOptions.value.find(o => o.value === target)?.label?.split(' ')[0] : null
    toast.add({ title: !target ? 'Nobody is up on this now' : target === me.value ? 'Yours now' : `Handed to ${name}` })
  } catch (e) {
    toast.add({ title: 'Not handed off', description: (e as Error).message, color: 'error' })
  } finally {
    handingOffBusy.value = false
  }
}
const takeIt = () => handOff(me.value)

// ---------- following ----------
// Bells only: comments, status changes, client decisions. Never puts the
// task on your list, never changes who is up. RLS lets you follow only as
// yourself and only what you can already see.
const { profile } = useCurrentUser()
const isClientUser = computed(() => profile.value?.role === 'client')
const following = computed(() => !!me.value && (item.value?.work_item_followers ?? []).some(f => f.user_id === me.value))
const followBusy = ref(false)
async function toggleFollow() {
  if (!me.value) return
  followBusy.value = true
  try {
    const { error } = following.value
      ? await supabase.from('work_item_followers').delete().eq('work_item_id', id).eq('user_id', me.value)
      : await supabase.from('work_item_followers').insert({ work_item_id: id, user_id: me.value })
    if (error) throw error
    await refresh()
    toast.add({ title: following.value ? 'Following' : 'Unfollowed' })
  } catch (e) {
    toast.add({ title: 'Not saved', description: (e as Error).message, color: 'error' })
  } finally {
    followBusy.value = false
  }
}
// Subtask avatars: the child's owner first and solid, the rest behind it.
const childPeople = (c: { assignee_id: string | null, work_item_assignees: { user_id: string, profiles: { full_name: string } | null }[] }) =>
  [...c.work_item_assignees].sort((a, b) => Number(b.user_id === c.assignee_id) - Number(a.user_id === c.assignee_id))

// ---------- waits on (dependencies) ----------
// Other tasks this one waits on; the schedule draws them as arrows.
const { data: waitsOn, refresh: refreshWaits } = await useAsyncData(`task-${id}-waits`, async () => {
  const { data, error } = await supabase.from('work_item_dependencies').select('predecessor_id, predecessor:work_items!work_item_dependencies_predecessor_id_fkey(id, title, due_on)').eq('successor_id', id)
  if (error) throw error
  return data
}, fresh)
const { data: siblings } = await useAsyncData(`task-${id}-siblings`, async () => {
  const pid = item.value?.project_id
  if (!pid) return []
  const { data } = await supabase.from('work_items').select('id, title, due_on').eq('project_id', pid).neq('id', id).order('due_on', { ascending: true, nullsFirst: false }).limit(200)
  return data ?? []
}, fresh)
const waitOptions = computed(() => (siblings.value ?? []).filter(s => !waitsOn.value?.some(w => w.predecessor_id === s.id)).map(s => ({ label: s.title + (s.due_on ? ` (due ${shortDate(s.due_on)})` : ''), value: s.id })))
const addingWait = ref<string | undefined>()
async function addWait(predecessorId?: string) {
  if (!predecessorId) return
  addingWait.value = undefined
  const { error } = await supabase.from('work_item_dependencies').insert({ predecessor_id: predecessorId, successor_id: id })
  if (error) toast.add({ title: 'Not saved', description: error.message, color: 'error' })
  else await refreshWaits()
}
async function removeWait(predecessorId: string) {
  const { error } = await supabase.from('work_item_dependencies').delete().eq('predecessor_id', predecessorId).eq('successor_id', id)
  if (error) toast.add({ title: 'Not saved', description: error.message, color: 'error' })
  else await refreshWaits()
}
const lateStart = computed(() => {
  const start = draft.start_on || draft.due_on
  return !!start && (waitsOn.value ?? []).some(w => w.predecessor?.due_on && start <= w.predecessor.due_on)
})

// ---------- comments ----------

const commentBody = ref('')
const commentVisible = ref(false)

// ---------- assistant ----------
const drafting = ref<'description' | 'reply' | null>(null)
async function draftDescription() {
  drafting.value = 'description'
  try {
    const r = await $fetch<{ text: string }>('/api/ai/draft', { method: 'POST', body: { kind: 'task_description', taskId: id, current: draft.description, instruction: draft.description ? 'Tidy and complete the current description; keep its facts.' : 'Write it from the task title, comments, and project.' } })
    draft.description = r.text
    saveDescription()
  } catch (e) {
    toast.add({ title: 'Could not draft', description: apiError(e), color: 'error' })
  } finally {
    drafting.value = null
  }
}
async function draftReply() {
  drafting.value = 'reply'
  try {
    const r = await $fetch<{ text: string }>('/api/ai/draft', { method: 'POST', body: { kind: 'client_reply', taskId: id, current: commentBody.value, instruction: commentBody.value ? 'Turn these notes into the reply.' : 'Reply to the latest client comment or decision.' } })
    commentBody.value = r.text
    commentVisible.value = true
  } catch (e) {
    toast.add({ title: 'Could not draft', description: apiError(e), color: 'error' })
  } finally {
    drafting.value = null
  }
}
const commenting = ref(false)
// @mentions: typing @ offers people; the comment keeps "@Full Name" in
// the text and the matching ids in mentions, which notifies them.
const commentInput = ref<{ textareaRef?: HTMLTextAreaElement } | null>(null)
const mentionQuery = ref<string | null>(null)
const mentionAt = ref(0)
const mentionPick = ref(0)
const mentionMatches = computed(() => {
  if (mentionQuery.value === null) return []
  const q = mentionQuery.value.toLowerCase()
  return (people.value ?? []).filter(p => p.full_name.toLowerCase().includes(q)).slice(0, 6)
})
function onCommentInput(e: Event) {
  const el = e.target as HTMLTextAreaElement
  const upto = el.value.slice(0, el.selectionStart ?? el.value.length)
  const m = upto.match(/(^|\s)@([\w .-]{0,30})$/)
  if (m) { mentionAt.value = upto.length - m[2]!.length - 1; mentionQuery.value = m[2]!; mentionPick.value = 0 }
  else mentionQuery.value = null
}
function insertMention(p: { id: string, full_name: string }) {
  const el = commentInput.value?.textareaRef
  const text = commentBody.value
  const caret = el?.selectionStart ?? text.length
  commentBody.value = `${text.slice(0, mentionAt.value)}@${p.full_name} ${text.slice(caret)}`
  mentionQuery.value = null
  nextTick(() => { if (el) { const pos = mentionAt.value + p.full_name.length + 2; el.focus(); el.setSelectionRange(pos, pos) } })
}
function onCommentKeydown(e: KeyboardEvent) {
  if (mentionQuery.value === null || !mentionMatches.value.length) return
  if (e.key === 'ArrowDown') { e.preventDefault(); mentionPick.value = (mentionPick.value + 1) % mentionMatches.value.length }
  else if (e.key === 'ArrowUp') { e.preventDefault(); mentionPick.value = (mentionPick.value - 1 + mentionMatches.value.length) % mentionMatches.value.length }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches.value[mentionPick.value]!) }
  else if (e.key === 'Escape') mentionQuery.value = null
}
const mentionedIds = (text: string) => (people.value ?? []).filter(p => text.includes(`@${p.full_name}`)).map(p => p.id)
// Comment text split into plain runs and mention runs for rendering.
const commentRuns = (text: string) => {
  const names = (people.value ?? []).map(p => p.full_name).sort((a, b) => b.length - a.length)
  if (!names.length) return [{ text, mention: false }]
  const re = new RegExp(`@(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  const out: { text: string, mention: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), mention: false })
    out.push({ text: m[0], mention: true })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), mention: false })
  return out
}
async function addComment() {
  if (!commentBody.value.trim() || mentionQuery.value !== null) return
  commenting.value = true
  try {
    const body = commentBody.value.trim()
    const { error } = await supabase.from('work_item_comments').insert({ work_item_id: id, author_id: user.value!.sub, body, visible_to_client: commentVisible.value, mentions: mentionedIds(body) })
    if (error) throw error
    commentBody.value = ''
    await refreshComments()
  } catch (e) {
    toast.add({ title: 'Could not comment', description: (e as Error).message, color: 'error' })
  } finally {
    commenting.value = false
  }
}
// Your focus list. One click reverses this, so no undo toast.
const onFocusList = computed(() => focusList.has(id))
async function toggleFocus() {
  try { onFocusList.value ? await focusList.remove([id]) : await focusList.add([id]) }
  catch (e) { toast.add({ title: 'Not saved', description: (e as Error).message, color: 'error' }) }
}

const undo = useUndo()
async function deleteComment(commentId: string) {
  const { error } = await supabase.from('work_item_comments').delete().eq('id', commentId)
  if (error) toast.add({ title: 'Could not remove', description: error.message, color: 'error' })
  else {
    await refreshComments()
    undo.offerRestore('Comment removed', 'work_item_comments', commentId, refreshComments)
  }
}

// ---------- client review link ----------

const origin = useRequestURL().origin
const reviewLink = computed(() => `${origin}/r/${item.value?.public_token}`)
const shareOpen = ref(false)
const shareTo = ref('')
const shareMessage = ref('')
const shareMark = ref(true)
const sharing = ref(false)
function openShare() {
  shareTo.value = ''
  shareMessage.value = ''
  shareMark.value = item.value?.status !== ws.clientReviewKey.value
  shareOpen.value = true
}
async function copyReviewLink() {
  await navigator.clipboard.writeText(reviewLink.value)
  toast.add({ title: 'Review link copied', description: 'Anyone with it can see the shared files and client-visible comments.', color: 'success' })
}
async function shareByEmail() {
  sharing.value = true
  try {
    const to = shareTo.value.split(/[\s,;]+/).filter(Boolean)
    const res = await $fetch<{ to: string[] }>('/api/tasks/share', { method: 'POST', body: { taskId: id, to, message: shareMessage.value, markClientReview: shareMark.value } })
    shareOpen.value = false
    toast.add({ title: 'Review link sent', description: `To ${res.to.join(', ')}`, color: 'success' })
    await refresh()
  } catch (e) {
    toast.add({ title: 'Not sent', description: apiError(e), color: 'error' })
  } finally {
    sharing.value = false
  }
}

// ---------- files ----------

type Attachment = NonNullable<typeof attachments.value>[number]
const attachOpen = ref(false)
const attachKind = ref<'upload' | 'link'>('link')
const linkPath = ref('')
const linkName = ref('')
// Start the path at the project's server folder so people type only the
// file name. Cleared after each add, so the next one starts there too.
watch(attachOpen, (open) => {
  const folder = item.value?.projects?.server_path
  if (open && !linkPath.value && folder) linkPath.value = folder.replace(/\/+$/, '') + '/'
})
const fileInput = ref<HTMLInputElement | null>(null)
const attaching = ref(false)

// The file dialog only gives the file's name; it goes after whatever
// folder is typed, which starts as the project's server folder.
async function chooseServerFile() {
  useServerFileName(await pickFileName())
}
function dropServerFile(e: DragEvent) {
  useServerFileName(droppedName(e))
}
// The Mac app drops the real path, mapped to the share.
const desktop = useDesktop()
async function dropServerFileDesktop(e: Event) {
  const path = (e as CustomEvent<{ paths: string[] }>).detail.paths[0]
  if (path) linkPath.value = await desktop.shareUrl(path)
}
function useServerFileName(name: string | null) {
  if (!name) return
  const typed = linkPath.value.trim()
  const dir = typed.endsWith('/') ? typed : typed.includes('/') ? typed.replace(/\/[^/]*$/, '/') : ''
  linkPath.value = dir + name
}
async function attachLink() {
  const link = linkPath.value.trim()
  if (!link) return
  attaching.value = true
  try {
    const name = linkName.value.trim() || link.split(/[\\/]/).filter(Boolean).pop() || link
    const { error } = await supabase.from('work_item_files').insert({ work_item_id: id, kind: 'link', link, file_name: name, uploaded_by: user.value!.sub })
    if (error) throw error
    linkPath.value = ''
    linkName.value = ''
    attachOpen.value = false
    await refreshFiles()
  } catch (e) {
    toast.add({ title: 'Could not add the link', description: (e as Error).message, color: 'error' })
  } finally {
    attaching.value = false
  }
}
async function attachUpload(e: Event) {
  const list = (e.target as HTMLInputElement).files
  if (!list?.length) return
  attaching.value = true
  try {
    for (const f of Array.from(list)) {
      const path = await files.upload(id, f)
      const { error } = await supabase.from('work_item_files').insert({ work_item_id: id, kind: 'upload', path, file_name: f.name, content_type: f.type || null, size_bytes: f.size, uploaded_by: user.value!.sub })
      if (error) throw error
    }
    attachOpen.value = false
    await refreshFiles()
  } catch (err) {
    toast.add({ title: 'Upload failed', description: (err as Error).message, color: 'error' })
  } finally {
    attaching.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
async function openFile(f: Attachment) {
  try {
    await files.open(f.path!)
  } catch (e) {
    toast.add({ title: 'Could not open the file', description: (e as Error).message, color: 'error' })
  }
}
async function copyLink(f: Attachment) {
  await navigator.clipboard.writeText(f.link ?? '')
  toast.add({ title: 'Path copied', color: 'success' })
}
const linkHref = (f: Attachment) => (f.link && /^(smb|afp|https?|file):\/\//i.test(f.link) ? f.link : null)
async function removeFile(f: Attachment) {
  try {
    const { error } = await supabase.from('work_item_files').delete().eq('id', f.id)
    if (error) throw error
    if (f.kind === 'upload' && f.path) await files.remove(f.path).catch(() => {})
    await refreshFiles()
  } catch (e) {
    toast.add({ title: 'Could not remove', description: (e as Error).message, color: 'error' })
  }
}
const size = (n: number | null) => (n == null ? '' : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`)

// Turn a server link into a shareable copy: upload the file, flip the row
// to an upload, keep the link so the server location is not lost.
const convertInput = ref<HTMLInputElement | null>(null)
const converting = ref<Attachment | null>(null)
function startConvert(f: Attachment) {
  converting.value = f
  convertInput.value?.click()
}
async function convertUpload(e: Event) {
  const f = converting.value
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!f || !file) return
  attaching.value = true
  try {
    const path = await files.upload(id, file)
    const { error } = await supabase.from('work_item_files')
      .update({ kind: 'upload', path, file_name: file.name, content_type: file.type || null, size_bytes: file.size })
      .eq('id', f.id)
    if (error) throw error
    toast.add({ title: 'Copy uploaded', description: 'Anyone with access can open it now, including on a review link.', color: 'success' })
    await refreshFiles()
  } catch (err) {
    toast.add({ title: 'Upload failed', description: (err as Error).message, color: 'error' })
  } finally {
    attaching.value = false
    converting.value = null
    if (convertInput.value) convertInput.value.value = ''
  }
}

// ---------- delete ----------

const deleting = ref(false)
async function deleteTask() {
  const { error } = await supabase.from('work_items').delete().eq('id', id)
  if (error) toast.add({ title: 'Could not delete', description: error.message, color: 'error' })
  else {
    await navigateTo('/tasks')
    undo.offerRestore('Task deleted', 'work_items', id, () => navigateTo(`/tasks/${id}`))
  }
}

// The activity panel is dragged wider or narrower from its left edge,
// within limits, and the width is remembered per person.
const PANEL_MIN = 320
const PANEL_MAX = 720
const PANEL_DEFAULT = 420
const layout = await useViewState('task-detail', { panelWidth: PANEL_DEFAULT })
const clampPanel = (w: number) => Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(w)))
const panelWidth = computed(() => clampPanel(Number(layout.panelWidth) || PANEL_DEFAULT))
function startResize(e: PointerEvent) {
  const startX = e.clientX
  const startW = panelWidth.value
  const move = (ev: PointerEvent) => { layout.panelWidth = clampPanel(startW + (startX - ev.clientX)) }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}
// The way back: Tasks, the client, the project, and the parent for a subtask.
const crumbs = computed(() => [
  { label: 'Tasks', to: '/tasks' },
  { label: item.value?.projects?.clients?.name ?? '', to: `/clients/${item.value?.projects?.clients?.id}` },
  { label: item.value?.projects?.name === 'General' ? 'General tasks' : item.value?.projects?.name ?? '', to: `/projects/${item.value?.projects?.id}` },
  ...(parent.value ? [{ label: parent.value.title, to: `/tasks/${parent.value.id}` }] : []),
])
</script>

<template>
  <div v-if="item" class="-my-6 flex flex-col lg:h-screen">
    <!-- Top bar: breadcrumb, actions -->
    <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default py-3 text-sm">
      <AppCrumbs :items="crumbs" />
      <div class="ml-auto flex items-center gap-2">
        <UButton
          size="sm" icon="i-lucide-star" :variant="onFocusList ? 'solid' : 'outline'" :color="onFocusList ? 'primary' : 'neutral'"
          :title="onFocusList ? 'Take it off your focus list' : 'Put it on the end of your focus list. Only you see it.'"
          @click="toggleFocus"
        >{{ onFocusList ? 'In focus' : 'Add to focus' }}</UButton>
        <UButton variant="outline" size="sm" icon="i-lucide-share-2" @click="openShare">Share for review</UButton>
        <TaskTimerControl :work-item="{ id: item.id, title: item.title, project_id: item.project_id }" :project-tasks="itemProjectTasks ?? []" @changed="refreshTimeLogged" />
        <UButton variant="outline" size="sm" icon="i-lucide-timer" title="Enter hours, or a different day" @click="loggingTime = true;">Log time</UButton>
        <UButton v-if="canDelete" variant="ghost" color="neutral" size="sm" icon="i-lucide-trash-2" aria-label="Delete task" @click="deleting = true;" />
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <!-- Left: the task -->
      <!-- pl-px: cards draw a 1px ring outside their box, and the scroll container would clip it on the left. -->
      <div class="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto py-6 pl-px lg:pr-6">
        <div class="flex flex-wrap items-center gap-3">
          <USelect :model-value="item.status" :items="ws.items.value" :color="ws.color(item.status)" variant="subtle" size="sm" :ui="{ content: 'min-w-44' }" @update:model-value="setStatus($event as string)">
            <template #leading><span class="size-2 rounded-full" :class="ws.dot(item.status)" /></template>
          </USelect>
          <span v-if="item.completed_at" class="text-xs text-muted">Completed {{ stamp(item.completed_at) }}</span>
          <span v-else-if="item.shared_at" class="text-xs text-muted">Shared for review {{ stamp(item.shared_at) }}</span>
        </div>
        <div v-if="item.client_decision" class="rounded-md px-4 py-2 text-sm" :class="item.client_decision === 'approved' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'">
          {{ item.client_decision === 'approved' ? 'Approved' : 'Changes requested' }} by {{ item.client_decision_by }}<span v-if="item.client_decision_at">, {{ stamp(item.client_decision_at) }}</span>
        </div>

        <UInput v-model="draft.title" variant="none" size="xl" class="w-full" :ui="{ base: 'text-2xl font-semibold px-0' }" placeholder="Task title" @blur="saveTitle" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />

        <dl class="grid gap-y-2 text-sm">
          <div class="flex items-center gap-3">
            <dt class="w-24 shrink-0 text-muted">Up now</dt>
            <dd class="flex min-w-0 flex-1 items-center gap-2">
              <USelectMenu :model-value="item.assignee_id ?? undefined" :items="peopleOptions" value-key="value" variant="ghost" size="sm" class="max-w-full" placeholder="Nobody yet" :disabled="handingOffBusy" @update:model-value="handOff($event as string)">
                <template #default>
                  <span v-if="item.up" class="flex min-w-0 items-center gap-2">
                    <span class="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-medium text-inverted">{{ initials(item.up.full_name) }}</span>
                    <span class="min-w-0">
                      <span class="block truncate">{{ item.up.full_name }}</span>
                      <span v-if="sinceText" class="block text-xs text-muted">{{ sinceText }}</span>
                    </span>
                  </span>
                  <span v-else class="text-muted">Nobody yet</span>
                </template>
              </USelectMenu>
              <UButton v-if="imUp" size="xs" variant="outline" color="neutral" icon="i-lucide-arrow-right-left" :disabled="handingOffBusy" @click="openHandOff">Hand off</UButton>
              <UButton v-else size="xs" variant="outline" icon="i-lucide-hand" :loading="handingOffBusy" @click="takeIt">Take it</UButton>
            </dd>
          </div>
          <div class="flex items-start gap-3">
            <dt class="w-24 shrink-0 pt-1 text-muted">Also on it</dt>
            <dd class="min-w-0 flex-1">
              <USelectMenu v-model="draft.assignees" :items="peopleOptions" value-key="value" multiple variant="ghost" size="sm" class="max-w-full" placeholder="Nobody yet" @update:model-value="saveAssignees(draft.assignees)">
                <template #default>
                  <span v-if="item.work_item_assignees.length" class="flex min-w-0 items-center gap-2" :title="item.work_item_assignees.map(a => a.profiles?.full_name).join(', ')">
                    <span class="flex shrink-0 -space-x-1.5">
                      <span v-for="a in item.work_item_assignees.slice(0, 5)" :key="a.user_id" class="grid size-6 place-items-center rounded-full bg-elevated text-[10px] font-medium ring-2 ring-default">{{ initials(a.profiles?.full_name ?? '?') }}</span>
                      <span v-if="item.work_item_assignees.length > 5" class="grid size-6 place-items-center rounded-full bg-accented text-[10px] font-medium ring-2 ring-default">+{{ item.work_item_assignees.length - 5 }}</span>
                    </span>
                    <span class="min-w-0 truncate">{{ item.work_item_assignees.length <= 2 ? item.work_item_assignees.map(a => a.profiles?.full_name).join(', ') : `${item.work_item_assignees[0]?.profiles?.full_name?.split(' ')[0]} and ${item.work_item_assignees.length - 1} others` }}</span>
                  </span>
                  <span v-else class="text-muted">Nobody yet</span>
                </template>
              </USelectMenu>
              <p class="mt-0.5 text-xs text-muted">Everyone here gets comments, status changes, and mentions. Only the person up now sees it on their own list.</p>
            </dd>
          </div>
          <div v-if="!isClientUser" class="flex items-start gap-3">
            <dt class="w-24 shrink-0 pt-1 text-muted">Following</dt>
            <dd class="min-w-0 flex-1">
              <div class="flex min-w-0 items-center gap-2">
                <span v-if="item.work_item_followers.length" class="flex min-w-0 items-center gap-2 opacity-50" :title="item.work_item_followers.map(f => f.profiles?.full_name).join(', ')">
                  <span class="flex shrink-0 -space-x-1.5">
                    <span v-for="f in item.work_item_followers.slice(0, 5)" :key="f.user_id" class="grid size-6 place-items-center rounded-full bg-elevated text-[10px] font-medium ring-2 ring-default">{{ initials(f.profiles?.full_name ?? '?') }}</span>
                    <span v-if="item.work_item_followers.length > 5" class="grid size-6 place-items-center rounded-full bg-accented text-[10px] font-medium ring-2 ring-default">+{{ item.work_item_followers.length - 5 }}</span>
                  </span>
                  <span class="min-w-0 truncate">{{ item.work_item_followers.length <= 2 ? item.work_item_followers.map(f => f.profiles?.full_name).join(', ') : `${item.work_item_followers[0]?.profiles?.full_name?.split(' ')[0]} and ${item.work_item_followers.length - 1} others` }}</span>
                </span>
                <span v-else class="text-muted">Nobody yet</span>
                <UButton v-if="!ws.isDone(item.status)" size="xs" variant="ghost" color="neutral" :icon="following ? 'i-lucide-bell-off' : 'i-lucide-bell'" :loading="followBusy" @click="toggleFollow">{{ following ? 'Unfollow' : 'Follow' }}</UButton>
              </div>
              <p class="mt-0.5 text-xs text-muted">Followers get comments and status changes, nothing else. Following never puts a task on your list.</p>
            </dd>
          </div>
          <div class="flex items-start gap-3">
            <dt class="w-24 shrink-0 pt-1 text-muted">Waits on</dt>
            <dd class="min-w-0 flex-1 space-y-1">
              <div v-for="w in waitsOn" :key="w.predecessor_id" class="flex items-center gap-2">
                <NuxtLink :to="`/tasks/${w.predecessor_id}`" class="truncate hover:underline">{{ w.predecessor?.title }}</NuxtLink>
                <span v-if="w.predecessor?.due_on" class="text-xs text-muted">due {{ shortDate(w.predecessor.due_on) }}</span>
                <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" aria-label="Remove" @click="removeWait(w.predecessor_id)" />
              </div>
              <p v-if="lateStart" class="text-xs text-error">Starts before what it waits on is due.</p>
              <USelectMenu v-model="addingWait" :items="waitOptions" value-key="value" variant="ghost" size="sm" class="max-w-md" :placeholder="waitsOn?.length ? 'Add another' : 'Nothing yet. Pick a task in this project.'" @update:model-value="addWait($event as string)" />
            </dd>
          </div>
          <div class="flex items-center gap-3">
            <dt class="w-24 shrink-0 text-muted">Project</dt>
            <dd class="min-w-0 flex-1">
              <USelectMenu :model-value="item.project_id" :items="projectOptions" value-key="value" variant="ghost" size="sm" class="max-w-md" placeholder="Pick a project" @update:model-value="setProject($event as string)" />
            </dd>
          </div>
          <div class="flex items-center gap-3">
            <dt class="w-24 shrink-0 text-muted">Priority</dt>
            <dd class="min-w-0 flex-1">
              <USelect :model-value="item.priority" :items="[...WORK_PRIORITIES]" variant="ghost" size="sm" @update:model-value="setPriority($event as string)" />
            </dd>
          </div>
          <div class="flex items-center gap-3">
            <dt class="w-24 shrink-0 text-muted">Dates</dt>
            <dd class="flex min-w-0 flex-1 items-center gap-2">
              <UInput v-model="draft.start_on" type="date" variant="ghost" size="sm" @change="saveDates" />
              <UIcon name="i-lucide-arrow-right" class="size-4 text-dimmed" />
              <UInput v-model="draft.due_on" type="date" variant="ghost" size="sm" :color="overdue ? 'error' : undefined" @change="saveDates" />
            </dd>
          </div>
          <div class="flex items-center gap-3">
            <dt class="w-24 shrink-0 text-muted">Estimate</dt>
            <dd class="flex min-w-0 flex-1 items-center gap-3">
              <UInput v-model="draft.estimate_hours" type="number" step="0.25" :min="0" variant="ghost" size="sm" class="w-24" placeholder="hours" @change="saveEstimate" />
              <span class="text-muted">Logged <span class="text-default tabular-nums">{{ formatHours(timeLogged ?? 0) }}</span></span>
            </dd>
          </div>
          <div class="flex items-center gap-3">
            <dt class="w-24 shrink-0 text-muted">Created</dt>
            <dd class="text-muted">{{ item.profiles?.full_name }}, {{ stamp(item.created_at) }}</dd>
          </div>
        </dl>

        <div>
          <div class="mb-1 flex items-center gap-2">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-dimmed">Description</h2>
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-sparkles" class="ml-auto" :loading="drafting === 'description'" @click="draftDescription">{{ draft.description ? 'Tidy' : 'Draft' }}</UButton>
          </div>
          <UTextarea v-model="draft.description" variant="none" autoresize :rows="3" class="w-full" :ui="{ base: 'px-0' }" placeholder="Add a description" @blur="saveDescription" />
        </div>

        <div v-if="!item.parent_id">
          <div class="mb-2 flex items-center gap-3">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-dimmed">Subtasks <span class="font-normal">{{ children?.length ? `${childrenDone} of ${children.length} done` : '' }}</span></h2>
            <UProgress v-if="children?.length" :model-value="childrenDone / children.length * 100" size="xs" class="w-32" />
          </div>
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <ul v-if="children?.length" class="divide-y divide-default text-sm">
              <li v-for="c in children" :key="c.id" class="flex items-center gap-3 px-4 py-2">
                <span class="size-2.5 shrink-0 rounded-full" :class="ws.dot(c.status)" :title="ws.label(c.status)" />
                <NuxtLink :to="`/tasks/${c.id}`" class="min-w-0 flex-1 truncate font-medium hover:underline" :class="ws.isDone(c.status) ? 'text-muted line-through' : ''">{{ c.title }}</NuxtLink>
                <span v-if="c.work_item_assignees.length" class="flex -space-x-1.5" :title="childPeople(c).map(a => a.profiles?.full_name + (a.user_id === c.assignee_id ? ' (up now)' : '')).join(', ')">
                  <span v-for="a in childPeople(c).slice(0, 3)" :key="a.user_id" class="grid size-5 place-items-center rounded-full text-[9px] font-medium ring-2 ring-default" :class="a.user_id === c.assignee_id ? 'relative z-10 bg-primary text-inverted' : 'bg-elevated opacity-50'">{{ initials(a.profiles?.full_name ?? '?') }}</span>
                </span>
                <span v-if="c.estimate_hours" class="text-xs tabular-nums text-muted">{{ formatHours(c.estimate_hours) }}</span>
                <span class="w-14 text-right text-xs tabular-nums" :class="c.due_on && c.due_on < todayString() && !ws.isDone(c.status) ? 'text-error' : 'text-muted'">{{ c.due_on ? shortDate(c.due_on) : '' }}</span>
              </li>
            </ul>
            <form class="flex items-center gap-2 px-3 py-2" @submit.prevent="addChild">
              <UIcon name="i-lucide-corner-down-right" class="size-4 text-dimmed" />
              <UInput v-model="newChild" variant="none" size="sm" class="flex-1" placeholder="Add a subtask and press Enter" :ui="{ base: 'px-0' }" />
              <UButton v-if="newChild.trim()" type="submit" size="xs" :loading="addingChild">Add</UButton>
            </form>
          </UCard>
        </div>

        <div>
          <div class="mb-2 flex items-center gap-4">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-dimmed">Files <span class="font-normal">{{ attachments?.length ?? 0 }}</span></h2>
            <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-paperclip" class="ml-auto" @click="attachOpen = true;">Attach</UButton>
          </div>
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <ul v-if="attachments?.length" class="divide-y divide-default text-sm">
              <li v-for="f in attachments" :key="f.id" class="flex items-center gap-3 px-4 py-2">
                <UIcon :name="f.kind === 'link' ? 'i-lucide-folder-symlink' : 'i-lucide-file'" class="shrink-0 text-muted" />
                <div class="min-w-0 flex-1">
                  <button v-if="f.kind === 'upload'" type="button" class="font-medium hover:underline" @click="openFile(f)">{{ f.file_name }}</button>
                  <a v-else-if="linkHref(f)" :href="linkHref(f)!" class="font-medium hover:underline">{{ f.file_name }}</a>
                  <span v-else class="font-medium">{{ f.file_name }}</span>
                  <div class="truncate text-xs text-muted">
                    <template v-if="f.kind === 'link'">On the server: {{ f.link }}</template>
                    <template v-else>Shareable copy{{ f.size_bytes ? `, ${size(f.size_bytes)}` : '' }}<template v-if="f.link">, also on the server: {{ f.link }}</template></template>
                    <span> &middot; {{ f.profiles?.full_name }}, {{ stamp(f.created_at) }}</span>
                  </div>
                </div>
                <UButton v-if="f.link" icon="i-lucide-copy" variant="ghost" color="neutral" size="xs" aria-label="Copy server path" title="Copy server path" @click="copyLink(f)" />
                <UButton v-if="f.kind === 'link'" icon="i-lucide-cloud-upload" variant="ghost" color="neutral" size="xs" aria-label="Upload a copy to share" title="Upload a copy to share" :loading="attaching && converting?.id === f.id" @click="startConvert(f)" />
                <UButton v-if="isAdmin || f.uploaded_by === user?.sub" icon="i-lucide-x" variant="ghost" color="neutral" size="xs" aria-label="Remove" @click="removeFile(f)" />
              </li>
            </ul>
            <p v-else class="px-4 py-6 text-center text-sm text-muted">No files. Link to the file on the server, or upload a copy for anyone outside the office.</p>
          </UCard>
          <input ref="convertInput" type="file" class="hidden" @change="convertUpload">
        </div>
      </div>

      <!-- Drag handle: sits on the panel's left border. Double-click resets. -->
      <div class="hidden w-1.5 shrink-0 cursor-col-resize rounded-full transition-colors hover:bg-primary/40 lg:block" title="Drag to resize. Double-click to reset." @pointerdown.prevent="startResize" @dblclick="layout.panelWidth = PANEL_DEFAULT" />
      <!-- Right: activity -->
      <div class="flex min-h-0 shrink-0 flex-col border-t border-default lg:w-(--panel) lg:border-l lg:border-t-0 lg:pl-6" :style="{ '--panel': `${panelWidth}px` }">
        <h2 class="shrink-0 py-4 text-xs font-semibold uppercase tracking-wider text-dimmed">Activity <span class="font-normal">{{ comments?.length ?? 0 }}</span></h2>
        <div class="min-h-0 flex-1 overflow-y-auto pr-1">
          <ul v-if="comments?.length" class="space-y-4 text-sm">
            <li v-for="c in comments" :key="c.id" class="flex gap-3">
              <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-elevated text-[10px] font-medium">{{ initials(c.author_id ? (c.profiles?.full_name ?? '?') : (c.author_name ?? 'C')) }}</span>
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2 text-xs text-muted">
                  <span class="font-medium text-default">{{ c.author_id ? c.profiles?.full_name : `${c.author_name ?? 'Client'} (client)` }}</span>
                  <span>{{ stamp(c.created_at) }}</span>
                  <UBadge v-if="c.visible_to_client && c.author_id" color="info" variant="subtle" size="xs">Client can see</UBadge>
                  <UButton v-if="isAdmin || c.author_id === user?.sub" icon="i-lucide-x" variant="ghost" color="neutral" size="xs" class="-my-1 ml-auto" aria-label="Remove comment" @click="deleteComment(c.id)" />
                </div>
                <p class="mt-0.5 whitespace-pre-line"><template v-for="(run, ri) in commentRuns(c.body)" :key="ri"><span v-if="run.mention" class="rounded bg-primary/10 px-1 font-medium text-primary">{{ run.text }}</span><template v-else>{{ run.text }}</template></template></p>
              </div>
            </li>
          </ul>
          <p v-else class="text-sm text-muted">No comments yet.</p>
        </div>
        <div class="shrink-0 border-t border-default py-4">
          <div class="relative">
            <UTextarea ref="commentInput" v-model="commentBody" :rows="2" class="w-full" placeholder="Write a comment. @ to mention someone. Cmd+Enter to post." autoresize @input="onCommentInput" @click="onCommentInput" @keydown="onCommentKeydown" @keydown.meta.enter="addComment" @keydown.ctrl.enter="addComment" />
            <ul v-if="mentionMatches.length" class="absolute bottom-full left-0 z-20 mb-1 w-64 rounded-md border border-default bg-default p-1 shadow-lg">
              <li v-for="(p, i) in mentionMatches" :key="p.id">
                <button type="button" class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm" :class="i === mentionPick ? 'bg-elevated' : 'hover:bg-elevated'" @mousedown.prevent="insertMention(p)">
                  <span class="grid size-5 place-items-center rounded-full bg-accented text-[10px] font-medium">{{ initials(p.full_name) }}</span>{{ p.full_name }}
                </button>
              </li>
            </ul>
          </div>
          <div class="mt-2 flex items-center gap-3">
            <UCheckbox v-model="commentVisible" label="Visible to client" size="sm" />
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-sparkles" :loading="drafting === 'reply'" title="Draft a client-facing reply" @click="draftReply">Draft reply</UButton>
            <UButton size="sm" class="ml-auto" :loading="commenting" :disabled="!commentBody.trim()" @click="addComment">Comment</UButton>
          </div>
        </div>
      </div>
    </div>

    <AppDrawer v-model:open="shareOpen" title="Share for review">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Review link" help="Anyone with the link sees the title, description, uploaded files (not server links), and comments marked visible to client. They can comment, approve, or request changes without signing in.">
            <div class="flex gap-2">
              <UInput :model-value="reviewLink" readonly class="flex-1" />
              <UButton variant="outline" color="neutral" icon="i-lucide-copy" @click="copyReviewLink">Copy</UButton>
            </div>
          </UFormField>
          <UFormField label="Email it to" help="Comma separated.">
            <UInput v-model="shareTo" class="w-full" placeholder="name@client.com" />
          </UFormField>
          <UFormField label="Message" help="Optional. The email always includes the link.">
            <UTextarea v-model="shareMessage" :rows="3" class="w-full" />
          </UFormField>
          <UCheckbox v-model="shareMark" label="Set status to Client review" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="shareOpen = false;">Close</UButton>
          <UButton :loading="sharing" :disabled="!shareTo.trim()" icon="i-lucide-send" @click="shareByEmail">Send</UButton>
        </div>
      </template>
    </AppDrawer>

    <UModal v-model:open="attachOpen" title="Attach a file">
      <template #body>
        <div class="space-y-4">
          <div class="flex gap-1">
            <UButton size="sm" :variant="attachKind === 'link' ? 'solid' : 'ghost'" :color="attachKind === 'link' ? 'primary' : 'neutral'" icon="i-lucide-folder-symlink" @click="attachKind = 'link';">Link to server file</UButton>
            <UButton size="sm" :variant="attachKind === 'upload' ? 'solid' : 'ghost'" :color="attachKind === 'upload' ? 'primary' : 'neutral'" icon="i-lucide-upload" @click="attachKind = 'upload';">Upload a copy</UButton>
          </div>
          <template v-if="attachKind === 'link'">
            <UFormField label="Path on the server" help="Paste the path, drop the file from Finder, or choose it. Dropped and chosen files only give their name, so it goes after the project folder. Nothing is copied; people outside the office cannot open it.">
              <div class="flex gap-2" @dragover.prevent @drop.prevent="dropServerFile" @desktop-drop="dropServerFileDesktop">
                <UInput v-model="linkPath" class="w-full" placeholder="smb://server/Jobs/Client/file.indd, or drop the file here" />
                <UButton variant="outline" color="neutral" icon="i-lucide-folder-open" title="Choose the file. The browser only gives its name, so it goes after the folder typed here." @click="chooseServerFile">Choose</UButton>
              </div>
            </UFormField>
            <UFormField label="Name" help="Optional. Defaults to the file name in the path.">
              <UInput v-model="linkName" class="w-full" />
            </UFormField>
            <div class="flex justify-end">
              <UButton :loading="attaching" :disabled="!linkPath.trim()" @click="attachLink">Add link</UButton>
            </div>
          </template>
          <template v-else>
            <p class="text-sm text-muted">Stores a copy in Docket (25 MB max) that anyone can open, including a client on a review link.</p>
            <input ref="fileInput" type="file" multiple class="block w-full text-sm" @change="attachUpload">
            <p v-if="attaching" class="text-sm text-muted">Uploading</p>
          </template>
        </div>
      </template>
    </UModal>

    <AppDrawer v-model:open="loggingTime" title="Log time">
      <template #body>
        <TimeEntryForm v-if="item" :date="todayString()" :projects="timeFormProjects" :project-tasks="itemProjectTasks ?? []" :work-item="{ id: item.id, title: item.title, project_id: item.project_id }" @saved="timeSaved" @cancel="loggingTime = false" />
      </template>
    </AppDrawer>

    <UModal v-model:open="handingOff" title="Hand off">
      <template #body>
        <div class="space-y-4">
          <UFormField label="To">
            <USelectMenu v-model="handOffTo" :items="handOffOptions" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Note (optional)">
            <UInput v-model="handOffNote" class="w-full" placeholder="Anything they need to know?" @keydown.enter.prevent="handOff(handOffTo, handOffNote)" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="handingOff = false;">Cancel</UButton>
          <UButton :loading="handingOffBusy" @click="handOff(handOffTo, handOffNote)">Hand off</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="deleting" title="Delete this task?">
      <template #body>
        <p class="text-sm">Comments and files go with it. Time logged against it stays, just unlinked.</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deleting = false;">Cancel</UButton>
          <UButton color="error" @click="deleteTask">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
