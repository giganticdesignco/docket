<script setup lang="ts">
// Every Docket invoice, with what is outstanding and what is late. New
// invoices usually start from a batch (Billing); this page can also start
// a blank one for a client.
definePageMeta({ middleware: 'can', permission: 'manage_billing' })
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
const rows = computed(() => (invoices.value ?? [])
  .filter(i =>
    filter.value === 'all' ? true
    : filter.value === 'open' ? i.status === 'sent'
    : filter.value === 'overdue' ? isOverdue(i)
    : i.status === filter.value)
  .sort((a, b) => (filter.value === 'all' ? (rank[a.status] ?? 9) - (rank[b.status] ?? 9) : 0)))
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
const clientOptions = computed(() => (clients.value ?? []).map(c => ({ label: c.name, value: c.id })))
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
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Number</th>
            <th class="px-2 py-2 font-medium">Client</th>
            <th class="px-2 py-2 font-medium">Subject</th>
            <th class="px-2 py-2 font-medium">Issued</th>
            <th class="px-2 py-2 font-medium">Due</th>
            <th class="px-2 py-2 text-right font-medium">Total</th>
            <th class="px-2 py-2 text-right font-medium">Outstanding</th>
            <th class="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="i in rows" :key="i.id" class="border-b border-default last:border-0">
            <td class="px-4 py-2 font-medium tabular-nums"><NuxtLink :to="`/invoices/${i.id}`" class="hover:underline">{{ i.number }}</NuxtLink></td>
            <td class="px-2 py-2"><NuxtLink :to="`/clients/${i.client_id}`" class="hover:underline">{{ i.clients?.name }}</NuxtLink></td>
            <td class="max-w-xs truncate px-2 py-2 text-muted" :title="i.subject ?? ''">{{ i.subject }}</td>
            <td class="px-2 py-2 tabular-nums">{{ shortDate(i.issue_date) }}</td>
            <td class="px-2 py-2 tabular-nums" :class="isOverdue(i) ? 'text-error' : ''">{{ shortDate(i.due_date) }}</td>
            <td class="px-2 py-2 text-right tabular-nums">{{ money(i.total) }}</td>
            <td class="px-2 py-2 text-right tabular-nums">{{ i.status === 'sent' ? money(i.due_amount) : '' }}</td>
            <td class="px-4 py-2"><UBadge :color="badge(i).color" variant="subtle" size="sm">{{ badge(i).label }}</UBadge></td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="8" class="px-4 py-8 text-center text-muted">Nothing here.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <UModal v-model:open="creating" title="Blank invoice">
      <template #body>
        <UFormField label="Client" help="For a fixed fee, a deposit, or anything not built from tracked time.">
          <USelectMenu v-model="newClientId" :items="clientOptions" value-key="value" class="w-full" placeholder="Pick a client" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="creating = false;">Cancel</UButton>
          <UButton :loading="busy" :disabled="!newClientId" @click="createBlank">Create draft</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
