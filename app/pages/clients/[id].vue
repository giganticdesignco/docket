<script setup lang="ts">
import { BILLING_METHODS } from '~~/shared/types/app'
import type { Database, Tables } from '~~/shared/types/database'

type RetainerRow = Database['public']['Functions']['retainer_status']['Returns'][number]

const route = useRoute()
const id = route.params.id as string
const supabase = useSupabaseClient()
const { can } = useCurrentUser()
const isAdmin = computed(() => can('manage_reference'))
const seeMoney = computed(() => can('field:amounts'))
const seeBudgets = computed(() => can('field:budgets'))
const canBill = computed(() => can('manage_invoices') || can('manage_quotes') || can('manage_retainers'))

const editing = ref(false)
const creatingProject = ref(false)
const creatingRetainer = ref(false)
const editingRetainer = ref<Tables<'retainers'> | null>(null)
const deletingRetainer = ref<RetainerRow | null>(null)
const toast = useToast()

const __ad1 = useAsyncData(`client-${id}`, async () => {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).single()
  if (error) throw createError({ statusCode: 404, statusMessage: 'Client not found' })
  return data
}, fresh)

const __ad2 = useAsyncData(`client-${id}-projects`, async () => {
  const { data, error } = await supabase.from('projects').select('*').eq('client_id', id).order('name')
  if (error) throw error
  return data
}, fresh)

// Use and rollover come from retainer_status(), a security definer function,
// so staff see the real burn rather than just their own hours.
const __ad3 = useAsyncData(`client-${id}-retainers`, async () => {
  const { data, error } = await supabase.rpc('retainer_status')
  if (error) throw error
  return data.filter(r => r.client_id === id).sort((a, b) => b.period_start.localeCompare(a.period_start))
}, fresh)

// Quotes, Docket invoices, then Harvest history. RLS gives staff nothing
// for any of them, so no admin check on the queries.
const __ad4 = useAsyncData(`client-${id}-quotes`, async () => {
  const { data, error } = await supabase.from('quotes').select('id, number, title, status, subtotal, valid_until').eq('client_id', id).order('created_at', { ascending: false }).limit(20)
  if (error) throw error
  return data
}, fresh)
const __ad5 = useAsyncData(`client-${id}-docket-invoices`, async () => {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, number, subject, status, issue_date, due_date, total, due_amount')
    .eq('client_id', id)
    .order('issue_date', { ascending: false })
    .limit(50)
  if (error) throw error
  return data
}, fresh)

const __ad6 = useAsyncData(`client-${id}-invoices`, async () => {
  const { data, error } = await supabase
    .from('harvest_invoices')
    .select('id, number, subject, state, issue_date, due_date, amount, due_amount')
    .eq('client_id', id)
    .order('issue_date', { ascending: false })
    .limit(50)
  if (error) throw error
  return data
}, fresh)
const __ad7 = useActivePeople()
await Promise.all([__ad1, __ad2, __ad3, __ad4, __ad5, __ad6, __ad7])
const { data: client, refresh } = __ad1
const { data: projects, refresh: refreshProjects } = __ad2
const { data: retainers, refresh: refreshRetainers } = __ad3
const { data: quotes } = __ad4
const { data: docketInvoices } = __ad5
const { data: harvestInvoices } = __ad6
// Both sources as one list, newest first, the shape the Invoices page uses.
const invoices = computed<InvoiceRow[]>(() => [...(docketInvoices.value ?? []).map(invoiceRow), ...(harvestInvoices.value ?? []).map(harvestInvoiceRow)].sort((a, b) => b.issue_date.localeCompare(a.issue_date)))
const { data: people } = __ad7

