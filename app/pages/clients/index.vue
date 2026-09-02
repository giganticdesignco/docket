<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'

useHead({ title: 'Clients' })
const supabase = useSupabaseClient()
const { isAdmin } = useCurrentUser()

const showInactive = ref(false)
const creating = ref(false)

const { data: clients, refresh } = await useAsyncData('clients', async () => {
  const { data, error } = await supabase.from('clients').select('*').order('name')
  if (error) throw error
  return data
}, fresh)

const { data: projectCounts } = await useAsyncData('client-project-counts', async () => {
  const { data, error } = await supabase.from('projects').select('client_id').eq('is_active', true)
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const p of data) counts[p.client_id] = (counts[p.client_id] ?? 0) + 1
  return counts
}, fresh)

const rows = computed(() =>
  (clients.value ?? []).filter(c => showInactive.value || c.is_active),
)

function onSaved(_c: Tables<'clients'>) {
  creating.value = false
  refresh()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-4">
      <h1 class="text-2xl font-semibold">Clients</h1>
      <USwitch v-model="showInactive" label="Show inactive" size="sm" class="ml-auto" />
      <UButton v-if="isAdmin" icon="i-lucide-plus" @click="creating = true;">New client</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Name</th>
            <th class="px-4 py-2 font-medium">Active projects</th>
            <th class="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in rows" :key="c.id" class="border-b border-default last:border-0">
            <td class="px-4 py-2">
              <NuxtLink :to="`/clients/${c.id}`" class="font-medium hover:underline">{{ c.name }}</NuxtLink>
            </td>
            <td class="px-4 py-2">{{ projectCounts?.[c.id] ?? 0 }}</td>
            <td class="px-4 py-2">
              <UBadge :color="c.is_active ? 'success' : 'neutral'" variant="subtle" size="sm">
                {{ c.is_active ? 'Active' : 'Inactive' }}
              </UBadge>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="3" class="px-4 py-8 text-center text-muted">No clients yet.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <UModal v-model:open="creating" title="New client">
      <template #body>
        <ClientForm @saved="onSaved" @cancel="creating = false" />
      </template>
    </UModal>
  </div>
</template>
