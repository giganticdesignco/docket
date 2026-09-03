<script setup lang="ts">
import type { InvoiceDoc } from '~~/shared/types/invoice'

// One invoice. While it is a draft: edit the header and lines, preview,
// send. Once sent: the document as the client sees it, payments, reminders,
// void. Money columns come from recalc_invoice(), never computed here.
definePageMeta({ middleware: 'can', permission: 'manage_invoices' })

const route = useRoute()
const id = route.params.id as string
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const origin = useRequestURL().origin

const __ad1 = useAsyncData(`invoice-${id}`, async () => {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, clients(name), billing_batches(id, period_start, period_end)')
    .eq('id', id)
    .single()
  if (error) throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })
  return data
}, fresh)

const __ad2 = useAsyncData(`invoice-${id}-lines`, async () => {
  const { data, error } = await supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('position')
  if (error) throw error
  return data
}, fresh)

const __ad3 = useAsyncData(`invoice-${id}-payments`, async () => {
  const { data, error } = await supabase.from('invoice_payments').select('*, profiles(full_name)').eq('invoice_id', id).order('paid_on')
  if (error) throw error
  return data
}, fresh)
await Promise.all([__ad1, __ad2, __ad3])
const { data: invoice, refresh: refreshInvoice } = __ad1
const { data: lines, refresh: refreshLines } = __ad2
const { data: payments, refresh: refreshPayments } = __ad3

// The document exactly as the public page renders it.
const { data: doc, refresh: refreshDoc } = await useAsyncData(`invoice-${id}-doc`, () =>
  $fetch<InvoiceDoc>(`/api/i/${invoice.value!.public_token}`), fresh)

useHead({ title: () => (invoice.value ? `Invoice ${invoice.value.number}` : 'Invoice') })
useAssistantScreen(() => ({ invoice: invoice.value ? `Invoice ${invoice.value.number}` : undefined, client: invoice.value?.clients?.name }))

async function refreshAll() {
  await Promise.all([refreshInvoice(), refreshLines(), refreshPayments()])
  await refreshDoc()
}

const isDraft = computed(() => invoice.value?.status === 'draft')
const isOverdue = computed(() => invoice.value?.status === 'sent' && invoice.value.due_date < todayString())
const badge = computed((): { label: string, color: 'neutral' | 'warning' | 'success' | 'error' } => {
  const st = invoice.value?.status
  return isOverdue.value ? { label: 'overdue', color: 'error' }
    : st === 'sent' ? { label: 'sent', color: 'warning' }
    : st === 'paid' ? { label: 'paid', color: 'success' }
    : { label: st ?? '', color: 'neutral' }
})
const publicLink = computed(() => `${origin}/i/${invoice.value?.public_token}`)
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

// ---------- draft editor ----------

type LineDraft = { key: number, kind: string, description: string, quantity: number | string, unit_price: number | string, taxable: boolean, project_id: string | null }
let nextKey = 0
const form = reactive({ number: '', subject: '', issue_date: '', due_date: '', tax_rate: 0 as number | string, notes: '' })
const draftLines = ref<LineDraft[]>([])
const snapshot = ref('')

function loadEditor() {
  const i = invoice.value
  if (!i) return
  form.number = i.number
  form.subject = i.subject ?? ''
  form.issue_date = i.issue_date
  form.due_date = i.due_date
  form.tax_rate = i.tax_rate
  form.notes = i.notes ?? ''
  draftLines.value = (lines.value ?? []).map(l => ({
    key: nextKey++, kind: l.kind, description: l.description, quantity: l.quantity, unit_price: l.unit_price, taxable: l.taxable, project_id: l.project_id,
  }))
  snapshot.value = JSON.stringify([form, draftLines.value])
}
loadEditor()
watch([invoice, lines], loadEditor)