// Open tasks across this client's projects, and who has worked on the
// account lately, for the Team and Tasks sections.
const ws = await useWorkStatuses()
const projectIds = computed(() => (projects.value ?? []).map(p => p.id))
const __ad8 = useAsyncData(`client-${id}-tasks`, async () => {
  if (!projectIds.value.length) return []
  const { data, error } = await supabase
    .from('work_items')
    .select('id, title, status, priority, due_on, project_id, projects(name), work_item_assignees(user_id)')
    .in('project_id', projectIds.value)
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(500)
  if (error) throw error
  return data.filter(w => !ws.isDone(w.status))
}, { ...fresh, watch: [projectIds] })
const __ad9 = useAsyncData(`client-${id}-recent-time`, async () => {
  if (!projectIds.value.length) return []
  const { data, error } = await supabase.from('time_entries').select('user_id, hours').in('project_id', projectIds.value).gte('spent_on', addDays(todayString(), -90))
  if (error) throw error
  return data
}, { ...fresh, watch: [projectIds] })
// Client contacts: people with a login for this client's portal.
const __ad10 = useAsyncData(`client-${id}-contacts`, async () => {
  const { data, error } = await supabase.from('profiles').select('id, full_name, email, is_active, created_at').eq('client_id', id).order('full_name')
  if (error) throw error
  return data
}, fresh)
// Lifetime burn per project, everyone's time, for the projects table.
const __ad11 = useProjectBudgets()
await Promise.all([__ad8, __ad9, __ad10, __ad11])
const { data: contacts, refresh: refreshContacts } = __ad10
const { data: budgets } = __ad11
const { data: openTasks } = __ad8
const { data: recentTime } = __ad9
const nameOf = (uid: string) => people.value?.find(p => p.id === uid)?.full_name ?? ''
// The team on the account: project leads, people on open tasks, and
// anyone who logged time here in the last 90 days.
const team = computed(() => {
  const m = new Map<string, { id: string, name: string, leads: string[], tasks: number, hours: number }>()
  const get = (uid: string) => { const x = m.get(uid) ?? { id: uid, name: nameOf(uid), leads: [], tasks: 0, hours: 0 }; m.set(uid, x); return x }
  for (const p of projects.value ?? []) if (p.lead_id && p.is_active) get(p.lead_id).leads.push(p.name)
  for (const t of openTasks.value ?? []) for (const a of t.work_item_assignees) get(a.user_id).tasks++
  for (const e of recentTime.value ?? []) get(e.user_id).hours += e.hours
  return [...m.values()].filter(x => x.name).sort((a, b) => b.leads.length - a.leads.length || b.tasks - a.tasks || b.hours - a.hours)
})
const TASKS_SHOWN = 25

// ---------- one team member, in a drawer ----------
const member = ref<NonNullable<typeof team.value>[number] | null>(null)
// Their open tasks for this client, from the rows already loaded.
const memberTasks = computed(() => (openTasks.value ?? []).filter(t => t.work_item_assignees.some(a => a.user_id === member.value?.id)))
// Their time on this client, by project, fetched when the drawer opens.
// Under RLS a person without see_all_time gets only their own rows, so
// this can legitimately come back empty for someone else.
const { data: memberTime, status: memberTimeStatus } = await useAsyncData('client-member-time', async () => {
  if (!member.value || !projectIds.value.length) return null
  const { data, error } = await supabase.from('time_entries')
    .select('hours, spent_on, project_id')
    .eq('user_id', member.value.id).in('project_id', projectIds.value).limit(5000)
  if (error) throw error
  const byProject = new Map<string, number>()
  let total = 0, thisYear = 0
  for (const e of data ?? []) {
    byProject.set(e.project_id, (byProject.get(e.project_id) ?? 0) + e.hours)
    total += e.hours
    if (e.spent_on >= `${year}-01-01`) thisYear += e.hours
  }
  return {
    total, thisYear,
    projects: [...byProject.entries()].map(([pid, hours]) => ({ pid, name: projectName(pid), hours })).sort((a, b) => b.hours - a.hours),
  }
}, { ...fresh, watch: [member], immediate: false })
watch(member, (m) => { if (m) refreshNuxtData('client-member-time') })

useHead({ title: () => client.value?.name ?? 'Client' })
useAssistantScreen(() => ({ client: client.value?.name }))

const inviting = ref(false)
const invite = reactive({ fullName: '', email: '' })
const inviteBusy = ref(false)
async function sendInvite(email = invite.email, fullName = invite.fullName) {
  inviteBusy.value = true
  try {
    const r = await $fetch<{ resent: boolean }>('/api/clients/invite', { method: 'POST', body: { clientId: id, email, fullName } })
    toast.add({ title: r.resent ? 'Sign-in link sent again' : 'Invitation sent', description: email, color: 'success' })
    inviting.value = false
    invite.fullName = ''
    invite.email = ''
    await refreshContacts()
  } catch (e) {
    toast.add({ title: 'Could not invite', description: apiError(e), color: 'error' })
  } finally {
    inviteBusy.value = false
  }
}
async function setContactActive(contactId: string, active: boolean) {
  const { error } = await supabase.from('profiles').update({ is_active: active }).eq('id', contactId)
  if (error) toast.add({ title: 'Not saved', description: error.message, color: 'error' })
  else await refreshContacts()
}

const burn = (projectId: string) => budgets.value?.find(b => b.project_id === projectId)
const usedPct = (used: number, total: number | null) => (total && total > 0 ? Math.round(used / total * 100) : null)

