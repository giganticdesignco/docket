<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'

// The ClickUp import could only tie a task to a project when the
// project's name appeared in the task's title; everything else landed
// in a "General" project made for the client. This page lists those,
// a client at a time, with the client's projects beside them, so they
// can be moved in a few clicks each: drag a row onto a project, or tick
// several and drop (or pick) once. Every move offers Undo for thirty
// seconds.
definePageMeta({ middleware: 'can', permission: 'manage_tasks' })
useHead({ title: 'Unsorted tasks' })

const supabase = useSupabaseClient()
const toast = useToast()
const undo = useUndo()
const __ad0 = useWorkStatuses()

// Open tasks sitting in a General project. RLS decides which are visible.
const __ad1 = useAsyncData('unsorted-tasks', async () => {
  const { data, error } = await supabase
    .from('work_items')
    .select('id, title, status, due_on, clickup_id, project_id, projects!inner(id, name, client_id, clients(id, name)), work_item_assignees(profiles(full_name))')
    .eq('projects.name', 'General')
    .order('title')
    .limit(2000)
  if (error) throw error
  return data
}, fresh)
const __ad2 = useAsyncData('projects-for-triage', async () => {
  const { data, error } = await supabase.from('projects').select('id, client_id, name, is_active').order('name')
  if (error) throw error
  return data
}, fresh)
const __ad3 = useActivePeople()
await Promise.all([__ad0, __ad1, __ad2, __ad3])
const ws = await __ad0
const { data: items, refresh } = __ad1
useLive(['work_items'], refresh)
const { data: projects, refresh: refreshProjects } = __ad2
const { data: people } = __ad3

type Item = NonNullable<typeof items.value>[number]
const openItems = computed(() => (items.value ?? []).filter(i => !ws.isDone(i.status)))

const search = ref('')
const clientFilter = ref<string | undefined>()
const groups = computed(() => {
  const q = search.value.trim().toLowerCase()
  const by = new Map<string, { clientId: string, clientName: string, generalId: string, items: Item[] }>()
  for (const i of openItems.value) {
    const clientId = i.projects.client_id
    if (clientFilter.value && clientId !== clientFilter.value) continue
    if (q && !i.title.toLowerCase().includes(q)) continue
    let g = by.get(clientId)
    if (!g) {
      g = { clientId, clientName: i.projects.clients?.name ?? 'Client', generalId: i.projects.id, items: [] }
      by.set(clientId, g)
    }
    g.items.push(i)
  }
  return [...by.values()].sort((a, b) => a.clientName.localeCompare(b.clientName))
})
const clientOptions = computed(() => {
  const seen = new Map<string, string>()
  for (const i of openItems.value) seen.set(i.projects.client_id, i.projects.clients?.name ?? 'Client')
  return [{ label: 'All clients', value: undefined }, ...[...seen].map(([value, label]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label))]
})

// The client's other projects. Active ones only: these are open tasks,
// and a finished project is the wrong home for open work.
const clientProjects = (clientId: string) => (projects.value ?? []).filter(p => p.client_id === clientId && p.is_active && p.name !== 'General')
const projectOptions = (clientId: string) => clientProjects(clientId).map(p => ({ label: p.name, value: p.id }))

// ---------- selection ----------
const selected = ref(new Set<string>())
const isSelected = (id: string) => selected.value.has(id)
function toggle(id: string, on: boolean) {
  if (on) selected.value.add(id)
  else selected.value.delete(id)
}
const groupSelected = (g: { items: Item[] }) => g.items.filter(i => selected.value.has(i.id))
const groupAllSelected = (g: { items: Item[] }) => g.items.length > 0 && g.items.every(i => selected.value.has(i.id))
function toggleGroup(g: { items: Item[] }, on: boolean) {
  for (const i of g.items) toggle(i.id, on)
}

// ---------- moving ----------
const moving = ref(false)
async function move(ids: string[], projectId: string, generalId: string) {
  if (!ids.length) return
  const target = projects.value?.find(p => p.id === projectId)
  moving.value = true
  try {
    const { error } = await supabase.from('work_items').update({ project_id: projectId }).in('id', ids)
    if (error) throw error
    for (const id of ids) selected.value.delete(id)
    await refresh()
    undo.offer(
      `Moved ${ids.length === 1 ? 'one task' : `${ids.length} tasks`} to ${target?.name ?? 'the project'}`,
      async () => {
        const { error: back } = await supabase.from('work_items').update({ project_id: generalId }).in('id', ids)
        if (back) throw back
      },
      refresh,
    )
  } catch (e) {
    toast.add({ title: 'Could not move', description: (e as Error).message, color: 'error' })
  } finally {
    moving.value = false
  }
}
function moveSelected(g: { clientId: string, generalId: string, items: Item[] }, projectId: string | undefined) {
  if (!projectId) return
  move(groupSelected(g).map(i => i.id), projectId, g.generalId)
}

