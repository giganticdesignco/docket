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
const ws = await useWorkStatuses()

const { data: item, refresh } = await useAsyncData(`task-${id}`, async () => {
  const { data, error } = await supabase
    .from('work_items')
    .select('*, projects(id, name, server_path, clients(id, name)), profiles!work_items_created_by_fkey(full_name), work_item_assignees(user_id, profiles(full_name))')
    .eq('id', id)
    .single()
  if (error) throw createError({ statusCode: 404, statusMessage: 'Task not found' })
  return data
}, fresh)

const { data: comments, refresh: refreshComments } = await useAsyncData(`task-${id}-comments`, async () => {
  const { data, error } = await supabase.from('work_item_comments').select('*, profiles(full_name)').eq('work_item_id', id).order('created_at')
  if (error) throw error
  return data
}, fresh)

const { data: attachments, refresh: refreshFiles } = await useAsyncData(`task-${id}-files`, async () => {
  const { data, error } = await supabase.from('work_item_files').select('*, profiles(full_name)').eq('work_item_id', id).order('created_at')
  if (error) throw error
  return data
}, fresh)

// time_entries under RLS: admins see everyone's, staff their own.
const { data: timeLogged } = await useAsyncData(`task-${id}-time`, async () => {
  const { data, error } = await supabase.from('time_entries').select('hours').eq('work_item_id', id)
  if (error) throw error
  return (data ?? []).reduce((s, r) => s + r.hours, 0)
}, fresh)

const { data: people } = await useAsyncData('people-for-tasks', async () => {
  const { data, error } = await supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
  if (error) throw error
  return data
}, fresh)

const { data: projects } = await useAsyncData('projects-for-tasks', async () => {
  const { data, error } = await supabase.from('projects').select('id, name, clients(name)').eq('is_active', true).order('name')
  if (error) throw error
  return data
}, fresh)
const projectOptions = computed(() => (projects.value ?? []).map(p => ({ label: `${p.clients?.name ?? ''} / ${p.name}`, value: p.id })))
const setProject = (projectId: string) => { if (projectId && projectId !== item.value?.project_id) patch({ project_id: projectId }) }

useHead({ title: () => item.value?.title ?? 'Task' })

type Item = NonNullable<typeof item.value>
const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
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
const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

// ---------- comments ----------

const commentBody = ref('')
const commentVisible = ref(false)
const commenting = ref(false)
async function addComment() {
  if (!commentBody.value.trim()) return
  commenting.value = true
  try {
    const { error } = await supabase.from('work_item_comments').insert({ work_item_id: id, author_id: user.value!.sub, body: commentBody.value.trim(), visible_to_client: commentVisible.value })
    if (error) throw error
    commentBody.value = ''
    await refreshComments()
  } catch (e) {
    toast.add({ title: 'Could not comment', description: (e as Error).message, color: 'error' })
  } finally {
    commenting.value = false
  }
}
async function deleteComment(commentId: string) {
  const { error } = await supabase.from('work_item_comments').delete().eq('id', commentId)
  if (error) toast.add({ title: 'Could not remove', description: error.message, color: 'error' })
  else await refreshComments()
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
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Not sent', description: err.data?.statusMessage ?? err.message, color: 'error' })
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
  else await navigateTo('/tasks')
}
</script>

