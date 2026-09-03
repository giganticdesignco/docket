<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'
import { BILLING_METHODS, type BillingMethod } from '~~/shared/types/app'
import type { FormSubmitEvent } from '@nuxt/ui'

// Create or edit a project. Admin only (see ClientForm).
const props = defineProps<{
  project?: Tables<'projects'>
  clients: Pick<Tables<'clients'>, 'id' | 'name'>[]
  people: Pick<Tables<'profiles'>, 'id' | 'full_name'>[]
  defaultClientId?: string
}>()
const emit = defineEmits<{ saved: [project: Tables<'projects'>]; cancel: [] }>()

const supabase = useSupabaseClient()
const toast = useToast()

const LEAD_NONE = '__none__'
const state = reactive({
  client_id: props.project?.client_id ?? props.defaultClientId ?? undefined as string | undefined,
  name: props.project?.name ?? '',
  code: props.project?.code ?? '',
  billing_method: (props.project?.billing_method ?? 'hourly') as BillingMethod,
  hourly_rate: props.project?.hourly_rate ?? undefined,
  budget_hours: props.project?.budget_hours ?? undefined,
  budget_amount: props.project?.budget_amount ?? undefined,
  server_path: props.project?.server_path ?? '',
  client_visible: props.project?.client_visible ?? false,
  is_active: props.project?.is_active ?? true,
  lead_id: props.project?.lead_id ?? LEAD_NONE,
  department_id: props.project?.department_id ?? LEAD_NONE,
})
// Departments label the project for the list's filter. Active ones,
// plus whichever this project already has.
const { data: departments } = await useAsyncData('departments-for-form', async () => {
  const { data, error } = await supabase.from('departments').select('id, name, is_active').order('name')
  if (error) throw error
  return data
}, fresh)
const departmentOptions = computed(() => [
  { label: 'None', value: LEAD_NONE },
  ...(departments.value ?? []).filter(d => d.is_active || d.id === props.project?.department_id).map(d => ({ label: d.name, value: d.id })),
])
const leadOptions = computed(() => [{ label: 'Nobody yet', value: LEAD_NONE }, ...props.people.map(p => ({ label: p.full_name, value: p.id }))])
const saving = ref(false)
// Clients made from the picker join the list the parent handed us.
const extraClients = ref<{ id: string, name: string }[]>([])
const allClients = computed(() => [...props.clients, ...extraClients.value])

// New projects can start from a project template: its tasks are made
// once the project exists. Loaded only when creating.
const { data: templates } = await useAsyncData('project-templates-for-form', async () => {
  if (props.project) return []
  const { data, error } = await supabase.from('project_templates').select('id, name, description, project_template_items(estimate_hours)').eq('is_active', true).order('position').order('name')
  if (error) throw error
  return data
}, fresh)
const templateId = ref(LEAD_NONE)
const templateOptions = computed(() => [{ label: 'Start empty', value: LEAD_NONE }, ...(templates.value ?? []).map(t => ({ label: `${t.name} (${t.project_template_items.length} ${t.project_template_items.length === 1 ? 'task' : 'tasks'}, ${formatHours(t.project_template_items.reduce((s, i) => s + (i.estimate_hours ?? 0), 0))})`, value: t.id }))])
const templateNote = computed(() => templates.value?.find(t => t.id === templateId.value)?.description ?? '')

