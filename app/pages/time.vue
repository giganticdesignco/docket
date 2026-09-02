<script setup lang="ts">
// The signed-in user's timesheet: one week at a time, one day expanded.
// Client-only (see routeRules in nuxt.config) so "today" and the live timer
// come from the browser clock.
useHead({ title: 'Time' })

const route = useRoute()
const router = useRouter()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const timer = useTimer()
const { running, isRunning, liveHours } = timer

const selected = computed(() => {
  const q = route.query.date
  return typeof q === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayString()
})
const days = computed(() => weekDays(selected.value))
const weekStart = computed(() => days.value[0]!)
const weekEnd = computed(() => days.value[6]!)

function goTo(date: string) {
  router.push({ query: date === todayString() ? {} : { date } })
}

const __ad1 = useAsyncData('time-week', async () => {
  const { data, error } = await supabase
    .from('time_entries')
    .select('*, projects(name, clients(name)), tasks(name)')
    .eq('user_id', user.value!.sub)
    .gte('spent_on', weekStart.value)
    .lte('spent_on', weekEnd.value)
    .order('spent_on')
    .order('created_at')
  if (error) throw error
  return data
}, { ...fresh, watch: [weekStart] })

const __ad2 = useAsyncData('projects-for-time', async () => {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, billing_method, clients(name)')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}, fresh)

const __ad3 = useAsyncData('project-tasks-for-time', async () => {
  const { data, error } = await supabase
    .from('project_tasks')
    .select('project_id, task_id, tasks(id, name, is_billable_default, is_active)')
  if (error) throw error
  return data
}, fresh)

const __ad4 = timer.load()
await Promise.all([__ad1, __ad2, __ad3, __ad4])
const { data: entries, refresh } = __ad1
const { data: projects } = __ad2
const { data: projectTasks } = __ad3

// The signed-in person's pace: this week and this month against their
// weekly target, and how much of it is billable.
const { profile } = useCurrentUser()
const { data: pace } = await useAsyncData('time-pace', async () => {
  const name = profile.value?.full_name
  if (!name) return null
  const today = todayString()
  const [week, month, target] = await Promise.all([
    supabase.rpc('report_rollup', { p_from: weekStart.value, p_to: weekEnd.value, p_person: name }).single(),
    supabase.rpc('report_rollup', { p_from: startOfMonth(today), p_to: endOfMonth(today), p_person: name }).single(),
    supabase.from('availability').select('hours_per_week').eq('user_id', user.value!.sub).is('effective_to', null).maybeSingle(),
  ])
  if (week.error) throw week.error
  if (month.error) throw month.error
  return { week: week.data, month: month.data, target: target.data?.hours_per_week ?? 30 }
}, { ...fresh, watch: [weekStart] })
const billableShare = (r: { hours: number, billable_hours: number }) => (Number(r.hours) > 0 ? Math.round(Number(r.billable_hours) / Number(r.hours) * 100) : 0)

type Row = NonNullable<typeof entries.value>[number]

const dayEntries = computed(() => (entries.value ?? []).filter(e => e.spent_on === selected.value))
const totals = computed(() => {
  const t: Record<string, number> = {}
  for (const e of entries.value ?? []) t[e.spent_on] = (t[e.spent_on] ?? 0) + liveHours(e)
  return t
})
// The running timer lives on a day other than the one shown.
const runningElsewhere = computed(() => running.value && running.value.spent_on !== selected.value ? running.value : null)

const creating = ref(false)
const editing = ref<Row | null>(null)

// /time?item=<task id> from a task page: open the new-entry form on it.
const { data: workItem } = await useAsyncData('time-work-item', async () => {
  const itemId = typeof route.query.item === 'string' ? route.query.item : null
  if (!itemId) return null
  const { data, error } = await supabase.from('work_items').select('id, title, project_id').eq('id', itemId).maybeSingle()
  if (error) throw error
  return data
}, { ...fresh, watch: [() => route.query.item] })
watch(workItem, (w) => { if (w) creating.value = true }, { immediate: true })
if (route.query.new) creating.value = true
const deleting = ref<Row | null>(null)
const busy = ref<string | null>(null) // entry id with an action in flight

// Keys: arrows move a day or a week, Enter opens a new entry, "." copies
// the most recent earlier day's entries onto this one.
async function copyPreviousDay() {
  const { data: last } = await supabase.from('time_entries').select('spent_on').eq('user_id', user.value!.sub).lt('spent_on', selected.value).order('spent_on', { ascending: false }).limit(1).maybeSingle()
  if (!last) { toast.add({ title: 'Nothing earlier to copy', color: 'neutral' }); return }
  const { data: src, error } = await supabase.from('time_entries').select('project_id, task_id, hours, notes, is_billable, work_item_id').eq('user_id', user.value!.sub).eq('spent_on', last.spent_on).not('ended_at', 'is', null).is('started_at', null)
  const rows = (src ?? []).length ? src! : (await supabase.from('time_entries').select('project_id, task_id, hours, notes, is_billable, work_item_id').eq('user_id', user.value!.sub).eq('spent_on', last.spent_on)).data ?? []
  if (error) { toast.add({ title: 'Could not copy', description: error.message, color: 'error' }); return }
  const { error: insErr } = await supabase.from('time_entries').insert(rows.map(r => ({ ...r, user_id: user.value!.sub, spent_on: selected.value })))
  if (insErr) { toast.add({ title: 'Could not copy', description: insErr.message, color: 'error' }); return }
  toast.add({ title: `Copied ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} from ${shortDate(last.spent_on)}`, color: 'success' })
  refresh()
}
useShortcuts('Time', {
  'arrowleft': { label: 'Previous day', handler: () => goTo(addDays(selected.value, -1)) },
  'arrowright': { label: 'Next day', handler: () => goTo(addDays(selected.value, 1)) },
  'arrowup': { label: 'Previous week', handler: () => goTo(addDays(selected.value, -7)) },
  'arrowdown': { label: 'Next week', handler: () => goTo(addDays(selected.value, 7)) },
  'enter': { label: 'New entry on this day', handler: () => { if (!creating.value && !editing.value) creating.value = true } },
  '.': { label: 'Copy the previous day\'s entries here', handler: copyPreviousDay },
})

function saved() {
  creating.value = false
  editing.value = null
  if (route.query.item) router.replace({ query: { ...route.query, item: undefined } })
  refresh()
}

async function act(id: string, fn: () => Promise<unknown>, failTitle: string) {
  busy.value = id
  try {
    await fn()
    await refresh()
  } catch (e) {
    toast.add({ title: failTitle, description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = null
  }
}

const startRow = (e: Row) => act(e.id, () => timer.resume(e.id), 'Could not start timer')
const stopRow = (e: Pick<Row, 'id'> & Parameters<typeof timer.stop>[0]) => act(e.id, () => timer.stop(e), 'Could not stop timer')

async function confirmDelete() {
  const e = deleting.value
  if (!e) return
  await act(e.id, async () => {
    const { error } = await supabase.from('time_entries').delete().eq('id', e.id)
    if (error) throw error
  }, 'Could not delete entry')
  deleting.value = null
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2">
      <h1 class="text-2xl font-semibold">Time</h1>
      <div class="ml-auto flex items-center gap-1">
        <UButton icon="i-lucide-chevron-left" variant="ghost" color="neutral" size="sm" aria-label="Previous week" @click="goTo(addDays(selected, -7))" />
        <UButton variant="ghost" color="neutral" size="sm" @click="goTo(todayString())">Today</UButton>
        <UButton icon="i-lucide-chevron-right" variant="ghost" color="neutral" size="sm" aria-label="Next week" @click="goTo(addDays(selected, 7))" />
      </div>
    </div>

    <div data-tour="week"><WeekStrip :days="days" :selected="selected" :totals="totals" @select="goTo" /></div>

    <p v-if="pace" data-tour="pace" class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      <span>This week <strong class="text-default tabular-nums">{{ formatHours(pace.week.hours) }}</strong> of {{ formatHours(pace.target) }}<template v-if="Number(pace.week.hours) > 0">, {{ billableShare(pace.week) }}% billable</template></span>
      <span>This month <strong class="text-default tabular-nums">{{ formatHours(pace.month.hours) }}</strong><template v-if="Number(pace.month.hours) > 0">, {{ billableShare(pace.month) }}% billable</template></span>
    </p>

    <div v-if="runningElsewhere" class="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
      <UIcon name="i-lucide-timer" class="text-primary" />
      <span>
        Timer running since {{ longDate(runningElsewhere.spent_on) }}:
        <strong class="tabular-nums">{{ formatHours(liveHours(runningElsewhere)) }}</strong>
      </span>
      <div class="ml-auto flex gap-2">
        <UButton size="xs" variant="ghost" color="neutral" @click="goTo(runningElsewhere.spent_on)">Go to day</UButton>
        <UButton size="xs" icon="i-lucide-square" :loading="busy === runningElsewhere.id" @click="stopRow(runningElsewhere)">Stop</UButton>
      </div>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex items-center gap-4">
          <h2 class="font-semibold">{{ longDate(selected) }}</h2>
          <span class="ml-auto tabular-nums text-muted">{{ formatHours(totals[selected] ?? 0) }}</span>
          <UButton icon="i-lucide-plus" size="sm" data-tour="new-entry" @click="creating = true;">New entry</UButton>
        </div>
      </template>

      <ul class="divide-y divide-default text-sm">
        <li
          v-for="e in dayEntries"
          :key="e.id"
          class="flex items-center gap-4 px-4 py-3"
          :class="isRunning(e) ? 'bg-primary/5' : ''"
        >
          <div class="min-w-0 flex-1">
            <div class="font-medium">{{ e.projects?.clients?.name }} / {{ e.projects?.name }}</div>
            <div class="truncate text-muted">
              {{ e.tasks?.name }}<span v-if="e.notes"> &middot; {{ e.notes }}</span>
            </div>
          </div>
          <UBadge v-if="!e.is_billable" color="neutral" variant="subtle" size="sm">Non-billable</UBadge>
          <UIcon v-if="e.is_locked" name="i-lucide-lock" class="text-muted" title="Locked by a billing batch" />
          <span class="w-16 text-right tabular-nums" :class="isRunning(e) ? 'font-semibold text-primary' : ''">
            {{ formatHours(liveHours(e)) }}
          </span>
          <div class="flex gap-1">
            <UButton
              v-if="isRunning(e)"
              icon="i-lucide-square" size="sm" aria-label="Stop timer"
              :loading="busy === e.id"
              @click="stopRow(e)"
            />
            <UButton
              v-else
              icon="i-lucide-play" variant="ghost" color="neutral" size="sm" aria-label="Start timer" data-tour="timer"
              :disabled="e.is_locked || (!!busy && busy !== e.id)" :loading="busy === e.id"
              @click="startRow(e)"
            />
            <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" aria-label="Edit" :disabled="e.is_locked" @click="editing = e;" />
            <UButton icon="i-lucide-trash-2" variant="ghost" color="neutral" size="sm" aria-label="Delete" :disabled="e.is_locked || isRunning(e)" @click="deleting = e;" />
          </div>
        </li>
        <li v-if="dayEntries.length === 0" class="px-4 py-8 text-center text-muted">
          No time logged. Add an entry or start a timer.
        </li>
      </ul>
    </UCard>

    <UModal v-model:open="creating" :title="`New entry for ${longDate(selected)}`">
      <template #body>
        <TimeEntryForm :date="selected" :projects="projects ?? []" :project-tasks="projectTasks ?? []" :work-item="workItem ?? undefined" @saved="saved" @cancel="creating = false" />
      </template>
    </UModal>

    <UModal :open="!!editing" title="Edit entry" @update:open="(v) => { if (!v) editing = null }">
      <template #body>
        <TimeEntryForm v-if="editing" :entry="editing" :date="editing.spent_on" :projects="projects ?? []" :project-tasks="projectTasks ?? []" @saved="saved" @cancel="editing = null" />
      </template>
    </UModal>

    <UModal :open="!!deleting" title="Delete entry?" @update:open="(v) => { if (!v) deleting = null }">
      <template #body>
        <p v-if="deleting" class="text-sm">
          This removes {{ formatHours(deleting.hours) }} on {{ deleting.projects?.name }} ({{ deleting.tasks?.name }}). It cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deleting = null;">Cancel</UButton>
          <UButton color="error" :loading="!!deleting && busy === deleting.id" @click="confirmDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
