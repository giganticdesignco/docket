<script setup lang="ts">
import { BILLING_METHODS } from '~~/shared/types/app'

const route = useRoute()
const id = route.params.id as string
const supabase = useSupabaseClient()
const { isAdmin } = useCurrentUser()
const editing = ref(false)

const { data: project, refresh } = await useAsyncData(`project-${id}`, async () => {
  const { data, error } = await supabase.from('projects').select('*, clients(id, name)').eq('id', id).single()
  if (error) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  return data
}, fresh)

const { data: projectTasks } = await useAsyncData(`project-${id}-tasks-named`, async () => {
  const { data, error } = await supabase.from('project_tasks').select('hourly_rate, tasks(name)').eq('project_id', id)
  if (error) throw error
  return data
}, fresh)

const { data: clients } = await useAsyncData('clients-for-projects', async () => {
  const { data, error } = await supabase.from('clients').select('id, name').order('name')
  if (error) throw error
  return data
}, fresh)

// Lifetime burn across everyone's time plus linked Harvest history.
// Security definer function, so staff see the real total.
const { data: budget, refresh: refreshBudget } = await useAsyncData(`project-${id}-budget`, async () => {
  const { data, error } = await supabase.rpc('project_budget', { p_project_id: id }).single()
  if (error) throw error
  return data
}, fresh)

// time_detail runs under RLS: admins see everyone, staff see their own.
const { data: recent } = await useAsyncData(`project-${id}-recent`, async () => {
  const { data, error } = await supabase
    .from('time_detail')
    .select('id, spent_on, user_name, task_name, hours, notes, is_billable')
    .eq('project_id', id)
    .order('spent_on', { ascending: false })
    .limit(10)
  if (error) throw error
  return data
}, fresh)

useHead({ title: () => project.value?.name ?? 'Project' })

const billingLabel = (v: string) => BILLING_METHODS.find(b => b.value === v)?.label ?? v
const money = (n: number | null) => (n == null ? 'Not set' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)
const pct = (used: number, total: number | null) => (total && total > 0 ? Math.round(used / total * 100) : 0)
const burnColor = (p: number) => (p >= 100 ? 'error' : p >= 80 ? 'warning' : 'primary')
</script>

