<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'
import type { FormSubmitEvent } from '@nuxt/ui'

// Create or edit a department (Web, Creative/Design...). Admin only.
const props = defineProps<{ department?: Tables<'departments'> }>()
const emit = defineEmits<{ saved: [department: Tables<'departments'>]; cancel: [] }>()

const supabase = useSupabaseClient()
const toast = useToast()

const state = reactive({
  name: props.department?.name ?? '',
  lead_id: props.department?.lead_id ?? undefined as string | undefined,
  is_active: props.department?.is_active ?? true,
})
// Anyone on the team can lead; the lead reviews the department's time.
const { data: people } = await useAsyncData('department-form-people', async () => {
  const { data } = await supabase.from('profiles').select('id, full_name').eq('is_active', true).neq('role', 'client').order('full_name')
  return data ?? []
}, fresh)
const peopleItems = computed(() => [{ label: 'No lead yet', value: undefined as string | undefined }, ...(people.value ?? []).map(p => ({ label: p.full_name, value: p.id }))])
const saving = ref(false)

function validate(s: typeof state) {
  return s.name.trim() ? [] : [{ name: 'name', message: 'Name is required' }]
}

async function onSubmit(_e: FormSubmitEvent<typeof state>) {
  saving.value = true
  const values = { name: state.name.trim(), lead_id: state.lead_id ?? null, is_active: state.is_active }
  const query = props.department
    ? supabase.from('departments').update(values).eq('id', props.department.id)
    : supabase.from('departments').insert(values)
  const { data, error } = await query.select().single()
  saving.value = false
  if (error) {
    const description = error.code === '23505' ? 'A department with this name already exists.' : error.message
    toast.add({ title: 'Could not save department', description, color: 'error' })
    return
  }
  emit('saved', data)
}
</script>

<template>
  <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
    <UFormField label="Name" name="name" required>
      <UInput v-model="state.name" class="w-full" autofocus />
    </UFormField>
    <UFormField label="Lead" name="lead_id" help="Reviews this department's submitted time on Approvals. Their own weeks go to whoever has the approve time permission.">
      <USelectMenu v-model="state.lead_id" :items="peopleItems" value-key="value" class="w-full" placeholder="No lead yet" />
    </UFormField>
    <UFormField name="is_active">
      <USwitch v-model="state.is_active" label="Active" />
    </UFormField>
    <div class="flex justify-end gap-2">
      <UButton variant="ghost" color="neutral" @click="emit('cancel')">Cancel</UButton>
      <UButton type="submit" :loading="saving">{{ department ? 'Save' : 'Create department' }}</UButton>
    </div>
  </UForm>
</template>
