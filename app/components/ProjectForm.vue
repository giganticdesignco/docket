<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'
import { BILLING_METHODS, type BillingMethod } from '~~/shared/types/app'
import type { FormSubmitEvent } from '@nuxt/ui'

// Create or edit a project. Admin only (see ClientForm).
const props = defineProps<{
  project?: Tables<'projects'>
  clients: Pick<Tables<'clients'>, 'id' | 'name'>[]
  defaultClientId?: string
}>()
const emit = defineEmits<{ saved: [project: Tables<'projects'>]; cancel: [] }>()

const supabase = useSupabaseClient()
const toast = useToast()

const state = reactive({
  client_id: props.project?.client_id ?? props.defaultClientId ?? undefined as string | undefined,
  name: props.project?.name ?? '',
  code: props.project?.code ?? '',
  billing_method: (props.project?.billing_method ?? 'hourly') as BillingMethod,
  hourly_rate: props.project?.hourly_rate ?? undefined,
  budget_hours: props.project?.budget_hours ?? undefined,
  budget_amount: props.project?.budget_amount ?? undefined,
  server_path: props.project?.server_path ?? '',
  is_active: props.project?.is_active ?? true,
})
const saving = ref(false)

// New projects start with the folder the settings template produces.
// Stops filling in once someone edits the field by hand.
const { data: settings } = await useAsyncData('project-folder-template', async () => {
  const { data } = await supabase.from('invoice_settings').select('project_folder_template').eq('id', true).maybeSingle()
  return data?.project_folder_template ?? ''
}, fresh)
const folderTouched = ref(!!props.project)

// The folder dialog only tells us the folder's name. It goes under the
// template's directory, or under whatever directory is already typed.
async function chooseFolder() {
  useFolderName(await pickFolderName())
}
function dropFolder(e: DragEvent) {
  useFolderName(droppedName(e))
}
function useFolderName(name: string | null) {
  if (!name) return
  const client = props.clients.find(c => c.id === state.client_id)?.name
  const fromTemplate = settings.value ? fillFolderTemplate(settings.value, { client }).replace(/\/[^/]*$/, '') : ''
  const typed = state.server_path.trim().replace(/\/+$/, '')
  const base = fromTemplate || (typed.includes('/') ? typed.replace(/\/[^/]*$/, '') : '')
  state.server_path = base ? `${base}/${name}` : name
  folderTouched.value = true
}
watch(() => [state.client_id, state.code, state.name], () => {
  if (folderTouched.value || !settings.value) return
  const client = props.clients.find(c => c.id === state.client_id)?.name
  state.server_path = fillFolderTemplate(settings.value, { client, code: state.code.trim(), name: state.name.trim() })
}, { immediate: true })

const clientOptions = computed(() => props.clients.map(c => ({ label: c.name, value: c.id })))

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
    is_active: state.is_active,
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
  emit('saved', data)
}
</script>

<template>
  <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
    <UFormField label="Client" name="client_id" required>
      <USelectMenu v-model="state.client_id" :items="clientOptions" value-key="value" class="w-full" placeholder="Pick a client" />
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
    <div class="grid grid-cols-3 gap-4">
      <UFormField label="Hourly rate" name="hourly_rate" hint="Overrides user default">
        <UInput v-model="state.hourly_rate" type="number" step="0.01" min="0" class="w-full" />
      </UFormField>
      <UFormField label="Budget hours" name="budget_hours">
        <UInput v-model="state.budget_hours" type="number" step="0.25" min="0" class="w-full" />
      </UFormField>
      <UFormField label="Budget amount" name="budget_amount">
        <UInput v-model="state.budget_amount" type="number" step="0.01" min="0" class="w-full" />
      </UFormField>
    </div>
    <UFormField label="Server folder" name="server_path" help="Where this project's files live on the office server. New task file links start here.">
      <div class="flex gap-2" @dragover.prevent @drop.prevent="dropFolder">
        <UInput v-model="state.server_path" class="w-full" placeholder="smb://server/Jobs/Client/1234 Project, or drop the folder here" @input="folderTouched = true" />
        <UButton variant="outline" color="neutral" icon="i-lucide-folder-open" title="Choose the folder. The browser only gives its name, so it goes under the template's path." @click="chooseFolder">Choose</UButton>
      </div>
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