<template>
  <div v-if="project" class="space-y-6">
    <div class="flex items-center gap-3">
      <UButton to="/projects" icon="i-lucide-arrow-left" variant="ghost" color="neutral" size="sm" />
      <div>
        <h1 class="text-2xl font-semibold">{{ project.name }}</h1>
        <NuxtLink :to="`/clients/${project.client_id}`" class="text-sm text-muted hover:underline">{{ project.clients?.name }}</NuxtLink>
      </div>
      <UBadge v-if="!project.is_active" color="neutral" variant="subtle">Inactive</UBadge>
      <div v-if="isAdmin" class="ml-auto flex gap-2">
        <UButton variant="outline" icon="i-lucide-pencil" @click="editing = true;">Edit</UButton>
        <UButton :to="`/projects/${id}/settings`" variant="outline" icon="i-lucide-settings">Tasks</UButton>
      </div>
    </div>

    <UCard>
      <dl class="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <div><dt class="text-muted">Job code</dt><dd>{{ project.code || 'None' }}</dd></div>
        <div><dt class="text-muted">Billing</dt><dd>{{ billingLabel(project.billing_method) }}</dd></div>
        <div><dt class="text-muted">Hourly rate</dt><dd>{{ money(project.hourly_rate) }}</dd></div>
        <div><dt class="text-muted">Budget hours</dt><dd>{{ project.budget_hours ?? 'No budget' }}</dd></div>
        <div><dt class="text-muted">Budget amount</dt><dd>{{ money(project.budget_amount) }}</dd></div>
      </dl>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-baseline gap-3">
          <h2 class="font-semibold">Budget</h2>
          <span class="text-xs text-muted">Lifetime, everyone's time, including Harvest history where linked.</span>
        </div>
      </template>
      <div v-if="budget" class="grid gap-6 sm:grid-cols-2">
        <div class="space-y-2">
          <div class="flex items-baseline justify-between text-sm">
            <span class="text-muted">Hours</span>
            <span class="tabular-nums">
              <strong>{{ formatHours(budget.hours_used) }}</strong>
              <span v-if="project.budget_hours" class="text-muted"> of {{ formatHours(project.budget_hours) }}</span>
            </span>
          </div>
          <UProgress v-if="project.budget_hours" :model-value="Math.min(pct(budget.hours_used, project.budget_hours), 100)" :color="burnColor(pct(budget.hours_used, project.budget_hours))" />
          <p class="text-xs text-muted">
            <span v-if="project.budget_hours">{{ pct(budget.hours_used, project.budget_hours) }}% used</span>
            <span v-else>No hours budget on this project.</span>
            <span v-if="budget.billable_hours !== budget.hours_used"> &middot; {{ formatHours(budget.billable_hours) }} billable</span>
          </p>
        </div>
        <div class="space-y-2">
          <div class="flex items-baseline justify-between text-sm">
            <span class="text-muted">Billable amount</span>
            <span class="tabular-nums">
              <strong>{{ money(budget.amount_used) }}</strong>
              <span v-if="project.budget_amount" class="text-muted"> of {{ money(project.budget_amount) }}</span>
            </span>
          </div>
          <UProgress v-if="project.budget_amount" :model-value="Math.min(pct(budget.amount_used, project.budget_amount), 100)" :color="burnColor(pct(budget.amount_used, project.budget_amount))" />
          <p class="text-xs text-muted">
            <span v-if="project.budget_amount">{{ pct(budget.amount_used, project.budget_amount) }}% used</span>
            <span v-else>No amount budget on this project.</span>
          </p>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">Tasks</h2>
      </template>
      <ul v-if="projectTasks?.length" class="divide-y divide-default text-sm">
        <li v-for="pt in projectTasks" :key="pt.tasks?.name" class="flex justify-between py-2">
          <span>{{ pt.tasks?.name }}</span>
          <span class="tabular-nums text-muted">{{ pt.hourly_rate == null ? 'Project rate' : money(pt.hourly_rate) }}</span>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">
        No tasks assigned yet.
        <span v-if="isAdmin">Use the Tasks button above to add some.</span>
        <span v-else>Ask an admin to add some before logging time.</span>
      </p>
    </UCard>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <h2 class="font-semibold">{{ isAdmin ? 'Recent entries' : 'Your recent entries' }}</h2>
      </template>
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Date</th>
            <th v-if="isAdmin" class="px-4 py-2 font-medium">Person</th>
            <th class="px-4 py-2 font-medium">Task</th>
            <th class="px-4 py-2 font-medium">Notes</th>
            <th class="px-4 py-2 text-right font-medium">Hours</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in recent" :key="e.id!" class="border-b border-default last:border-0">
            <td class="px-4 py-2 whitespace-nowrap tabular-nums">{{ shortDate(e.spent_on!) }}</td>
            <td v-if="isAdmin" class="px-4 py-2">{{ e.user_name }}</td>
            <td class="px-4 py-2">{{ e.task_name }}</td>
            <td class="px-4 py-2 max-w-md truncate text-muted">{{ e.notes }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ formatHours(e.hours ?? 0) }}</td>
          </tr>
          <tr v-if="!recent?.length">
            <td :colspan="isAdmin ? 5 : 4" class="px-4 py-6 text-center text-muted">No time logged yet.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <UModal v-model:open="editing" title="Edit project">
      <template #body>
        <ProjectForm :project="project" :clients="clients ?? []" @saved="editing = false; refresh(); refreshBudget()" @cancel="editing = false" />
      </template>
    </UModal>
  </div>
</template>
