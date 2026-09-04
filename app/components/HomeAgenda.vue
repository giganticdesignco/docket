<script setup lang="ts">
// Today or this week for the signed-in person: busy blocks from their
// Google Calendar (free/busy only, so no titles) merged with the tasks
// due, in time order. Without a calendar connection it is just the
// tasks, with a link to connect.
const props = defineProps<{ range: 'day' | 'week' }>()
const emit = defineEmits<{ 'update:range': [value: 'day' | 'week'] }>()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const ws = await useWorkStatuses()

const today = todayString()
const days = computed(() => (props.range === 'day' ? [today] : weekDays(today)))
const from = computed(() => days.value[0]!)
const to = computed(() => days.value[days.value.length - 1]!)

const { data, status } = await useAsyncData('home-agenda', async () => {
  if (!user.value) return { busy: [], due: [], connected: false }
  const startIso = new Date(`${from.value}T00:00:00`).toISOString()
  const endIso = new Date(`${addDays(to.value, 1)}T00:00:00`).toISOString()
  const [busy, due, conn] = await Promise.all([
    supabase.from('calendar_busy').select('id, starts_at, ends_at, hours').eq('user_id', user.value.sub).gte('starts_at', startIso).lt('starts_at', endIso).order('starts_at'),
    supabase.from('work_items').select('id, title, status, due_on, is_milestone, assignee_id, projects(name, clients(name)), work_item_assignees!inner(user_id)').eq('work_item_assignees.user_id', user.value.sub).gte('due_on', from.value).lte('due_on', to.value).order('due_on'),
    supabase.from('calendar_connections').select('user_id').eq('user_id', user.value.sub).maybeSingle(),
  ])
  return {
    busy: busy.data ?? [],
    // Up now: a task someone else is up on is theirs to worry about today;
    // one with nobody up stays, tagged, so it is not forgotten.
    due: (due.data ?? []).filter(w => !ws.isDone(w.status) && (!w.assignee_id || w.assignee_id === user.value?.sub)),
    connected: !!conn.data,
  }
}, { ...fresh, server: false, watch: [() => props.range] })

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const dayOf = (iso: string) => toDateString(new Date(iso))
// One list per day: busy blocks by start time, then the tasks due.
const perDay = computed(() => days.value.map(d => ({
  day: d,
  busy: (data.value?.busy ?? []).filter(b => dayOf(b.starts_at) === d),
  due: (data.value?.due ?? []).filter(w => w.due_on === d),
})))
const busyHours = (d: { busy: { hours: number }[] }) => d.busy.reduce((s, b) => s + b.hours, 0)
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-center gap-3">
        <h2 class="font-semibold">Agenda</h2>
        <span class="text-xs text-muted">{{ range === 'day' ? longDate(today) : `${shortDate(from)} to ${shortDate(to)}` }}</span>
        <div class="ml-auto flex gap-0.5 rounded-md bg-elevated p-0.5">
          <UButton size="xs" :variant="range === 'day' ? 'solid' : 'ghost'" :color="range === 'day' ? 'primary' : 'neutral'" @click="emit('update:range', 'day')">Day</UButton>
          <UButton size="xs" :variant="range === 'week' ? 'solid' : 'ghost'" :color="range === 'week' ? 'primary' : 'neutral'" @click="emit('update:range', 'week')">Week</UButton>
        </div>
      </div>
    </template>
    <div v-if="status === 'pending' && !data" class="px-4 py-6 text-sm text-muted">Loading</div>
    <div v-else class="divide-y divide-default text-sm">
      <div v-for="d in perDay" :key="d.day" class="px-4 py-2">
        <div v-if="range === 'week'" class="mb-1 flex items-baseline gap-2 text-xs">
          <span class="font-semibold" :class="d.day === today ? 'text-primary' : ''">{{ dayName(d.day) }} {{ shortDate(d.day) }}</span>
          <span v-if="busyHours(d)" class="text-muted">{{ formatHours(busyHours(d)) }} in meetings</span>
        </div>
        <ul v-if="d.busy.length || d.due.length" class="space-y-1">
          <li v-for="b in d.busy" :key="b.id" class="flex items-center gap-2 rounded bg-elevated/60 px-2 py-1">
            <UIcon name="i-lucide-calendar" class="size-3.5 shrink-0 text-muted" />
            <span class="tabular-nums">{{ clock(b.starts_at) }} to {{ clock(b.ends_at) }}</span>
            <span class="text-muted">Busy</span>
          </li>
          <li v-for="w in d.due" :key="w.id" class="flex items-center gap-2 px-2 py-1" :class="w.assignee_id ? '' : 'opacity-70'">
            <UIcon :name="w.is_milestone ? 'i-lucide-flag' : 'i-lucide-circle-dot'" class="size-3.5 shrink-0" :class="w.due_on! < today ? 'text-error' : w.assignee_id ? 'text-primary' : 'text-warning'" />
            <NuxtLink :to="`/tasks/${w.id}`" class="min-w-0 flex-1 truncate hover:underline">{{ w.title }}</NuxtLink>
            <UBadge v-if="!w.assignee_id" color="warning" variant="subtle" size="sm">Nobody up</UBadge>
            <span class="shrink-0 truncate text-xs text-muted">{{ w.projects?.clients?.name }}</span>
            <span class="shrink-0 text-xs text-muted">due</span>
          </li>
        </ul>
        <p v-else class="px-2 py-1 text-xs text-muted">{{ range === 'day' ? 'Nothing on the calendar and nothing due today.' : 'Clear.' }}</p>
      </div>
    </div>
    <div v-if="data && !data.connected" class="border-t border-default px-4 py-2 text-xs text-muted">
      Meetings show here once your Google Calendar is connected. <NuxtLink to="/account" class="underline">Connect it</NuxtLink>.
    </div>
  </UCard>
</template>
