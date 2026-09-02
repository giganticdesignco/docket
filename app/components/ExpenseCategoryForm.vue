<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'
import type { FormSubmitEvent } from '@nuxt/ui'

// Create or edit an expense category (Meals, Printing...). Admin only.
const props = defineProps<{ category?: Tables<'expense_categories'> }>()
const emit = defineEmits<{ saved: [category: Tables<'expense_categories'>]; cancel: [] }>()

const supabase = useSupabaseClient()
const toast = useToast()

const state = reactive({
  name: props.category?.name ?? '',
  is_active: props.category?.is_active ?? true,
})
const saving = ref(false)

function validate(s: typeof state) {
  return s.name.trim() ? [] : [{ name: 'name', message: 'Name is required' }]
}

async function onSubmit(_e: FormSubmitEvent<typeof state>) {
  saving.value = true
  const values = { name: state.name.trim(), is_active: state.is_active }
  const query = props.category
    ? supabase.from('expense_categories').update(values).eq('id', props.category.id)
    : supabase.from('expense_categories').insert(values)
  const { data, error } = await query.select().single()
  saving.value = false
  if (error) {
    const description = error.code === '23505' ? 'A category with this name already exists.' : error.message
    toast.add({ title: 'Could not save category', description, color: 'error' })
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
      <UButton type="submit" :loading="saving">{{ category ? 'Save' : 'Create category' }}</UButton>
    </div>
  </UForm>
</template>
