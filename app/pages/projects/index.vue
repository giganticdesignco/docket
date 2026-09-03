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
// Open tasks and who is on them, for the Tasks and Assigned columns.
const ws = await useWorkStatuses()
const __ad6 = useAsyncData('projects-open-tasks', async () => {
  const { data, error } = await supabase.from('work_items').select('project_id, status, work_item_assignees(user_id)').limit(5000)
  if (error) throw error
  return data.filter(w => !ws.isDone(w.status))
}, fresh)
await Promise.all([__ad1, __ad2, __ad3, __ad4, __ad5, __ad6])
const { data: clients } = __ad1
const { data: projects, refresh } = __ad2
const { data: burn } = __ad3
const { data: people } = __ad4
const { data: departments } = __ad5
const { data: openTasks } = __ad6
const taskStats = computed(() => {
  const m = new Map<string, { count: number, people: Set<string> }>()
  for (const t of openTasks.value ?? []) {
    const x = m.get(t.project_id) ?? { count: 0, people: new Set<string>() }
    x.count++
    for (const a of t.work_item_assignees) x.people.add(a.user_id)
    m.set(t.project_id, x)
  }
  return m
})
const nameOf = (id: string) => people.value?.find(p => p.id === id)?.full_name ?? ''
const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
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

const rows = computed(() => cols.sorted(
  (projects.value ?? [])
    .filter(p =>
      (showInactive.value || p.is_active)
      && (!clientFilter.value || p.client_id === clientFilter.value)
      && (!departmentFilter.value || p.department_id === departmentFilter.value),
    )
    .map(p => ({ ...p, pct: usedPct(p), taskCount: taskStats.value.get(p.id)?.count ?? 0, assigned: [...(taskStats.value.get(p.id)?.people ?? [])].map(nameOf).filter(Boolean).sort() })),
))
type Row = { id: string, name: string, client_id: string, clients: { name: string } | null, departments: { name: string } | null, code: string | null, billing_method: string, budget_hours: number | null, budget_amount: number | null, is_active: boolean, pct: number | null, taskCount: number, assigned: string[] }
// Sortable, reorderable, hideable; the arrangement is saved per person.
const cols = await useColumns<Row>('projects', [
  { key: 'name', label: 'Project', sort: r => r.name, always: true },
  { key: 'client', label: 'Client', sort: r => r.clients?.name },
  { key: 'department', label: 'Department', sort: r => r.departments?.name },
  { key: 'code', label: 'Code', sort: r => r.code },
  { key: 'billing', label: 'Billing', sort: r => r.billing_method },
  // Dollar budgets are money; hour budgets are not, but the column mixes them.
  { key: 'budget', label: 'Budget', align: 'right', sort: r => r.budget_hours ?? r.budget_amount, permission: 'see_money' },
  { key: 'remaining', label: 'Remaining', sort: r => (r.pct == null ? null : 100 - r.pct), class: 'w-48', permission: 'see_money' },
  { key: 'tasks', label: 'Tasks', align: 'right', sort: r => r.taskCount },
  { key: 'assigned', label: 'Assigned', sort: r => r.assigned.join(', ') },
  { key: 'status', label: 'Status', sort: r => (r.is_active ? 0 : 1) },
])

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
      <div class="table-scroll"><table class="w-full text-sm">
        <TableHead :cols="cols" />
        <tbody>
          <tr v-for="p in rows" :key="p.id" class="border-b border-default last:border-0">
            <td v-for="c in cols.visible" :key="c.key" class="px-4 py-2" :class="[c.align === 'right' ? 'text-right tabular-nums' : '', c.class ?? '']">
              <NuxtLink v-if="c.key === 'name'" :to="`/projects/${p.id}`" class="font-medium hover:underline">{{ p.name }}</NuxtLink>
              <NuxtLink v-else-if="c.key === 'client'" :to="`/clients/${p.client_id}`" class="hover:underline">{{ p.clients?.name }}</NuxtLink>
              <span v-else-if="c.key === 'department'" class="text-muted">{{ p.departments?.name }}</span>
              <span v-else-if="c.key === 'code'" class="text-muted">{{ p.code }}</span>
              <template v-else-if="c.key === 'billing'">{{ billingLabel(p.billing_method) }}</template>
              <template v-else-if="c.key === 'budget'">{{ budget(p) }}</template>
              <template v-else-if="c.key === 'remaining'">
                <div v-if="p.pct != null" class="flex items-center gap-2">
                  <UProgress :model-value="Math.min(p.pct, 100)" :color="burnColor(p.pct)" size="sm" class="flex-1" />
                  <span class="w-16 whitespace-nowrap text-right text-xs tabular-nums" :class="p.pct > 100 ? 'text-error' : 'text-muted'">
                    {{ p.pct > 100 ? Math.round(p.pct - 100) + '% over' : Math.round(100 - p.pct) + '% left' }}
                  </span>
                </div>
                <span v-else class="text-xs text-muted">No budget</span>
              </template>
              <NuxtLink v-else-if="c.key === 'tasks'" :to="`/projects/${p.id}`" class="hover:underline" :class="p.taskCount ? '' : 'text-dimmed'" title="Open tasks">{{ p.taskCount || '' }}</NuxtLink>
              <span v-else-if="c.key === 'assigned'" class="flex -space-x-1.5" :title="p.assigned.join(', ')">
                <span v-for="n in p.assigned.slice(0, 6)" :key="n" class="grid size-6 place-items-center rounded-full bg-elevated text-[10px] font-medium ring-2 ring-default">{{ initials(n) }}</span>
                <span v-if="p.assigned.length > 6" class="grid size-6 place-items-center rounded-full bg-accented text-[10px] font-medium ring-2 ring-default">+{{ p.assigned.length - 6 }}</span>
              </span>
              <UBadge v-else-if="c.key === 'status'" :color="p.is_active ? 'success' : 'neutral'" variant="subtle" size="sm">{{ p.is_active ? 'Active' : 'Inactive' }}</UBadge>
            </td>
            <td />
          </tr>
          <tr v-if="rows.length === 0">
            <td :colspan="cols.visible.length + 1" class="px-4 py-8 text-center text-muted">No projects match.</td>
          </tr>
        </tbody>
      </table></div>
    </UCard>

    <AppDrawer v-model:open="creating" title="New project">
      <template #body>
        <ProjectForm :clients="clients ?? []" :people="people ?? []" @saved="creating = false; refresh()" @cancel="creating = false" />
      </template>
    </AppDrawer>
  </div>
</template>