// ---------- drag a row onto a project ----------
// A ticked row drags the whole selection in its client; an unticked row
// drags itself. Drop on a project card, or on New project to make one
// and move them into it.
const dragging = ref<{ ids: string[], clientId: string, generalId: string } | null>(null)
const over = ref<string | null>(null)
function onDragStart(g: { clientId: string, generalId: string, items: Item[] }, i: Item, e: DragEvent) {
  const ids = selected.value.has(i.id) ? groupSelected(g).map(x => x.id) : [i.id]
  dragging.value = { ids, clientId: g.clientId, generalId: g.generalId }
  e.dataTransfer?.setData('text/plain', i.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
const reset = () => { dragging.value = null; over.value = null }
function onDragOver(target: string, clientId: string, e: DragEvent) {
  if (dragging.value?.clientId !== clientId) return
  e.preventDefault()
  over.value = target
}
async function onDrop(projectId: string, clientId: string) {
  const d = dragging.value
  reset()
  if (!d || d.clientId !== clientId) return
  await move(d.ids, projectId, d.generalId)
}
function onDropNew(g: { clientId: string, clientName: string, generalId: string }) {
  const d = dragging.value
  reset()
  if (!d || d.clientId !== g.clientId) return
  for (const id of d.ids) selected.value.add(id)
  newFor.value = { clientId: g.clientId, clientName: g.clientName, generalId: g.generalId }
}

// ---------- a project that does not exist yet ----------
const newFor = ref<{ clientId: string, clientName: string, generalId: string } | null>(null)
async function projectCreated(p: Tables<'projects'>) {
  const g = newFor.value
  newFor.value = null
  await refreshProjects()
  if (!g) return
  const ids = (groups.value.find(x => x.clientId === g.clientId)?.items ?? []).filter(i => selected.value.has(i.id)).map(i => i.id)
  if (ids.length) await move(ids, p.id, g.generalId)
  else toast.add({ title: 'Project added', description: `${p.name} is in the picker now.`, color: 'success', duration: 3000 })
}

</script>

<template>
  <div class="space-y-4">
    <AppCrumbs :items="[{ label: 'Tasks', to: '/tasks' }]" />
    <div>
      <h1 class="text-2xl font-semibold">Unsorted tasks <span class="text-base font-normal text-muted">{{ openItems.length }}</span></h1>
      <p class="text-sm text-muted">Tasks the ClickUp import could not tie to a project sit in each client's General project. Drag a task onto one of the client's projects, or tick several and drop them together.</p>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <USelectMenu v-model="clientFilter" :items="clientOptions" value-key="value" size="sm" class="w-56" placeholder="All clients" />
      <UInput v-model="search" icon="i-lucide-search" placeholder="Search titles" size="sm" class="w-48" />
    </div>

    <p v-if="!groups.length" class="py-12 text-center text-sm text-muted">
      {{ openItems.length ? 'Nothing matches.' : 'Every open task has a project.' }}
    </p>

    <UCard v-for="g in groups" :key="g.clientId" :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-center gap-3">
          <UCheckbox :model-value="groupAllSelected(g)" :aria-label="`Select all for ${g.clientName}`" @update:model-value="toggleGroup(g, $event === true)" />
          <NuxtLink :to="`/clients/${g.clientId}`" class="font-semibold hover:underline">{{ g.clientName }}</NuxtLink>
          <span class="text-sm text-muted">{{ g.items.length }} unsorted</span>
          <div class="ml-auto flex flex-wrap items-center gap-2">
            <span v-if="groupSelected(g).length" class="text-xs text-muted">{{ groupSelected(g).length }} selected</span>
            <USelectMenu
              :model-value="undefined"
              :items="projectOptions(g.clientId)"
              value-key="value"
              size="sm"
              class="w-64"
              :placeholder="projectOptions(g.clientId).length ? 'Move selected to' : 'No active projects yet'"
              :disabled="moving || !groupSelected(g).length || !projectOptions(g.clientId).length"
              @update:model-value="moveSelected(g, $event as string | undefined)"
            />
            <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-plus" title="Make a project for this client and move the selected tasks into it" @click="newFor = { clientId: g.clientId, clientName: g.clientName, generalId: g.generalId };">New project</UButton>
          </div>
        </div>
      </template>
      <div class="grid lg:grid-cols-[1fr_18rem]">
        <!-- Left: the unsorted tasks, one fixed column grid so faces, dates and statuses line up -->
        <ul class="divide-y divide-default text-sm">
          <li
            v-for="i in g.items" :key="i.id" draggable="true"
            class="grid cursor-grab grid-cols-[auto_1fr_5rem_4rem_7rem_1.5rem] items-center gap-3 px-4 py-2 active:cursor-grabbing"
            :class="[isSelected(i.id) ? 'bg-primary/5' : '', dragging?.ids.includes(i.id) ? 'opacity-40' : '']"
            @dragstart="onDragStart(g, i, $event)" @dragend="reset"
          >
            <UCheckbox :model-value="isSelected(i.id)" :aria-label="`Select ${i.title}`" @update:model-value="toggle(i.id, $event === true)" />
            <div class="min-w-0">
              <NuxtLink :to="`/tasks/${i.id}`" class="font-medium hover:underline">{{ i.title }}</NuxtLink>
              <div class="truncate text-xs text-muted">{{ i.work_item_assignees.map(a => a.profiles?.full_name).filter(Boolean).join(', ') || 'Unassigned' }}</div>
            </div>
            <span class="flex -space-x-1.5" :title="i.work_item_assignees.map(a => a.profiles?.full_name).join(', ')">
              <span v-for="a in i.work_item_assignees.slice(0, 3)" :key="a.profiles?.full_name ?? ''" class="grid size-6 place-items-center rounded-full bg-elevated text-[10px] font-medium ring-2 ring-default">{{ initials(a.profiles?.full_name ?? '?') }}</span>
            </span>
            <span class="text-right tabular-nums" :class="i.due_on && i.due_on < todayString() ? 'text-error' : 'text-muted'">{{ i.due_on ? shortDate(i.due_on) : '' }}</span>
            <span class="min-w-0"><UBadge :color="ws.color(i.status)" variant="subtle" size="sm" class="max-w-full truncate">{{ ws.label(i.status) }}</UBadge></span>
            <UButton v-if="i.clickup_id" :to="`https://app.clickup.com/t/${i.clickup_id}`" external target="_blank" icon="i-lucide-external-link" variant="ghost" color="neutral" size="xs" aria-label="Open in ClickUp" title="Open in ClickUp" />
            <span v-else />
          </li>
        </ul>
        <!-- Right: the client's projects, each a drop target -->
        <div class="border-t border-default p-3 lg:border-l lg:border-t-0">
          <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-dimmed">Projects</div>
          <div class="space-y-1.5">
            <div
              v-for="p in clientProjects(g.clientId)" :key="p.id"
              class="rounded-md border px-3 py-2 text-sm transition-colors"
              :class="over === `${g.clientId}|${p.id}` ? 'border-primary bg-primary/10' : dragging?.clientId === g.clientId ? 'border-dashed border-primary/40' : 'border-default'"
              @dragover="onDragOver(`${g.clientId}|${p.id}`, g.clientId, $event)" @dragleave="over === `${g.clientId}|${p.id}` && (over = null)" @drop.prevent="onDrop(p.id, g.clientId)"
            >
              <NuxtLink :to="`/projects/${p.id}`" class="font-medium hover:underline">{{ p.name }}</NuxtLink>
            </div>
            <p v-if="!clientProjects(g.clientId).length" class="px-1 py-2 text-xs text-muted">No active projects yet.</p>
            <button
              type="button" class="w-full rounded-md border border-dashed px-3 py-2 text-left text-sm text-muted transition-colors hover:border-primary hover:text-highlighted"
              :class="over === `${g.clientId}|new` ? 'border-primary bg-primary/10 text-highlighted' : 'border-accented'"
              @dragover="onDragOver(`${g.clientId}|new`, g.clientId, $event)" @dragleave="over === `${g.clientId}|new` && (over = null)" @drop.prevent="onDropNew(g)"
              @click="newFor = { clientId: g.clientId, clientName: g.clientName, generalId: g.generalId };"
            ><UIcon name="i-lucide-plus" class="mr-1 inline-block size-3.5 align-[-2px]" />New project</button>
          </div>
        </div>
      </div>
    </UCard>

    <AppDrawer :open="!!newFor" :title="newFor ? `New project for ${newFor.clientName}` : 'New project'" @update:open="(v) => { if (!v) newFor = null }">
      <template #body>
        <ProjectForm v-if="newFor" :clients="[{ id: newFor.clientId, name: newFor.clientName }]" :people="people ?? []" :default-client-id="newFor.clientId" @saved="projectCreated" @cancel="newFor = null" />
      </template>
    </AppDrawer>
  </div>
</template>
