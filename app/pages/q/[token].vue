<script setup lang="ts">
import type { QuoteDoc } from '~~/shared/types/quote'

// The client's side of a quote: read it, accept it by typing a name, or
// decline with a reason. No sign-in; the link is the key.
definePageMeta({ layout: false })

const route = useRoute()
const token = route.params.token as string
const { data: doc, error, refresh } = await useFetch<QuoteDoc>(`/api/q/${token}`)
if (error.value || !doc.value) {
  throw createError({ statusCode: 404, statusMessage: 'This quote link is not valid', fatal: true })
}
useHead({ title: () => `Quote ${doc.value?.quote.number ?? ''}: ${doc.value?.quote.title ?? ''}` })

const toast = useToast()
const name = ref('')
const email = ref('')
const agree = ref(false)
const declining = ref(false)
const reason = ref('')
const busy = ref<'accept' | 'decline' | null>(null)
const open = computed(() => !!doc.value && (doc.value.quote.status === 'sent' || doc.value.quote.status === 'draft') && !doc.value.expired)

async function act(kind: 'accept' | 'decline') {
  if (name.value.trim().length < 2) {
    toast.add({ title: 'Type your full name first', color: 'error' })
    return
  }
  if (kind === 'accept' && !agree.value) {
    toast.add({ title: 'Tick the box to confirm you accept the quote and its terms', color: 'error' })
    return
  }
  busy.value = kind
  try {
    const body = kind === 'accept' ? { name: name.value, email: email.value } : { name: name.value, reason: reason.value }
    doc.value = await $fetch<QuoteDoc>(`/api/q/${token}/${kind}`, { method: 'POST', body })
    toast.add({ title: kind === 'accept' ? 'Accepted. Thank you!' : 'Declined', description: `${doc.value.company.name} has been notified.`, color: 'success' })
  } catch (e) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'That did not go through', description: err.data?.statusMessage ?? err.message, color: 'error' })
    await refresh()
  } finally {
    busy.value = null
  }
}
const print = () => window.print()
</script>

<template>
  <div v-if="doc" class="invoice-page -my-6 min-h-screen bg-gray-100 py-8 print:bg-white print:py-0" style="color-scheme: light">
    <div class="mx-auto mb-4 flex max-w-3xl items-center justify-between px-2 print:hidden">
      <div class="text-sm text-gray-600">Quote {{ doc.quote.number }} from {{ doc.company.name }}</div>
      <button type="button" class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700" @click="print">Download PDF</button>
    </div>
    <QuoteDocument :doc="doc" />

    <div v-if="open" class="mx-auto mt-6 max-w-3xl rounded-lg bg-white p-6 text-gray-900 shadow-sm print:hidden">
      <h2 class="text-lg font-semibold">Accept this quote</h2>
      <p class="mt-1 text-sm text-gray-500">Typing your name here counts as your approval to proceed. We will be in touch to get started.</p>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <input v-model="name" type="text" placeholder="Your full name" class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none">
        <input v-model="email" type="email" placeholder="Your email (optional)" class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none">
      </div>
      <label class="mt-3 flex items-start gap-2 text-sm">
        <input v-model="agree" type="checkbox" class="mt-1">
        <span>I accept quote {{ doc.quote.number }} for {{ doc.quote.title }}<template v-if="doc.quote.terms"> and its terms</template>.</span>
      </label>
      <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button type="button" class="text-sm text-gray-500 hover:text-gray-900" @click="declining = !declining;">{{ declining ? 'Never mind' : 'Decline instead' }}</button>
        <button type="button" class="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50" :disabled="!!busy" @click="act('accept')">{{ busy === 'accept' ? 'Sending' : 'Accept quote' }}</button>
      </div>
      <div v-if="declining" class="mt-4 space-y-2 border-t border-gray-100 pt-4">
        <textarea v-model="reason" rows="2" placeholder="Anything we should know? (optional)" class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none" />
        <div class="flex justify-end">
          <button type="button" class="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50" :disabled="!!busy" @click="act('decline')">{{ busy === 'decline' ? 'Sending' : 'Decline quote' }}</button>
        </div>
      </div>
    </div>
    <div v-else-if="doc.expired" class="mx-auto mt-6 max-w-3xl rounded-lg bg-white p-6 text-sm text-gray-700 shadow-sm print:hidden">
      This quote expired on {{ new Date(`${doc.quote.valid_until}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) }}. Get in touch<template v-if="doc.company.email"> at {{ doc.company.email }}</template> for a fresh one.
    </div>
  </div>
</template>
