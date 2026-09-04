<script setup lang="ts">
// Every invoice, Docket's own and the Harvest history, with what is
// outstanding and what is late. New invoices usually start from a batch
// (Billing); this page can also start a blank one for a client. Harvest
// rows are read only: the number opens nothing, the badge says where it
// came from, and a closed one in Harvest means written off.
definePageMeta({ middleware: 'can', permission: 'manage_invoices' })
useHead({ title: 'Invoices' })

const supabase = useSupabaseClient()
const toast = useToast()

const __ad1 = useAsyncData('invoices', async () => {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, number, status, subject, issue_date, due_date, total, due_amount, sent_at, client_id, clients(name)')
    .order('issue_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}, fresh)

const __ad2 = useAsyncData('clients-for-invoices', async () => {
  const { data, error } = await supabase.from('clients').select('id, name').eq('is_active', true).order('name')
  if (error) throw error
  return data
}, fresh)
// The Harvest years, 2015 on: thousands of rows. The page opens with every
// open one plus the latest thousand; a button loads the rest.
type HarvestRow = { id: string, number: string, subject: string | null, state: string, issue_date: string, due_date: string | null, amount: number, due_amount: number, client_id: string | null, client_name: string }
const HARVEST_COLS = 'id, number, subject, state, issue_date, due_date, amount, due_amount, client_id, client_name'
const __ad3 = useAsyncData('harvest-invoices-recent', async () => {
  const [recent, open, count] = await Promise.all([
    supabase.from('harvest_invoices').select(HARVEST_COLS).order('issue_date', { ascending: false }).range(0, 999),
    supabase.from('harvest_invoices').select(HARVEST_COLS).eq('state', 'open'),
    supabase.from('harvest_invoices').select('id', { count: 'exact', head: true }),
  ])
  for (const r of [recent, open, count]) if (r.error) throw r.error
  const seen = new Set((recent.data ?? []).map(r => r.id))
  return { rows: [...(recent.data ?? []), ...(open.data ?? []).filter(r => !seen.has(r.id))] as HarvestRow[], total: count.count ?? 0 }
}, fresh)
await Promise.all([__ad1, __ad2, __ad3])
const { data: docketInvoices } = __ad1
const { data: clients } = __ad2
const { data: harvestRecent } = __ad3
const harvestAll = ref<HarvestRow[] | null>(null)
const loadingHistory = ref(false)
const harvest = computed(() => harvestAll.value ?? harvestRecent.value?.rows ?? [])
const harvestHidden = computed(() => harvestAll.value ? 0 : Math.max(0, (harvestRecent.value?.total ?? 0) - harvest.value.length))
async function loadHistory() {
  loadingHistory.value = true
  try {
    harvestAll.value = await selectAll<HarvestRow>(supabase.from('harvest_invoices').select(HARVEST_COLS).order('issue_date', { ascending: false }))
  } catch (e) {
    toast.add({ title: 'Could not load the Harvest history', description: (e as Error).message, color: 'error' })
  } finally {
    loadingHistory.value = false
  }
}

// One shape for both sources. Harvest: open is sent, paid is paid, closed
// is written off (invoiced, never outstanding), draft is draft.
type Row = InvoiceRow
const invoices = computed<Row[]>(() => [
  ...(docketInvoices.value ?? []).map(invoiceRow),
  ...(harvest.value ?? []).map(harvestInvoiceRow),
])
type Filter = 'open' | 'overdue' | 'draft' | 'paid' | 'void' | 'all'
const view = await useViewState('invoices', { filter: 'all' as Filter })
const filter = persisted(view, 'filter')
const filters: { value: Filter, label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'draft', label: 'Drafts' }, { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue' }, { value: 'paid', label: 'Paid' }, { value: 'void', label: 'Void' },
]
const today = todayString()
const isOverdue = (i: Pick<Row, 'status' | 'due_date'>) => invoiceOverdue(i, today)
// Drafts float to the top of "All" so work in progress is never hidden.
const rank: Record<string, number> = { draft: 0, sent: 1, paid: 2, void: 3, written_off: 3 }
const search = ref('')
const cols = await useColumns<Row>('invoices', [
  { key: 'number', label: 'Number', sort: i => i.number, always: true },
  { key: 'client', label: 'Client', sort: i => i.client_name },
  { key: 'subject', label: 'Subject', sort: i => i.subject },
  { key: 'issued', label: 'Issued', sort: i => i.issue_date },
  { key: 'due', label: 'Due', sort: i => i.due_date },
  { key: 'total', label: 'Total', align: 'right', sort: i => i.total, permission: 'see_money' },
  { key: 'outstanding', label: 'Outstanding', align: 'right', sort: i => (i.status === 'sent' ? i.due_amount : null), permission: 'see_money' },
  { key: 'status', label: 'Status', sort: i => rank[i.status] ?? 9 },
])
const q = computed(() => search.value.trim().toLowerCase())
const matches = (i: Row) => !q.value || `${i.number} ${i.client_name} ${i.subject ?? ''}`.toLowerCase().includes(q.value)
const allRows = computed(() => cols.sorted((invoices.value ?? [])
  .filter(i =>
    filter.value === 'all' ? true
    : filter.value === 'open' ? i.status === 'sent'
    : filter.value === 'overdue' ? isOverdue(i)
    : filter.value === 'void' ? (i.status === 'void' || i.status === 'written_off')
    : i.status === filter.value)
  .filter(matches)
  .sort((a, b) => (filter.value === 'all' ? (rank[a.status] ?? 9) - (rank[b.status] ?? 9) : 0))))
// A page at a time, so eleven years of Harvest do not land in the DOM at once.
const PAGE = 200
const shown = ref(PAGE)
watch([filter, q], () => { shown.value = PAGE })
const rows = computed(() => allRows.value.slice(0, shown.value))
const outstanding = computed(() => (invoices.value ?? []).filter(i => i.status === 'sent').reduce((s, i) => s + i.due_amount, 0))
const overdue = computed(() => (invoices.value ?? []).filter(isOverdue).reduce((s, i) => s + i.due_amount, 0))
const drafts = computed(() => (invoices.value ?? []).filter(i => i.status === 'draft').length)

const badge = (i: Pick<Row, 'status' | 'due_date'>) => invoiceBadge(i, today)

const creating = ref(false)
const newClientId = ref<string | undefined>()
const busy = ref(false)
async function createBlank() {
  if (!newClientId.value) return
  busy.value = true
  try {
    const { data, error } = await supabase.rpc('create_invoice', { p_client_id: newClientId.value })
    if (error) throw error
    await navigateTo(`/invoices/${data}`)
  } catch (e) {
    toast.add({ title: 'Could not create the invoice', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Invoices</h1>
        <p class="text-sm text-muted">Made from billing batches, or blank for fixed fees and deposits. The Harvest years are here too, read only.</p>
      </div>
      <UButton icon="i-lucide-plus" class="ml-auto" @click="creating = true;">Blank invoice</UButton>
    </div>

    <div class="grid gap-4 sm:grid-cols-3">
      <UCard class="cursor-pointer" @click="filter = 'open';">
        <div class="text-sm text-muted">Outstanding</div>
        <div class="text-2xl font-semibold tabular-nums">{{ money(outstanding) }}</div>
      </UCard>
      <UCard class="cursor-pointer" @click="filter = 'overdue';">
        <div class="text-sm text-muted">Overdue</div>
        <div class="text-2xl font-semibold tabular-nums" :class="overdue ? 'text-error' : ''">{{ money(overdue) }}</div>
      </UCard>
      <UCard class="cursor-pointer" @click="filter = 'draft';">
        <div class="text-sm text-muted">Drafts</div>
        <div class="text-2xl font-semibold tabular-nums">{{ drafts }}</div>
      </UCard>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <div class="flex flex-wrap gap-1">
        <UButton v-for="f in filters" :key="f.value" size="xs" :variant="filter === f.value ? 'solid' : 'ghost'" :color="filter === f.value ? 'primary' : 'neutral'" @click="filter = f.value;">{{ f.label }}</UButton>
      </div>
      <UInput v-model="search" icon="i-lucide-search" placeholder="Number, client, or subject" size="sm" class="w-64" />
      <span class="text-xs text-muted">{{ allRows.length.toLocaleString() }} {{ allRows.length === 1 ? 'invoice' : 'invoices' }}</span>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="table-scroll"><table class="w-full text-sm">
        <TableHead :cols="cols" />
        <tbody>
          <tr v-for="i in rows" :key="i.id" class="border-b border-default last:border-0">
            <td v-for="c in cols.visible" :key="c.key" class="px-4 py-2" :class="[c.align === 'right' ? 'text-right tabular-nums' : '', c.key === 'subject' ? 'max-w-xs truncate text-muted' : '']" :title="c.key === 'subject' ? i.subject ?? '' : undefined">
              <template v-if="c.key === 'number'">
                <NuxtLink v-if="i.source === 'docket'" :to="`/invoices/${i.id}`" class="font-medium tabular-nums hover:underline">{{ i.number }}</NuxtLink>
                <span v-else class="font-medium tabular-nums" title="Imported from Harvest; open it there for the lines">{{ i.number }} <UBadge color="neutral" variant="subtle" size="sm" class="ml-1 align-middle">Harvest</UBadge></span>
              </template>
              <template v-else-if="c.key === 'client'">
                <NuxtLink v-if="i.client_id" :to="`/clients/${i.client_id}`" class="hover:underline">{{ i.client_name }}</NuxtLink>
                <span v-else class="text-muted">{{ i.client_name }}</span>
              </template>
              <template v-else-if="c.key === 'subject'">{{ i.subject }}</template>
              <span v-else-if="c.key === 'issued'" class="tabular-nums">{{ shortDate(i.issue_date) }}</span>
              <span v-else-if="c.key === 'due'" class="tabular-nums" :class="isOverdue(i) ? 'text-error' : ''">{{ shortDate(i.due_date) }}</span>
              <template v-else-if="c.key === 'total'">{{ money(i.total) }}</template>
              <template v-else-if="c.key === 'outstanding'">{{ i.status === 'sent' ? money(i.due_amount) : '' }}</template>
              <UBadge v-else-if="c.key === 'status'" :color="badge(i).color" variant="subtle" size="sm">{{ badge(i).label }}</UBadge>
            </td>
            <td />
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="cols.visible.length + 1" class="px-4 py-8 text-center text-muted">Nothing here.</td>
          </tr>
          <tr v-else-if="allRows.length > rows.length || harvestHidden">
            <td :colspan="cols.visible.length + 1" class="px-4 py-2 text-center">
              <UButton v-if="allRows.length > rows.length" size="xs" variant="ghost" color="neutral" @click="shown += PAGE;">Show {{ Math.min(PAGE, allRows.length - rows.length) }} more of {{ (allRows.length - rows.length).toLocaleString() }}</UButton>
              <UButton v-if="harvestHidden" size="xs" variant="ghost" color="neutral" icon="i-lucide-history" :loading="loadingHistory" @click="loadHistory">Load the older Harvest history ({{ harvestHidden.toLocaleString() }} more)</UButton>
            </td>
          </tr>
        </tbody>
      </table></div>
    </UCard>

    <AppDrawer v-model:open="creating" title="Blank invoice">
      <template #body>
        <UFormField label="Client" help="For a fixed fee, a deposit, or anything not built from tracked time.">
          <ClientPicker v-model="newClientId" :clients="clients ?? []" @created="c => clients?.push(c)" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="creating = false;">Cancel</UButton>
          <UButton :loading="busy" :disabled="!newClientId" @click="createBlank">Create draft</UButton>
        </div>
      </template>
    </AppDrawer>
  </div>
</template>
