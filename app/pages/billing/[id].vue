<script setup lang="ts">
// One batch: what it locked, its totals, a CSV of the lines, and void
// (draft or failed only), which releases the rows.
definePageMeta({ middleware: 'can', permission: 'manage_invoices' })

const route = useRoute()
const id = route.params.id as string
const supabase = useSupabaseClient()
const toast = useToast()
const csv = useCsv()

const __ad1 = useAsyncData(`batch-${id}`, async () => {
  const { data, error } = await supabase
    .from('billing_batches')
    .select('*, clients(name), projects(name), profiles(full_name)')
    .eq('id', id)
    .single()
  if (error) throw createError({ statusCode: 404, statusMessage: 'Batch not found' })
  return data
}, fresh)

const __ad2 = useAsyncData(`batch-${id}-time`, async () => {
  const { data, error } = await supabase
    .from('time_detail')
    .select('id, spent_on, user_name, project_name, task_name, hours, amount, notes')
    .eq('batch_id', id)
    .order('spent_on')
    .order('user_name')
  if (error) throw error
  return data
}, fresh)

const __ad3 = useAsyncData(`batch-${id}-expenses`, async () => {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, spent_on, amount, notes, receipt_path, projects(name), expense_categories(name), profiles!expenses_user_id_fkey(full_name)')
    .eq('batch_id', id)
    .order('spent_on')
  if (error) throw error
  return data
}, fresh)

// The live invoice made from this batch, if any.
const __ad4 = useAsyncData(`batch-${id}-invoice`, async () => {
  const { data, error } = await supabase.from('invoices').select('id, number, status').eq('batch_id', id).neq('status', 'void').maybeSingle()
  if (error) throw error
  return data
}, fresh)
await Promise.all([__ad1, __ad2, __ad3, __ad4])
const { data: batch, refresh } = __ad1
const { data: time, refresh: refreshTime } = __ad2
const { data: expenses, refresh: refreshExpenses } = __ad3
const { data: invoice, refresh: refreshInvoice } = __ad4

useHead({ title: () => (batch.value ? `Batch for ${batch.value.clients?.name ?? 'client'}` : 'Batch') })

const hours = computed(() => (time.value ?? []).reduce((s, r) => s + (r.hours ?? 0), 0))
const timeAmount = computed(() => (time.value ?? []).reduce((s, r) => s + (r.amount ?? 0), 0))
const expenseAmount = computed(() => (expenses.value ?? []).reduce((s, r) => s + r.amount, 0))
const statusColor: Record<string, 'neutral' | 'warning' | 'success' | 'error'> = {
  draft: 'neutral', pushing: 'warning', pushed: 'success', failed: 'error', void: 'neutral', invoiced: 'success',
}
const canVoid = computed(() => batch.value?.status === 'draft' || batch.value?.status === 'failed')

// How much the invoice lines say. Lines stay editable on the invoice.
const choosingDetail = ref(false)
const detail = ref<'task' | 'project' | 'summary'>('task')
const DETAIL = [
  { value: 'task', label: 'By task type', description: 'One line per project and task type, hours times rate. What Harvest did.' },
  { value: 'project', label: 'By project', description: 'One line per project with the hours by task type in the text.' },
  { value: 'summary', label: 'One line', description: 'All the work on one line for the period, expenses on another.' },
]
const invoicing = ref(false)
async function createInvoice() {
  const b = batch.value
  if (!b) return
  invoicing.value = true
  try {
    const { data, error } = await supabase.rpc('create_invoice', { p_client_id: b.client_id, p_batch_id: b.id, p_detail: detail.value })
    if (error) throw error
    await navigateTo(`/invoices/${data}`)
  } catch (e) {
    toast.add({ title: 'Could not create the invoice', description: (e as Error).message, color: 'error' })
    await Promise.all([refresh(), refreshInvoice()])
  } finally {
    invoicing.value = false
  }
}

