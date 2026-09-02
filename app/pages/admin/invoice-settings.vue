<script setup lang="ts">
// The one-row invoice_settings table: what prints on every invoice, the
// defaults for new ones, the number counter, and overdue reminders.
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Invoice settings' })

const supabase = useSupabaseClient()
const toast = useToast()

const { data: settings } = await useAsyncData('invoice-settings', async () => {
  const { data, error } = await supabase.from('invoice_settings').select('*').eq('id', true).single()
  if (error) throw error
  return data
}, fresh)

const form = reactive({
  company_name: settings.value?.company_name ?? '',
  company_address: settings.value?.company_address ?? '',
  company_email: settings.value?.company_email ?? '',
  company_phone: settings.value?.company_phone ?? '',
  payment_instructions: settings.value?.payment_instructions ?? '',
  default_terms_days: settings.value?.default_terms_days ?? 30,
  default_notes: settings.value?.default_notes ?? '',
  default_tax_rate: settings.value?.default_tax_rate ?? 0,
  next_invoice_number: settings.value?.next_invoice_number ?? 1,
  remind_overdue: settings.value?.remind_overdue ?? false,
  remind_every_days: settings.value?.remind_every_days ?? 7,
  next_quote_number: settings.value?.next_quote_number ?? 1,
  quote_valid_days: settings.value?.quote_valid_days ?? 30,
  quote_terms: settings.value?.quote_terms ?? '',
})

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const { error } = await supabase.from('invoice_settings').update({
      company_name: form.company_name.trim() || 'Gigantic Design Co.',
      company_address: form.company_address.trim() || null,
      company_email: form.company_email.trim() || null,
      company_phone: form.company_phone.trim() || null,
      payment_instructions: form.payment_instructions.trim() || null,
      default_terms_days: Number(form.default_terms_days) || 0,
      default_notes: form.default_notes.trim() || null,
      default_tax_rate: Number(form.default_tax_rate) || 0,
      next_invoice_number: Number(form.next_invoice_number) || 1,
      remind_overdue: form.remind_overdue,
      remind_every_days: Math.max(1, Number(form.remind_every_days) || 7),
      next_quote_number: Number(form.next_quote_number) || 1,
      quote_valid_days: Math.max(1, Number(form.quote_valid_days) || 30),
      quote_terms: form.quote_terms.trim() || null,
    }).eq('id', true)
    if (error) throw error
    toast.add({ title: 'Invoice settings saved', color: 'success' })
  } catch (e) {
    toast.add({ title: 'Could not save', description: (e as Error).message, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Invoice settings</h1>
      <p class="text-sm text-muted">What prints on every invoice and quote, defaults for new ones, and overdue reminders.</p>
    </div>

    <UCard>
      <template #header><h2 class="font-semibold">Company block</h2></template>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Company name" class="sm:col-span-2">
          <UInput v-model="form.company_name" class="w-full" />
        </UFormField>
        <UFormField label="Address" class="sm:col-span-2" help="Printed as typed, line breaks kept.">
          <UTextarea v-model="form.company_address" :rows="3" class="w-full" />
        </UFormField>
        <UFormField label="Email" help="Also the reply-to on invoice emails.">
          <UInput v-model="form.company_email" type="email" class="w-full" />
        </UFormField>
        <UFormField label="Phone">
          <UInput v-model="form.company_phone" class="w-full" />
        </UFormField>
      </div>
    </UCard>

    <UCard>
      <template #header><h2 class="font-semibold">Payment and defaults</h2></template>
      <div class="grid gap-4 sm:grid-cols-3">
        <UFormField label="Payment instructions" class="sm:col-span-3" help="Printed on every invoice and in every email: who to make checks out to, ACH details, a payment link.">
          <UTextarea v-model="form.payment_instructions" :rows="4" class="w-full" />
        </UFormField>
        <UFormField label="Terms (days)" help="Due date = issue date + this.">
          <UInput v-model.number="form.default_terms_days" type="number" :min="0" class="w-full" />
        </UFormField>
        <UFormField label="Default tax rate (%)" help="Applied to lines marked taxable.">
          <UInput v-model.number="form.default_tax_rate" type="number" :min="0" step="0.01" class="w-full" />
        </UFormField>
        <UFormField label="Next invoice number" help="Set once to continue Harvest's sequence.">
          <UInput v-model.number="form.next_invoice_number" type="number" :min="1" class="w-full" />
        </UFormField>
        <UFormField label="Default notes" class="sm:col-span-3" help="Prefilled on new invoices, editable per invoice.">
          <UTextarea v-model="form.default_notes" :rows="2" class="w-full" />
        </UFormField>
      </div>
    </UCard>

    <UCard>
      <template #header><h2 class="font-semibold">Overdue reminders</h2></template>
      <div class="space-y-4">
        <USwitch v-model="form.remind_overdue" label="Email the invoice's recipients when it is past due" />
        <UFormField label="Every (days)" class="w-40" help="At 9am Central.">
          <UInput v-model.number="form.remind_every_days" type="number" :min="1" class="w-full" :disabled="!form.remind_overdue" />
        </UFormField>
        <p class="text-xs text-muted">Reminders only go to invoices that were emailed from Docket, to the same addresses. You can also send one by hand from the invoice.</p>
      </div>
    </UCard>

    <UCard>
      <template #header><h2 class="font-semibold">Quotes</h2></template>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Next quote number" help="Numbers read Q-2026-014.">
          <UInput v-model.number="form.next_quote_number" type="number" :min="1" class="w-full" />
        </UFormField>
        <UFormField label="Valid for (days)" help="Valid-until date on new quotes.">
          <UInput v-model.number="form.quote_valid_days" type="number" :min="1" class="w-full" />
        </UFormField>
        <UFormField label="Default terms" class="sm:col-span-2" help="Prefilled on new quotes, editable per quote.">
          <UTextarea v-model="form.quote_terms" :rows="4" class="w-full" />
        </UFormField>
      </div>
    </UCard>

    <div class="flex justify-end">
      <UButton :loading="saving" @click="save">Save settings</UButton>
    </div>
  </div>
</template>
