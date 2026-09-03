<script setup lang="ts">
import { BILLING_METHODS } from '~~/shared/types/app'

useHead({ title: 'Projects' })
const supabase = useSupabaseClient()
const { can } = useCurrentUser()
const isAdmin = computed(() => can('manage_reference'))

const showInactive = ref(false)
const clientFilter = ref<string | undefined>()
const departmentFilter = ref<string | undefined>()
const creating = ref(false)

const __ad1 = useAsyncData('clients-for-projects', async () => {
  const { data, error } = await supabase.from('clients').select('id, name').order('name')
  if (error) throw error
  return data
}, fresh)

const __ad2 = useAsyncData('projects', async () => {
  const { data, error } = await supabase
    .from('projects')
    .select('*, clients(name), departments(name)')
    .order('name')
  if (error) throw error
  return data
}, fresh)

// Burn for every project in one call (security definer, totals only).
const __ad3 = useAsyncData('project-budgets', async () => {
  const { data, error } = await supabase.rpc('project_budgets')
  if (error) throw error
  return data
}, fresh)
const __ad4 = useAsyncData('people-for-tasks', async () => {
  const { data, error } = await supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
  if (error) throw error
  return data
}, fresh)
const __ad5 = useAsyncData('departments-for-projects', async () => {
  const { data, error } = await supabase.from('departments').select('id, name').eq('is_active', true).order('name')
  if (error) throw error
  return data
}, fresh)
await Promise.all([__ad1, __ad2, __ad3, __ad4, __ad5])
const { data: clients } = __ad1
const { data: projects, refresh } = __ad2
const { data: burn } = __ad3
const { data: people } = __ad4
const { data: departments } = __ad5
const departmentOptions = computed(() => [
  { label: 'All departments', value: undefined },
  ...(departments.value ?? []).map(d => ({ label: d.name, value: d.id })),
])
const burnById = computed(() => new Map((burn.value ?? []).map(b => [b.project_id, b])))

// Percent of the budget used: by hours when the project has an hours
// budget, otherwise by billable amount. Null when there is no budget.
function usedPct(p: { id: string, budget_hours: number | null, budget_amount: number | null }): number | null {
  const b = burnById.value.get(p.id)
  if (!b) return null
  if (p.budget_hours) return b.hours_used / p.budget_hours * 100
  if (p.budget_amount) return b.amount_used / p.budget_amount * 100
  return null
}
const burnColor = (pct: number) => (pct >= 100 ? 'error' : pct >= 80 ? 'warning' : 'primary')

const rows = computed(() =>
  (projects.value ?? [])
    .filter(p =>
      (showInactive.value || p.is_active)
      && (!clientFilter.value || p.client_id === clientFilter.value)
      && (!departmentFilter.value || p.department_id === departmentFilter.value),
    )
    .map(p => ({ ...p, pct: usedPct(p) })),
)

const clientOptions = computed(() => [
  { label: 'All clients', value: undefined },
  ...(clients.value ?? []).map(c => ({ label: c.name, value: c.id })),
])

const billingLabel = (v: string) => BILLING_METHODS.find(b => b.value === v)?.label ?? v
const money = (n: number | null) => (n == null ? '' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)
// Harvest budgets are either hours or dollars per project, rarely both.
const budget = (p: { budget_hours: number | null, budget_amount: number | null }) =>
  p.budget_hours != null ? `${p.budget_hours.toLocaleString()} h` : p.budget_amount != null ? money(p.budget_amount) : ''
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-4">
      <h1 class="text-2xl font-semibold">Projects</h1>
      <USelectMenu v-model="clientFilter" :items="clientOptions" value-key="value" class="ml-auto w-56" placeholder="All clients" />
      <USelectMenu v-if="departments?.length" v-model="departmentFilter" :items="departmentOptions" value-key="value" class="w-44" placeholder="All departments" />
      <USwitch v-model="showInactive" label="Show inactive" size="sm" />
      <UButton v-if="isAdmin" icon="i-lucide-plus" @click="creating = true;">New project</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Project</th>
            <th class="px-4 py-2 font-medium">Client</th>
            <th class="px-4 py-2 font-medium">Department</th>
            <th class="px-4 py-2 font-medium">Code</th>
            <th class="px-4 py-2 font-medium">Billing</th>
            <th class="px-4 py-2 font-medium text-right">Budget</th>
            <th class="px-4 py-2 font-medium">Remaining</th>
            <th class="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in rows" :key="p.id" class="border-b border-default last:border-0">
            <td class="px-4 py-2"><NuxtLink :to="`/projects/${p.id}`" class="font-medium hover:underline">{{ p.name }}</NuxtLink></td>
            <td class="px-4 py-2"><NuxtLink :to="`/clients/${p.client_id}`" class="hover:underline">{{ p.clients?.name }}</NuxtLink></td>
            <td class="px-4 py-2 text-muted">{{ p.departments?.name }}</td>
            <td class="px-4 py-2 text-muted">{{ p.code }}</td>
            <td class="px-4 py-2">{{ billingLabel(p.billing_method) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ budget(p) }}</td>
            <td class="px-4 py-2 w-48">
              <div v-if="p.pct != null" class="flex items-center gap-2">
                <UProgress :model-value="Math.min(p.pct, 100)" :color="burnColor(p.pct)" size="sm" class="flex-1" />
                <span class="w-16 whitespace-nowrap text-right text-xs tabular-nums" :class="p.pct > 100 ? 'text-error' : 'text-muted'">
                  {{ p.pct > 100 ? Math.round(p.pct - 100) + '% over' : Math.round(100 - p.pct) + '% left' }}
                </span>
              </div>
              <span v-else class="text-xs text-muted">No budget</span>
            </td>
            <td class="px-4 py-2">
              <UBadge :color="p.is_active ? 'success' : 'neutral'" variant="subtle" size="sm">{{ p.is_active ? 'Active' : 'Inactive' }}</UBadge>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="8" class="px-4 py-8 text-center text-muted">No projects match.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <AppDrawer v-model:open="creating" title="New project">
      <template #body>
        <ProjectForm :clients="clients ?? []" :people="people ?? []" @saved="creating = false; refresh()" @cancel="creating = false" />
      </template>
    </AppDrawer>
  </div>
</template>
