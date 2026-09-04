<script setup lang="ts">
// Build a batch: pick a client and period, untick anything to hold back,
// create. create_billing_batch() locks the rows in one transaction.
definePageMeta({ middleware: 'can', permission: 'manage_invoices' })
useHead({ title: 'New batch' })

const supabase = useSupabaseClient()
const route = useRoute()
const toast = useToast()

const lastMonth = addDays(startOfMonth(todayString()), -1)
const clientId = ref<string | undefined>(typeof route.query.client === 'string' ? route.query.client : undefined)
const projectId = ref<string | undefined>()
const from = ref(startOfMonth(lastMonth))
const to = ref(endOfMonth(lastMonth))

const __ad1 = useAsyncData('clients-for-billing', async () => {
  const { data, error } = await supabase.from('clients').select('id, name').order('name')
  if (error) throw error
  return data
}, fresh)

const __ad2 = useAsyncData('projects-for-billing', async () => {
  if (!clientId.value) return []
  const { data, error } = await supabase.from('projects').select('id, name').eq('client_id', clientId.value).order('name')
  if (error) throw error
  return data
}, { ...fresh, watch: [clientId] })

const __ad3 = useAsyncData('categories-for-billing', async () => {
  const { data, error } = await supabase.from('expense_categories').select('id, name')
  if (error) throw error
  return data
}, fresh)

const __ad4 = useAsyncData('people-for-billing', async () => {
  const { data, error } = await supabase.from('profiles').select('id, full_name')
  if (error) throw error
  return data
}, fresh)
await Promise.all([__ad1, __ad2, __ad3, __ad4])
const { data: clients } = __ad1
const { data: projects } = __ad2
const { data: categories } = __ad3
const { data: people } = __ad4

// PostgREST caps a response at 1000 rows; a busy client-month can pass that.
async function selectAll<T>(query: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null, error: { message: string } | null }> }): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

const ready = computed(() => !!clientId.value && from.value <= to.value)

const __ad5 = useAsyncData('unbilled-time', async () => {
  if (!ready.value) return []
  let q = supabase.from('unbilled_time')
    .select('id, spent_on, project_id, project_name, task_name, user_name, hours, amount, notes')
    .eq('client_id', clientId.value!).gte('spent_on', from.value).lte('spent_on', to.value)
    .order('spent_on').order('user_name')
  if (projectId.value) q = q.eq('project_id', projectId.value)
  return selectAll(q)
}, { ...fresh, watch: [clientId, projectId, from, to] })

const __ad6 = useAsyncData('unbilled-expenses', async () => {
  if (!ready.value) return []
  let q = supabase.from('unbilled_expenses')
    .select('id, spent_on, project_id, project_name, category_id, user_id, amount, notes, receipt_path')
    .eq('client_id', clientId.value!).gte('spent_on', from.value).lte('spent_on', to.value)
    .order('spent_on')
  if (projectId.value) q = q.eq('project_id', projectId.value)
  return selectAll(q)
}, { ...fresh, watch: [clientId, projectId, from, to] })
await Promise.all([__ad5, __ad6])
const { data: time, status: timeStatus } = __ad5
const { data: expenses, status: expenseStatus } = __ad6

const loading = computed(() => timeStatus.value === 'pending' || expenseStatus.value === 'pending')

// Everything starts ticked; the sets hold what stays in.
const pickedTime = ref(new Set<string>())
const pickedExpenses = ref(new Set<string>())
watch(time, rows => { pickedTime.value = new Set((rows ?? []).map(r => r.id!)) }, { immediate: true })
watch(expenses, rows => { pickedExpenses.value = new Set((rows ?? []).map(r => r.id!)) }, { immediate: true })
watch(clientId, () => { projectId.value = undefined })

function toggle(set: Set<string>, id: string, on: boolean) {
  if (on) set.add(id)
  else set.delete(id)
}
function toggleAll(set: Set<string>, ids: string[], on: boolean) {
  for (const id of ids) toggle(set, id, on)
}

const clientOptions = computed(() => (clients.value ?? []).map(c => ({ label: c.name, value: c.id })))
// The menu is built on Reka UI, whose items refuse an empty-string value
// and render nothing at all, hence the 'all' sentinel.
const ALL = 'all'
const projectOptions = computed(() => [{ label: 'All projects', value: ALL }, ...(projects.value ?? []).map(p => ({ label: p.name, value: p.id }))])
const projectPick = computed({
  get: () => projectId.value ?? ALL,
  set: (v: string) => { projectId.value = v === ALL ? undefined : v },
})
const categoryName = (id: string | null) => categories.value?.find(c => c.id === id)?.name ?? ''
const personName = (id: string | null) => people.value?.find(p => p.id === id)?.full_name ?? ''

