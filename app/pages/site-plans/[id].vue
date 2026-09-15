<script setup lang="ts">
import { cleanPartHours, flattenPages, groupPages, pageParts, typedHours } from '~~/shared/sitePlan'

// One site plan: the page tree on a canvas, saved with Save. Before it is
// on a project it can go onto a quote (priced there). On a project, Make
// tasks for new pages adds a task for each page without one, with a subtask
// for each part the page does not skip. Editing a page never changes its
// task or a quote.
const route = useRoute()
const id = route.params.id as string
const supabase = useSupabaseClient()
const toast = useToast()

const __ad1 = useAsyncData(`site-plan-${id}`, async () => {
  const { data, error } = await supabase.from('site_plans').select('id, name, client_id, project_id, created_at, clients(id, name), projects(id, name)').eq('id', id).single()
  if (error) throw createError({ statusCode: 404, statusMessage: 'Site plan not found' })
  return data
}, fresh)
const __ad2 = useAsyncData(`site-plan-${id}-pages`, async () => {
  const { data, error } = await supabase.from('site_plan_pages').select('id, parent_id, sort_order, title, path, template, template_id, part_hours, work_item_id').eq('plan_id', id).order('sort_order').order('created_at')
  if (error) throw error
  return data
}, fresh)
const __ad3 = useAsyncData(`site-plan-${id}-quotes`, async () => {
  const { data, error } = await supabase.from('quotes').select('id, number, title, status, valid_until').eq('site_plan_id', id).order('created_at', { ascending: false })
  if (error) throw error
  return data
}, fresh)
// Its own key, so it does not share the quote editor's entry, and no rate:
// this screen prices nothing. Retired templates too, so a page on one keeps
// its parts' hours as accept_quote and make_site_plan_tasks give them; the
// canvas offers only active ones. Parts in the template's order.
const __ad4 = useAsyncData('site-plan-page-templates', async () => {
  const { data, error } = await supabase.from('page_templates').select('id, name, color, is_active, page_template_parts(id, name, hours, position)').order('position').order('name')
  if (error) throw error
  return data.map(({ page_template_parts: parts, ...t }) => ({ ...t, parts: [...parts].sort((a, b) => a.position - b.position) }))
}, fresh)
// The linked tasks that are still live. RLS hides deleted ones (and, for
// someone without see_all_tasks, some live ones, so the count can read
// high; make_site_plan_tasks is the authority).
const __ad5 = useAsyncData(`site-plan-${id}-live-tasks`, async () => {
  const { data: linked, error } = await supabase.from('site_plan_pages').select('work_item_id').eq('plan_id', id).not('work_item_id', 'is', null)
  if (error) throw error
  const ids = (linked ?? []).map(p => p.work_item_id).filter((x): x is string => !!x)
  if (!ids.length) return [] as string[]
  const { data, error: wErr } = await supabase.from('work_items').select('id').in('id', ids)
  if (wErr) throw wErr
  return (data ?? []).map(w => w.id)
}, fresh)
const __ad6 = useClientNames()
await Promise.all([__ad1, __ad2, __ad3, __ad4, __ad5, __ad6])
const { data: plan, refresh: refreshPlan } = __ad1
const { data: pages, refresh: refreshPages } = __ad2
const { data: quotes } = __ad3
const { data: templates } = __ad4
const { data: liveTasks, refresh: refreshLive } = __ad5
const { data: clients } = __ad6

useHead({ title: () => plan.value?.name ?? 'Site plan' })
useAssistantScreen(() => ({ client: plan.value?.clients?.name, project: plan.value?.projects?.name }))
const today = todayString()

// ---------- editor ----------

type PageDraft = { id: string, parent_id: string | null, title: string, path: string, template: string, template_id: string | null, part_hours: Record<string, number | string> }
const draftPages = ref<PageDraft[]>([])
const removed = new Set<string>()
const snapshot = ref('')

