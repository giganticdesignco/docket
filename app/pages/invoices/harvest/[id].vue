<script setup lang="ts">
// One Harvest invoice: the header and its line items, exactly as
// imported. Historical record only; no edit, no send, no delete, no
// payments here (Docket never touched the money on these).
definePageMeta({ middleware: 'can', permission: 'manage_invoices' })

type LineItem = {
  kind?: string | null
  amount: number
  quantity: number
  unit_price: number
  description: string
  project?: { code: string | null, name: string | null, harvest_id?: number | null } | null
}

const route = useRoute()
const id = route.params.id as string
const supabase = useSupabaseClient()
const { can } = useCurrentUser()
const seeMoney = computed(() => can('see_money'))

const { data: invoice } = await useAsyncData(`harvest-invoice-${id}`, async () => {
  const { data, error } = await supabase.from('harvest_invoices').select('*').eq('id', id).single()
  if (error) throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })
  return data
}, fresh)

const lines = computed(() => ((invoice.value?.line_items as LineItem[] | null) ?? []))
const cols = computed(() => (seeMoney.value ? 5 : 3))

useHead({ title: () => (invoice.value ? `Invoice ${invoice.value.number}` : 'Invoice') })
useAssistantScreen(() => ({ invoice: invoice.value ? `Invoice ${invoice.value.number}` : undefined, client: invoice.value?.client_name }))

const badge = computed((): Badge => (invoice.value ? invoiceBadge({ state: invoice.value.state, due_date: invoice.value.due_date }) : { label: '', color: 'neutral' }))
const hasTax = computed(() => !!invoice.value?.tax_amount)
const hasDiscount = computed(() => !!invoice.value?.discount_amount)
const dateYear = (s: string) => `${shortDate(s)}, ${s.slice(0, 4)}`
const qty = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
</script>

<template>
  <div v-if="invoice" class="space-y-6">
    <AppCrumbs :items="[{ label: 'Invoices', to: '/invoices' }]" class="mb-3" />
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-semibold">
        Invoice {{ invoice.number }}
        <span class="font-normal text-muted">
          for
          <NuxtLink v-if="invoice.client_id" :to="`/clients/${invoice.client_id}`" class="hover:underline">{{ invoice.client_name }}</NuxtLink>
          <template v-else>{{ invoice.client_name }}</template>
        </span>
      </h1>
      <UBadge :color="badge.color" variant="subtle">{{ badge.label }}</UBadge>
      <UBadge color="neutral" variant="subtle">Harvest</UBadge>
    </div>

    <p class="text-sm text-muted">Imported from Harvest. A historical record: no editing, sending, or deleting here.</p>

    <UCard>
      <dl class="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
        <div v-if="invoice.subject" class="col-span-2 sm:col-span-4"><dt class="text-muted">Subject</dt><dd>{{ invoice.subject }}</dd></div>
        <div><dt class="text-muted">Issued</dt><dd class="tabular-nums">{{ dateYear(invoice.issue_date) }}</dd></div>
        <div v-if="invoice.due_date"><dt class="text-muted">Due</dt><dd class="tabular-nums">{{ dateYear(invoice.due_date) }}</dd></div>
        <div v-if="invoice.period_start && invoice.period_end"><dt class="text-muted">Period</dt><dd class="tabular-nums">{{ dateYear(invoice.period_start) }} to {{ dateYear(invoice.period_end) }}</dd></div>
        <div v-if="invoice.paid_date || invoice.paid_at"><dt class="text-muted">Paid</dt><dd class="tabular-nums">{{ invoice.paid_date ? dateYear(invoice.paid_date) : stamp(invoice.paid_at!, { year: true }) }}</dd></div>
        <div v-if="invoice.closed_at"><dt class="text-muted">Closed</dt><dd class="tabular-nums">{{ stamp(invoice.closed_at, { year: true }) }}</dd></div>
      </dl>
    </UCard>

    <h2 class="text-lg font-semibold">Lines</h2>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="table-scroll"><table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Description</th>
            <th class="px-2 py-2 font-medium">Project</th>
            <th class="w-24 px-2 py-2 text-right font-medium">Qty</th>
            <th v-if="seeMoney" class="w-28 px-2 py-2 text-right font-medium">Rate</th>
            <th v-if="seeMoney" class="w-28 px-2 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(l, i) in lines" :key="i" class="border-b border-default align-top last:border-0">
            <td class="whitespace-pre-line px-4 py-2">{{ l.description }}</td>
            <td class="px-2 py-2 text-muted">{{ l.project?.name ?? '' }}</td>
            <td class="px-2 py-2 text-right tabular-nums">{{ qty(l.quantity) }}</td>
            <td v-if="seeMoney" class="px-2 py-2 text-right tabular-nums">{{ money(l.unit_price) }}</td>
            <td v-if="seeMoney" class="px-2 py-2 text-right tabular-nums">{{ money(l.amount) }}</td>
          </tr>
          <tr v-if="!lines.length">
            <td :colspan="cols" class="px-4 py-6 text-center text-muted">No lines.</td>
          </tr>
        </tbody>
        <tfoot v-if="seeMoney" class="text-sm">
          <tr class="border-t border-default">
            <td colspan="4" class="px-4 py-1.5 text-right text-muted">Amount</td>
            <td class="px-2 py-1.5 text-right tabular-nums">{{ money(invoice.amount) }}</td>
          </tr>
          <tr v-if="hasTax">
            <td colspan="4" class="px-4 py-1.5 text-right text-muted">Tax</td>
            <td class="px-2 py-1.5 text-right tabular-nums">{{ money(invoice.tax_amount) }}</td>
          </tr>
          <tr v-if="hasDiscount">
            <td colspan="4" class="px-4 py-1.5 text-right text-muted">Discount</td>
            <td class="px-2 py-1.5 text-right tabular-nums">{{ money(-invoice.discount_amount!) }}</td>
          </tr>
          <tr v-if="invoice.state === 'open'" class="border-t border-default">
            <td colspan="4" class="px-4 py-1.5 text-right font-medium">Due</td>
            <td class="px-2 py-1.5 text-right font-semibold tabular-nums">{{ money(invoice.due_amount) }}</td>
          </tr>
        </tfoot>
      </table></div>
    </UCard>
  </div>
</template>