const timeRows = computed(() => time.value ?? [])
const expenseRows = computed(() => expenses.value ?? [])
const pickedTimeRows = computed(() => timeRows.value.filter(r => pickedTime.value.has(r.id!)))
const pickedExpenseRows = computed(() => expenseRows.value.filter(r => pickedExpenses.value.has(r.id!)))
const hours = computed(() => pickedTimeRows.value.reduce((s, r) => s + (r.hours ?? 0), 0))
const timeAmount = computed(() => pickedTimeRows.value.reduce((s, r) => s + (r.amount ?? 0), 0))
const expenseAmount = computed(() => pickedExpenseRows.value.reduce((s, r) => s + (r.amount ?? 0), 0))
const noRate = computed(() => pickedTimeRows.value.filter(r => (r.hours ?? 0) > 0 && !(r.amount ?? 0)).length)
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const creating = ref(false)
async function create() {
  if (!clientId.value) return
  creating.value = true
  try {
    const { data, error } = await supabase.rpc('create_billing_batch', {
      p_client_id: clientId.value,
      p_project_id: projectId.value,
      p_period_start: from.value,
      p_period_end: to.value,
      p_time_entry_ids: [...pickedTime.value],
      p_expense_ids: [...pickedExpenses.value],
    })
    if (error) throw error
    const n = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`
    toast.add({ title: 'Batch created', description: `${n(pickedTime.value.size, 'time entry').replace('entrys', 'entries')} and ${n(pickedExpenses.value.size, 'expense')} locked.`, color: 'success' })
    await navigateTo(`/billing/${data}`)
  } catch (e) {
    toast.add({ title: 'Could not create the batch', description: (e as Error).message, color: 'error' })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <AppCrumbs :items="[{ label: 'Billing', to: '/billing' }]" class="mb-3" />
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-semibold">New batch</h1>
    </div>

    <UCard>
      <div class="grid gap-4 md:grid-cols-4">
        <UFormField label="Client">
          <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" class="w-full" placeholder="Pick a client" />
        </UFormField>
        <UFormField label="Project">
          <USelectMenu v-model="projectPick" :items="projectOptions" value-key="value" class="w-full" :disabled="!clientId" />
        </UFormField>
        <UFormField label="From">
          <UInput v-model="from" type="date" class="w-full" />
        </UFormField>
        <UFormField label="To">
          <UInput v-model="to" type="date" class="w-full" />
        </UFormField>
      </div>
    </UCard>

    <template v-if="ready">
      <div class="flex items-center gap-4">
        <h2 class="text-lg font-semibold">Time</h2>
        <span class="text-sm text-muted">{{ pickedTime.size }} of {{ timeRows.length }} picked</span>
        <UButton v-if="timeRows.length" size="xs" variant="ghost" color="neutral" @click="toggleAll(pickedTime, timeRows.map(r => r.id!), pickedTime.size < timeRows.length)">
          {{ pickedTime.size < timeRows.length ? 'Pick all' : 'Clear' }}
        </UButton>
      </div>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <table class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr class="border-b border-default">
              <th class="w-8 px-4 py-2" />
              <th class="px-2 py-2 font-medium">Date</th>
              <th class="px-2 py-2 font-medium">Person</th>
              <th class="px-2 py-2 font-medium">Project</th>
              <th class="px-2 py-2 font-medium">Task</th>
              <th class="px-2 py-2 font-medium">Notes</th>
              <th class="px-2 py-2 text-right font-medium">Hours</th>
              <th class="px-4 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in timeRows" :key="r.id!" class="border-b border-default last:border-0" :class="{ 'opacity-50': !pickedTime.has(r.id!) }">
              <td class="px-4 py-1.5"><UCheckbox :model-value="pickedTime.has(r.id!)" @update:model-value="toggle(pickedTime, r.id!, $event === true)" /></td>
              <td class="px-2 py-1.5 tabular-nums">{{ shortDate(r.spent_on!) }}</td>
              <td class="px-2 py-1.5">{{ r.user_name }}</td>
              <td class="px-2 py-1.5">{{ r.project_name }}</td>
              <td class="px-2 py-1.5">{{ r.task_name }}</td>
              <td class="max-w-md truncate px-2 py-1.5 text-muted" :title="r.notes ?? ''">{{ r.notes }}</td>
              <td class="px-2 py-1.5 text-right tabular-nums">{{ formatHours(r.hours ?? 0) }}</td>
              <td class="px-4 py-1.5 text-right tabular-nums" :class="{ 'text-warning': (r.hours ?? 0) > 0 && !(r.amount ?? 0) }">{{ money(r.amount ?? 0) }}</td>
            </tr>
            <tr v-if="!timeRows.length">
              <td colspan="8" class="px-4 py-6 text-center text-muted">{{ loading ? 'Loading' : 'No unbilled time in this period.' }}</td>
            </tr>
          </tbody>
        </table>
      </UCard>

      <div class="flex items-center gap-4">
        <h2 class="text-lg font-semibold">Expenses</h2>
        <span class="text-sm text-muted">{{ pickedExpenses.size }} of {{ expenseRows.length }} picked</span>
        <UButton v-if="expenseRows.length" size="xs" variant="ghost" color="neutral" @click="toggleAll(pickedExpenses, expenseRows.map(r => r.id!), pickedExpenses.size < expenseRows.length)">
          {{ pickedExpenses.size < expenseRows.length ? 'Pick all' : 'Clear' }}
        </UButton>
      </div>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <table class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr class="border-b border-default">
              <th class="w-8 px-4 py-2" />
              <th class="px-2 py-2 font-medium">Date</th>
              <th class="px-2 py-2 font-medium">Person</th>
              <th class="px-2 py-2 font-medium">Project</th>
              <th class="px-2 py-2 font-medium">Category</th>
              <th class="px-2 py-2 font-medium">Notes</th>
              <th class="px-4 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in expenseRows" :key="r.id!" class="border-b border-default last:border-0" :class="{ 'opacity-50': !pickedExpenses.has(r.id!) }">
              <td class="px-4 py-1.5"><UCheckbox :model-value="pickedExpenses.has(r.id!)" @update:model-value="toggle(pickedExpenses, r.id!, $event === true)" /></td>
              <td class="px-2 py-1.5 tabular-nums">{{ shortDate(r.spent_on!) }}</td>
              <td class="px-2 py-1.5">{{ personName(r.user_id) }}</td>
              <td class="px-2 py-1.5">{{ r.project_name }}</td>
              <td class="px-2 py-1.5">{{ categoryName(r.category_id) }}</td>
              <td class="max-w-md truncate px-2 py-1.5 text-muted" :title="r.notes ?? ''">{{ r.notes }}<UIcon v-if="r.receipt_path" name="i-lucide-paperclip" class="ml-1 align-middle" /></td>
              <td class="px-4 py-1.5 text-right tabular-nums">{{ money(r.amount ?? 0) }}</td>
            </tr>
            <tr v-if="!expenseRows.length">
              <td colspan="7" class="px-4 py-6 text-center text-muted">{{ loading ? 'Loading' : 'No unbilled expenses in this period.' }}</td>
            </tr>
          </tbody>
        </table>
      </UCard>

      <UCard>
        <div class="flex flex-wrap items-center gap-6">
          <div class="text-sm">
            <div class="text-muted">Time</div>
            <div class="font-medium tabular-nums">{{ formatHours(hours) }} &middot; {{ money(timeAmount) }}</div>
          </div>
          <div class="text-sm">
            <div class="text-muted">Expenses</div>
            <div class="font-medium tabular-nums">{{ money(expenseAmount) }}</div>
          </div>
          <div class="text-sm">
            <div class="text-muted">Batch total</div>
            <div class="text-lg font-semibold tabular-nums">{{ money(timeAmount + expenseAmount) }}</div>
          </div>
          <p v-if="noRate" class="text-sm text-warning">{{ noRate }} picked {{ noRate === 1 ? 'entry has' : 'entries have' }} no rate and would bill at $0.</p>
          <UButton class="ml-auto" icon="i-lucide-lock" :loading="creating" :disabled="loading || (pickedTime.size + pickedExpenses.size) === 0" @click="create">
            Create batch and lock {{ pickedTime.size + pickedExpenses.size }} rows
          </UButton>
        </div>
      </UCard>
    </template>
    <p v-else class="text-sm text-muted">Pick a client to see what is unbilled.</p>
  </div>
</template>
