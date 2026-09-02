<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'

// Time off reduces capacity; there is no approval step. People log their
// own; admins log anyone's and company holidays (no person).
useHead({ title: 'Time off' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { isAdmin } = useCurrentUser()
const toast = useToast()

const everyone = ref(false)
const { data: entries, refresh } = await useAsyncData('time-off', async () => {
  let q = supabase.from('time_off').select('*, profiles(full_name)').order('starts_on', { ascending: false }).limit(200)
  if (!(isAdmin.value && everyone.value)) q = q.or(`user_id.eq.${user.value!.sub},user_id.is.null`)
  const { data, error } = await q
  if (error) throw error
  return data
}, { ...fresh, watch: [everyone] })

const { data: people } = await useAsyncData('people-for-time-off', async () => {
  if (!isAdmin.value) return []
  const { data, error } = await supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
  if (error) throw error
  return data
}, fresh)

const KINDS = [
  { label: 'PTO', value: 'pto' }, { label: 'Sick', value: 'sick' }, { label: 'Unpaid', value: 'unpaid' }, { label: 'Holiday', value: 'holiday' },
]
const kindLabel = (k: string) => KINDS.find(x => x.value === k)?.label ?? k
// Reka UI menu items refuse an empty-string value, hence the sentinel.
const COMPANY = '__company__'
const personOptions = computed(() => [{ label: 'Company holiday (everyone)', value: COMPANY }, ...(people.value ?? []).map(p => ({ label: p.full_name, value: p.id }))])
const personPick = computed({
  get: () => form.person || COMPANY,
  set: (v: string) => { form.person = v === COMPANY ? '' : v },
})

const adding = ref(false)
const form = reactive({ person: '', kind: 'pto', starts_on: todayString(), ends_on: todayString(), hours_per_day: 8 as number | string, notes: '' })
function openAdd() {
  form.person = isAdmin.value ? user.value!.sub : ''
  form.kind = 'pto'
  form.starts_on = todayString()
  form.ends_on = todayString()
  form.hours_per_day = 8
  form.notes = ''
  adding.value = true
}
const saving = ref(false)
async function save() {
  if (form.ends_on < form.starts_on) {
    toast.add({ title: 'Ends before it starts', color: 'error' })
    return
  }
  saving.value = true
  try {
    const { error } = await supabase.from('time_off').insert({
      user_id: isAdmin.value ? (form.person || null) : user.value!.sub,
      kind: form.kind as Tables<'time_off'>['kind'],
      starts_on: form.starts_on,
      ends_on: form.ends_on,
      hours_per_day: Number(form.hours_per_day) || 8,
      notes: form.notes.trim() || null,
    })
    if (error) throw error
    adding.value = false
    await refresh()
  } catch (e) {
    toast.add({ title: 'Could not save', description: (e as Error).message, color: 'error' })
  } finally {
    saving.value = false
  }
}
async function remove(id: string) {
  const { error } = await supabase.from('time_off').delete().eq('id', id)
  if (error) toast.add({ title: 'Could not remove', description: error.message, color: 'error' })
  else await refresh()
}

const weekdays = (a: string, b: string) => {
  let n = 0
  for (let d = a; d <= b; d = addDays(d, 1)) {
    const dow = parseDateString(d).getDay()
    if (dow !== 0 && dow !== 6) n++
  }
  return n
}
const canEdit = (e: { user_id: string | null }) => isAdmin.value || e.user_id === user.value?.sub
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Time off</h1>
        <p class="text-sm text-muted">Counts against capacity on weekdays. Company holidays apply to everyone.</p>
      </div>
      <USwitch v-if="isAdmin" v-model="everyone" label="Everyone" size="sm" class="ml-auto" />
      <UButton icon="i-lucide-plus" :class="isAdmin ? '' : 'ml-auto'" @click="openAdd">Add time off</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Who</th>
            <th class="px-2 py-2 font-medium">Kind</th>
            <th class="px-2 py-2 font-medium">Dates</th>
            <th class="px-2 py-2 text-right font-medium">Hours</th>
            <th class="px-2 py-2 font-medium">Notes</th>
            <th class="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in entries" :key="e.id" class="border-b border-default last:border-0" :class="e.ends_on < todayString() ? 'text-muted' : ''">
            <td class="px-4 py-2 font-medium">{{ e.user_id ? e.profiles?.full_name : 'Everyone' }}</td>
            <td class="px-2 py-2">{{ kindLabel(e.kind) }}</td>
            <td class="px-2 py-2 tabular-nums">{{ shortDate(e.starts_on) }}<span v-if="e.ends_on !== e.starts_on"> to {{ shortDate(e.ends_on) }}</span></td>
            <td class="px-2 py-2 text-right tabular-nums">{{ formatHours(weekdays(e.starts_on, e.ends_on) * e.hours_per_day) }}</td>
            <td class="max-w-xs truncate px-2 py-2 text-muted">{{ e.notes }}</td>
            <td class="px-4 py-2 text-right">
              <UButton v-if="canEdit(e)" icon="i-lucide-trash-2" variant="ghost" color="neutral" size="sm" aria-label="Remove" @click="remove(e.id)" />
            </td>
          </tr>
          <tr v-if="!entries?.length">
            <td colspan="6" class="px-4 py-8 text-center text-muted">No time off logged.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <UModal v-model:open="adding" title="Add time off">
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField v-if="isAdmin" label="Who" class="sm:col-span-2">
            <USelectMenu v-model="personPick" :items="personOptions" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Kind">
            <USelect v-model="form.kind" :items="KINDS" class="w-full" />
          </UFormField>
          <UFormField label="Hours per day" help="8 for a full day, 4 for a half day.">
            <UInput v-model="form.hours_per_day" type="number" :min="0.5" :max="24" step="0.5" class="w-full" />
          </UFormField>
          <UFormField label="From">
            <UInput v-model="form.starts_on" type="date" class="w-full" />
          </UFormField>
          <UFormField label="To">
            <UInput v-model="form.ends_on" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Notes" class="sm:col-span-2">
            <UInput v-model="form.notes" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="adding = false;">Cancel</UButton>
          <UButton :loading="saving" @click="save">Save</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
