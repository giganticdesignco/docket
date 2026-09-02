<script setup lang="ts">
// Billing: what is unbilled per client, and the batches made so far.
// A batch is a draft-and-lock grouping until the invoicing decision
// (see TODO 1 in schema.sql) says where it goes next.
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Billing' })

const supabase = useSupabaseClient()

const { data: unbilled } = await useAsyncData('unbilled-summary', async () => {
  const { data, error } = await supabase.rpc('unbilled_summary')
  if (error) throw error
  return data
}, fresh)

const { data: batches } = await useAsyncData('billing-batches', async () => {
  const { data, error } = await supabase
    .from('billing_batches')
    .select('*, clients(name), projects(name), profiles(full_name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}, fresh)

const unbilledTotal = computed(() => (unbilled.value ?? []).reduce((sum, r) => sum + r.time_amount + r.expense_amount, 0))
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const statusColor: Record<string, 'neutral' | 'warning' | 'success' | 'error'> = {
  draft: 'neutral', pushing: 'warning', pushed: 'success', failed: 'error', void: 'neutral', invoiced: 'success',
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Billing</h1>
        <p class="text-sm text-muted">Billable work not yet claimed by a batch. Harvest-invoiced entries are already locked and do not count.</p>
      </div>
      <UButton to="/billing/new" icon="i-lucide-plus" class="ml-auto" data-tour="new-batch">New batch</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }" data-tour="batches">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Client</th>
            <th class="px-4 py-2 font-medium">Unbilled since</th>
            <th class="px-4 py-2 text-right font-medium">Hours</th>
            <th class="px-4 py-2 text-right font-medium">Time</th>
            <th class="px-4 py-2 text-right font-medium">Expenses</th>
            <th class="px-4 py-2 text-right font-medium">Total</th>
            <th class="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in unbilled" :key="r.client_id" class="border-b border-default last:border-0">
            <td class="px-4 py-2"><NuxtLink :to="`/clients/${r.client_id}`" class="font-medium hover:underline">{{ r.client_name }}</NuxtLink></td>
            <td class="px-4 py-2 text-muted">{{ r.oldest ? shortDate(r.oldest) : '' }}<span v-if="r.newest && r.newest !== r.oldest"> to {{ shortDate(r.newest) }}</span></td>
            <td class="px-4 py-2 text-right tabular-nums">{{ formatHours(r.hours) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ money(r.time_amount) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ money(r.expense_amount) }}</td>
            <td class="px-4 py-2 text-right font-medium tabular-nums">{{ money(r.time_amount + r.expense_amount) }}</td>
            <td class="px-4 py-2 text-right">
              <UButton :to="`/billing/new?client=${r.client_id}`" size="xs" variant="outline" color="neutral">Batch</UButton>
            </td>
          </tr>
          <tr v-if="!unbilled?.length">
            <td colspan="7" class="px-4 py-8 text-center text-muted">Nothing unbilled.</td>
          </tr>
        </tbody>
        <tfoot v-if="unbilled?.length">
          <tr class="border-t border-default">
            <td colspan="5" class="px-4 py-2 text-right text-muted">Total</td>
            <td class="px-4 py-2 text-right font-semibold tabular-nums">{{ money(unbilledTotal) }}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </UCard>

    <h2 class="text-lg font-semibold">Batches</h2>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Client</th>
            <th class="px-4 py-2 font-medium">Period</th>
            <th class="px-4 py-2 font-medium">Status</th>
            <th class="px-4 py-2 text-right font-medium">Hours</th>
            <th class="px-4 py-2 text-right font-medium">Amount</th>
            <th class="px-4 py-2 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in batches" :key="b.id" class="border-b border-default last:border-0">
            <td class="px-4 py-2">
              <NuxtLink :to="`/billing/${b.id}`" class="font-medium hover:underline">{{ b.clients?.name }}</NuxtLink>
              <span v-if="b.projects" class="text-muted"> / {{ b.projects.name }}</span>
            </td>
            <td class="px-4 py-2 tabular-nums">{{ shortDate(b.period_start) }} to {{ shortDate(b.period_end) }}</td>
            <td class="px-4 py-2"><UBadge :color="statusColor[b.status]" variant="subtle" size="sm">{{ b.status }}</UBadge></td>
            <td class="px-4 py-2 text-right tabular-nums">{{ formatHours(b.subtotal_hours) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ money(b.subtotal_amount) }}</td>
            <td class="px-4 py-2 text-muted">{{ shortDate(b.created_at.slice(0, 10)) }} by {{ b.profiles?.full_name }}</td>
          </tr>
          <tr v-if="!batches?.length">
            <td colspan="6" class="px-4 py-8 text-center text-muted">No batches yet.</td>
          </tr>
        </tbody>
      </table>
    </UCard>
  </div>
</template>