// Billing: Docket invoices plus Harvest history, sent or later, this year
// and for the life of the account. Harvest 'closed' means written off, so
// it counts as invoiced but never as outstanding.
const year = todayString().slice(0, 4)
const billing = computed(() => {
  const issued = invoices.value.filter(i => i.status !== 'draft' && i.status !== 'void')
  const sums = (rows: InvoiceRow[]) => ({
    invoiced: rows.reduce((t, i) => t + i.total, 0),
    paid: rows.reduce((t, i) => t + i.total - i.due_amount, 0),
    outstanding: rows.filter(i => i.status === 'sent').reduce((t, i) => t + i.due_amount, 0),
  })
  return { year: sums(issued.filter(i => i.issue_date >= `${year}-01-01`)), all: sums(issued) }
})
// The oldest invoice on file, so "all time" says what it covers.
const firstInvoiceYear = computed(() => invoices.value.map(i => i.issue_date).sort()[0]?.slice(0, 4) ?? null)

// The billing numbers as tiles, so they sit in the same dashboard grid
// as the hours across the top of the page.
const billingTiles = computed(() => {
  if (!canBill.value || !seeMoney.value) return []
  const b = billing.value
  return [
    { label: 'Invoiced', value: money(b.year.invoiced), sub: `${money(b.all.invoiced)} all time` },
    { label: 'Paid', value: money(b.year.paid), sub: `${money(b.all.paid)} all time` },
    { label: 'Outstanding', value: money(b.all.outstanding), sub: b.year.outstanding ? `${money(b.year.outstanding)} from this year` : 'nothing from this year', subClass: b.all.outstanding > 0 ? 'text-warning' : 'text-muted' },
  ]
})

// Who is on each project: its lead, plus anyone on one of its open tasks.
const projectTeam = computed(() => {
  const m = new Map<string, Set<string>>()
  const add = (pid: string, uid: string | null) => { if (!uid) return; const set = m.get(pid) ?? new Set<string>(); set.add(uid); m.set(pid, set) }
  for (const pr of projects.value ?? []) add(pr.id, pr.lead_id)
  for (const t of openTasks.value ?? []) for (const a of t.work_item_assignees) add(t.project_id, a.user_id)
  return new Map([...m.entries()].map(([pid, set]) => [pid, [...set].map(nameOf).filter(Boolean).sort()]))
})
const teamOn = (projectId: string) => projectTeam.value.get(projectId) ?? []

// Same sort, reorder and show/hide controls as the main lists.
type ProjectRow = NonNullable<typeof projects.value>[number]
const projectCols = await useColumns<ProjectRow>('client-projects', [
  { key: 'name', label: 'Name', sort: p => p.name, always: true },
  { key: 'code', label: 'Code', sort: p => p.code, hidden: true },
  { key: 'billing', label: 'Billing', sort: p => p.billing_method },
  { key: 'team', label: 'Team', sort: p => teamOn(p.id).join(', ') },
  { key: 'hours', label: 'Hours', align: 'right', sort: p => burn(p.id)?.hours_used ?? 0 },
  { key: 'budget', label: 'Budget', align: 'right', sort: p => (p.budget_hours ? usedPct(burn(p.id)?.hours_used ?? 0, p.budget_hours) : p.budget_amount ? usedPct(burn(p.id)?.amount_used ?? 0, p.budget_amount) : null) },
  { key: 'status', label: 'Status', sort: p => (p.is_active ? 0 : 1) },
])
const projectRows = computed(() => projectCols.sorted(projects.value ?? []))

const projectName = (projectId: string | null) => projects.value?.find(p => p.id === projectId)?.name ?? 'All projects'
const qty = retainerQty
const pct = retainerPct
const status = (r: RetainerRow) => periodStatus(r, todayString())
// Periods that chain (same client, project, and name) shown as one
// contract: the current period, or the latest, up front.
const contracts = computed(() => {
  const by = new Map<string, RetainerRow[]>()
  for (const r of retainers.value ?? []) {
    const key = retainerChainKey(r)
    by.set(key, [...(by.get(key) ?? []), r])
  }
  const today = todayString()
  return [...by.entries()].map(([key, periods]) => {
    periods.sort((a, b) => b.period_start.localeCompare(a.period_start))
    const shown = periods.find(p => p.period_start <= today && p.period_end >= today) ?? periods[0]!
    return { key, periods, shown }
  }).sort((a, b) => b.shown.period_start.localeCompare(a.shown.period_start))
})

function retainerSaved() {
  creatingRetainer.value = false
  editingRetainer.value = null
  refreshRetainers()
}

async function editRetainer(r: RetainerRow) {
  const { data, error } = await supabase.from('retainers').select('*').eq('id', r.retainer_id).single()
  if (error) {
    toast.add({ title: 'Could not load retainer', description: error.message, color: 'error' })
    return
  }
  editingRetainer.value = data
}