const dirty = computed(() => JSON.stringify([form, draftLines.value]) !== snapshot.value)
const lineAmount = (l: LineDraft) => round2((Number(l.quantity) || 0) * (Number(l.unit_price) || 0))
const editorSubtotal = computed(() => round2(draftLines.value.reduce((s, l) => s + lineAmount(l), 0)))
const editorTax = computed(() => round2(draftLines.value.filter(l => l.taxable).reduce((s, l) => s + lineAmount(l), 0) * (Number(form.tax_rate) || 0) / 100))

function addLine() {
  draftLines.value.push({ key: nextKey++, kind: 'other', description: '', quantity: 1, unit_price: 0, taxable: false, project_id: null })
}
function removeLine(i: number) {
  draftLines.value.splice(i, 1)
}

const saving = ref(false)
async function save(): Promise<boolean> {
  if (!form.number.trim()) return fail('Give the invoice a number')
  if (form.due_date < form.issue_date) return fail('The due date is before the issue date')
  if (draftLines.value.some(l => !l.description.trim())) return fail('Every line needs a description')
  saving.value = true
  try {
    const { error } = await supabase.from('invoices').update({
      number: form.number.trim(),
      subject: form.subject.trim() || null,
      issue_date: form.issue_date,
      due_date: form.due_date,
      tax_rate: Number(form.tax_rate) || 0,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    const del = await supabase.from('invoice_lines').delete().eq('invoice_id', id)
    if (del.error) throw del.error
    if (draftLines.value.length) {
      const ins = await supabase.from('invoice_lines').insert(draftLines.value.map((l, i) => ({
        invoice_id: id,
        position: i + 1,
        kind: l.kind,
        description: l.description.trim(),
        quantity: Number(l.quantity) || 0,
        unit_price: Number(l.unit_price) || 0,
        taxable: l.taxable,
        project_id: l.project_id,
      })))
      if (ins.error) throw ins.error
    }
    await refreshAll()
    toast.add({ title: 'Invoice saved', color: 'success' })
    return true
  } catch (e) {
    return fail((e as Error).message)
  } finally {
    saving.value = false
  }
}
function fail(message: string) {
  toast.add({ title: 'Not saved', description: message, color: 'error' })
  return false
}

// ---------- send ----------

const sendOpen = ref(false)
const sendKind = ref<'invoice' | 'reminder'>('invoice')
const sendTo = ref('')
const sendMessage = ref('')
const sending = ref(false)
function openSend(kind: 'invoice' | 'reminder') {
  sendKind.value = kind
  sendTo.value = (invoice.value?.sent_to ?? []).join(', ')
  sendMessage.value = ''
  sendOpen.value = true
}
async function send() {
  if (isDraft.value && dirty.value && !(await save())) return
  sending.value = true
  try {
    const to = sendTo.value.split(/[\s,;]+/).filter(Boolean)
    const res = await $fetch<{ to: string[] }>('/api/invoices/send', {
      method: 'POST',
      body: { invoiceId: id, to, message: sendMessage.value, kind: sendKind.value },
    })
    sendOpen.value = false
    toast.add({ title: sendKind.value === 'reminder' ? 'Reminder sent' : 'Invoice sent', description: `To ${res.to.join(', ')}`, color: 'success' })
    await refreshAll()
  } catch (e) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Not sent', description: err.data?.statusMessage ?? err.message, color: 'error' })
  } finally {
    sending.value = false
  }
}

async function markSent() {
  if (isDraft.value && dirty.value && !(await save())) return
  if (!lines.value?.length) {
    fail('Add at least one line first')
    return
  }
  const { error } = await supabase.from('invoices').update({ status: 'sent', sent_at: invoice.value?.sent_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)
  if (error) toast.add({ title: 'Could not mark as sent', description: error.message, color: 'error' })
  else await refreshAll()
}

async function copyLink() {
  await navigator.clipboard.writeText(publicLink.value)
  toast.add({ title: 'Link copied', description: 'Anyone with it can view this invoice.', color: 'success' })
}

// ---------- payments ----------

const payOpen = ref(false)
const pay = reactive({ paid_on: todayString(), amount: 0 as number | string, method: 'check', reference: '', notes: '' })
const methodOptions = [
  { label: 'Check', value: 'check' }, { label: 'ACH', value: 'ach' }, { label: 'Card', value: 'card' }, { label: 'Other', value: 'other' },
]
const paying = ref(false)
function openPayment() {
  pay.paid_on = todayString()
  pay.amount = invoice.value?.due_amount ?? 0
  pay.method = 'check'
  pay.reference = ''
  pay.notes = ''
  payOpen.value = true
}
async function recordPayment() {
  const amount = Number(pay.amount)
  if (!(amount > 0)) {
    fail('Enter an amount above zero')
    return
  }
  paying.value = true
  try {
    const { error } = await supabase.from('invoice_payments').insert({
      invoice_id: id, paid_on: pay.paid_on, amount, method: pay.method, reference: pay.reference.trim() || null, notes: pay.notes.trim() || null, created_by: user.value!.sub,
    })
    if (error) throw error
    payOpen.value = false
    await refreshAll()
    toast.add({ title: 'Payment recorded', description: invoice.value?.status === 'paid' ? 'Invoice is paid in full.' : `${money(invoice.value?.due_amount ?? 0)} still due.`, color: 'success' })
  } catch (e) {
    fail((e as Error).message)
  } finally {
    paying.value = false
  }
}
async function deletePayment(paymentId: string) {
  const { error } = await supabase.from('invoice_payments').delete().eq('id', paymentId)
  if (error) toast.add({ title: 'Could not remove the payment', description: error.message, color: 'error' })
  else await refreshAll()
}

// ---------- void ----------

const voidOpen = ref(false)
const voiding = ref(false)
async function voidInvoice() {
  voiding.value = true
  try {
    const { error } = await supabase.rpc('void_invoice', { p_invoice_id: id })
    if (error) throw error
    voidOpen.value = false
    await refreshAll()
    toast.add({ title: 'Invoice voided', description: invoice.value?.batch_id ? 'Its batch is a draft again.' : undefined, color: 'success' })
  } catch (e) {
    fail((e as Error).message)
  } finally {
    voiding.value = false
  }
}
</script>

<template>
  <div v-if="invoice" class="space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <UButton to="/invoices" icon="i-lucide-arrow-left" variant="ghost" color="neutral" size="sm" />
      <h1 class="text-2xl font-semibold">
        Invoice {{ invoice.number }}
        <span class="font-normal text-muted">for <NuxtLink :to="`/clients/${invoice.client_id}`" class="hover:underline">{{ invoice.clients?.name }}</NuxtLink></span>
      </h1>
      <UBadge :color="badge.color" variant="subtle">{{ badge.label }}</UBadge>
      <div class="ml-auto flex flex-wrap gap-2">
        <UButton v-if="isDraft" :loading="saving" :disabled="!dirty" icon="i-lucide-save" @click="save();">Save</UButton>
        <UButton :to="publicLink" target="_blank" variant="outline" color="neutral" icon="i-lucide-external-link">Preview</UButton>
        <UButton v-if="invoice.status !== 'void'" variant="outline" color="neutral" icon="i-lucide-link" @click="copyLink">Copy link</UButton>
        <UButton v-if="isDraft || invoice.status === 'sent'" icon="i-lucide-send" @click="openSend('invoice')">{{ isDraft ? 'Send' : 'Send again' }}</UButton>
        <UButton v-if="isDraft" variant="outline" icon="i-lucide-check" @click="markSent">Mark as sent</UButton>
        <UButton v-if="invoice.status === 'sent'" variant="outline" icon="i-lucide-bell" @click="openSend('reminder')">Send reminder</UButton>
        <UButton v-if="invoice.status === 'sent'" variant="outline" icon="i-lucide-banknote" @click="openPayment">Record payment</UButton>
        <UButton v-if="isDraft || invoice.status === 'sent'" variant="outline" color="error" icon="i-lucide-ban" @click="voidOpen = true;">Void</UButton>
      </div>
    </div>

    <p class="text-sm text-muted">
      <span v-if="invoice.billing_batches">From batch <NuxtLink :to="`/billing/${invoice.billing_batches.id}`" class="underline">{{ shortDate(invoice.billing_batches.period_start) }} to {{ shortDate(invoice.billing_batches.period_end) }}</NuxtLink>. </span>
      <span v-if="invoice.sent_at">Sent {{ stamp(invoice.sent_at) }}<span v-if="invoice.sent_to?.length"> to {{ invoice.sent_to.join(', ') }}</span>. </span>
      <span v-if="invoice.last_reminded_at">Last reminder {{ stamp(invoice.last_reminded_at) }}. </span>
      <span v-if="invoice.paid_at">Paid {{ stamp(invoice.paid_at) }}. </span>
      <span v-if="invoice.status === 'void'">Void.</span>
    </p>

    <template v-if="isDraft">
      <UCard>
        <div class="grid gap-4 md:grid-cols-4">
          <UFormField label="Number">
            <UInput v-model="form.number" class="w-full" />
          </UFormField>
          <UFormField label="Issue date">
            <UInput v-model="form.issue_date" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Due date">
            <UInput v-model="form.due_date" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Tax rate (%)">
            <UInput v-model="form.tax_rate" type="number" :min="0" step="0.01" class="w-full" />
          </UFormField>
          <UFormField label="Subject" class="md:col-span-4">
            <UInput v-model="form.subject" class="w-full" placeholder="What this invoice is for" />
          </UFormField>
          <UFormField label="Notes" class="md:col-span-4" help="Printed under the totals.">
            <UTextarea v-model="form.notes" :rows="2" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <div class="flex items-center gap-4">
        <h2 class="text-lg font-semibold">Lines</h2>
        <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-plus" class="ml-auto" @click="addLine">Add line</UButton>
      </div>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <table class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr class="border-b border-default">
              <th class="px-4 py-2 font-medium">Description</th>
              <th class="w-28 px-2 py-2 text-right font-medium">Qty</th>
              <th class="w-32 px-2 py-2 text-right font-medium">Rate</th>
              <th class="w-16 px-2 py-2 text-center font-medium">Tax</th>
              <th class="w-32 px-2 py-2 text-right font-medium">Amount</th>
              <th class="w-12 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="(l, i) in draftLines" :key="l.key" class="border-b border-default last:border-0">
              <td class="px-4 py-1.5"><UInput v-model="l.description" class="w-full" size="sm" /></td>
              <td class="px-2 py-1.5"><UInput v-model="l.quantity" type="number" step="0.01" class="w-full" size="sm" :ui="{ base: 'text-right' }" /></td>
              <td class="px-2 py-1.5"><UInput v-model="l.unit_price" type="number" step="0.01" class="w-full" size="sm" :ui="{ base: 'text-right' }" /></td>
              <td class="px-2 py-1.5 text-center"><UCheckbox v-model="l.taxable" /></td>
              <td class="px-2 py-1.5 text-right tabular-nums">{{ money(lineAmount(l)) }}</td>
              <td class="px-2 py-1.5 text-right"><UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" aria-label="Remove line" @click="removeLine(i)" /></td>
            </tr>
            <tr v-if="!draftLines.length">
              <td colspan="6" class="px-4 py-6 text-center text-muted">No lines. Add one, or create the invoice from a batch.</td>
            </tr>
          </tbody>
          <tfoot class="text-sm">
            <tr class="border-t border-default">
              <td colspan="4" class="px-4 py-1.5 text-right text-muted">Subtotal</td>
              <td class="px-2 py-1.5 text-right tabular-nums">{{ money(editorSubtotal) }}</td>
              <td />
            </tr>
            <tr v-if="editorTax">
              <td colspan="4" class="px-4 py-1.5 text-right text-muted">Tax ({{ form.tax_rate }}%)</td>
              <td class="px-2 py-1.5 text-right tabular-nums">{{ money(editorTax) }}</td>
              <td />
            </tr>
            <tr>
              <td colspan="4" class="px-4 py-1.5 text-right font-medium">Total</td>
              <td class="px-2 py-1.5 text-right font-semibold tabular-nums">{{ money(editorSubtotal + editorTax) }}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </UCard>
      <p v-if="dirty" class="text-sm text-warning">Unsaved changes. Save before sending; the preview shows the saved version.</p>
    </template>

    <template v-else>
      <UCard v-if="payments?.length || invoice.status === 'sent'">
        <template #header>
          <div class="flex items-center gap-4">
            <h2 class="font-semibold">Payments</h2>
            <span class="text-sm text-muted tabular-nums">{{ money(invoice.paid_amount) }} of {{ money(invoice.total) }}, {{ money(invoice.due_amount) }} due</span>
          </div>
        </template>
        <table v-if="payments?.length" class="w-full text-sm">
          <tbody>
            <tr v-for="p in payments" :key="p.id" class="border-b border-default last:border-0">
              <td class="py-1.5 pr-4 tabular-nums">{{ shortDate(p.paid_on) }}</td>
              <td class="py-1.5 pr-4">{{ methodOptions.find(m => m.value === p.method)?.label ?? p.method }} <span class="text-muted">{{ p.reference }}</span></td>
              <td class="py-1.5 pr-4 text-muted">{{ p.notes }}</td>
              <td class="py-1.5 pr-4 text-right tabular-nums">{{ money(p.amount) }}</td>
              <td class="py-1.5 text-right"><UButton icon="i-lucide-trash-2" variant="ghost" color="neutral" size="xs" aria-label="Remove payment" @click="deletePayment(p.id)" /></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-muted">No payments yet.</p>
      </UCard>
    </template>

    <h2 class="text-lg font-semibold">{{ isDraft ? 'Preview' : 'Invoice' }}</h2>
    <InvoiceDocument v-if="doc" :doc="doc" />

    <AppDrawer v-model:open="sendOpen" :title="sendKind === 'reminder' ? 'Send a reminder' : 'Send invoice'">
      <template #body>
        <div class="space-y-4">
          <UFormField label="To" help="Comma separated.">
            <UInput v-model="sendTo" class="w-full" placeholder="billing@client.com" />
          </UFormField>
          <UFormField label="Message" :help="sendKind === 'reminder' ? 'Optional. The default says the invoice is past due and how much is outstanding.' : 'Optional. The email always includes the number, amount due, due date, a link, and your payment instructions.'">
            <UTextarea v-model="sendMessage" :rows="4" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="sendOpen = false;">Cancel</UButton>
          <UButton :loading="sending" :disabled="!sendTo.trim()" icon="i-lucide-send" @click="send">{{ sendKind === 'reminder' ? 'Send reminder' : 'Send' }}</UButton>
        </div>
      </template>
    </AppDrawer>

    <AppDrawer v-model:open="payOpen" title="Record a payment">
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Date">
            <UInput v-model="pay.paid_on" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Amount">
            <UInput v-model="pay.amount" type="number" step="0.01" :min="0" class="w-full" />
          </UFormField>
          <UFormField label="Method">
            <USelect v-model="pay.method" :items="methodOptions" class="w-full" />
          </UFormField>
          <UFormField label="Reference" help="Check number, transaction id.">
            <UInput v-model="pay.reference" class="w-full" />
          </UFormField>
          <UFormField label="Notes" class="sm:col-span-2">
            <UInput v-model="pay.notes" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="payOpen = false;">Cancel</UButton>
          <UButton :loading="paying" @click="recordPayment">Record payment</UButton>
        </div>
      </template>
    </AppDrawer>

    <UModal v-model:open="voidOpen" title="Void this invoice?">
      <template #body>
        <p class="text-sm">
          The invoice keeps its number and stays in the list as void.
          <span v-if="invoice.batch_id">Its batch goes back to draft, so the work can be invoiced again or the batch voided to release the rows.</span>
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="voidOpen = false;">Cancel</UButton>
          <UButton color="error" :loading="voiding" @click="voidInvoice">Void invoice</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