<template>
  <div v-if="item" class="-my-6 flex flex-col lg:h-screen">
    <!-- Top bar: breadcrumb, actions -->
    <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default py-3 text-sm">
      <UButton to="/tasks" icon="i-lucide-arrow-left" variant="ghost" color="neutral" size="sm" />
      <NuxtLink :to="`/clients/${item.projects?.clients?.id}`" class="text-muted hover:text-highlighted">{{ item.projects?.clients?.name }}</NuxtLink>
      <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed" />
      <NuxtLink :to="`/projects/${item.projects?.id}`" class="text-muted hover:text-highlighted">{{ item.projects?.name === 'General' ? 'General tasks' : item.projects?.name }}</NuxtLink>
      <div class="ml-auto flex items-center gap-2">
        <UButton variant="outline" size="sm" icon="i-lucide-share-2" @click="openShare">Share for review</UButton>
        <UButton :to="`/time?item=${item.id}`" variant="outline" size="sm" icon="i-lucide-timer">Log time</UButton>
        <UButton v-if="canDelete" variant="ghost" color="neutral" size="sm" icon="i-lucide-trash-2" aria-label="Delete task" @click="deleting = true;" />
      </div>
    </div>

    <div class="grid min-h-0 flex-1 lg:grid-cols-5">
      <!-- Left: the task -->
      <div class="min-h-0 space-y-6 overflow-y-auto py-6 lg:col-span-3 lg:pr-8">
        <div class="flex flex-wrap items-center gap-3">
          <USelect :model-value="item.status" :items="ws.items.value" :color="ws.color(item.status)" variant="subtle" size="sm" class="w-44" @update:model-value="setStatus($event as string)" />
          <span v-if="item.completed_at" class="text-xs text-muted">Completed {{ stamp(item.completed_at) }}</span>
          <span v-else-if="item.shared_at" class="text-xs text-muted">Shared for review {{ stamp(item.shared_at) }}</span>
        </div>
        <div v-if="item.client_decision" class="rounded-md px-4 py-2 text-sm" :class="item.client_decision === 'approved' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'">
          {{ item.client_decision === 'approved' ? 'Approved' : 'Changes requested' }} by {{ item.client_decision_by }}<span v-if="item.client_decision_at">, {{ stamp(item.client_decision_at) }}</span>
        </div>

        <UInput v-model="draft.title" variant="none" size="xl" class="w-full" :ui="{ base: 'text-2xl font-semibold px-0' }" placeholder="Task title" @blur="saveTitle" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />

        <dl class="grid gap-y-2 text-sm">
          <div class="flex items-center gap-3">
            <dt class="w-24 shrink-0 text-muted">Assignees</dt>
            <dd class="min-w-0 flex-1">
              <USelectMenu v-model="draft.assignees" :items="peopleOptions" value-key="value" multiple variant="ghost" size="sm" class="w-full" placeholder="Nobody yet" @update:model-value="saveAssignees(draft.assignees)">
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
            </dd>
          </div>
          <div class="flex items-center gap-3">
            <dt class="w-24 shrink-0 text-muted">Project</dt>
            <dd class="min-w-0 flex-1">
              <USelectMenu :model-value="item.project_id" :items="projectOptions" value-key="value" variant="ghost" size="sm" class="w-full max-w-md" placeholder="Pick a project" @update:model-value="setProject($event as string)" />
            </dd>
          </div>
          <div class="flex items-center gap-3">
            <dt class="w-24 shrink-0 text-muted">Priority</dt>
            <dd class="min-w-0 flex-1">
              <USelect :model-value="item.priority" :items="[...WORK_PRIORITIES]" variant="ghost" size="sm" class="w-40" @update:model-value="setPriority($event as string)" />
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
          <h2 class="mb-1 text-xs font-semibold uppercase tracking-wider text-dimmed">Description</h2>
          <UTextarea v-model="draft.description" variant="none" autoresize :rows="3" class="w-full" :ui="{ base: 'px-0' }" placeholder="Add a description" @blur="saveDescription" />
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

      <!-- Right: activity -->
      <div class="flex min-h-0 flex-col border-t border-default lg:col-span-2 lg:border-l lg:border-t-0 lg:pl-6">
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
                <p class="mt-0.5 whitespace-pre-line">{{ c.body }}</p>
              </div>
            </li>
          </ul>
          <p v-else class="text-sm text-muted">No comments yet.</p>
        </div>
        <div class="shrink-0 border-t border-default py-4">
          <UTextarea v-model="commentBody" :rows="2" class="w-full" placeholder="Write a comment. Cmd+Enter to post." autoresize @keydown.meta.enter="addComment" @keydown.ctrl.enter="addComment" />
          <div class="mt-2 flex items-center gap-3">
            <UCheckbox v-model="commentVisible" label="Visible to client" size="sm" />
            <UButton size="sm" class="ml-auto" :loading="commenting" :disabled="!commentBody.trim()" @click="addComment">Comment</UButton>
          </div>
        </div>
      </div>
    </div>

    <UModal v-model:open="shareOpen" title="Share for review">
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
    </UModal>

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