async function confirmDeleteRetainer() {
  const r = deletingRetainer.value
  if (!r) return
  const { error } = await supabase.from('retainers').delete().eq('id', r.retainer_id)
  if (error) {
    toast.add({ title: 'Could not delete retainer', description: error.message, color: 'error' })
    return
  }
  deletingRetainer.value = null
  refreshRetainers()
}

const billingLabel = (v: string) => BILLING_METHODS.find(b => b.value === v)?.label ?? v
</script>

<template>
  <div v-if="client" class="space-y-6">
    <AppCrumbs :items="[{ label: 'Clients', to: '/clients' }]" class="mb-3" />
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-semibold">{{ client.name }}</h1>
      <UBadge v-if="!client.is_active" color="neutral" variant="subtle">Inactive</UBadge>
      <div class="ml-auto flex gap-2">
        <UButton v-if="canBill" :to="`/portal?as=${id}`" variant="outline" color="neutral" icon="i-lucide-eye">View as client</UButton>
        <UButton v-if="isAdmin" variant="outline" icon="i-lucide-pencil" @click="editing = true;">Edit</UButton>
      </div>
    </div>

    <dl v-if="client.qbo_customer_id" class="text-sm">
      <dt class="text-muted">QuickBooks customer ID</dt>
      <dd>{{ client.qbo_customer_id }}</dd>
    </dl>

    <!-- Hours is dropped here: almost everything for a client is billable, so it repeats Billable hours. -->
    <ReportRollup variant="tiles" rate :omit="['Hours']" :from="`${year}-01-01`" :to="`${year}-12-31`" :client="client.name" :extra="billingTiles" />
    <p v-if="billingTiles.length" class="-mt-4 text-xs text-muted">
      Hours, billable amount and the effective rate (billable amount over billable hours) are this year. Invoiced and paid show this year with the lifetime figure under them, outstanding covers every year<template v-if="firstInvoiceYear"> back to {{ firstInvoiceYear }}</template>. Docket and Harvest invoices count together, and an invoice written off in Harvest counts as invoiced but never as outstanding.
    </p>

    <!-- Who can sign in, and who works on it: side by side, since both are short. -->
    <div class="grid gap-x-6 gap-y-2 lg:grid-cols-2 lg:grid-rows-[auto_auto_1fr]">
      <section v-if="canBill" class="grid gap-2 lg:row-span-3 lg:grid-rows-subgrid">
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-semibold">Contacts</h2>
          <UButton class="ml-auto shrink-0" size="xs" variant="outline" icon="i-lucide-user-plus" @click="inviting = true;">Invite a contact</UButton>
        </div>
        <p class="text-sm text-muted">People who can sign in to see this client's quotes, invoices, and reviews.</p>
        <UCard class="h-full" :ui="{ body: 'p-0 sm:p-0' }">
          <ul v-if="contacts?.length" class="divide-y divide-default text-sm">
            <li v-for="c in contacts" :key="c.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
              <div class="min-w-0 flex-1">
                <span class="font-medium">{{ c.full_name }}</span>
                <span class="ml-2 text-muted">{{ c.email }}</span>
              </div>
              <UBadge :color="c.is_active ? 'success' : 'neutral'" variant="subtle" size="sm">{{ c.is_active ? 'Active' : 'Inactive' }}</UBadge>
              <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-mail" :loading="inviteBusy" @click="sendInvite(c.email, c.full_name)">Send link</UButton>
              <UButton size="xs" variant="ghost" color="neutral" @click="setContactActive(c.id, !c.is_active)">{{ c.is_active ? 'Deactivate' : 'Reactivate' }}</UButton>
            </li>
          </ul>
          <p v-else class="px-4 py-6 text-center text-sm text-muted">No contacts have a login yet. Invite one and they get an email with a sign-in link.</p>
        </UCard>
      </section>

      <section class="grid gap-2 lg:row-span-3 lg:grid-rows-subgrid">
        <h2 class="text-lg font-semibold">Team</h2>
        <p class="text-sm text-muted">Who works with this client: project leads, people on open tasks, and anyone with time here in the last 90 days.</p>
        <UCard class="h-full" :ui="{ body: 'p-3 sm:p-4' }">
          <ul v-if="team.length" class="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <li v-for="m in team" :key="m.id">
              <button type="button" class="flex items-center gap-2 rounded-md p-1 -m-1 text-left transition-colors hover:bg-elevated" :title="`What ${m.name} does for this client`" @click="member = m;">
              <span class="grid size-7 shrink-0 place-items-center rounded-full bg-elevated text-[10px] font-medium">{{ initials(m.name) }}</span>
              <div>
                <div class="font-medium">{{ m.name }}</div>
                <div class="text-xs text-muted">
                  <span v-if="m.leads.length" :title="m.leads.join(', ')">Lead on {{ m.leads.length }} {{ m.leads.length === 1 ? 'project' : 'projects' }}</span>
                  <span v-if="m.leads.length && (m.tasks || m.hours)"> &middot; </span>
                  <span v-if="m.tasks">{{ m.tasks }} open {{ m.tasks === 1 ? 'task' : 'tasks' }}</span>
                  <span v-if="m.tasks && m.hours"> &middot; </span>
                  <span v-if="m.hours" class="tabular-nums">{{ formatHours(m.hours) }} in 90 days</span>
                </div>
              </div>
              </button>
            </li>
          </ul>
          <p v-else class="text-sm text-muted">Nobody yet. People show up here once they lead a project, take a task, or log time for this client.</p>
        </UCard>
      </section>
    </div>

    <div class="flex items-center gap-4">
      <h2 class="text-lg font-semibold">Projects</h2>
      <UButton v-if="isAdmin" class="ml-auto" size="sm" icon="i-lucide-plus" @click="creatingProject = true;">New project</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="table-scroll">
        <table class="w-full text-sm">
          <TableHead :cols="projectCols" />
          <tbody>
            <tr v-for="p in projectRows" :key="p.id" class="border-b border-default last:border-0">
              <td v-for="c in projectCols.visible" :key="c.key" class="px-4 py-2" :class="c.align === 'right' ? 'text-right tabular-nums' : ''">
                <NuxtLink v-if="c.key === 'name'" :to="`/projects/${p.id}`" class="font-medium hover:underline">{{ p.name }}</NuxtLink>
                <span v-else-if="c.key === 'code'" class="text-muted">{{ p.code }}</span>
                <template v-else-if="c.key === 'billing'">{{ billingLabel(p.billing_method) }}</template>
                <span v-else-if="c.key === 'team'" class="flex -space-x-1.5" :title="teamOn(p.id).join(', ')">
                  <span v-for="n in teamOn(p.id).slice(0, 5)" :key="n" class="grid size-6 place-items-center rounded-full bg-elevated text-[10px] font-medium ring-2 ring-default">{{ initials(n) }}</span>
                  <span v-if="teamOn(p.id).length > 5" class="grid size-6 place-items-center rounded-full bg-accented text-[10px] font-medium ring-2 ring-default">+{{ teamOn(p.id).length - 5 }}</span>
                </span>
                <template v-else-if="c.key === 'hours'">{{ formatHours(burn(p.id)?.hours_used ?? 0) }}</template>
                <template v-else-if="c.key === 'budget'">
                  <template v-if="p.budget_hours && burn(p.id)">
                    <span :class="usedPct(burn(p.id)!.hours_used, p.budget_hours)! >= 100 ? 'text-error' : usedPct(burn(p.id)!.hours_used, p.budget_hours)! >= 80 ? 'text-warning' : ''">{{ usedPct(burn(p.id)!.hours_used, p.budget_hours) }}%</span>
                    <span class="text-muted"> of {{ formatHours(p.budget_hours) }}</span>
                  </template>
                  <template v-else-if="p.budget_amount && burn(p.id) && seeBudgets">
                    <span :class="usedPct(burn(p.id)!.amount_used, p.budget_amount)! >= 100 ? 'text-error' : usedPct(burn(p.id)!.amount_used, p.budget_amount)! >= 80 ? 'text-warning' : ''">{{ usedPct(burn(p.id)!.amount_used, p.budget_amount) }}%</span>
                    <span class="text-muted"> of {{ money(p.budget_amount) }}</span>
                  </template>
                  <span v-else class="text-muted">No budget</span>
                </template>
                <UBadge v-else-if="c.key === 'status'" :color="p.is_active ? 'success' : 'neutral'" variant="subtle" size="sm">{{ p.is_active ? 'Active' : 'Inactive' }}</UBadge>
              </td>
              <td />
            </tr>
            <tr v-if="!projectRows.length">
              <td :colspan="projectCols.visible.length + 1" class="px-4 py-8 text-center text-muted">No projects for this client.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <div class="flex items-center gap-4">
      <h2 class="text-lg font-semibold">Tasks <span class="text-base font-normal text-muted">{{ openTasks?.length ?? 0 }} open</span></h2>
      <NuxtLink to="/tasks" class="ml-auto text-sm text-muted hover:underline">All tasks</NuxtLink>
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Task</th>
            <th class="px-4 py-2 font-medium">Project</th>
            <th class="px-4 py-2 font-medium">Status</th>
            <th class="px-4 py-2 font-medium">Assigned</th>
            <th class="px-4 py-2 text-right font-medium">Due</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in (openTasks ?? []).slice(0, TASKS_SHOWN)" :key="t.id" class="border-b border-default last:border-0">
            <td class="max-w-md truncate px-4 py-2"><NuxtLink :to="`/tasks/${t.id}`" class="font-medium hover:underline">{{ t.title }}</NuxtLink></td>
            <td class="px-4 py-2 text-muted">{{ t.projects?.name }}</td>
            <td class="px-4 py-2"><span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full" :class="ws.dot(t.status)" />{{ ws.label(t.status) }}</span></td>
            <td class="px-4 py-2">
              <span class="flex -space-x-1.5" :title="t.work_item_assignees.map(a => nameOf(a.user_id)).join(', ')">
                <span v-for="a in t.work_item_assignees.slice(0, 5)" :key="a.user_id" class="grid size-6 place-items-center rounded-full bg-elevated text-[10px] font-medium ring-2 ring-default">{{ initials(nameOf(a.user_id)) }}</span>
                <span v-if="!t.work_item_assignees.length" class="text-xs text-dimmed">Nobody</span>
              </span>
            </td>
            <td class="px-4 py-2 text-right tabular-nums" :class="t.due_on && t.due_on < todayString() ? 'text-error' : 'text-muted'">{{ t.due_on ? shortDate(t.due_on) : '' }}</td>
          </tr>
          <tr v-if="!openTasks?.length">
            <td colspan="5" class="px-4 py-8 text-center text-muted">No open tasks for this client.</td>
          </tr>
          <tr v-else-if="openTasks.length > TASKS_SHOWN">
            <td colspan="5" class="px-4 py-2 text-xs text-muted">{{ openTasks.length - TASKS_SHOWN }} more. Open a project for the rest.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <div class="flex items-center gap-4">
      <h2 class="text-lg font-semibold">Retainers</h2>
      <UButton v-if="isAdmin" class="ml-auto" size="sm" icon="i-lucide-plus" @click="creatingRetainer = true;">New retainer</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <ul v-if="contracts.length" class="divide-y divide-default text-sm">
        <li v-for="c in contracts" :key="c.key" class="space-y-2 px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="min-w-0 flex-1">
              <NuxtLink :to="`/retainers/${c.shown.retainer_id}`" class="font-medium hover:underline">{{ c.shown.name }}</NuxtLink>
              <span class="text-muted">&middot; {{ projectName(c.shown.project_id) }}</span>
              <div class="text-muted">
                {{ shortDate(c.shown.period_start) }} to {{ shortDate(c.shown.period_end) }}, {{ status(c.shown) }}
                <span v-if="c.periods.length > 1"> &middot; {{ c.periods.length }} periods since {{ shortDate(c.periods[c.periods.length - 1]!.period_start) }}</span>
              </div>
            </div>
            <div class="text-right tabular-nums">
              <div><strong>{{ qty(c.shown, c.shown.used) }}</strong> <span class="text-muted">of {{ qty(c.shown, c.shown.available) }}</span></div>
              <div class="text-xs text-muted">
                <span v-if="c.shown.carried_in > 0">{{ qty(c.shown, c.shown.allotted) }} + {{ qty(c.shown, c.shown.carried_in) }} carried in &middot; </span>
                <span :class="c.shown.remaining < 0 ? 'text-error' : ''">{{ c.shown.remaining < 0 ? qty(c.shown, -c.shown.remaining) + ' over' : qty(c.shown, c.shown.remaining) + ' left' }}</span>
              </div>
            </div>
            <div v-if="isAdmin" class="flex gap-1">
              <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" aria-label="Edit this period" @click="editRetainer(c.shown)" />
              <UButton icon="i-lucide-trash-2" variant="ghost" color="neutral" size="sm" aria-label="Delete this period" @click="deletingRetainer = c.shown;" />
            </div>
          </div>
          <UProgress :model-value="Math.min(pct(c.shown), 100)" :color="burnColor(pct(c.shown))" size="sm" />
          <details v-if="c.periods.length > 1" class="text-xs text-muted">
            <summary class="cursor-pointer select-none">Other periods</summary>
            <ul class="mt-1 divide-y divide-default/60">
              <li v-for="r in c.periods.filter(p => p.retainer_id !== c.shown.retainer_id)" :key="r.retainer_id" class="flex items-center gap-3 py-1">
                <span class="tabular-nums">{{ shortDate(r.period_start) }} to {{ shortDate(r.period_end) }}</span>
                <span class="tabular-nums">{{ qty(r, r.used) }} of {{ qty(r, r.available) }}</span>
                <span class="ml-auto flex gap-1">
                  <UButton v-if="isAdmin" icon="i-lucide-pencil" variant="ghost" color="neutral" size="xs" aria-label="Edit" @click="editRetainer(r)" />
                  <UButton v-if="isAdmin" icon="i-lucide-trash-2" variant="ghost" color="neutral" size="xs" aria-label="Delete" @click="deletingRetainer = r;" />
                </span>
              </li>
            </ul>
          </details>
        </li>
      </ul>
      <p v-else class="px-4 py-6 text-center text-sm text-muted">No retainers for this client.</p>
    </UCard>

    <template v-if="isAdmin">
      <h2 class="text-lg font-semibold">Quotes</h2>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul v-if="quotes?.length" class="divide-y divide-default text-sm">
          <li v-for="q in quotes" :key="q.id" class="flex items-center gap-3 px-4 py-2">
            <NuxtLink :to="`/quotes/${q.id}`" class="font-medium tabular-nums hover:underline">{{ q.number }}</NuxtLink>
            <span class="min-w-0 flex-1 truncate">{{ q.title }}</span>
            <span class="tabular-nums">{{ money(q.subtotal) }}</span>
            <UBadge :color="q.status === 'accepted' ? 'success' : q.status === 'sent' ? 'info' : q.status === 'declined' || q.status === 'expired' ? 'neutral' : 'neutral'" variant="subtle" size="sm">{{ q.status }}</UBadge>
          </li>
        </ul>
        <p v-else class="px-4 py-6 text-center text-sm text-muted">No quotes for this client. Start one from Quotes.</p>
      </UCard>

      <div class="flex items-center gap-4">
        <h2 class="text-lg font-semibold">Invoices</h2>
        <UButton :to="`/billing/new?client=${id}`" class="ml-auto" size="sm" variant="outline" icon="i-lucide-plus">New batch</UButton>
      </div>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <table v-if="invoices.length" class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr class="border-b border-default">
              <th class="px-4 py-2 font-medium">Number</th>
              <th class="px-2 py-2 font-medium">Subject</th>
              <th class="px-2 py-2 font-medium">Issued</th>
              <th class="px-2 py-2 font-medium">Due</th>
              <th class="px-2 py-2 text-right font-medium">Total</th>
              <th class="px-2 py-2 text-right font-medium">Outstanding</th>
              <th class="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="inv in invoices" :key="inv.id" class="border-b border-default last:border-0">
              <td class="px-4 py-2 font-medium tabular-nums">
                <NuxtLink v-if="inv.source === 'docket'" :to="`/invoices/${inv.id}`" class="hover:underline">{{ inv.number }}</NuxtLink>
                <span v-else title="Imported from Harvest; open it there for the lines">{{ inv.number }} <UBadge color="neutral" variant="subtle" size="sm" class="ml-1 align-middle">Harvest</UBadge></span>
              </td>
              <td class="max-w-sm truncate px-2 py-2 text-muted" :title="inv.subject ?? ''">{{ inv.subject }}</td>
              <td class="px-2 py-2 tabular-nums">{{ shortDate(inv.issue_date) }}</td>
              <td class="px-2 py-2 tabular-nums">{{ shortDate(inv.due_date) }}</td>
              <td class="px-2 py-2 text-right tabular-nums">{{ money(inv.total) }}</td>
              <td class="px-2 py-2 text-right tabular-nums">{{ inv.status === 'sent' ? money(inv.due_amount) : '' }}</td>
              <td class="px-4 py-2"><UBadge :color="invoiceBadge(inv).color" variant="subtle" size="sm">{{ invoiceBadge(inv).label }}</UBadge></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="px-4 py-6 text-center text-sm text-muted">No invoices yet. Make a batch, then create the invoice from it. The Harvest years show here too once imported.</p>
      </UCard>
    </template>

    <AppDrawer :open="!!member" :title="member?.name ?? ''" :description="`What they do for ${client.name}`" @update:open="(v) => { if (!v) member = null }">
      <template #body>
        <div v-if="member" class="space-y-6">
          <div class="grid grid-cols-3 gap-4">
            <div>
              <div class="text-xs text-muted">Open tasks</div>
              <div class="text-lg font-semibold tabular-nums">{{ member.tasks }}</div>
            </div>
            <div>
              <div class="text-xs text-muted">Last 90 days</div>
              <div class="text-lg font-semibold tabular-nums">{{ formatHours(member.hours) }}</div>
            </div>
            <div>
              <div class="text-xs text-muted">This year</div>
              <div class="text-lg font-semibold tabular-nums">{{ memberTime ? formatHours(memberTime.thisYear) : '' }}</div>
              <div v-if="memberTime" class="text-xs tabular-nums text-muted">{{ formatHours(memberTime.total) }} all time</div>
            </div>
          </div>

          <div v-if="member.leads.length">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-dimmed">Leads</h3>
            <ul class="mt-1 space-y-0.5 text-sm">
              <li v-for="n in member.leads" :key="n">{{ n }}</li>
            </ul>
          </div>

          <div>
            <h3 class="text-xs font-semibold uppercase tracking-wider text-dimmed">Open tasks <span class="font-normal">{{ memberTasks.length }}</span></h3>
            <ul v-if="memberTasks.length" class="mt-1 divide-y divide-default text-sm">
              <li v-for="t in memberTasks" :key="t.id" class="flex items-center gap-2 py-1.5">
                <span class="size-2 shrink-0 rounded-full" :class="ws.dot(t.status)" :title="ws.label(t.status)" />
                <NuxtLink :to="`/tasks/${t.id}`" class="min-w-0 flex-[2] truncate hover:underline" @click="member = null">{{ t.title }}</NuxtLink>
                <span class="max-w-28 shrink truncate text-xs text-muted">{{ t.projects?.name }}</span>
                <span class="w-14 shrink-0 text-right text-xs tabular-nums" :class="t.due_on && t.due_on < todayString() ? 'text-error' : 'text-muted'">{{ t.due_on ? shortDate(t.due_on) : '' }}</span>
              </li>
            </ul>
            <p v-else class="mt-1 text-sm text-muted">Nothing open for this client.</p>
          </div>

          <div>
            <h3 class="text-xs font-semibold uppercase tracking-wider text-dimmed">Hours by project</h3>
            <p v-if="memberTimeStatus === 'pending'" class="mt-1 text-sm text-muted">Loading</p>
            <ul v-else-if="memberTime?.projects.length" class="mt-1 divide-y divide-default text-sm">
              <li v-for="r in memberTime.projects" :key="r.pid" class="flex items-center gap-3 py-1.5">
                <NuxtLink :to="`/projects/${r.pid}`" class="min-w-0 flex-1 truncate hover:underline" @click="member = null">{{ r.name }}</NuxtLink>
                <span class="shrink-0 tabular-nums">{{ formatHours(r.hours) }}</span>
              </li>
            </ul>
            <p v-else class="mt-1 text-sm text-muted">No time logged on this client{{ can('see_all_time') ? '' : ', or none you can see' }}.</p>
          </div>
        </div>
      </template>
    </AppDrawer>

    <AppDrawer v-model:open="creatingRetainer" title="New retainer">
      <template #body>
        <RetainerForm :client-id="id" :projects="projects ?? []" @saved="retainerSaved" @cancel="creatingRetainer = false;" />
      </template>
    </AppDrawer>

    <AppDrawer :open="!!editingRetainer" title="Edit retainer" @update:open="(v) => { if (!v) editingRetainer = null }">
      <template #body>
        <RetainerForm v-if="editingRetainer" :retainer="editingRetainer" :client-id="id" :projects="projects ?? []" @saved="retainerSaved" @cancel="editingRetainer = null;" />
      </template>
    </AppDrawer>

    <UModal :open="!!deletingRetainer" title="Delete retainer?" @update:open="(v) => { if (!v) deletingRetainer = null }">
      <template #body>
        <p v-if="deletingRetainer" class="text-sm">This removes "{{ deletingRetainer.name }}" for {{ shortDate(deletingRetainer.period_start) }} to {{ shortDate(deletingRetainer.period_end) }}. Time entries are not affected.</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deletingRetainer = null;">Cancel</UButton>
          <UButton color="error" @click="confirmDeleteRetainer">Delete</UButton>
        </div>
      </template>
    </UModal>

    <AppDrawer v-model:open="inviting" title="Invite a contact" description="They get an email from Docket with a sign-in link. No password.">
      <template #body>
        <form class="space-y-4" @submit.prevent="sendInvite()">
          <UFormField label="Name">
            <UInput v-model="invite.fullName" class="w-full" placeholder="Jane Smith" autofocus />
          </UFormField>
          <UFormField label="Email" required>
            <UInput v-model="invite.email" type="email" class="w-full" placeholder="jane@theirdomain.com" required />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="inviting = false;">Cancel</UButton>
            <UButton type="submit" :loading="inviteBusy" :disabled="!invite.email.trim()">Send invitation</UButton>
          </div>
        </form>
      </template>
    </AppDrawer>

    <AppDrawer v-model:open="editing" title="Edit client">
      <template #body>
        <ClientForm :client="client" @saved="editing = false; refresh()" @cancel="editing = false" />
      </template>
    </AppDrawer>

    <AppDrawer v-model:open="creatingProject" title="New project">
      <template #body>
        <ProjectForm :clients="[client]" :people="people ?? []" :default-client-id="client.id" @saved="creatingProject = false; refreshProjects()" @cancel="creatingProject = false" />
      </template>
    </AppDrawer>
  </div>
</template>
