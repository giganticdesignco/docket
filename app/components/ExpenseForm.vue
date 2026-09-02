<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Tables } from '~~/shared/types/database'

type Expense = Tables<'expenses'>
type ProjectOption = Pick<Tables<'projects'>, 'id' | 'name'> & { clients: { name: string } | null }
type CategoryOption = Pick<Tables<'expense_categories'>, 'id' | 'name'>

// Create or edit one of the signed-in user's expenses, with an optional
// receipt (image or PDF) stored in the receipts bucket.
const props = defineProps<{
  expense?: Expense
  projects: ProjectOption[]
  categories: CategoryOption[]
}>()
const emit = defineEmits<{ saved: [expense: Expense]; cancel: [] }>()

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const receipts = useReceipts()
const toast = useToast()

const state = reactive({
  project_id: props.expense?.project_id as string | undefined,
  category_id: props.expense?.category_id as string | undefined,
  spent_on: props.expense?.spent_on ?? todayString(),
  // UInput type=number hands back a number once edited, a string before.
  amount: (props.expense ? String(props.expense.amount) : '') as string | number,
  notes: props.expense?.notes ?? '',
  is_billable: props.expense?.is_billable ?? true,
  is_reimbursable: props.expense?.is_reimbursable ?? false,
})
const file = ref<File | null>(null)
const removeReceipt = ref(false)
const saving = ref(false)

const projectOptions = computed(() => props.projects.map(p => ({
  label: p.clients ? `${p.clients.name} / ${p.name}` : p.name,
  value: p.id,
})))
const categoryOptions = computed(() => props.categories.map(c => ({ label: c.name, value: c.id })))

const currentReceipt = computed(() => (!removeReceipt.value && props.expense?.receipt_path) || null)

function onFile(e: Event) {
  file.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

function validate(s: typeof state) {
  const errors = []
  if (!s.project_id) errors.push({ name: 'project_id', message: 'Pick a project' })
  if (!s.category_id) errors.push({ name: 'category_id', message: 'Pick a category' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.spent_on)) errors.push({ name: 'spent_on', message: 'Pick a date' })
  const raw = String(s.amount ?? '').trim()
  const amount = Number(raw)
  if (!raw || !Number.isFinite(amount) || amount <= 0) errors.push({ name: 'amount', message: 'Enter an amount' })
  return errors
}

async function onSubmit(_e: FormSubmitEvent<typeof state>) {
  saving.value = true
  const oldPath = props.expense?.receipt_path ?? null
  let receiptPath = removeReceipt.value ? null : oldPath
  let uploaded: string | null = null
  try {
    if (file.value) {
      uploaded = await receipts.upload(file.value)
      receiptPath = uploaded
    }
    const values = {
      user_id: user.value!.sub,
      project_id: state.project_id!,
      category_id: state.category_id!,
      spent_on: state.spent_on,
      amount: Math.round(Number(state.amount) * 100) / 100,
      notes: state.notes.trim() || null,
      is_billable: state.is_billable,
      is_reimbursable: state.is_reimbursable,
      receipt_path: receiptPath,
    }
    const query = props.expense
      ? supabase.from('expenses').update(values).eq('id', props.expense.id)
      : supabase.from('expenses').insert(values)
    const { data, error } = await query.select().single()
    if (error) throw error
    // The row no longer points at the old file. Best effort cleanup.
    if (oldPath && oldPath !== receiptPath) await receipts.remove(oldPath).catch(() => {})
    emit('saved', data)
  } catch (e) {
    if (uploaded) await receipts.remove(uploaded).catch(() => {})
    toast.add({ title: 'Could not save expense', description: (e as Error).message, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
    <UFormField label="Project" name="project_id" required>
      <USelectMenu v-model="state.project_id" :items="projectOptions" value-key="value" class="w-full" placeholder="Pick a project" />
    </UFormField>
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Category" name="category_id" required>
        <USelectMenu v-model="state.category_id" :items="categoryOptions" value-key="value" class="w-full" placeholder="Pick a category" />
      </UFormField>
      <UFormField label="Date" name="spent_on" required>
        <UInput v-model="state.spent_on" type="date" class="w-full" />
      </UFormField>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Amount" name="amount" required>
        <UInput v-model="state.amount" type="number" step="0.01" min="0" icon="i-lucide-dollar-sign" class="w-full" />
      </UFormField>
      <div class="flex flex-col justify-end gap-2 pb-1">
        <USwitch v-model="state.is_billable" label="Billable to client" />
        <USwitch v-model="state.is_reimbursable" label="Reimburse me" />
      </div>
    </div>
    <UFormField label="Notes" name="notes">
      <UTextarea v-model="state.notes" :rows="2" class="w-full" />
    </UFormField>
    <UFormField label="Receipt" name="receipt" hint="Image or PDF, up to 10 MB">
      <div v-if="currentReceipt" class="flex items-center gap-2 text-sm">
        <UIcon name="i-lucide-paperclip" class="text-muted" />
        <span>Receipt attached</span>
        <UButton size="xs" variant="ghost" color="neutral" @click="receipts.open(currentReceipt)">View</UButton>
        <UButton size="xs" variant="ghost" color="neutral" @click="removeReceipt = true;">Remove</UButton>
      </div>
      <input
        v-else
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        class="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-elevated file:px-3 file:py-1.5 file:text-sm file:text-highlighted"
        @change="onFile"
      >
    </UFormField>
    <div class="flex justify-end gap-2">
      <UButton variant="ghost" color="neutral" @click="emit('cancel')">Cancel</UButton>
      <UButton type="submit" :loading="saving">{{ expense ? 'Save' : 'Add expense' }}</UButton>
    </div>
  </UForm>
</template>
