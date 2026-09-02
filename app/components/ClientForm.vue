<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'
import type { FormSubmitEvent } from '@nuxt/ui'

// Create or edit a client. Admin only: RLS rejects anyone else, and the
// pages only render this for admins.
const props = defineProps<{ client?: Tables<'clients'> }>()
const emit = defineEmits<{ saved: [client: Tables<'clients'>]; cancel: [] }>()

const supabase = useSupabaseClient()
const toast = useToast()

const state = reactive({
  name: props.client?.name ?? '',
  qbo_customer_id: props.client?.qbo_customer_id ?? '',
  is_active: props.client?.is_active ?? true,
})
const saving = ref(false)

function validate(s: typeof state) {
  return s.name.trim() ? [] : [{ name: 'name', message: 'Name is required' }]
}

async function onSubmit(_e: FormSubmitEvent<typeof state>) {
  saving.value = true
  const values = {
    name: state.name.trim(),
    qbo_customer_id: state.qbo_customer_id.trim() || null,
    is_active: state.is_active,
  }
  const query = props.client
    ? supabase.from('clients').update(values).eq('id', props.client.id)
    : supabase.from('clients').insert(values)
  const { data, error } = await query.select().single()
  saving.value = false
  if (error) {
    toast.add({ title: 'Could not save client', description: error.message, color: 'error' })
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
    <UFormField label="QuickBooks customer ID" name="qbo_customer_id" hint="Optional, used in step 8">
      <UInput v-model="state.qbo_customer_id" class="w-full" />
    </UFormField>
    <UFormField name="is_active">
      <USwitch v-model="state.is_active" label="Active" />
    </UFormField>
    <div class="flex justify-end gap-2">
      <UButton variant="ghost" color="neutral" @click="emit('cancel')">Cancel</UButton>
      <UButton type="submit" :loading="saving">{{ client ? 'Save' : 'Create client' }}</UButton>
    </div>
  </UForm>
</template>
