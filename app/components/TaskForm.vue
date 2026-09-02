<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'
import type { FormSubmitEvent } from '@nuxt/ui'

// Create or edit a global task (Design, Dev, QA...). Admin only.
const props = defineProps<{ task?: Tables<'tasks'> }>()
const emit = defineEmits<{ saved: [task: Tables<'tasks'>]; cancel: [] }>()

const supabase = useSupabaseClient()
const toast = useToast()

const state = reactive({
  name: props.task?.name ?? '',
  qbo_item_id: props.task?.qbo_item_id ?? '',
  is_billable_default: props.task?.is_billable_default ?? true,
  is_active: props.task?.is_active ?? true,
})
const saving = ref(false)

function validate(s: typeof state) {
  return s.name.trim() ? [] : [{ name: 'name', message: 'Name is required' }]
}

async function onSubmit(_e: FormSubmitEvent<typeof state>) {
  saving.value = true
  const values = {
    name: state.name.trim(),
    qbo_item_id: state.qbo_item_id.trim() || null,
    is_billable_default: state.is_billable_default,
    is_active: state.is_active,
  }
  const query = props.task
    ? supabase.from('tasks').update(values).eq('id', props.task.id)
    : supabase.from('tasks').insert(values)
  const { data, error } = await query.select().single()
  saving.value = false
  if (error) {
    const description = error.code === '23505' ? 'A task with this name already exists.' : error.message
    toast.add({ title: 'Could not save task', description, color: 'error' })
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
    <UFormField label="QuickBooks service item ID" name="qbo_item_id" hint="Optional, used in step 8">
      <UInput v-model="state.qbo_item_id" class="w-full" />
    </UFormField>
    <UFormField name="is_billable_default">
      <USwitch v-model="state.is_billable_default" label="Billable by default" />
    </UFormField>
    <UFormField name="is_active">
      <USwitch v-model="state.is_active" label="Active" />
    </UFormField>
    <div class="flex justify-end gap-2">
      <UButton variant="ghost" color="neutral" @click="emit('cancel')">Cancel</UButton>
      <UButton type="submit" :loading="saving">{{ task ? 'Save' : 'Create task' }}</UButton>
    </div>
  </UForm>
</template>
