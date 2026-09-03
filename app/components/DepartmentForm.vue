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
  is_active: props.department?.is_active ?? true,
})
const saving = ref(false)

function validate(s: typeof state) {
  return s.name.trim() ? [] : [{ name: 'name', message: 'Name is required' }]
}

async function onSubmit(_e: FormSubmitEvent<typeof state>) {
  saving.value = true
  const values = { name: state.name.trim(), is_active: state.is_active }
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
    <UFormField name="is_active">
      <USwitch v-model="state.is_active" label="Active" />
    </UFormField>
    <div class="flex justify-end gap-2">
      <UButton variant="ghost" color="neutral" @click="emit('cancel')">Cancel</UButton>
      <UButton type="submit" :loading="saving">{{ department ? 'Save' : 'Create department' }}</UButton>
    </div>
  </UForm>
</template>