// New projects start with the folder the settings template produces.
// Stops filling in once someone edits the field by hand.
const { data: settings } = await useAsyncData('project-folder-template', async () => {
  const { data } = await supabase.from('invoice_settings').select('project_folder_template').eq('id', true).maybeSingle()
  return data?.project_folder_template ?? ''
}, fresh)
const folderTouched = ref(!!props.project)
// One root per volume (CLIENTS, WEB). Editing a project starts on the
// root its folder already sits under.
const roots = computed(() => folderRoots(settings.value))
const root = ref(
  roots.value.find(r => props.project?.server_path?.startsWith(r.value.replace(/\{.*$/, '')))?.value
  ?? roots.value[0]?.value ?? '',
)

// The folder dialog only tells us the folder's name. It goes under the
// root's client folder, or under whatever directory is already typed.
async function chooseFolder() {
  useFolderName(await pickFolderName())
}
function dropFolder(e: DragEvent) {
  useFolderName(droppedName(e))
}
// In the Mac app a drop carries the real path, so the whole thing goes
// in, mapped from the mounted volume to its smb:// share.
const desktop = useDesktop()
async function dropFolderDesktop(e: Event) {
  const path = (e as CustomEvent<{ paths: string[] }>).detail.paths[0]
  if (!path) return
  state.server_path = await desktop.shareUrl(path)
  folderTouched.value = true
}
function useFolderName(name: string | null) {
  if (!name) return
  const client = allClients.value.find(c => c.id === state.client_id)?.name
  const base = folderBase(root.value, client, state.server_path)
  state.server_path = base ? `${base}/${name}` : name
  folderTouched.value = true
}
watch(() => [state.client_id, state.code, state.name, root.value], () => {
  if (folderTouched.value || !root.value) return
  const client = allClients.value.find(c => c.id === state.client_id)?.name
  state.server_path = fillFolderTemplate(root.value, { client, code: state.code.trim(), name: state.name.trim() })
}, { immediate: true })


function validate(s: typeof state) {
  const errors = []
  if (!s.client_id) errors.push({ name: 'client_id', message: 'Pick a client' })
  if (!s.name.trim()) errors.push({ name: 'name', message: 'Name is required' })
  return errors
}

// Empty number inputs come back as '' or undefined. Store null.
function num(v: unknown): number | null {
  if (v === '' || v === undefined || v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function onSubmit(_e: FormSubmitEvent<typeof state>) {
  saving.value = true
  const values = {
    client_id: state.client_id!,
    name: state.name.trim(),
    code: state.code.trim() || null,
    billing_method: state.billing_method,
    hourly_rate: num(state.hourly_rate),
    budget_hours: num(state.budget_hours),
    budget_amount: num(state.budget_amount),
    server_path: state.server_path.trim() || null,
    client_visible: state.client_visible,
    is_active: state.is_active,
    lead_id: state.lead_id === LEAD_NONE ? null : state.lead_id,
    department_id: state.department_id === LEAD_NONE ? null : state.department_id,
  }
  const query = props.project
    ? supabase.from('projects').update(values).eq('id', props.project.id)
    : supabase.from('projects').insert(values)
  const { data, error } = await query.select().single()
  saving.value = false
  if (error) {
    const description = error.code === '23505' ? 'That client already has a project with this name.' : error.message
    toast.add({ title: 'Could not save project', description, color: 'error' })
    return
  }
  if (!props.project && templateId.value !== LEAD_NONE) {
    const { data: made, error: tplErr } = await supabase.rpc('apply_project_template', { p_project_id: data.id, p_template_id: templateId.value })
    if (tplErr) toast.add({ title: 'Project made, but the template did not apply', description: tplErr.message, color: 'warning' })
    else toast.add({ title: `${made} ${made === 1 ? 'task' : 'tasks'} added from the template`, color: 'success', duration: 3000 })
  }
  emit('saved', data)
}
</script>

<template>
  <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
    <UFormField label="Client" name="client_id" required>
      <ClientPicker v-model="state.client_id" :clients="allClients" @created="c => extraClients.push(c)" />
    </UFormField>
    <UFormField label="Name" name="name" required>
      <UInput v-model="state.name" class="w-full" />
    </UFormField>
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Job code" name="code">
        <UInput v-model="state.code" class="w-full" />
      </UFormField>
      <UFormField label="Billing" name="billing_method">
        <USelect v-model="state.billing_method" :items="BILLING_METHODS" class="w-full" />
      </UFormField>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Lead" name="lead_id" help="Who owns this project day to day.">
        <USelectMenu v-model="state.lead_id" :items="leadOptions" value-key="value" class="w-full" />
      </UFormField>
      <UFormField label="Department" name="department_id" help="What kind of work it is, for the list's filter.">
        <USelect v-model="state.department_id" :items="departmentOptions" class="w-full" />
      </UFormField>
    </div>
    <div class="grid grid-cols-3 gap-4">
      <UFormField label="Hourly rate" name="hourly_rate">
        <UInput v-model="state.hourly_rate" type="number" step="0.01" min="0" class="w-full" placeholder="Person's rate" />
      </UFormField>
      <UFormField label="Budget hours" name="budget_hours">
        <UInput v-model="state.budget_hours" type="number" step="0.25" min="0" class="w-full" />
      </UFormField>
      <UFormField label="Budget amount" name="budget_amount">
        <UInput v-model="state.budget_amount" type="number" step="0.01" min="0" class="w-full" />
      </UFormField>
    </div>
    <UFormField v-if="!project && templates?.length" label="Start from" name="template" :help="templateNote || 'A template adds its tasks, with their hours, once the project is made.'">
      <USelect v-model="templateId" :items="templateOptions" class="w-full" />
    </UFormField>
    <SimilarProjects v-if="!project" :name="state.name" :client-name="allClients.find(c => c.id === state.client_id)?.name" @use="(h, a) => { state.budget_hours = h; if (a != null) state.budget_amount = a }" />
    <UFormField label="Server folder" name="server_path" help="Where this project's files live on the office server. New task file links start here.">
      <div class="flex gap-2" @dragover.prevent @drop.prevent="dropFolder" @desktop-drop="dropFolderDesktop">
        <USelect v-if="roots.length > 1" v-model="root" :items="roots" class="w-36 shrink-0" aria-label="Volume" />
        <UInput v-model="state.server_path" class="w-full" placeholder="smb://server/Jobs/Client/1234 Project, or drop the folder here" @input="folderTouched = true" />
        <UButton variant="outline" color="neutral" icon="i-lucide-folder-open" title="Choose the folder. The browser only gives its name, so it goes under the template's path." @click="chooseFolder">Choose</UButton>
      </div>
    </UFormField>
    <UFormField name="client_visible" help="On the client portal, every task on this project is listed read-only. Off, only tasks shared for review appear.">
      <USwitch v-model="state.client_visible" label="Visible to client" />
    </UFormField>
    <UFormField name="is_active">
      <USwitch v-model="state.is_active" label="Active" />
    </UFormField>
    <div class="flex justify-end gap-2">
      <UButton variant="ghost" color="neutral" @click="emit('cancel')">Cancel</UButton>
      <UButton type="submit" :loading="saving">{{ project ? 'Save' : 'Create project' }}</UButton>
    </div>
  </UForm>
</template>
