<script setup lang="ts">
import type { InvoiceDoc } from '~~/shared/types/invoice'

// The invoice as the client sees it: on the public page, in the admin's
// preview, and on paper. Plain HTML on a white sheet so it prints the same
// everywhere; no Nuxt UI components in here.
const props = defineProps<{ doc: InvoiceDoc }>()

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const date = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const qty = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const hours = (n: number) => formatHours(n)

const stamp = computed(() => {
  const i = props.doc.invoice
  if (i.status === 'void') return { text: 'Void', cls: 'border-gray-400 text-gray-500' }
  if (i.status === 'paid') return { text: 'Paid', cls: 'border-emerald-600 text-emerald-700' }
  if (i.status === 'sent' && i.due_date < todayString()) return { text: 'Past due', cls: 'border-red-600 text-red-700' }
  if (i.status === 'draft') return { text: 'Draft', cls: 'border-gray-400 text-gray-500' }
  return null
})
const methodLabel = (m: string | null) => ({ check: 'Check', ach: 'ACH', card: 'Card', other: 'Other' }[m ?? ''] ?? m ?? '')
</script>

<template>
  <div class="invoice-sheet mx-auto max-w-3xl bg-white p-10 text-[15px] leading-relaxed text-gray-900 shadow-lg print:max-w-none print:p-0 print:shadow-none" style="color-scheme: light">
    <div class="flex items-start justify-between gap-8">
      <div>
        <div class="text-xl font-semibold">{{ doc.settings.company_name }}</div>
        <div v-if="doc.settings.company_address" class="mt-1 whitespace-pre-line text-sm text-gray-600">{{ doc.settings.company_address }}</div>
        <div v-if="doc.settings.company_email || doc.settings.company_phone" class="mt-1 text-sm text-gray-600">
          {{ [doc.settings.company_email, doc.settings.company_phone].filter(Boolean).join(' · ') }}
        </div>
      </div>
      <div class="text-right">
        <div class="text-3xl font-semibold tracking-tight">Invoice</div>
        <div class="text-gray-600">#{{ doc.invoice.number }}</div>
        <div v-if="stamp" class="mt-2 inline-block rounded border-2 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide" :class="stamp.cls">{{ stamp.text }}</div>
      </div>
    </div>

    <div class="mt-8 grid grid-cols-2 gap-8">
      <div>
        <div class="text-xs uppercase tracking-wide text-gray-500">Bill to</div>
        <div class="mt-1 font-medium">{{ doc.client.name }}</div>
      </div>
      <dl class="grid grid-cols-[auto_auto] justify-end gap-x-6 gap-y-1 text-right text-sm">
        <dt class="text-gray-500">Issue date</dt>
        <dd>{{ date(doc.invoice.issue_date) }}</dd>
        <dt class="text-gray-500">Due date</dt>
        <dd>{{ date(doc.invoice.due_date) }}</dd>
        <dt class="text-gray-500">Amount due</dt>
        <dd class="font-semibold">{{ money(doc.invoice.due_amount) }}</dd>
      </dl>
    </div>

    <div v-if="doc.invoice.subject" class="mt-8 text-lg font-medium">{{ doc.invoice.subject }}</div>

    <table class="mt-4 w-full text-sm">
      <thead>
        <tr class="border-b-2 border-gray-900 text-left text-xs uppercase tracking-wide text-gray-500">
          <th class="py-2 pr-4 font-medium">Description</th>
          <th class="py-2 pr-4 text-right font-medium">Qty</th>
          <th class="py-2 pr-4 text-right font-medium">Rate</th>
          <th class="py-2 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="l in doc.lines" :key="l.id" class="border-b border-gray-200 align-top">
          <td class="py-2 pr-4">{{ l.description }}<span v-if="l.taxable && doc.invoice.tax_rate" class="text-gray-400"> *</span></td>
          <td class="py-2 pr-4 text-right tabular-nums">{{ l.kind === 'service' ? hours(l.quantity) : qty(l.quantity) }}</td>
          <td class="py-2 pr-4 text-right tabular-nums">{{ money(l.unit_price) }}</td>
          <td class="py-2 text-right tabular-nums">{{ money(l.amount) }}</td>
        </tr>
        <tr v-if="!doc.lines.length">
          <td colspan="4" class="py-6 text-center text-gray-400">No lines yet.</td>
        </tr>
      </tbody>
    </table>

    <div class="mt-4 flex justify-end">
      <dl class="grid w-64 grid-cols-[1fr_auto] gap-y-1 text-sm">
        <dt class="text-gray-500">Subtotal</dt>
        <dd class="text-right tabular-nums">{{ money(doc.invoice.subtotal) }}</dd>
        <template v-if="doc.invoice.tax_amount">
          <dt class="text-gray-500">Tax ({{ doc.invoice.tax_rate }}%)</dt>
          <dd class="text-right tabular-nums">{{ money(doc.invoice.tax_amount) }}</dd>
        </template>
        <dt class="border-t border-gray-300 pt-1 font-medium">Total</dt>
        <dd class="border-t border-gray-300 pt-1 text-right font-medium tabular-nums">{{ money(doc.invoice.total) }}</dd>
        <template v-if="doc.invoice.paid_amount">
          <dt class="text-gray-500">Paid</dt>
          <dd class="text-right tabular-nums">{{ money(-doc.invoice.paid_amount) }}</dd>
        </template>
        <dt class="border-t-2 border-gray-900 pt-1 text-base font-semibold">Amount due</dt>
        <dd class="border-t-2 border-gray-900 pt-1 text-right text-base font-semibold tabular-nums">{{ money(doc.invoice.due_amount) }}</dd>
      </dl>
    </div>
    <p v-if="doc.lines.some(l => l.taxable) && doc.invoice.tax_rate" class="mt-1 text-right text-xs text-gray-400">* taxable</p>

    <div v-if="doc.invoice.notes" class="mt-8 whitespace-pre-line text-sm">{{ doc.invoice.notes }}</div>

    <div v-if="doc.settings.payment_instructions" class="mt-8 rounded border border-gray-200 bg-gray-50 p-4 text-sm print:bg-white">
      <div class="text-xs uppercase tracking-wide text-gray-500">Payment</div>
      <div class="mt-1 whitespace-pre-line">{{ doc.settings.payment_instructions }}</div>
    </div>

    <div v-if="doc.payments.length" class="mt-8 text-sm">
      <div class="text-xs uppercase tracking-wide text-gray-500">Payments received</div>
      <table class="mt-2 w-full">
        <tbody>
          <tr v-for="p in doc.payments" :key="p.id" class="border-b border-gray-200">
            <td class="py-1 pr-4">{{ date(p.paid_on) }}</td>
            <td class="py-1 pr-4 text-gray-600">{{ [methodLabel(p.method), p.reference].filter(Boolean).join(' ') }}</td>
            <td class="py-1 text-right tabular-nums">{{ money(p.amount) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="doc.detail.time.length || doc.detail.expenses.length" class="mt-10 break-before-page text-sm print:mt-0">
      <div class="text-lg font-medium">Detail</div>
      <template v-if="doc.detail.time.length">
        <div class="mt-4 text-xs uppercase tracking-wide text-gray-500">Time</div>
        <table class="mt-1 w-full">
          <thead>
            <tr class="border-b border-gray-900 text-left text-xs text-gray-500">
              <th class="py-1 pr-3 font-medium">Date</th>
              <th class="py-1 pr-3 font-medium">Person</th>
              <th class="py-1 pr-3 font-medium">Project / task</th>
              <th class="py-1 pr-3 font-medium">Notes</th>
              <th class="py-1 text-right font-medium">Hours</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(t, i) in doc.detail.time" :key="i" class="border-b border-gray-100 align-top">
              <td class="whitespace-nowrap py-1 pr-3 tabular-nums">{{ shortDate(t.spent_on) }}</td>
              <td class="py-1 pr-3">{{ t.user_name }}</td>
              <td class="py-1 pr-3">{{ t.project_name }} / {{ t.task_name }}</td>
              <td class="py-1 pr-3 text-gray-600">{{ t.notes }}</td>
              <td class="py-1 text-right tabular-nums">{{ hours(t.hours) }}</td>
            </tr>
          </tbody>
        </table>
      </template>
      <template v-if="doc.detail.expenses.length">
        <div class="mt-6 text-xs uppercase tracking-wide text-gray-500">Expenses</div>
        <table class="mt-1 w-full">
          <thead>
            <tr class="border-b border-gray-900 text-left text-xs text-gray-500">
              <th class="py-1 pr-3 font-medium">Date</th>
              <th class="py-1 pr-3 font-medium">Person</th>
              <th class="py-1 pr-3 font-medium">Project / category</th>
              <th class="py-1 pr-3 font-medium">Notes</th>
              <th class="py-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(e, i) in doc.detail.expenses" :key="i" class="border-b border-gray-100 align-top">
              <td class="whitespace-nowrap py-1 pr-3 tabular-nums">{{ shortDate(e.spent_on) }}</td>
              <td class="py-1 pr-3">{{ e.user_name }}</td>
              <td class="py-1 pr-3">{{ e.project_name }} / {{ e.category_name }}</td>
              <td class="py-1 pr-3 text-gray-600">{{ e.notes }}</td>
              <td class="py-1 text-right tabular-nums">{{ money(e.amount) }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>
  </div>
</template>