function exportCsv() {
  const b = batch.value
  if (!b) return
  const rows = [
    ...(time.value ?? []).map(r => ({ date: r.spent_on, type: 'Time', person: r.user_name, project: r.project_name, item: r.task_name, hours: r.hours, amount: r.amount, notes: r.notes })),
    ...(expenses.value ?? []).map(r => ({ date: r.spent_on, type: 'Expense', person: r.profiles?.full_name, project: r.projects?.name, item: r.expense_categories?.name, hours: null, amount: r.amount, notes: r.notes })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const columns = [
    { key: 'date', label: 'Date', kind: 'date' as const },
    { key: 'type', label: 'Type' },
    { key: 'person', label: 'Person' },
    { key: 'project', label: 'Project' },
    { key: 'item', label: 'Task or category' },
    { key: 'hours', label: 'Hours', kind: 'hours' as const },
    { key: 'amount', label: 'Amount', kind: 'money' as const },
    { key: 'notes', label: 'Notes' },
  ]
  const name = `batch-${(b.clients?.name ?? 'client').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${b.period_start}-to-${b.period_end}.csv`
  csv.download(name, csv.toCsv(columns, rows, { hours: hours.value, amount: timeAmount.value + expenseAmount.value }))
}

const voiding = ref(false)
const confirmingVoid = ref(false)
async function voidBatch() {
  voiding.value = true
  try {
    const { error } = await supabase.rpc('void_billing_batch', { p_batch_id: id })
    if (error) throw error
    confirmingVoid.value = false
    toast.add({ title: 'Batch voided', description: 'Its time and expenses are unbilled again.', color: 'success' })
    await Promise.all([refresh(), refreshTime(), refreshExpenses()])
  } catch (e) {
    toast.add({ title: 'Could not void the batch', description: (e as Error).message, color: 'error' })
  } finally {
    voiding.value = false
  }
}
</script>

<template>
  <div v-if="batch" class="space-y-6">
    <AppCrumbs :items="[{ label: 'Billing', to: '/billing' }]" class="mb-3" />
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-semibold">
        <NuxtLink :to="`/clients/${batch.client_id}`" class="hover:underline">{{ batch.clients?.name }}</NuxtLink>
        <span v-if="batch.projects" class="font-normal text-muted"> / {{ batch.projects.name }}</span>
      </h1>
      <UBadge :color="statusColor[batch.status]" variant="subtle">{{ batch.status }}</UBadge>
      <div class="ml-auto flex gap-2">
        <UButton v-if="invoice" :to="`/invoices/${invoice.id}`" variant="outline" icon="i-lucide-file-text">Invoice {{ invoice.number }}</UButton>
        <UButton v-else-if="batch.status === 'draft'" icon="i-lucide-file-plus" :loading="invoicing" @click="choosingDetail = true;">Create invoice</UButton>
        <UButton variant="outline" color="neutral" icon="i-lucide-download" :disabled="!time?.length && !expenses?.length" @click="exportCsv">Export CSV</UButton>
        <UButton v-if="canVoid" variant="outline" color="error" icon="i-lucide-undo-2" @click="confirmingVoid = true;">Void batch</UButton>
      </div>
    </div>

    <UCard>
      <dl class="grid gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt class="text-muted">Period</dt>
          <dd class="tabular-nums">{{ shortDate(batch.period_start) }} to {{ shortDate(batch.period_end) }}</dd>
        </div>
        <div>
          <dt class="text-muted">Time</dt>
          <dd class="tabular-nums">{{ formatHours(batch.subtotal_hours) }}<template v-if="batch.status !== 'void'"> &middot; {{ money(timeAmount) }}</template></dd>
        </div>
        <div>
          <dt class="text-muted">Expenses</dt>
          <dd class="tabular-nums">{{ batch.status === 'void' ? 'released' : money(expenseAmount) }}</dd>
        </div>
        <div>
          <dt class="text-muted">Batch total</dt>
          <dd class="text-lg font-semibold tabular-nums">{{ money(batch.subtotal_amount) }}</dd>
        </div>
      </dl>
      <p class="mt-3 text-xs text-muted">
        Created {{ shortDate(batch.created_at.slice(0, 10)) }} by {{ batch.profiles?.full_name }}.
        <span v-if="batch.qbo_doc_number">QuickBooks invoice {{ batch.qbo_doc_number }}.</span>
        <span v-if="batch.qbo_error" class="text-error">Last push failed: {{ batch.qbo_error }}</span>
        <span v-if="batch.status === 'void'">Voided; the rows below were released.</span>
        <span v-if="batch.status === 'invoiced'">Invoiced; void the invoice first to change anything here.</span>
      </p>
    </UCard>

    <h2 class="text-lg font-semibold">Time <span class="text-sm font-normal text-muted">{{ time?.length ?? 0 }} entries</span></h2>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Date</th>
            <th class="px-2 py-2 font-medium">Person</th>
            <th class="px-2 py-2 font-medium">Project</th>
            <th class="px-2 py-2 font-medium">Task</th>
            <th class="px-2 py-2 font-medium">Notes</th>
            <th class="px-2 py-2 text-right font-medium">Hours</th>
            <th class="px-4 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in time" :key="r.id!" class="border-b border-default last:border-0">
            <td class="px-4 py-1.5 tabular-nums">{{ shortDate(r.spent_on!) }}</td>
            <td class="px-2 py-1.5">{{ r.user_name }}</td>
            <td class="px-2 py-1.5">{{ r.project_name }}</td>
            <td class="px-2 py-1.5">{{ r.task_name }}</td>
            <td class="max-w-md truncate px-2 py-1.5 text-muted" :title="r.notes ?? ''">{{ r.notes }}</td>
            <td class="px-2 py-1.5 text-right tabular-nums">{{ formatHours(r.hours ?? 0) }}</td>
            <td class="px-4 py-1.5 text-right tabular-nums">{{ money(r.amount ?? 0) }}</td>
          </tr>
          <tr v-if="!time?.length">
            <td colspan="7" class="px-4 py-6 text-center text-muted">No time in this batch.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <h2 class="text-lg font-semibold">Expenses <span class="text-sm font-normal text-muted">{{ expenses?.length ?? 0 }} entries</span></h2>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Date</th>
            <th class="px-2 py-2 font-medium">Person</th>
            <th class="px-2 py-2 font-medium">Project</th>
            <th class="px-2 py-2 font-medium">Category</th>
            <th class="px-2 py-2 font-medium">Notes</th>
            <th class="px-4 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in expenses" :key="r.id" class="border-b border-default last:border-0">
            <td class="px-4 py-1.5 tabular-nums">{{ shortDate(r.spent_on) }}</td>
            <td class="px-2 py-1.5">{{ r.profiles?.full_name }}</td>
            <td class="px-2 py-1.5">{{ r.projects?.name }}</td>
            <td class="px-2 py-1.5">{{ r.expense_categories?.name }}</td>
            <td class="max-w-md truncate px-2 py-1.5 text-muted" :title="r.notes ?? ''">{{ r.notes }}<UIcon v-if="r.receipt_path" name="i-lucide-paperclip" class="ml-1 align-middle" /></td>
            <td class="px-4 py-1.5 text-right tabular-nums">{{ money(r.amount) }}</td>
          </tr>
          <tr v-if="!expenses?.length">
            <td colspan="6" class="px-4 py-6 text-center text-muted">No expenses in this batch.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <UModal v-model:open="choosingDetail" title="Create invoice" description="How much should the lines say? You can edit them on the invoice afterwards.">
      <template #body>
        <URadioGroup v-model="detail" :items="DETAIL" variant="card" />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="choosingDetail = false;">Cancel</UButton>
          <UButton :loading="invoicing" icon="i-lucide-file-plus" @click="createInvoice">Create invoice</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="confirmingVoid" title="Void this batch?">
      <template #body>
        <p class="text-sm">Its {{ time?.length ?? 0 }} time {{ time?.length === 1 ? 'entry' : 'entries' }} and {{ expenses?.length ?? 0 }} {{ expenses?.length === 1 ? 'expense' : 'expenses' }} go back to unbilled and can be edited again. The batch stays in the list as void.</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="confirmingVoid = false;">Cancel</UButton>
          <UButton color="error" :loading="voiding" @click="voidBatch">Void batch</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
