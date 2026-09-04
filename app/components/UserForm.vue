<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Tables } from '~~/shared/types/database'

type Profile = Tables<'profiles'>

// Edit a person: name, role, default rate, active flag, and hours per week
// (availability, used by capacity in step 9). Admin only. People are added
// in Supabase Auth, not here; deactivate rather than delete.
const props = defineProps<{
  profile: Profile
  hoursPerWeek: number | null
  isSelf: boolean
}>()
const emit = defineEmits<{ saved: []; cancel: [] }>()

const supabase = useSupabaseClient()
const toast = useToast()
// Cost rate is money, so only people who see money see or set it.
const { can } = useCurrentUser()
const seeMoney = computed(() => can('field:cost_margin'))

const state = reactive({
  full_name: props.profile.full_name,
  role: props.profile.role as Profile['role'],
  default_rate: (props.profile.default_rate == null ? '' : String(props.profile.default_rate)) as string | number,
  cost_rate: (props.profile.cost_rate == null ? '' : String(props.profile.cost_rate)) as string | number,
  is_active: props.profile.is_active,
  department_id: props.profile.department_id ?? undefined as string | undefined,
  hours_per_week: (props.hoursPerWeek == null ? '' : String(props.hoursPerWeek)) as string | number,
})
const saving = ref(false)

const { data: roles } = await useRoles()
const { data: departments } = await useAsyncData('user-form-departments', async () => {
  const { data } = await supabase.from('departments').select('id, name, lead_id').eq('is_active', true).order('name')
  return data ?? []
}, fresh)
const departmentItems = computed(() => [{ label: 'None', value: undefined as string | undefined }, ...(departments.value ?? []).map(d => ({ label: d.name, value: d.id }))])
const roleOptions = computed(() => (roles.value ?? []).map(r => ({ label: r.label, value: r.key })))

function num(v: string | number): number | null {
  const raw = String(v ?? '').trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function validate(s: typeof state) {
  const errors = []
  if (!s.full_name.trim()) errors.push({ name: 'full_name', message: 'Name is required' })
  if (String(s.default_rate).trim() && (num(s.default_rate) ?? -1) < 0) errors.push({ name: 'default_rate', message: 'Rate must be 0 or more' })
  if (String(s.hours_per_week).trim() && ((num(s.hours_per_week) ?? -1) < 0 || (num(s.hours_per_week) ?? 0) > 168)) errors.push({ name: 'hours_per_week', message: 'Between 0 and 168' })
  return errors
}

async function onSubmit(_e: FormSubmitEvent<typeof state>) {
  saving.value = true
  try {
    const { error } = await supabase.from('profiles').update({
      full_name: state.full_name.trim(),
      role: state.role,
      default_rate: num(state.default_rate),
      ...(seeMoney.value ? { cost_rate: num(state.cost_rate) } : {}),
      is_active: state.is_active,
      department_id: state.department_id ?? null,
    }).eq('id', props.profile.id)
    if (error) throw error

    // Availability is a history: close the current row and open a new one
    // from today when the number changes.
    const hours = num(state.hours_per_week)
    if (hours != null && hours !== props.hoursPerWeek) {
      const today = todayString()
      const { data: current, error: curErr } = await supabase
        .from('availability').select('id, effective_from').eq('user_id', props.profile.id).is('effective_to', null).maybeSingle()
      if (curErr) throw curErr
      if (current && current.effective_from === today) {
        const { error: e } = await supabase.from('availability').update({ hours_per_week: hours }).eq('id', current.id)
        if (e) throw e
      } else {
        if (current) {
          const { error: e } = await supabase.from('availability').update({ effective_to: addDays(today, -1) }).eq('id', current.id)
          if (e) throw e
        }
        const { error: e } = await supabase.from('availability').insert({ user_id: props.profile.id, hours_per_week: hours, effective_from: today })
        if (e) throw e
      }
    }
    emit('saved')
  } catch (e) {
    toast.add({ title: 'Could not save person', description: (e as Error).message, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
    <UFormField label="Name" name="full_name" required>
      <UInput v-model="state.full_name" class="w-full" />
    </UFormField>
    <UFormField label="Email" name="email" hint="Set in Supabase Auth">
      <UInput :model-value="profile.email" class="w-full" disabled />
    </UFormField>
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Role" name="role" :hint="isSelf ? 'Not for yourself' : undefined">
        <USelect v-model="state.role" :items="roleOptions" class="w-full" :disabled="isSelf" />
      </UFormField>
      <UFormField label="Default rate" name="default_rate" hint="Fallback">
        <UInput v-model="state.default_rate" type="number" step="0.01" min="0" icon="i-lucide-dollar-sign" class="w-full" />
      </UFormField>
    </div>
    <UFormField v-if="seeMoney" label="Cost rate" name="cost_rate" help="What an hour of this person costs the company. Quotes use it for margin; nothing client-facing shows it.">
      <UInput v-model="state.cost_rate" type="number" step="0.01" min="0" icon="i-lucide-dollar-sign" class="w-full" />
    </UFormField>
    <UFormField label="Department" name="department_id" help="Its lead reviews this person's submitted time.">
      <USelectMenu v-model="state.department_id" :items="departmentItems" value-key="value" class="w-full" placeholder="None" />
    </UFormField>
    <div class="grid grid-cols-2 items-end gap-4">
      <UFormField label="Hours per week" name="hours_per_week" hint="From today">
        <UInput v-model="state.hours_per_week" type="number" step="0.5" min="0" max="168" class="w-full" placeholder="30" />
      </UFormField>
      <UFormField name="is_active" class="pb-2">
        <USwitch v-model="state.is_active" label="Active" :disabled="isSelf" />
      </UFormField>
    </div>
    <div class="flex justify-end gap-2">
      <UButton variant="ghost" color="neutral" @click="emit('cancel')">Cancel</UButton>
      <UButton type="submit" :loading="saving">Save</UButton>
    </div>
  </UForm>
</template>