function loadEditor() {
  draftPages.value = (pages.value ?? []).map(p => ({ id: p.id, parent_id: p.parent_id, title: p.title, path: p.path ?? '', template: p.template ?? '', template_id: p.template_id, part_hours: { ...typedHours(p) } }))
  removed.clear()
  snapshot.value = JSON.stringify(draftPages.value)
}
loadEditor()
watch(pages, loadEditor)
const dirty = computed(() => JSON.stringify(draftPages.value) !== snapshot.value)
function pagesRemoved(ids: string[]) { for (const x of ids) removed.add(x) }

const templateById = computed(() => new Map((templates.value ?? []).map(t => [t.id, t])))
const groups = computed(() => groupPages(draftPages.value, templates.value ?? []))
const linkedIds = computed(() => new Set(liveTasks.value ?? []))
// Counted from saved pages: a page with no task, or whose task is gone.
const missing = computed(() => (plan.value?.project_id ? (pages.value ?? []).filter(p => !p.work_item_id || !linkedIds.value.has(p.work_item_id)).length : 0))
const clientLocked = computed(() => !!plan.value?.project_id || (quotes.value?.length ?? 0) > 0)

const saving = ref(false)
async function save(): Promise<boolean> {
  if (draftPages.value.some(p => !p.title.trim())) return fail('Every page needs a title')
  // The database takes 0 to 9999 hours a part; say so instead of dropping or failing on a typed value.
  if (draftPages.value.some(p => pageParts(p, templateById.value).some(({ part }) => { const v = p.part_hours[part.id]; return v !== undefined && v !== '' && !(Number(v) >= 0 && Number(v) <= 9999) }))) return fail('Part hours go from 0 to 9999')
  saving.value = true
  try {
    if (draftPages.value.length) {
      // Parents before children, so a new child never points at an unsaved
      // parent. work_item_id is never sent, so the upsert leaves it alone.
      // Upsert before the delete: a page moved out from under a removed
      // page must point at its new parent before the cascade runs.
      const { error } = await supabase.from('site_plan_pages').upsert(flattenPages(draftPages.value).map(({ page: p }, i) => ({
        id: p.id, plan_id: id, parent_id: p.parent_id, sort_order: i + 1,
        title: p.title.trim(), path: p.path.trim() || null, template: p.template.trim() || null,
        template_id: p.template_id, part_hours: cleanPartHours(p, templateById.value),
      })), { onConflict: 'id' })
      if (error) throw error
    }
    if (removed.size) {
      const { error } = await supabase.from('site_plan_pages').delete().in('id', [...removed])
      if (error) throw error
    }
    await Promise.all([refreshPages(), refreshLive()])
    toast.add({ title: 'Site plan saved', color: 'success' })
    return true
  } catch (e) {
    return fail((e as Error).message)
  } finally {
    saving.value = false
  }
}
function fail(message: string) {
  toast.add({ title: 'Not saved', description: message, color: 'error' })
  return false
}

// ---------- make tasks for new pages ----------

