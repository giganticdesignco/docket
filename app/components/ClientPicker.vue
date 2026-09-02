<script setup lang="ts">
// A client select that can make the client on the spot: type a name
// that is not there and pick "Create", and it is saved and selected
// without leaving the form. Needs the manage reference data permission,
// which the same RLS rule checks on insert.
const props = defineProps<{ modelValue?: string, clients: { id: string, name: string }[], placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [id: string | undefined], created: [client: { id: string, name: string }] }>()
const supabase = useSupabaseClient()
const toast = useToast()
const { can } = useCurrentUser()

const value = computed({ get: () => props.modelValue, set: v => emit('update:modelValue', v) })
const items = computed(() => props.clients.map(c => ({ label: c.name, value: c.id })))
const creating = ref(false)
async function create(label: string) {
  const name = label.trim()
  if (!name) return
  const existing = props.clients.find(c => c.name.toLowerCase() === name.toLowerCase())
  if (existing) { value.value = existing.id; return }
  creating.value = true
  const { data, error } = await supabase.from('clients').insert({ name }).select('id, name').single()
  creating.value = false
  if (error) { toast.add({ title: 'Could not add the client', description: error.code === '42501' ? 'You need the manage reference data permission.' : error.message, color: 'error' }); return }
  emit('created', data)
  value.value = data.id
  toast.add({ title: 'Client added', description: data.name, color: 'success', duration: 2500 })
}
</script>

<template>
  <USelectMenu
    v-model="value"
    :items="items"
    value-key="value"
    class="w-full"
    :placeholder="placeholder ?? 'Pick a client'"
    :create-item="can('manage_reference')"
    :loading="creating"
    @create="create"
  >
    <template #create-item-label="{ item }">Create client "{{ item }}"</template>
  </USelectMenu>
</template>
