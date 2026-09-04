<script setup lang="ts">
import type { QuoteDoc, SitemapNode } from '~~/shared/types/quote'

// The quote as the client sees it: public page, admin preview, print.
// Plain HTML on a white sheet, like the invoice.
const props = defineProps<{ doc: QuoteDoc }>()

const date = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const stampDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const totalHours = computed(() => props.doc.lines.reduce((s, l) => s + (l.hours ?? 0), 0))

const stamp = computed(() => {
  const q = props.doc.quote
  if (q.status === 'accepted') return { text: 'Accepted', cls: 'border-emerald-600 text-emerald-700' }
  if (q.status === 'declined') return { text: 'Declined', cls: 'border-gray-400 text-gray-500' }
  if (q.status === 'expired' || props.doc.expired) return { text: 'Expired', cls: 'border-red-600 text-red-700' }
  if (q.status === 'draft') return { text: 'Draft', cls: 'border-gray-400 text-gray-500' }
  return null
})
const flat = (nodes: SitemapNode[], depth = 0): { node: SitemapNode, depth: number }[] =>
  nodes.flatMap(n => [{ node: n, depth }, ...flat(n.children, depth + 1)])
const pageCount = (nodes: SitemapNode[]): number => nodes.reduce((s, n) => s + 1 + pageCount(n.children), 0)
</script>

<template>
  <div class="invoice-sheet mx-auto max-w-3xl bg-white p-10 text-[15px] leading-relaxed text-gray-900 shadow-lg print:max-w-none print:p-0 print:shadow-none" style="color-scheme: light">
    <div class="flex items-start justify-between gap-8">
      <div>
        <div class="text-xl font-semibold">{{ doc.company.name }}</div>
        <div v-if="doc.company.address" class="mt-1 whitespace-pre-line text-sm text-gray-600">{{ doc.company.address }}</div>
        <div v-if="doc.company.email || doc.company.phone" class="mt-1 text-sm text-gray-600">{{ [doc.company.email, doc.company.phone].filter(Boolean).join(' · ') }}</div>
      </div>
      <div class="text-right">
        <div class="text-3xl font-semibold tracking-tight">Quote</div>
        <div class="text-gray-600">{{ doc.quote.number }}</div>
        <div v-if="stamp" class="mt-2 inline-block rounded border-2 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide" :class="stamp.cls">{{ stamp.text }}</div>
      </div>
    </div>

    <div class="mt-8 grid grid-cols-2 gap-8">
      <div>
        <div class="text-xs uppercase tracking-wide text-gray-500">Prepared for</div>
        <div class="mt-1 font-medium">{{ doc.client.name }}</div>
      </div>
      <dl class="grid grid-cols-[auto_auto] justify-end gap-x-6 gap-y-1 text-right text-sm">
        <dt class="text-gray-500">Date</dt>
        <dd>{{ stampDate(doc.quote.created_at) }}</dd>
        <template v-if="doc.quote.valid_until">
          <dt class="text-gray-500">Valid until</dt>
          <dd>{{ date(doc.quote.valid_until) }}</dd>
        </template>
        <dt class="text-gray-500">Total</dt>
        <dd class="font-semibold">{{ money(doc.quote.subtotal) }}</dd>
      </dl>
    </div>

    <h1 class="mt-8 text-2xl font-semibold">{{ doc.quote.title }}</h1>
    <p v-if="doc.quote.intro" class="mt-3 whitespace-pre-line">{{ doc.quote.intro }}</p>

    <table class="mt-8 w-full text-sm">
      <thead>
        <tr class="border-b-2 border-gray-900 text-left text-xs uppercase tracking-wide text-gray-500">
          <th class="py-2 pr-4 font-medium">Scope</th>
          <th class="py-2 pr-4 text-right font-medium">Hours</th>
          <th class="py-2 pr-4 text-right font-medium">Rate</th>
          <th class="py-2 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="l in doc.lines" :key="l.id" class="border-b border-gray-200 align-top">
          <td class="py-2 pr-4">
            {{ l.description }}
            <div v-if="l.task || l.pages" class="text-xs text-gray-500">{{ [l.task, l.pages ? `${l.pages} page${l.pages === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') }}</div>
          </td>
          <td class="py-2 pr-4 text-right tabular-nums">{{ l.hours != null ? formatHours(l.hours) : '' }}</td>
          <td class="py-2 pr-4 text-right tabular-nums">{{ l.rate != null ? money(l.rate) : '' }}</td>
          <td class="py-2 text-right tabular-nums">{{ money(l.amount) }}</td>
        </tr>
        <tr v-if="!doc.lines.length">
          <td colspan="4" class="py-6 text-center text-gray-400">No scope lines yet.</td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="border-t-2 border-gray-900">
          <td class="pt-2 text-base font-semibold">Total</td>
          <td class="pt-2 text-right text-sm text-gray-500 tabular-nums">{{ totalHours ? formatHours(totalHours) : '' }}</td>
          <td />
          <td class="pt-2 text-right text-base font-semibold tabular-nums">{{ money(doc.quote.subtotal) }}</td>
        </tr>
      </tfoot>
    </table>

    <div v-if="doc.sitemap.length" class="mt-8">
      <div class="text-xs uppercase tracking-wide text-gray-500">Pages <span class="normal-case">({{ pageCount(doc.sitemap) }})</span></div>
      <ul class="mt-2 text-sm">
        <li v-for="{ node, depth } in flat(doc.sitemap)" :key="node.id" class="flex gap-3 border-b border-gray-100 py-1" :style="{ paddingLeft: `${depth * 1.25}rem` }">
          <span class="font-medium">{{ node.title }}</span>
          <span v-if="node.path" class="text-gray-500">{{ node.path }}</span>
          <span v-if="node.template" class="ml-auto text-xs text-gray-400">{{ node.template }}</span>
        </li>
      </ul>
    </div>

    <div v-if="doc.quote.terms" class="mt-8 text-sm">
      <div class="text-xs uppercase tracking-wide text-gray-500">Terms</div>
      <p class="mt-1 whitespace-pre-line">{{ doc.quote.terms }}</p>
    </div>

    <div v-if="doc.quote.status === 'accepted'" class="mt-8 rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 print:bg-white">
      Accepted by {{ doc.quote.accepted_by }}<span v-if="doc.quote.accepted_at"> on {{ stampDate(doc.quote.accepted_at) }}</span>.
    </div>
    <div v-else-if="doc.quote.status === 'declined'" class="mt-8 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 print:bg-white">
      Declined<span v-if="doc.quote.declined_by"> by {{ doc.quote.declined_by }}</span><span v-if="doc.quote.declined_at"> on {{ stampDate(doc.quote.declined_at) }}</span>.<span v-if="doc.quote.decline_reason"> {{ doc.quote.decline_reason }}</span>
    </div>
  </div>
</template>