const makeOpen = ref(false)
const making = ref(false)
const plural = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`
async function openMake() {
  if (dirty.value && !(await save())) return
  await refreshLive()
  if (missing.value === 0) {
    toast.add({ title: 'Every page already has a task.', color: 'success' })
    return
  }
  makeOpen.value = true
}
async function makeTasks() {
  making.value = true
  try {
    const { data, error } = await supabase.rpc('make_site_plan_tasks', { p_plan_id: id })
    if (error) throw error
    const n = data ?? 0
    makeOpen.value = false
    toast.add({ title: `${plural(n)} made on ${plan.value?.projects?.name ?? 'the project'}`, description: 'Each has its parts as subtasks. Check who is up on the project.', color: 'success' })
    await Promise.all([refreshPages(), refreshLive()])
  } catch (e) {
    toast.add({ title: 'Could not make the tasks', description: (e as Error).message, color: 'error' })
  } finally {
    making.value = false
  }
}

// ---------- add to a quote ----------

const addOpen = ref(false)
const adding = ref(false)
const openQuotes = ref<{ id: string, number: string, title: string, status: string }[]>([])
const target = ref<string | undefined>()
const newTitle = ref('')
const quoteOptions = computed(() => [
  ...openQuotes.value.map(q => ({ label: `${q.number} ${q.title} (${q.status === 'draft' ? 'Draft' : 'Sent'})`, value: q.id })),
  { label: 'New quote', value: '__new__' },
])
async function openAddToQuote() {
  if (!plan.value) return
  const { data, error } = await supabase.from('quotes').select('id, number, title, status').eq('client_id', plan.value.client_id).in('status', ['draft', 'sent']).is('site_plan_id', null).order('created_at', { ascending: false })
  if (error) {
    toast.add({ title: 'Could not add to the quote', description: error.message, color: 'error' })
    return
  }
  openQuotes.value = data ?? []
  target.value = openQuotes.value.length ? undefined : '__new__'
  newTitle.value = plan.value.name
  addOpen.value = true
}
async function addToQuote() {
  if (!plan.value || !target.value) return
  adding.value = true
  try {
    if (dirty.value && !(await save())) return
    let quoteId = target.value
    if (quoteId === '__new__') {
      const { data, error } = await supabase.rpc('create_quote', { p_client_id: plan.value.client_id, p_title: newTitle.value.trim() })
      if (error) throw error
      quoteId = data
    }
    const { error } = await supabase.from('quotes').update({ site_plan_id: id, updated_at: new Date().toISOString() }).eq('id', quoteId)
    if (error) throw error
    toast.add({ title: 'Site plan added to the quote', description: 'Price the plan there to write the scope lines.', color: 'success' })
    addOpen.value = false
    await navigateTo(`/quotes/${quoteId}`)
  } catch (e) {
    toast.add({ title: 'Could not add to the quote', description: (e as Error).message, color: 'error' })
  } finally {
    adding.value = false
  }
}

// ---------- edit ----------

const editOpen = ref(false)
const editing = ref(false)
const editName = ref('')
const editClientId = ref<string | undefined>()
function openEdit() {
  editName.value = plan.value?.name ?? ''
  editClientId.value = plan.value?.client_id
  editOpen.value = true
}
async function saveEdit() {
  if (!editName.value.trim()) return
  editing.value = true
  const { error } = await supabase.from('site_plans').update({
    name: editName.value.trim(), ...(clientLocked.value || !editClientId.value ? {} : { client_id: editClientId.value }),
  }).eq('id', id)
  editing.value = false
  if (error) { fail(error.message); return }
  editOpen.value = false
  await refreshPlan()
  toast.add({ title: 'Site plan updated', color: 'success' })
}

// ---------- delete ----------

const deleting = ref(false)
const deleteBusy = ref(false)
async function deletePlan() {
  deleteBusy.value = true
  const { error } = await supabase.from('site_plans').delete().eq('id', id)
  deleteBusy.value = false
  if (error) {
    toast.add({ title: 'Could not delete the site plan', description: error.message, color: 'error' })
    return
  }
  deleting.value = false
  toast.add({ title: 'Site plan deleted', color: 'success' })
  await navigateTo('/site-plans')
}
</script>

<template>
  <div v-if="plan" class="space-y-6">
    <AppCrumbs :items="[{ label: 'Site plans', to: '/site-plans' }]" class="mb-3" />
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-semibold">{{ plan.name }}</h1>
      <PageActions
        class="ml-auto"
        :primary="{ label: 'Save', icon: 'i-lucide-save', loading: saving, disabled: !dirty, onSelect: save }"
        :items="[
          { label: 'Make tasks for new pages', icon: 'i-lucide-list-plus', show: !!plan.project_id, onSelect: openMake },
          { label: 'Add to a quote', icon: 'i-lucide-file-signature', show: !plan.project_id, onSelect: openAddToQuote },
          { label: 'Edit site plan', icon: 'i-lucide-pencil', onSelect: openEdit },
        ]"
        :more="[
          { label: 'Delete site plan', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { deleting = true } },
        ]"
      />
    </div>

    <div class="space-y-1">
      <p class="text-sm text-muted">
        <NuxtLink :to="`/clients/${plan.client_id}`" class="hover:underline">{{ plan.clients?.name }}</NuxtLink>
        <template v-if="plan.projects">. On <NuxtLink :to="`/projects/${plan.projects.id}`" class="hover:underline">{{ plan.projects.name }}</NuxtLink></template>
        <template v-if="quotes?.length">. Quotes: <template v-for="(q, i) in quotes" :key="q.id"><template v-if="i">, </template><NuxtLink :to="`/quotes/${q.id}`" class="tabular-nums hover:underline">{{ q.number }}</NuxtLink> ({{ quoteBadge(q, today).label }})</template></template>
      </p>
      <p v-if="plan.project_id && pages?.length" class="text-sm">
        <template v-if="missing > 0">{{ missing }} of {{ pages?.length ?? 0 }} pages have no task yet.</template>
        <template v-else>Every page has a task.</template>
      </p>
    </div>

    <UCard :ui="{ body: 'p-2 sm:p-4' }">
      <SitemapCanvas :nodes="draftPages" :templates="templates ?? []" :editable="true" @removed="pagesRemoved" />
      <div v-if="draftPages.length" class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span v-for="g in groups" :key="g.template?.id ?? 'none'">
          <span class="font-medium text-default">{{ g.pages.length }}</span> {{ g.template?.name ?? 'untyped' }}, {{ formatHours(g.hours) }}
        </span>
        <span v-if="plan.project_id" class="ml-auto">Editing or removing a page does not change its task.</span>
        <span v-else class="ml-auto">Draft and sent quotes show these pages as saved. A quote keeps its own copy once it is accepted.</span>
      </div>
    </UCard>
    <p v-if="dirty" class="text-sm text-warning">Unsaved changes. Quotes and Make tasks use the saved version.</p>

    <UModal v-model:open="makeOpen" title="Make tasks for new pages?">
      <template #body>
        <p class="text-sm">{{ plural(missing) }} on {{ plan.projects?.name }}, one for each page with no task yet. Each gets a subtask for every part the page does not skip, with that part's hours as its estimate, up to the person on the accepted quote's line for that part. Each of those people gets one notification, not one per subtask. Where there is no such person, nobody is up.</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="makeOpen = false;">Cancel</UButton>
          <UButton :loading="making" @click="makeTasks">Make {{ plural(missing) }}</UButton>
        </div>
      </template>
    </UModal>

    <AppDrawer v-model:open="addOpen" title="Add to a quote" :description="`Put this plan on a draft or sent quote for ${plan.clients?.name ?? 'this client'}, or start a new quote. Price it on the quote.`">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Quote">
            <USelectMenu v-model="target" :items="quoteOptions" value-key="value" class="w-full" placeholder="Pick a quote" />
          </UFormField>
          <UFormField v-if="target === '__new__'" label="Title" help="Becomes the project name when accepted.">
            <UInput v-model="newTitle" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="addOpen = false;">Cancel</UButton>
          <UButton :loading="adding" :disabled="!target || (target === '__new__' && !newTitle.trim())" @click="addToQuote">Add to quote</UButton>
        </div>
      </template>
    </AppDrawer>

    <AppDrawer v-model:open="editOpen" title="Edit site plan">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name">
            <UInput v-model="editName" class="w-full" />
          </UFormField>
          <UFormField v-if="!clientLocked" label="Client">
            <ClientPicker v-model="editClientId" :clients="clients ?? []" @created="c => clients?.push(c)" />
          </UFormField>
          <UFormField v-else label="Client" help="The client is fixed once a quote uses this plan or it is on a project.">
            <p class="text-sm">{{ plan.clients?.name }}</p>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="editOpen = false;">Cancel</UButton>
          <UButton :loading="editing" :disabled="!editName.trim()" @click="saveEdit">Save</UButton>
        </div>
      </template>
    </AppDrawer>

    <UModal v-model:open="deleting" title="Delete this site plan?">
      <template #body>
        <p class="text-sm">Its pages go with it. Quotes that use it lose the link, and an accepted quote keeps the pages it was accepted with. Tasks made from it stay on the project.</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deleting = false;">Cancel</UButton>
          <UButton color="error" :loading="deleteBusy" @click="deletePlan">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
