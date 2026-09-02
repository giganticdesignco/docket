<script setup lang="ts">
import { DEFAULT_SETTINGS, type MaterialType } from '~~/shared/estimator'

// Materials and pricing knobs for the estimator. Edit a cost when a
// supplier price changes; add a material when a new roll comes in.
definePageMeta({ middleware: 'can', permission: 'manage_settings' })
useHead({ title: 'Estimator materials' })

const supabase = useSupabaseClient()
const toast = useToast()

const TYPES: MaterialType[] = ['Print Vinyl', 'Cut Vinyl', 'Overlaminate', 'Transfer Tape', 'Banner Tape', 'Substrate', 'Mounting Tape']
const __ad1 = useAsyncData('admin-estimator-materials', async () => {
  const { data, error } = await supabase.from('estimator_materials').select('*').order('position').order('name')
  if (error) throw error
  return data
}, fresh)
const __ad2 = useAsyncData('admin-estimator-settings', async () => {
  const { data } = await supabase.from('estimator_settings').select('*').eq('id', true).maybeSingle()
  return data ?? { id: true, ...DEFAULT_SETTINGS }
}, fresh)
await Promise.all([__ad1, __ad2])
const { data: materials, refresh } = __ad1
const { data: settings } = __ad2

type Row = NonNullable<typeof materials.value>[number]
const filter = ref<string>('all')
const showInactive = ref(false)
const rows = computed(() => (materials.value ?? []).filter(m => (showInactive.value || m.is_active) && (filter.value === 'all' || m.types.includes(filter.value))))
const typeOptions = [{ label: 'All types', value: 'all' }, ...TYPES.map(t => ({ label: t, value: t }))]

