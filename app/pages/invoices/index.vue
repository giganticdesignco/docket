<script setup lang="ts">
// Every Docket invoice, with what is outstanding and what is late. New
// invoices usually start from a batch (Billing); this page can also start
// a blank one for a client.
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
await Promise.all([__ad1, __ad2])
const { data: invoices } = __ad1
const { data: clients } = __ad2

type Row = NonNullable<typeof invoices.value>[number]
type Filter = 'open' | 'overdue' | 'draft' | 'paid' | 'void' | 'all'
const view = await useViewState('invoices', { filter: 'all' as Filter })
const filter = persisted(view, 'filter')
const filters: { value: Filter, label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'draft', label: 'Drafts' }, { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue' }, { value: 'paid', label: 'Paid' }, { value: 'void', label: 'Void' },
]
const today = todayString()
const isOverdue = (i: Pick<Row, 'status' | 'due_date'>) => i.status === 'sent' && i.due_date < today
// Drafts float to the top of "All" so work in progress is never hidden.
const rank: Record<string, number> = { draft: 0, sent: 1, paid: 2, void: 3 }
const cols = await useColumns<Row>('invoices', [
  { key: 'number', label: 'Number', sort: i => i.number, always: true },
  { key: 'client', label: 'Client', sort: i => i.clients?.name },
  { key: 'subject', label: 'Subject', sort: i => i.subject },
  { key: 'issued', label: 'Issued', sort: i => i.issue_date },
  { key: 'due', label: 'Due', sort: i => i.due_date },
  { key: 'total', label: 'Total', align: 'right', sort: i => i.total },
  { key: 'outstanding', label: 'Outstanding', align: 'right', sort: i => (i.status === 'sent' ? i.due_amount : null) },
  { key: 'status', label: 'Status', sort: i => rank[i.status] ?? 9 },
])
const rows = computed(() => cols.sorted((invoices.value ?? [])
  .filter(i =>
    filter.value === 'all' ? true
    : filter.value === 'open' ? i.status === 'sent'
    : filter.value === 'overdue' ? isOverdue(i)
    : i.status === filter.value)
  .sort((a, b) => (filter.value === 'all' ? (rank[a.status] ?? 9) - (rank[b.status] ?? 9) : 0))))
const outstanding = computed(() => (invoices.value ?? []).filter(i => i.status === 'sent').reduce((s, i) => s + i.due_amount, 0))
const overdue = computed(() => (invoices.value ?? []).filter(isOverdue).reduce((s, i) => s + i.due_amount, 0))
const drafts = computed(() => (invoices.value ?? []).filter(i => i.status === 'draft').length)

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const badge = (i: Pick<Row, 'status' | 'due_date'>): { label: string, color: 'neutral' | 'warning' | 'success' | 'error' } =>
  isOverdue(i) ? { label: 'overdue', color: 'error' }
  : i.status === 'sent' ? { label: 'sent', color: 'warning' }
  : i.status === 'paid' ? { label: 'paid', color: 'success' }
  : { label: i.status, color: 'neutral' }

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
        <p class="text-sm text-muted">Made from billing batches, or blank for fixed fees and deposits.</p>
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

    <div class="flex flex-wrap gap-1">
      <UButton v-for="f in filters" :key="f.value" size="xs" :variant="filter === f.value ? 'solid' : 'ghost'" :color="filter === f.value ? 'primary' : 'neutral'" @click="filter = f.value;">{{ f.label }}</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <TableHead :cols="cols" />
        <tbody>
          <tr v-for="i in rows" :key="i.id" class="border-b border-default last:border-0">
            <td v-for="c in cols.visible" :key="c.key" class="px-4 py-2" :class="[c.align === 'right' ? 'text-right tabular-nums' : '', c.key === 'subject' ? 'max-w-xs truncate text-muted' : '']" :title="c.key === 'subject' ? i.subject ?? '' : undefined">
              <NuxtLink v-if="c.key === 'number'" :to="`/invoices/${i.id}`" class="font-medium tabular-nums hover:underline">{{ i.number }}</NuxtLink>
              <NuxtLink v-else-if="c.key === 'client'" :to="`/clients/${i.client_id}`" class="hover:underline">{{ i.clients?.name }}</NuxtLink>
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
        </tbody>
      </table>
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
