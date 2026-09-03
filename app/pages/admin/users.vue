<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'

// People: roles, default rates, capacity, active flag. Accounts themselves
// live in Supabase Auth (Authentication > Users); Google links by email.
definePageMeta({ middleware: 'can', permission: 'manage_people' })
useHead({ title: 'People' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const toast = useToast()
const showInactive = ref(false)
const editing = ref<Tables<'profiles'> | null>(null)
const adding = ref(false)
const addState = reactive({ email: '', full_name: '', role: 'staff' as 'staff' | 'admin' })
const addSaving = ref(false)
const roleOptions = [
  { label: 'Staff', value: 'staff' },
  { label: 'Admin', value: 'admin' },
]

// Goes through a server route: creating an auth user needs the secret key.
async function addPerson() {
  addSaving.value = true
  try {
    await $fetch('/api/people', { method: 'POST', body: { ...addState } })
    toast.add({ title: `${addState.full_name.trim()} can now sign in with Google`, color: 'success' })
    adding.value = false
    addState.email = ''
    addState.full_name = ''
    addState.role = 'staff'
    refresh()
  } catch (e) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Could not add person', description: err.data?.statusMessage ?? err.message, color: 'error' })
  } finally {
    addSaving.value = false
  }
}

const __ad1 = useAsyncData('admin-profiles', async () => {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name')
  if (error) throw error
  return data
}, fresh)

const __ad2 = useAsyncData('admin-availability', async () => {
  const { data, error } = await supabase.from('availability').select('user_id, hours_per_week').is('effective_to', null)
  if (error) throw error
  return data
}, fresh)
await Promise.all([__ad1, __ad2])
const { data: profiles, refresh } = __ad1
const { data: availability, refresh: refreshAvailability } = __ad2

const hoursFor = (id: string) => availability.value?.find(a => a.user_id === id)?.hours_per_week ?? null

// This month per person, by name, from the report function.
const { data: monthRows } = await useAsyncData('admin-people-month', async () => {
  const today = todayString()
  const { data, error } = await supabase.rpc('report_time', { p_from: startOfMonth(today), p_to: endOfMonth(today), p_group: 'person' })
  if (error) throw error
  return data
}, fresh)
const monthFor = (name: string) => monthRows.value?.find(r => r.label === name)
const monthText = (name: string) => {
  const r = monthFor(name)
  if (!r || Number(r.hours) === 0) return ''
  return `${formatHours(r.hours)} (${Math.round(Number(r.billable_hours) / Number(r.hours) * 100)}% billable)`
}
type Person = NonNullable<typeof profiles.value>[number]
const cols = await useColumns<Person>('people', [
  { key: 'name', label: 'Name', sort: p => p.full_name, always: true },
  { key: 'email', label: 'Email', sort: p => p.email },
  { key: 'role', label: 'Role', sort: p => p.role },
  { key: 'rate', label: 'Default rate', align: 'right', sort: p => p.default_rate },
  { key: 'hours', label: 'Hours / week', align: 'right', sort: p => hoursFor(p.id) },
  { key: 'month', label: 'This month', align: 'right', sort: p => Number(monthFor(p.full_name)?.hours ?? 0) },
  { key: 'status', label: 'Status', sort: p => (p.is_active ? 0 : 1) },
])
const rows = computed(() => cols.sorted((profiles.value ?? []).filter(p => showInactive.value || p.is_active)))
const money = (n: number | null) => (n == null ? '' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)

function done() {
  editing.value = null
  refresh()
  refreshAvailability()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">People</h1>
        <p class="text-sm text-muted">
          People sign in with Google using their giganticdesign.com address. Deactivate rather than delete so their time stays attached.
        </p>
      </div>
      <USwitch v-model="showInactive" label="Show inactive" size="sm" class="ml-auto shrink-0" />
      <UButton icon="i-lucide-user-plus" @click="adding = true;">Add person</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <TableHead :cols="cols" />
        <tbody>
          <tr v-for="p in rows" :key="p.id" class="border-b border-default last:border-0">
            <td v-for="c in cols.visible" :key="c.key" class="px-4 py-2" :class="[c.align === 'right' ? 'text-right tabular-nums' : '', c.key === 'month' ? 'whitespace-nowrap' : '']">
              <template v-if="c.key === 'name'"><span class="font-medium">{{ p.full_name }}</span><span v-if="p.id === user?.sub" class="ml-2 text-xs text-muted">you</span></template>
              <span v-else-if="c.key === 'email'" class="text-muted">{{ p.email }}</span>
              <UBadge v-else-if="c.key === 'role'" :color="p.role === 'admin' ? 'primary' : 'neutral'" variant="subtle" size="sm">{{ p.role }}</UBadge>
              <template v-else-if="c.key === 'rate'">{{ money(p.default_rate) }}</template>
              <template v-else-if="c.key === 'hours'">{{ hoursFor(p.id) ?? '' }}</template>
              <template v-else-if="c.key === 'month'">{{ monthText(p.full_name) }}</template>
              <UBadge v-else-if="c.key === 'status'" :color="p.is_active ? 'success' : 'neutral'" variant="subtle" size="sm">{{ p.is_active ? 'Active' : 'Inactive' }}</UBadge>
            </td>
            <td class="px-2 py-2 text-right">
              <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" aria-label="Edit" @click="editing = p;" />
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td :colspan="cols.visible.length + 1" class="px-4 py-8 text-center text-muted">Nobody here.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <AppDrawer v-model:open="adding" title="Add person">
      <template #body>
        <form class="space-y-4" @submit.prevent="addPerson">
          <UFormField label="Full name" required>
            <UInput v-model="addState.full_name" class="w-full" autofocus />
          </UFormField>
          <UFormField label="Email" required hint="giganticdesign.com only">
            <UInput v-model="addState.email" type="email" class="w-full" placeholder="name@giganticdesign.com" />
          </UFormField>
          <UFormField label="Role">
            <USelect v-model="addState.role" :items="roleOptions" class="w-full" />
          </UFormField>
          <p class="text-xs text-muted">No email is sent. Tell them to open Docket and sign in with Google; rate and hours can be set after.</p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="adding = false;">Cancel</UButton>
            <UButton type="submit" :loading="addSaving" :disabled="!addState.full_name.trim() || !addState.email.trim()">Add person</UButton>
          </div>
        </form>
      </template>
    </AppDrawer>

    <AppDrawer :open="!!editing" :title="editing?.full_name ?? 'Edit person'" @update:open="(v) => { if (!v) editing = null }">
      <template #body>
        <UserForm v-if="editing" :profile="editing" :hours-per-week="hoursFor(editing.id)" :is-self="editing.id === user?.sub" @saved="done" @cancel="editing = null;" />
      </template>
    </AppDrawer>
  </div>
</template>