const editing = ref<Row | null>(null)
const adding = ref(false)
const form = reactive({ name: '', types: [] as string[], width_in: 54, length_in: 1800, cost: 0, markup_pct: 925, printable: false, is_active: true })
function openAdd() {
  Object.assign(form, { name: '', types: [], width_in: 54, length_in: 1800, cost: 0, markup_pct: 925, printable: false, is_active: true })
  adding.value = true
}
function openEdit(m: Row) {
  Object.assign(form, { name: m.name, types: [...m.types], width_in: m.width_in, length_in: m.length_in, cost: m.cost, markup_pct: m.markup_pct, printable: m.printable, is_active: m.is_active })
  editing.value = m
}
const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const values = { name: form.name.trim(), types: form.types, width_in: Number(form.width_in), length_in: Number(form.length_in), cost: Number(form.cost), markup_pct: Math.round(Number(form.markup_pct)), printable: form.printable, is_active: form.is_active }
    if (!values.name || !values.types.length || values.width_in <= 0 || values.length_in <= 0) throw new Error('Name, at least one type, and a size are needed.')
    const q = editing.value
      ? supabase.from('estimator_materials').update(values).eq('id', editing.value.id)
      : supabase.from('estimator_materials').insert({ ...values, position: (materials.value?.length ?? 0) + 1 })
    const { error } = await q
    if (error) throw error
    adding.value = false
    editing.value = null
    await refresh()
  } catch (e) {
    toast.add({ title: 'Could not save', description: (e as Error).message, color: 'error' })
  } finally {
    saving.value = false
  }
}
const savingSettings = ref(false)
async function saveSettings() {
  savingSettings.value = true
  const s = settings.value!
  const { error } = await supabase.from('estimator_settings').upsert({ id: true, ink_sq_in_cost: Number(s.ink_sq_in_cost), default_markup: Number(s.default_markup), cut_vinyl_markup: Number(s.cut_vinyl_markup), substrate_markup: Number(s.substrate_markup), mounting_tape_markup: Number(s.mounting_tape_markup) })
  savingSettings.value = false
  if (error) toast.add({ title: 'Could not save', description: error.message, color: 'error' })
  else toast.add({ title: 'Pricing settings saved', color: 'success' })
}
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const perSqFt = (m: Row) => money(m.cost / (m.width_in * m.length_in) * 144)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Estimator materials</h1>
        <p class="text-sm text-muted">What a roll or sheet costs. The estimator prices per square inch from the size and cost here.</p>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <USelect v-model="filter" :items="typeOptions" size="sm" class="w-40" />
        <USwitch v-model="showInactive" label="Show inactive" size="sm" />
        <UButton icon="i-lucide-plus" @click="openAdd">New material</UButton>
      </div>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr class="border-b border-default">
              <th class="px-4 py-2 font-medium">Material</th>
              <th class="px-2 py-2 font-medium">Types</th>
              <th class="px-2 py-2 text-right font-medium">Size (in)</th>
              <th class="px-2 py-2 text-right font-medium">Cost</th>
              <th class="px-2 py-2 text-right font-medium">Per sq ft</th>
              <th class="px-2 py-2 text-right font-medium">Markup</th>
              <th class="px-2 py-2 font-medium">Print</th>
              <th class="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in rows" :key="m.id" class="border-b border-default last:border-0" :class="m.is_active ? '' : 'text-muted'">
              <td class="max-w-md truncate px-4 py-1.5" :title="m.name">{{ m.name }}</td>
              <td class="px-2 py-1.5 text-xs text-muted">{{ m.types.join(', ') }}</td>
              <td class="px-2 py-1.5 text-right tabular-nums">{{ m.width_in }} x {{ m.length_in }}</td>
              <td class="px-2 py-1.5 text-right tabular-nums">{{ money(m.cost) }}</td>
              <td class="px-2 py-1.5 text-right tabular-nums text-muted">{{ perSqFt(m) }}</td>
              <td class="px-2 py-1.5 text-right tabular-nums">x{{ (m.markup_pct / 100).toFixed(2) }}</td>
              <td class="px-2 py-1.5">{{ m.printable ? 'Yes' : '' }}</td>
              <td class="px-4 py-1.5 text-right"><UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="xs" aria-label="Edit" @click="openEdit(m)" /></td>
            </tr>
            <tr v-if="!rows.length"><td colspan="8" class="px-4 py-8 text-center text-muted">No materials here.</td></tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard v-if="settings">
      <template #header><h2 class="font-semibold">Pricing rules</h2></template>
      <div class="grid gap-4 sm:grid-cols-5">
        <UFormField label="Ink per sq in" help="Cost of ink per printed square inch."><UInput v-model.number="settings.ink_sq_in_cost" type="number" step="0.0000001" class="w-full" /></UFormField>
        <UFormField label="Default markup" help="Transfer and banner tape."><UInput v-model.number="settings.default_markup" type="number" step="0.05" class="w-full" /></UFormField>
        <UFormField label="Cut vinyl markup"><UInput v-model.number="settings.cut_vinyl_markup" type="number" step="0.05" class="w-full" /></UFormField>
        <UFormField label="Substrate markup"><UInput v-model.number="settings.substrate_markup" type="number" step="0.05" class="w-full" /></UFormField>
        <UFormField label="Mounting tape markup"><UInput v-model.number="settings.mounting_tape_markup" type="number" step="0.05" class="w-full" /></UFormField>
      </div>
      <p class="mt-3 text-xs text-muted">Printed material and overlaminate use each material's own markup. These are the old tool's numbers; change them here and every estimate follows.</p>
      <div class="mt-3 flex justify-end"><UButton :loading="savingSettings" @click="saveSettings">Save rules</UButton></div>
    </UCard>

    <UModal :open="adding || !!editing" :title="editing ? 'Edit material' : 'New material'" @update:open="(v) => { if (!v) { adding = false; editing = null } }">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full" placeholder="Stickers / White / Gloss / Alpha Calendared Permanent Vinyl - 6 mil" /></UFormField>
          <UFormField label="Types" required help="A material can serve more than one layer.">
            <UCheckboxGroup v-model="form.types" :items="TYPES.map(t => ({ label: t, value: t }))" orientation="horizontal" />
          </UFormField>
          <div class="grid grid-cols-3 gap-4">
            <UFormField label="Width (in)"><UInput v-model.number="form.width_in" type="number" step="0.25" class="w-full" /></UFormField>
            <UFormField label="Length (in)" help="A 150 ft roll is 1800."><UInput v-model.number="form.length_in" type="number" step="1" class="w-full" /></UFormField>
            <UFormField label="Cost"><UInput v-model.number="form.cost" type="number" step="0.01" class="w-full" /></UFormField>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <UFormField label="Markup (percent)" help="925 means 9.25 times."><UInput v-model.number="form.markup_pct" type="number" step="1" class="w-full" /></UFormField>
            <UFormField label="Printable" class="pt-6"><USwitch v-model="form.printable" label="Takes ink" /></UFormField>
            <UFormField label="Active" class="pt-6"><USwitch v-model="form.is_active" label="Offered" /></UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="adding = false; editing = null;">Cancel</UButton>
          <UButton :loading="saving" @click="save">{{ editing ? 'Save' : 'Add material' }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
