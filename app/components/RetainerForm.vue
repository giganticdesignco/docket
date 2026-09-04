<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Tables } from '~~/shared/types/database'

type Retainer = Tables<'retainers'>

// Create or edit a retainer: a budget of hours or dollars for one period on
// a client, or on one of its projects. Admin only. A term (monthly,
// quarterly, yearly) sets the end date from the start and, with Renews on,
// a nightly job opens the next period when this one ends. Leftover rolls
// into the next contiguous period when rollover is on.
const props = defineProps<{
  retainer?: Retainer
  clientId: string
  projects: Pick<Tables<'projects'>, 'id' | 'name'>[]
}>()
const emit = defineEmits<{ saved: [retainer: Retainer]; cancel: [] }>()

const supabase = useSupabaseClient()
const toast = useToast()

const today = todayString()
const state = reactive({
  name: props.retainer?.name ?? '',
  project_id: props.retainer?.project_id ?? '',
  basis: (props.retainer?.basis ?? 'hours') as Retainer['basis'],
  period_start: props.retainer?.period_start ?? startOfMonth(today),
  period_end: props.retainer?.period_end ?? endOfMonth(today),
  allotted: (props.retainer ? String(props.retainer.allotted) : '') as string | number,
  rollover: props.retainer?.rollover ?? false,
  rollover_cap: (props.retainer?.rollover_cap == null ? '' : String(props.retainer.rollover_cap)) as string | number,
  term: (props.retainer?.term ?? 'monthly') as 'custom' | 'monthly' | 'quarterly' | 'yearly',
  renews: props.retainer?.renews ?? !props.retainer,
})
const termOptions = [
  { label: 'Monthly', value: 'monthly' },
  { label: 'Quarterly', value: 'quarterly' },
  { label: 'Yearly', value: 'yearly' },
  { label: 'Custom dates', value: 'custom' },
]
// The end date follows the term: a month, a quarter, or a year from the
// start, minus a day. Custom leaves both dates to you.
function endFor(start: string, term: string): string {
  const d = parseDateString(start)
  const months = term === 'monthly' ? 1 : term === 'quarterly' ? 3 : 12
  const e = new Date(d.getFullYear(), d.getMonth() + months, d.getDate() - 1)
  return toDateString(e)
}
watch(() => [state.term, state.period_start], () => {
  if (state.term !== 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(state.period_start)) state.period_end = endFor(state.period_start, state.term)
  if (state.term === 'custom') state.renews = false
}, { immediate: !props.retainer })
const saving = ref(false)

// Reka UI menu items refuse an empty-string value, hence the sentinel.
const WHOLE = '__client__'
const projectOptions = computed(() => [
  { label: 'Whole client', value: WHOLE },
  ...props.projects.map(p => ({ label: p.name, value: p.id })),
])
const projectPick = computed({
  get: () => state.project_id || WHOLE,
  set: (v: string) => { state.project_id = v === WHOLE ? '' : v },
})
const basisOptions = [
  { label: 'Hours', value: 'hours' },
  { label: 'Dollars', value: 'amount' },
]

function num(v: string | number): number | null {
  const raw = String(v ?? '').trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function validate(s: typeof state) {
  const errors = []
  if (!s.name.trim()) errors.push({ name: 'name', message: 'Name is required' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.period_start)) errors.push({ name: 'period_start', message: 'Pick a start date' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.period_end) || s.period_end < s.period_start) errors.push({ name: 'period_end', message: 'End must be on or after start' })
  const allotted = num(s.allotted)
  if (allotted == null || allotted <= 0) errors.push({ name: 'allotted', message: 'Enter the allotment' })
  if (s.rollover && String(s.rollover_cap).trim() && (num(s.rollover_cap) ?? -1) < 0) errors.push({ name: 'rollover_cap', message: 'Cap must be 0 or more' })
  return errors
}

async function onSubmit(_e: FormSubmitEvent<typeof state>) {
  saving.value = true
  const values = {
    client_id: props.clientId,
    project_id: state.project_id || null,
    name: state.name.trim(),
    basis: state.basis,
    period_start: state.period_start,
    period_end: state.period_end,
    allotted: num(state.allotted)!,
    rollover: state.rollover,
    rollover_cap: state.rollover ? num(state.rollover_cap) : null,
    term: state.term,
    renews: state.term !== 'custom' && state.renews,
  }
  const query = props.retainer
    ? supabase.from('retainers').update(values).eq('id', props.retainer.id)
    : supabase.from('retainers').insert(values)
  const { data, error } = await query.select().single()
  saving.value = false
  if (error) {
    toast.add({ title: 'Could not save retainer', description: error.message, color: 'error' })
    return
  }
  emit('saved', data)
}
</script>

<template>
  <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
    <UFormField label="Name" name="name" required hint="Reuse the same name each period so leftover can roll over">
      <UInput v-model="state.name" class="w-full" placeholder="Monthly retainer" autofocus />
    </UFormField>
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Applies to" name="project_id">
        <USelectMenu v-model="projectPick" :items="projectOptions" value-key="value" class="w-full" />
      </UFormField>
      <UFormField label="Basis" name="basis">
        <USelect v-model="state.basis" :items="basisOptions" class="w-full" />
      </UFormField>
    </div>
    <div class="grid grid-cols-2 items-end gap-4">
      <UFormField label="Term" name="term">
        <USelect v-model="state.term" :items="termOptions" class="w-full" />
      </UFormField>
      <UFormField name="renews" class="pb-2">
        <USwitch v-model="state.renews" :disabled="state.term === 'custom'" label="Renews on its own when the period ends" />
      </UFormField>
    </div>
    <div class="grid grid-cols-3 gap-4">
      <UFormField label="From" name="period_start" required>
        <UInput v-model="state.period_start" type="date" class="w-full" />
      </UFormField>
      <UFormField label="To" name="period_end" required>
        <UInput v-model="state.period_end" type="date" class="w-full" :disabled="state.term !== 'custom'" />
      </UFormField>
      <UFormField :label="state.basis === 'hours' ? 'Hours' : 'Amount'" name="allotted" required>
        <UInput v-model="state.allotted" type="number" step="0.01" min="0" class="w-full" :icon="state.basis === 'amount' ? 'i-lucide-dollar-sign' : undefined" />
      </UFormField>
    </div>
    <div class="grid grid-cols-2 items-end gap-4">
      <UFormField name="rollover" class="pb-2">
        <USwitch v-model="state.rollover" label="Leftover rolls into the next period" />
      </UFormField>
      <UFormField label="Rollover cap" name="rollover_cap" hint="Blank means uncapped">
        <UInput v-model="state.rollover_cap" type="number" step="0.01" min="0" class="w-full" :disabled="!state.rollover" />
      </UFormField>
    </div>
    <div class="flex justify-end gap-2">
      <UButton variant="ghost" color="neutral" @click="emit('cancel')">Cancel</UButton>
      <UButton type="submit" :loading="saving">{{ retainer ? 'Save' : 'Create retainer' }}</UButton>
    </div>
  </UForm>
</template>
