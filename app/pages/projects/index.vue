<script setup lang="ts">
import { BILLING_METHODS } from '~~/shared/types/database'

useHead({ title: 'Projects' })
const supabase = useSupabaseClient()
const { isAdmin } = useCurrentUser()

const showInactive = ref(false)
const clientFilter = ref<string | undefined>()
const creating = ref(false)

const { data: clients } = await useAsyncData('clients-for-projects', async () => {
  const { data, error } = await supabase.from('clients').select('id, name').order('name')
  if (error) throw error
  return data
}, fresh)

const { data: projects, refresh } = await useAsyncData('projects', async () => {
  const { data, error } = await supabase
    .from('projects')
    .select('*, clients(name)')
    .order('name')
  if (error) throw error
  return data
}, fresh)

const rows = computed(() =>
  (projects.value ?? []).filter(p =>
    (showInactive.value || p.is_active)
    && (!clientFilter.value || p.client_id === clientFilter.value),
  ),
)

const clientOptions = computed(() => [
  { label: 'All clients', value: undefined },
  ...(clients.value ?? []).map(c => ({ label: c.name, value: c.id })),
])

const billingLabel = (v: string) => BILLING_METHODS.find(b => b.value === v)?.label ?? v
const money = (n: number | null) => (n == null ? '' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-4">
      <h1 class="text-2xl font-semibold">Projects</h1>
      <USelectMenu v-model="clientFilter" :items="clientOptions" value-key="value" class="ml-auto w-56" placeholder="All clients" />
      <USwitch v-model="showInactive" label="Show inactive" size="sm" />
      <UButton v-if="isAdmin" icon="i-lucide-plus" @click="creating = true;">New project</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Project</th>
            <th class="px-4 py-2 font-medium">Client</th>
            <th class="px-4 py-2 font-medium">Code</th>
            <th class="px-4 py-2 font-medium">Billing</th>
            <th class="px-4 py-2 font-medium text-right">Rate</th>
            <th class="px-4 py-2 font-medium text-right">Budget hrs</th>
            <th class="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in rows" :key="p.id" class="border-b border-default last:border-0">
            <td class="px-4 py-2"><NuxtLink :to="`/projects/${p.id}`" class="font-medium hover:underline">{{ p.name }}</NuxtLink></td>
            <td class="px-4 py-2"><NuxtLink :to="`/clients/${p.client_id}`" class="hover:underline">{{ p.clients?.name }}</NuxtLink></td>
            <td class="px-4 py-2 text-muted">{{ p.code }}</td>
            <td class="px-4 py-2">{{ billingLabel(p.billing_method) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ money(p.hourly_rate) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ p.budget_hours ?? '' }}</td>
            <td class="px-4 py-2">
              <UBadge :color="p.is_active ? 'success' : 'neutral'" variant="subtle" size="sm">{{ p.is_active ? 'Active' : 'Inactive' }}</UBadge>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="7" class="px-4 py-8 text-center text-muted">No projects match.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <UModal v-model:open="creating" title="New project">
      <template #body>
        <ProjectForm :clients="clients ?? []" @saved="creating = false; refresh()" @cancel="creating = false" />
      </template>
    </UModal>
  </div>
</template>
