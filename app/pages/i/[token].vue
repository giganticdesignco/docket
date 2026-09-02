<script setup lang="ts">
import type { InvoiceDoc } from '~~/shared/types/invoice'

// The client's view of an invoice. No sign-in; the token in the link is
// the credential. "Download PDF" is the browser's print dialog.
definePageMeta({ layout: false })

const route = useRoute()
const { data: doc, error } = await useFetch<InvoiceDoc>(`/api/i/${route.params.token as string}`)
if (error.value || !doc.value) {
  throw createError({ statusCode: 404, statusMessage: 'Invoice not found', fatal: true })
}

useHead({ title: () => `Invoice ${doc.value!.invoice.number} from ${doc.value!.settings.company_name}` })

const print = () => window.print()
</script>

<template>
  <div v-if="doc" class="invoice-page -my-6 min-h-screen bg-gray-100 py-8 print:bg-white print:py-0" style="color-scheme: light">
    <div class="mx-auto mb-4 flex max-w-3xl items-center justify-between px-2 print:hidden">
      <div class="text-sm text-gray-600">Invoice {{ doc.invoice.number }} from {{ doc.settings.company_name }}</div>
      <button type="button" class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700" @click="print">Download PDF</button>
    </div>
    <InvoiceDocument :doc="doc" />
  </div>
</template>
