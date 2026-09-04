<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'
import { WORK_PRIORITIES } from '~~/shared/types/app'

type Item = Tables<'work_items'>
type ProjectOption = { id: string, name: string, clients: { name: string } | null }
type Person = { id: string, full_name: string }
const NOBODY = '__nobody__'

// Create or edit a task (work item; TaskForm is the billing task type
// form). Up now is one person or nobody; Also on it is synced as a set
// after the row is saved. A trigger keeps whoever is up in that set.
const props = defineProps<{
  item?: Item & { assigneeIds: string[] }
  projects: ProjectOption[]
  people: Person[]
  defaultProjectId?: string
}>()
const emit = defineEmits<{ saved: [id: string]; cancel: [] }>()

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const ws = await useWorkStatuses()

const state = reactive({
  project_id: (props.item?.project_id ?? props.defaultProjectId) as string | undefined,
  title: props.item?.title ?? '',
  description: props.item?.description ?? '',
  status: props.item?.status ?? (ws.active.value[0]?.key ?? 'new'),
  priority: props.item?.priority ?? 'normal',
  start_on: props.item?.start_on ?? '',
  due_on: props.item?.due_on ?? '',
  estimate_hours: (props.item?.estimate_hours ?? '') as number | string,
  assignee_ids: [...(props.item?.assigneeIds ?? (props.item ? [] : [user.value!.sub]))],
  assignee_id: (props.item ? props.item.assignee_id : user.value!.sub) ?? NOBODY,
})

const NOBODY_LABEL = 'Nobody yet'
const upOptions = computed(() => [{ label: NOBODY_LABEL, value: NOBODY }, ...props.people.map(p => ({ label: p.full_name, value: p.id }))])
const projectOptions = computed(() => props.projects.map(p => ({ label: p.clients ? `${p.clients.name} / ${p.name}` : p.name, value: p.id })))
const peopleOptions = computed(() => props.people.map(p => ({ label: p.full_name, value: p.id })))
const saving = ref(false)

async function save() {
  if (!state.project_id) return fail('Pick a project')
  if (!state.title.trim()) return fail('Give the task a title')
  if (state.start_on && state.due_on && state.due_on < state.start_on) return fail('Due date is before the start date')
  saving.value = true
  try {
    const values = {
      project_id: state.project_id,
      title: state.title.trim(),
      description: state.description.trim() || null,
      status: state.status,
      priority: state.priority,
      start_on: state.start_on || null,
      due_on: state.due_on || null,
      estimate_hours: state.estimate_hours === '' ? null : Number(state.estimate_hours),
      assignee_id: state.assignee_id === NOBODY ? null : state.assignee_id,
    }
    let id = props.item?.id
    if (id) {
      const { error } = await supabase.from('work_items').update(values).eq('id', id)
      if (error) throw error
    } else {
      const { data, error } = await supabase.from('work_items').insert({ ...values, created_by: user.value!.sub }).select('id').single()
      if (error) throw error
      id = data.id
    }
    const before = new Set(props.item?.assigneeIds ?? [])
    const after = new Set(state.assignee_ids)
    const add = [...after].filter(x => !before.has(x))
    const drop = [...before].filter(x => !after.has(x))
    if (drop.length) {
      const { error } = await supabase.from('work_item_assignees').delete().eq('work_item_id', id).in('user_id', drop)
      if (error) throw error
    }
    // Upsert, because work_item_owner_follows has already added the row for
    // whoever is up.
    if (add.length) {
      const { error } = await supabase.from('work_item_assignees').upsert(add.map(user_id => ({ work_item_id: id!, user_id })), { onConflict: 'work_item_id,user_id', ignoreDuplicates: true })
      if (error) throw error
    }
    emit('saved', id)
  } catch (e) {
    fail((e as Error).message)
  } finally {
    saving.value = false
  }
}
function fail(message: string) {
  toast.add({ title: 'Not saved', description: message, color: 'error' })
}
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <UFormField label="Title" class="sm:col-span-2">
      <UInput v-model="state.title" class="w-full" autofocus />
    </UFormField>
    <UFormField label="Project" class="sm:col-span-2">
      <USelectMenu v-model="state.project_id" :items="projectOptions" value-key="value" class="w-full" placeholder="Pick a project" />
    </UFormField>
    <UFormField label="Up now" help="The one person whose turn it is. Only they see it on their own list.">
      <USelectMenu v-model="state.assignee_id" :items="upOptions" value-key="value" class="w-full" />
    </UFormField>
    <UFormField label="Also on it" help="Everyone here gets comments, status changes, and mentions.">
      <USelectMenu v-model="state.assignee_ids" :items="peopleOptions" value-key="value" multiple class="w-full" placeholder="Nobody yet" />
    </UFormField>
    <UFormField label="Status">
      <USelect v-model="state.status" :items="ws.items.value" class="w-full">
        <template #leading><span class="size-2 rounded-full" :class="ws.dot(state.status)" /></template>
      </USelect>
    </UFormField>
    <UFormField label="Priority">
      <USelect v-model="state.priority" :items="[...WORK_PRIORITIES]" class="w-full" />
    </UFormField>
    <UFormField label="Start">
      <UInput v-model="state.start_on" type="date" class="w-full" />
    </UFormField>
    <UFormField label="Due">
      <UInput v-model="state.due_on" type="date" class="w-full" />
    </UFormField>
    <UFormField label="Estimate (hours)" help="Spread across the task's days on Planner for the person up on it.">
      <UInput v-model="state.estimate_hours" type="number" step="0.25" :min="0" class="w-full" />
    </UFormField>
    <UFormField label="Description" class="sm:col-span-2">
      <UTextarea v-model="state.description" :rows="4" class="w-full" />
    </UFormField>
    <div class="flex justify-end gap-2 sm:col-span-2">
      <UButton variant="ghost" color="neutral" @click="emit('cancel')">Cancel</UButton>
      <UButton :loading="saving" @click="save">{{ item ? 'Save' : 'Create task' }}</UButton>
    </div>
  </div>
</template>
