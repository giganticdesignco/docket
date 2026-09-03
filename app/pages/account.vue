<script setup lang="ts">
// Your own settings: the Google Calendar connection, and a pointer to
// notification choices. Admins also see who else is connected.
useHead({ title: 'Account' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()
const toast = useToast()
const { profile, can } = useCurrentUser()

const { data: connections, refresh } = await useAsyncData('calendar-connections', async () => {
  const { data, error } = await supabase.from('calendar_connections').select('user_id, google_email, connected_at, last_synced_at, last_error')
  if (error) throw error
  // The view's columns come back nullable; the rows never are.
  return (data ?? []).map(c => ({ user_id: c.user_id!, google_email: c.google_email ?? '', connected_at: c.connected_at, last_synced_at: c.last_synced_at, last_error: c.last_error }))
}, fresh)
const mine = computed(() => connections.value?.find(c => c.user_id === user.value?.sub) ?? null)
const others = computed(() => (connections.value ?? []).filter(c => c.user_id !== user.value?.sub))
const { data: people } = await useAsyncData('people-for-account', async () => {
  if (!can('manage_people')) return []
  const { data } = await supabase.from('profiles').select('id, full_name').eq('is_active', true).neq('role', 'client').order('full_name')
  return data ?? []
}, fresh)
const nameOf = (id: string) => people.value?.find(p => p.id === id)?.full_name ?? id

// Back from Google: the callback appends what happened.
onMounted(() => {
  const msg = typeof route.query.calendar === 'string' ? route.query.calendar : ''
  if (msg === 'connected') toast.add({ title: 'Calendar connected', description: 'Busy time for the next eight weeks is in.', color: 'success' })
  else if (msg) toast.add({ title: 'Calendar not connected', description: msg, color: 'error' })
})

const busy = ref(false)
async function sync(userId?: string) {
  busy.value = true
  try {
    const r = await $fetch<{ blocks: number }>('/api/google/sync', { method: 'POST', body: { userId } })
    toast.add({ title: 'Calendar synced', description: `${r.blocks} busy ${r.blocks === 1 ? 'block' : 'blocks'} for the next eight weeks.`, color: 'success' })
    await refresh()
  } catch (e) {
    toast.add({ title: 'Sync failed', description: (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? (e as Error).message, color: 'error' })
  } finally {
    busy.value = false
  }
}
async function disconnect() {
  busy.value = true
  try {
    await $fetch('/api/google/disconnect', { method: 'POST' })
    toast.add({ title: 'Calendar disconnected', color: 'success' })
    await refresh()
  } finally {
    busy.value = false
  }
}
const stamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never')

// The morning brief email, saved on the profile. Own row, so RLS allows it.
const briefBusy = ref(false)
async function setBriefEmail(on: boolean) {
  if (!profile.value) return
  briefBusy.value = true
  const { error } = await supabase.from('profiles').update({ brief_email: on }).eq('id', profile.value.id)
  briefBusy.value = false
  if (error) { toast.add({ title: 'Not saved', description: error.message, color: 'error' }); return }
  profile.value = { ...profile.value, brief_email: on }
  toast.add({ title: on ? 'You will get the brief by email each weekday morning' : 'Brief email off', color: 'success', duration: 2500 })
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Account</h1>
      <p class="text-sm text-muted">{{ profile?.full_name }} · {{ profile?.email }}</p>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-baseline gap-3">
          <h2 class="font-semibold">Google Calendar</h2>
          <span class="text-xs text-muted">Meetings count against your capacity.</span>
        </div>
      </template>
      <div v-if="mine" class="space-y-3 text-sm">
        <p>Connected as <strong>{{ mine.google_email }}</strong>. Busy time for the next eight weeks syncs every night and shows on Planner and Schedule as busy time.</p>
        <p class="text-xs text-muted">Last synced {{ stamp(mine.last_synced_at) }}.<span v-if="mine.last_error" class="text-error"> Last error: {{ mine.last_error }}</span></p>
        <div class="flex gap-2">
          <UButton size="sm" icon="i-lucide-refresh-cw" :loading="busy" @click="sync()">Sync now</UButton>
          <UButton size="sm" variant="ghost" color="neutral" :disabled="busy" @click="disconnect">Disconnect</UButton>
        </div>
      </div>
      <div v-else class="space-y-3 text-sm">
        <p>Connect your Google Calendar and Docket reads only when you are busy, never what the events are. That time is subtracted from your available hours on Planner and Schedule.</p>
        <UButton to="/api/google/connect" external icon="i-simple-icons-google">Connect Google Calendar</UButton>
      </div>
    </UCard>

    <ConnectClaudeCard v-if="profile?.role !== 'client'" />

    <UCard v-if="can('manage_people')">
      <template #header><h2 class="font-semibold">Team calendars</h2></template>
      <ul v-if="others.length" class="divide-y divide-default text-sm">
        <li v-for="c in others" :key="c.user_id" class="flex items-center gap-3 py-2">
          <span class="min-w-0 flex-1"><span class="font-medium">{{ nameOf(c.user_id) }}</span> <span class="text-muted">{{ c.google_email }}</span></span>
          <span class="text-xs" :class="c.last_error ? 'text-error' : 'text-muted'">{{ c.last_error ? c.last_error : `synced ${stamp(c.last_synced_at)}` }}</span>
          <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-refresh-cw" :loading="busy" @click="sync(c.user_id)">Sync</UButton>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">Nobody else has connected a calendar yet. Each person does it from this page.</p>
    </UCard>

    <UCard>
      <template #header><h2 class="font-semibold">Morning brief</h2></template>
      <p class="text-sm text-muted">Each weekday morning Docket writes you a short note: what is overdue or due today, weeks waiting for your approval, quotes out with clients, today's meetings, and where the week's hours stand. It is on your Home page either way.</p>
      <USwitch class="mt-3" :model-value="!!profile?.brief_email" label="Also email it to me each morning" :loading="briefBusy" @update:model-value="setBriefEmail" />
    </UCard>

    <UCard>
      <template #header><h2 class="font-semibold">Notifications</h2></template>
      <p class="text-sm text-muted">What reaches you in the bell and by email is on the <NuxtLink to="/notifications" class="text-primary hover:underline">Notifications</NuxtLink> page.</p>
    </UCard>
  </div>
</template>
