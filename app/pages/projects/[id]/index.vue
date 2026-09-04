<script setup lang="ts">
import { BILLING_METHODS } from '~~/shared/types/app'

const route = useRoute()
const id = route.params.id as string
const supabase = useSupabaseClient()
const { can } = useCurrentUser()
const isAdmin = computed(() => can('manage_reference'))
const seeAll = computed(() => can('see_all_time'))
const seeRates = computed(() => can('field:rates'))
const seeBudgets = computed(() => can('field:budgets'))
const seeAmounts = computed(() => can('field:amounts'))
const editing = ref(false)

const __ad1 = useAsyncData(`project-${id}`, async () => {
  const { data, error } = await supabase.from('projects').select('*, clients(id, name), profiles!projects_lead_id_fkey(full_name)').eq('id', id).single()
  if (error) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  return data
}, fresh)

const __ad2 = useAsyncData(`project-${id}-tasks-named`, async () => {
  const { data, error } = await supabase.from('project_tasks').select('project_id, task_id, hourly_rate, tasks(id, name, is_billable_default, is_active)').eq('project_id', id)
  if (error) throw error
  return data
}, fresh)

const __ad3 = useClientNames()

// Tasks on this project, newest due first among the open ones.
const __ad4 = useAsyncData(`project-${id}-work-items`, async () => {
  const { data, error } = await supabase
    .from('work_items')
    .select('id, title, status, due_on, estimate_hours, work_item_assignees(user_id, profiles(full_name))')
    .eq('project_id', id)
    .order('due_on', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}, fresh)
const __ad5 = useActivePeople()
const __ad6 = useWorkStatuses()
const showDone = ref(false)
const openItems = computed(() => (workItems.value ?? []).filter(i => !ws.isDone(i.status)))
const visibleItems = computed(() => (showDone.value ? workItems.value ?? [] : openItems.value))
const creatingTask = ref(false)
function taskCreated() {
  creatingTask.value = false
  refreshItems()
}

// Lifetime burn across everyone's time plus linked Harvest history.
// Security definer function, so staff see the real total.
const __ad7 = useAsyncData(`project-${id}-budget`, async () => {
  const { data, error } = await supabase.rpc('project_budget', { p_project_id: id }).single()
  if (error) throw error
  return data
}, fresh)

// time_detail runs under RLS: admins see everyone, staff see their own.
const __ad8 = useAsyncData(`project-${id}-recent`, async () => {
  const { data, error } = await supabase
    .from('time_detail')
    .select('id, spent_on, user_name, task_name, hours, notes, is_billable')
    .eq('project_id', id)
    .order('spent_on', { ascending: false })
    .limit(10)
  if (error) throw error
  return data
}, fresh)
// Hours logged per task, to show what's left against each estimate.
// RLS scopes time_entries the same as the rest of the page: admins see
// everyone's, staff their own.
const __ad9 = useAsyncData(`project-${id}-item-hours`, async () => {
  const { data, error } = await supabase.from('time_entries').select('work_item_id, hours').eq('project_id', id)
  if (error) throw error
  return data
}, fresh)

// Quotes and invoices tied to this project. RLS gives nothing back to
// staff without manage_invoices or manage_quotes, so the card renders
// what RLS allows;
// the UI also hides it behind canBill.
const __ad10 = useAsyncData(`project-${id}-quotes`, async () => {
  const { data, error } = await supabase.from('quotes').select('id, number, title, status, subtotal, valid_until').eq('project_id', id).order('created_at', { ascending: false }).limit(20)
  if (error) throw error
  return data
}, fresh)
const __ad11 = useAsyncData(`project-${id}-invoices`, async () => {
  const { data, error } = await supabase.from('invoice_lines').select('invoice_id, invoices(id, number, subject, status, issue_date, due_date, total, due_amount)').eq('project_id', id)
  if (error) throw error
  const seen = new Set<string>()
  return data.map(l => l.invoices).filter((inv): inv is NonNullable<typeof inv> => !!inv && !seen.has(inv.id) && (seen.add(inv.id), true))
}, fresh)
await Promise.all([__ad1, __ad2, __ad3, __ad4, __ad5, __ad6, __ad7, __ad8, __ad9, __ad10, __ad11])
const { data: project, refresh } = __ad1
const { data: projectTasks } = __ad2
const { data: clients } = __ad3
const { data: workItems, refresh: refreshItems } = __ad4
const { data: people } = __ad5
const ws = await __ad6
const { data: budget, refresh: refreshBudget } = __ad7
const { data: recent } = __ad8
const { data: itemHours } = __ad9
const { data: quotes } = __ad10
const { data: invoices } = __ad11
const canBill = computed(() => can('manage_invoices') || can('manage_quotes'))
const hoursByItem = computed(() => {
  const m = new Map<string, number>()
  for (const e of itemHours.value ?? []) {
    if (!e.work_item_id) continue
    m.set(e.work_item_id, (m.get(e.work_item_id) ?? 0) + e.hours)
  }
  return m
})
const remaining = (i: { id: string, estimate_hours: number | null }) => {
  if (i.estimate_hours == null) return null
  return i.estimate_hours - (hoursByItem.value.get(i.id) ?? 0)
}

useHead({ title: () => project.value?.name ?? 'Project' })
useAssistantScreen(() => ({ project: project.value?.name, client: project.value?.clients?.name }))

// Lifetime breakdown by task type and by person, from the report
// function under RLS: admins see everyone, staff their own time.
const year = todayString().slice(0, 4)
const { data: breakdown } = await useAsyncData(`project-${id}-breakdown`, async () => {
  const p = project.value
  if (!p) return null
  const args = { p_from: '2000-01-01', p_to: todayString(), p_client: p.clients?.name ?? undefined, p_project: p.name }
  const [byTask, byPerson] = await Promise.all([
    supabase.rpc('report_time', { ...args, p_group: 'task' }),
    supabase.rpc('report_time', { ...args, p_group: 'person' }),
  ])
  if (byTask.error) throw byTask.error
  if (byPerson.error) throw byPerson.error
  return { byTask: byTask.data, byPerson: byPerson.data }
}, fresh)
const share = (h: number, rows: { hours: number }[]) => {
  const total = rows.reduce((t, r) => t + Number(r.hours), 0)
  return total > 0 ? Math.round(Number(h) / total * 100) : 0
}

const billingLabel = (v: string) => BILLING_METHODS.find(b => b.value === v)?.label ?? v
const pct = (used: number, total: number | null) => (total && total > 0 ? Math.round(used / total * 100) : 0)
const invoiceColor = (inv: { status: string, due_date: string | null }) => invoiceBadge(inv).color
const invoiceLabel = (inv: { status: string, due_date: string | null }) => invoiceBadge(inv).label

// Inline time entry: the small clock button on a task, or the project
// page's own row, opens this drawer with the task prefilled.
const loggingTimeItem = ref<{ id: string, title: string } | null>(null)
const projectOptions = computed(() => (project.value ? [{ id: project.value.id, name: project.value.name, billing_method: project.value.billing_method, clients: project.value.clients ? { name: project.value.clients.name } : null }] : []))
const projectTasksForForm = computed(() => (projectTasks.value ?? []).map(pt => ({ project_id: pt.project_id, task_id: pt.task_id, tasks: pt.tasks })))
function timeLogged() {
  loggingTimeItem.value = null
  refreshItems()
  __ad9.refresh()
}

const toast = useToast()
async function copyFolder() {
  if (!project.value?.server_path) return
  try {
    await navigator.clipboard.writeText(project.value.server_path)
    toast.add({ title: 'Folder path copied', color: 'success' })
  } catch {
    toast.add({ title: 'Could not copy', description: 'Select the path and copy it by hand.', color: 'error' })
  }
}
</script>

<template>
  <div v-if="project" class="space-y-6">
    <AppCrumbs :items="[{ label: 'Projects', to: '/projects' }]" class="mb-3" />
    <div class="flex items-center gap-3">
      <div>
        <h1 class="text-2xl font-semibold">{{ project.name }}</h1>
        <NuxtLink :to="`/clients/${project.client_id}`" class="text-sm text-muted hover:underline">{{ project.clients?.name }}</NuxtLink>
      </div>
      <UBadge v-if="!project.is_active" color="neutral" variant="subtle">Inactive</UBadge>
      <UBadge v-if="project.client_visible" color="info" variant="subtle" title="Every task on this project shows on the client portal">Visible to client</UBadge>
      <div v-if="isAdmin" class="ml-auto flex gap-2">
        <UButton variant="outline" icon="i-lucide-pencil" @click="editing = true;">Edit</UButton>
        <UButton :to="`/projects/${id}/settings`" variant="outline" icon="i-lucide-settings">Task types</UButton>
      </div>
    </div>

    <UCard>
      <dl class="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <div><dt class="text-muted">Job code</dt><dd>{{ project.code || 'None' }}</dd></div>
        <div><dt class="text-muted">Billing</dt><dd>{{ billingLabel(project.billing_method) }}</dd></div>
        <div v-if="seeRates"><dt class="text-muted">Hourly rate</dt><dd>{{ money(project.hourly_rate) || 'Not set' }}</dd></div>
        <div><dt class="text-muted">Budget hours</dt><dd>{{ project.budget_hours ?? 'No budget' }}</dd></div>
        <div v-if="seeBudgets"><dt class="text-muted">Budget amount</dt><dd>{{ money(project.budget_amount) || 'Not set' }}</dd></div>
        <div><dt class="text-muted">Lead</dt><dd>{{ project.profiles?.full_name ?? 'Unassigned' }}</dd></div>
      </dl>
    </UCard>

    <UCard>
      <div class="flex flex-wrap items-center gap-3">
        <UIcon name="i-lucide-folder" class="shrink-0 text-muted" />
        <div class="min-w-0 flex-1">
          <div class="text-sm text-muted">Server folder</div>
          <div v-if="project.server_path" class="truncate font-mono text-sm" :title="project.server_path">{{ project.server_path }}</div>
          <div v-else class="text-sm text-muted">Not set.<template v-if="isAdmin"> Edit the project to add it.</template></div>
        </div>
        <div v-if="project.server_path" class="flex gap-2">
          <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-copy" @click="copyFolder">Copy</UButton>
          <UButton v-if="folderHref(project.server_path)" size="sm" variant="outline" color="neutral" icon="i-lucide-external-link" :to="folderHref(project.server_path)!" external>Open</UButton>
        </div>
      </div>
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
        <div v-if="seeBudgets && budget.amount_used != null" class="space-y-2">
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

    <div v-if="canBill" class="grid gap-6 sm:grid-cols-2">
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header><h2 class="font-semibold">Quotes</h2></template>
        <ul v-if="quotes?.length" class="divide-y divide-default text-sm">
          <li v-for="q in quotes" :key="q.id" class="flex items-center gap-3 px-4 py-2">
            <NuxtLink :to="`/quotes/${q.id}`" class="font-medium tabular-nums hover:underline">{{ q.number }}</NuxtLink>
            <span class="min-w-0 flex-1 truncate">{{ q.title }}</span>
            <span v-if="seeAmounts" class="tabular-nums">{{ money(q.subtotal) }}</span>
            <UBadge :color="quoteBadge(q).color" variant="subtle" size="sm">{{ quoteBadge(q).label }}</UBadge>
          </li>
        </ul>
        <p v-else class="px-4 py-6 text-center text-sm text-muted">No quotes for this project.</p>
      </UCard>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header><h2 class="font-semibold">Invoices</h2></template>
        <ul v-if="invoices?.length" class="divide-y divide-default text-sm">
          <li v-for="inv in invoices" :key="inv.id" class="flex items-center gap-3 px-4 py-2">
            <NuxtLink :to="`/invoices/${inv.id}`" class="font-medium tabular-nums hover:underline">{{ inv.number }}</NuxtLink>
            <span class="min-w-0 flex-1 truncate text-muted">{{ inv.subject }}</span>
            <span v-if="seeAmounts" class="tabular-nums">{{ money(inv.total) }}</span>
            <UBadge :color="invoiceColor(inv)" variant="subtle" size="sm">{{ invoiceLabel(inv) }}</UBadge>
          </li>
        </ul>
        <p v-else class="px-4 py-6 text-center text-sm text-muted">No invoices for this project yet.</p>
      </UCard>
    </div>

    <ReportRollup :from="`${year}-01-01`" :to="`${year}-12-31`" :client="project.clients?.name ?? undefined" :project="project.name" />

    <UCard v-if="breakdown && (breakdown.byTask.length || breakdown.byPerson.length)">
      <template #header>
        <div class="flex items-baseline gap-3">
          <h2 class="font-semibold">{{ seeAll ? 'Where the time went' : 'Where your time went' }}</h2>
          <span class="text-xs text-muted">Lifetime.<template v-if="recent?.length"> Last entry {{ shortDate(recent[0]!.spent_on!) }}.</template></span>
        </div>
      </template>
      <div class="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">By task type</h3>
          <ul class="space-y-1.5 text-sm">
            <li v-for="r in breakdown.byTask" :key="r.key" class="space-y-0.5">
              <div class="flex justify-between gap-3"><span class="truncate">{{ r.label || 'No task' }}</span><span class="tabular-nums text-muted">{{ formatHours(r.hours) }} <span class="text-xs">{{ share(r.hours, breakdown.byTask) }}%</span></span></div>
              <UProgress :model-value="share(r.hours, breakdown.byTask)" size="xs" color="neutral" />
            </li>
          </ul>
        </div>
        <div>
          <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">By person</h3>
          <ul class="space-y-1.5 text-sm">
            <li v-for="r in breakdown.byPerson" :key="r.key" class="space-y-0.5">
              <div class="flex justify-between gap-3"><span class="truncate">{{ r.label }}</span><span class="tabular-nums text-muted">{{ formatHours(r.hours) }} <span class="text-xs">{{ share(r.hours, breakdown.byPerson) }}%</span></span></div>
              <UProgress :model-value="share(r.hours, breakdown.byPerson)" size="xs" color="neutral" />
            </li>
          </ul>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">Task types and rates</h2>
      </template>
      <ul v-if="projectTasks?.length" class="divide-y divide-default text-sm">
        <li v-for="pt in projectTasks" :key="pt.tasks?.name" class="flex justify-between py-2">
          <span>{{ pt.tasks?.name }}</span>
          <span v-if="seeRates" class="tabular-nums text-muted">{{ pt.hourly_rate == null ? 'Project rate' : money(pt.hourly_rate) }}</span>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">
        No tasks assigned yet.
        <span v-if="isAdmin">Use the Task types button above to add some.</span>
        <span v-else>Ask an admin to add some before logging time.</span>
      </p>
    </UCard>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex items-center gap-4">
          <h2 class="font-semibold">Tasks <span class="text-sm font-normal text-muted">{{ openItems.length }} open</span></h2>
          <USwitch v-model="showDone" label="Show completed" size="sm" class="ml-auto" />
          <UButton size="sm" icon="i-lucide-plus" @click="creatingTask = true;">New task</UButton>
        </div>
      </template>
      <ul v-if="visibleItems.length" class="divide-y divide-default text-sm">
        <li v-for="i in visibleItems" :key="i.id" class="flex items-center gap-3 px-4 py-2">
          <div class="min-w-0 flex-1">
            <NuxtLink :to="`/tasks/${i.id}`" class="font-medium hover:underline">{{ i.title }}</NuxtLink>
            <div class="truncate text-muted">{{ i.work_item_assignees.map(a => a.profiles?.full_name).join(', ') || 'Unassigned' }}</div>
          </div>
          <span v-if="i.estimate_hours != null" class="w-20 shrink-0 text-right tabular-nums text-xs" :class="(remaining(i) ?? 0) < 0 ? 'text-error' : 'text-muted'">
            {{ (remaining(i) ?? 0) < 0 ? `${formatHours(-remaining(i)!)} over` : `${formatHours(remaining(i)!)} left` }}
          </span>
          <span class="w-16 text-right tabular-nums" :class="i.due_on && i.due_on < todayString() && !ws.isDone(i.status) ? 'text-error' : 'text-muted'">{{ i.due_on ? shortDate(i.due_on) : '' }}</span>
          <UBadge :color="ws.color(i.status)" variant="subtle" size="sm">{{ ws.label(i.status) }}</UBadge>
          <TaskTimerControl compact :work-item="{ id: i.id, title: i.title, project_id: id }" :project-tasks="projectTasksForForm" @changed="__ad9.refresh()" />
          <UButton icon="i-lucide-timer" variant="ghost" color="neutral" size="xs" aria-label="Log time" title="Log time: enter hours, or a different day" @click="loggingTimeItem = { id: i.id, title: i.title };" />
        </li>
      </ul>
      <p v-else class="px-4 py-6 text-center text-sm text-muted">No tasks on this project yet.</p>
    </UCard>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <h2 class="font-semibold">{{ seeAll ? 'Recent entries' : 'Your recent entries' }}</h2>
      </template>
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Date</th>
            <th v-if="seeAll" class="px-4 py-2 font-medium">Person</th>
            <th class="px-4 py-2 font-medium">Task</th>
            <th class="px-4 py-2 font-medium">Notes</th>
            <th class="px-4 py-2 text-right font-medium">Hours</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in recent" :key="e.id!" class="border-b border-default last:border-0">
            <td class="px-4 py-2 whitespace-nowrap tabular-nums">{{ shortDate(e.spent_on!) }}</td>
            <td v-if="seeAll" class="px-4 py-2">{{ e.user_name }}</td>
            <td class="px-4 py-2">{{ e.task_name }}</td>
            <td class="px-4 py-2 max-w-md truncate text-muted">{{ e.notes }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ formatHours(e.hours ?? 0) }}</td>
          </tr>
          <tr v-if="!recent?.length">
            <td :colspan="seeAll ? 5 : 4" class="px-4 py-6 text-center text-muted">No time logged yet.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <AppDrawer v-model:open="creatingTask" title="New task">
      <template #body>
        <WorkItemForm v-if="project" :projects="[{ id: project.id, name: project.name, clients: project.clients ? { name: project.clients.name } : null }]" :people="people ?? []" :default-project-id="project.id" @saved="taskCreated" @cancel="creatingTask = false;" />
      </template>
    </AppDrawer>

    <AppDrawer v-model:open="editing" title="Edit project">
      <template #body>
        <ProjectForm :project="project" :clients="clients ?? []" :people="people ?? []" @saved="editing = false; refresh(); refreshBudget()" @cancel="editing = false" />
      </template>
    </AppDrawer>

    <AppDrawer :open="!!loggingTimeItem" title="Log time" @update:open="(v) => { if (!v) loggingTimeItem = null }">
      <template #body>
        <TimeEntryForm v-if="loggingTimeItem" :date="todayString()" :projects="projectOptions" :project-tasks="projectTasksForForm" :work-item="{ id: loggingTimeItem.id, title: loggingTimeItem.title, project_id: id }" @saved="timeLogged" @cancel="loggingTimeItem = null" />
      </template>
    </AppDrawer>
  </div>
</template>
