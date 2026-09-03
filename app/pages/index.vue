<script setup lang="ts">
// Home: my day at a glance. The timer and this week's pace, what I am
// on and when it is due, the projects I am working in, and today's or
// this week's agenda. The full timesheet stays at /time.
useHead({ title: 'Home' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { profile } = useCurrentUser()
const timer = useTimer()
const ws = await useWorkStatuses()
const toast = useToast()

const today = todayString()
const week = weekDays(today)
const view = await useViewState('home', { agendaRange: 'day' as 'day' | 'week' })
const agendaRange = persisted(view, 'agendaRange')

// This week and today against the weekly target, as on Time.
const __ad1 = useAsyncData('home-pace', async () => {
  const name = profile.value?.full_name
  if (!name || !user.value) return null
  const [wk, day, target] = await Promise.all([
    supabase.rpc('report_rollup', { p_from: week[0]!, p_to: week[6]!, p_person: name }).single(),
    supabase.rpc('report_rollup', { p_from: today, p_to: today, p_person: name }).single(),
    supabase.from('availability').select('hours_per_week').eq('user_id', user.value.sub).is('effective_to', null).maybeSingle(),
  ])
  return { week: Number(wk.data?.hours ?? 0), today: Number(day.data?.hours ?? 0), target: target.data?.hours_per_week ?? 30 }
}, { ...fresh, server: false })

// What I am on, not done, soonest first.
const __ad2 = useAsyncData('home-tasks', async () => {
  if (!user.value) return []
  const { data, error } = await supabase
    .from('work_items')
    .select('id, title, status, priority, due_on, estimate_hours, project_id, projects(id, name, clients(name)), work_item_assignees!inner(user_id)')
    .eq('work_item_assignees.user_id', user.value.sub)
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(200)
  if (error) throw error
  return data.filter(w => !ws.isDone(w.status) && !ws.isPaused(w.status))
}, { ...fresh, server: false })

// Projects I have a task on or logged time in during the last 30 days.
const __ad3 = useAsyncData('home-recent-project-ids', async () => {
  if (!user.value) return []
  const { data } = await supabase.from('time_entries').select('project_id').eq('user_id', user.value.sub).gte('spent_on', addDays(today, -30))
  return [...new Set((data ?? []).map(e => e.project_id))]
}, { ...fresh, server: false })
// This morning's brief, written by the cron before the day starts.
const __ad4 = useAsyncData('home-brief', async () => {
  if (!user.value) return null
  const { data } = await supabase.from('morning_briefs').select('day, text, created_at').eq('user_id', user.value.sub).order('day', { ascending: false }).limit(1).maybeSingle()
  return data
}, { ...fresh, server: false })
// For the Start timer drawer: the same lists the timesheet's form uses.
const __ad5 = useAsyncData('projects-for-time', async () => {
  const { data, error } = await supabase.from('projects').select('id, name, billing_method, clients(name)').eq('is_active', true).order('name')
  if (error) throw error
  return data
}, { ...fresh, server: false })
const __ad6 = useAsyncData('project-tasks-for-time', async () => {
  const { data, error } = await supabase.from('project_tasks').select('project_id, task_id, tasks(id, name, is_billable_default, is_active)')
  if (error) throw error
  return data
}, { ...fresh, server: false })
await Promise.all([__ad1, __ad2, __ad3, __ad4, __ad5, __ad6, timer.load()])
const { data: brief } = __ad4
const { data: formProjects } = __ad5
const { data: formProjectTasks } = __ad6
// Click the Timer card to start one from here.
const startingTimer = ref(false)
async function timerSaved() {
  startingTimer.value = false
  await Promise.all([timer.load(), refreshPace()])
}
const { data: pace, refresh: refreshPace } = __ad1
const { data: tasks } = __ad2
const { data: recentIds } = __ad3

const { data: projects } = await useAsyncData('home-projects', async () => {
  const ids = [...new Set([...(tasks.value ?? []).map(t => t.project_id), ...(recentIds.value ?? [])])]
  if (!ids.length) return []
  const { data, error } = await supabase.from('projects').select('id, name, is_active, clients(name)').in('id', ids).eq('is_active', true).order('name')
  if (error) throw error
  return data.sort((a, b) => (a.clients?.name ?? '').localeCompare(b.clients?.name ?? '') || a.name.localeCompare(b.name))
}, { ...fresh, server: false })

const overdue = computed(() => (tasks.value ?? []).filter(t => t.due_on && t.due_on < today))
const thisWeek = computed(() => (tasks.value ?? []).filter(t => t.due_on && t.due_on >= today && t.due_on <= week[6]!))
const later = computed(() => (tasks.value ?? []).filter(t => !t.due_on || t.due_on > week[6]!))
const buckets = computed(() => [
  { key: 'overdue', label: 'Overdue', items: overdue.value },
  { key: 'week', label: 'This week', items: thisWeek.value },
  { key: 'later', label: 'Later or no date', items: later.value },
].filter(b => b.items.length))
const SHOW = 8
const shown = computed(() => {
  let left = SHOW
  return buckets.value.map(b => { const items = b.items.slice(0, Math.max(left, 0)); left -= items.length; return { ...b, items, more: b.items.length - items.length } }).filter(b => b.items.length)
})
const openCount = computed(() => tasks.value?.length ?? 0)
const taskCountByProject = (id: string) => (tasks.value ?? []).filter(t => t.project_id === id).length

const busy = ref(false)
async function stopTimer() {
  busy.value = true
  try { await timer.stop(); toast.add({ title: 'Timer stopped', color: 'success', duration: 2000 }) } catch (e) { toast.add({ title: 'Could not stop the timer', description: (e as Error).message, color: 'error' }) } finally { busy.value = false }
}
const firstName = computed(() => (profile.value?.full_name ?? '').split(' ')[0] ?? '')
const hour = new Date().getHours()
const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
const dotClass = (color?: string) => ({ primary: 'bg-primary', info: 'bg-info', success: 'bg-success', warning: 'bg-warning', error: 'bg-error' }[color ?? ''] ?? 'bg-accented')
const runningTask = computed(() => tasks.value?.find(t => t.id === timer.running.value?.work_item_id))
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end gap-4">
      <div>
        <h1 class="text-2xl font-semibold">{{ greeting }}, {{ firstName }}</h1>
        <p class="text-sm text-muted">{{ longDate(today) }}</p>
      </div>
      <div class="ml-auto flex gap-2">
        <UButton to="/time" variant="outline" color="neutral" icon="i-lucide-clock">Timesheet</UButton>
        <UButton to="/tasks" variant="outline" color="neutral" icon="i-lucide-list-todo">Tasks</UButton>
      </div>
    </div>

    <!-- Brief on the left, two columns wide; timer, today, and week stacked beside it. Without a brief the three sit in a row. -->
    <div class="grid gap-4 sm:grid-cols-3">
      <UCard v-if="brief" class="sm:col-span-2 sm:row-span-3" :ui="{ body: 'p-4 sm:p-5 h-full' }">
        <div class="flex items-baseline gap-3">
          <h2 class="font-semibold">Morning brief</h2>
          <span class="text-xs text-muted">{{ brief.day === today ? 'Today' : longDate(brief.day) }}</span>
          <NuxtLink to="/account" class="ml-auto text-xs text-muted hover:underline" title="Have this emailed to you each weekday morning">{{ profile?.brief_email ? 'Emailed to you each morning' : 'Get it by email' }}</NuxtLink>
        </div>
        <p class="mt-2 whitespace-pre-line text-sm leading-relaxed">{{ brief.text }}</p>
      </UCard>
      <UCard :ui="{ body: 'p-3 sm:p-4' }" :class="timer.running.value ? '' : 'cursor-pointer transition-colors hover:bg-elevated/40'" role="button" tabindex="0" :title="timer.running.value ? '' : 'Start a timer'" @click="!timer.running.value && (startingTimer = true)" @keydown.enter="!timer.running.value && (startingTimer = true)">
        <div class="text-xs text-muted">Timer</div>
        <template v-if="timer.running.value">
          <div class="flex items-center gap-2">
            <span class="text-2xl font-semibold tabular-nums text-primary">{{ formatHours(timer.liveHours(timer.running.value)) }}</span>
            <UButton size="xs" icon="i-lucide-square" :loading="busy" class="ml-auto" @click="stopTimer">Stop</UButton>
          </div>
          <div class="truncate text-xs text-muted">
            <NuxtLink v-if="runningTask" :to="`/tasks/${runningTask.id}`" class="hover:underline">{{ runningTask.title }}</NuxtLink>
            <span v-else>{{ timer.running.value.notes || 'Running' }}</span>
          </div>
        </template>
        <template v-else>
          <div class="text-2xl font-semibold text-muted">Off</div>
          <div class="text-xs text-muted">Click to start one.</div>
        </template>
      </UCard>
      <UCard :ui="{ body: 'p-3 sm:p-4' }">
        <div class="text-xs text-muted">Today</div>
        <div class="text-2xl font-semibold tabular-nums">{{ formatHours(pace?.today ?? 0) }}</div>
        <NuxtLink to="/time" class="text-xs text-muted hover:underline">Logged so far</NuxtLink>
      </UCard>
      <UCard :ui="{ body: 'p-3 sm:p-4' }">
        <div class="text-xs text-muted">This week</div>
        <div class="text-2xl font-semibold tabular-nums">{{ formatHours(pace?.week ?? 0) }} <span class="text-base font-normal text-muted">of {{ formatHours(pace?.target ?? 30) }}</span></div>
        <UProgress :model-value="Math.min((pace?.week ?? 0) / Math.max(pace?.target ?? 30, 1) * 100, 100)" size="xs" class="mt-2" />
      </UCard>
    </div>

    <div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div class="space-y-6">
        <!-- My tasks -->
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <div class="flex items-center gap-3">
              <h2 class="font-semibold">My tasks <span class="text-sm font-normal text-muted">{{ openCount }} open</span></h2>
              <NuxtLink to="/tasks" class="ml-auto text-xs text-muted hover:underline">All tasks</NuxtLink>
            </div>
          </template>
          <div v-if="shown.length" class="divide-y divide-default text-sm">
            <div v-for="b in shown" :key="b.key">
              <div class="bg-elevated/40 px-4 py-1 text-[10px] font-semibold uppercase tracking-wider" :class="b.key === 'overdue' ? 'text-error' : 'text-dimmed'">{{ b.label }} <span class="font-normal">{{ b.items.length + b.more }}</span></div>
              <ul class="divide-y divide-default">
                <li v-for="t in b.items" :key="t.id" class="flex items-center gap-3 px-4 py-2">
                  <span class="size-2.5 shrink-0 rounded-full" :class="dotClass(ws.color(t.status))" :title="ws.label(t.status)" />
                  <div class="min-w-0 flex-1">
                    <NuxtLink :to="`/tasks/${t.id}`" class="font-medium hover:underline">{{ t.title }}</NuxtLink>
                    <div class="truncate text-xs text-muted">{{ t.projects?.clients?.name }} / {{ t.projects?.name }}</div>
                  </div>
                  <span v-if="t.estimate_hours" class="text-xs tabular-nums text-muted">{{ formatHours(t.estimate_hours) }}</span>
                  <span class="w-16 text-right text-xs tabular-nums" :class="t.due_on && t.due_on < today ? 'text-error' : 'text-muted'">{{ t.due_on ? shortDate(t.due_on) : '' }}</span>
                </li>
              </ul>
              <NuxtLink v-if="b.more" to="/tasks" class="block px-4 py-1.5 text-xs text-muted hover:underline">{{ b.more }} more</NuxtLink>
            </div>
          </div>
          <p v-else class="px-4 py-6 text-center text-sm text-muted">Nothing assigned to you. Enjoy it, or pick something up on <NuxtLink to="/planner" class="underline">Planner</NuxtLink>.</p>
        </UCard>

        <!-- My projects -->
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <div class="flex items-center gap-3">
              <h2 class="font-semibold">My projects</h2>
              <span class="text-xs text-muted">Where you have a task, or logged time in the last 30 days</span>
              <NuxtLink to="/projects" class="ml-auto text-xs text-muted hover:underline">All projects</NuxtLink>
            </div>
          </template>
          <ul v-if="projects?.length" class="divide-y divide-default text-sm">
            <li v-for="p in projects" :key="p.id" class="flex items-center gap-3 px-4 py-2">
              <div class="min-w-0 flex-1">
                <NuxtLink :to="`/projects/${p.id}`" class="font-medium hover:underline">{{ p.name }}</NuxtLink>
                <div class="text-xs text-muted">{{ p.clients?.name }}</div>
              </div>
              <span v-if="taskCountByProject(p.id)" class="text-xs tabular-nums text-muted">{{ taskCountByProject(p.id) }} {{ taskCountByProject(p.id) === 1 ? 'task' : 'tasks' }}</span>
            </li>
          </ul>
          <p v-else class="px-4 py-6 text-center text-sm text-muted">No projects yet. Log time or take a task and they show up here.</p>
        </UCard>
      </div>

      <HomeAgenda :range="agendaRange" @update:range="agendaRange = $event" />
    </div>

    <AppDrawer v-model:open="startingTimer" title="Start a timer">
      <template #body>
        <TimeEntryForm :date="today" :projects="formProjects ?? []" :project-tasks="formProjectTasks ?? []" @saved="timerSaved" @cancel="startingTimer = false" />
      </template>
    </AppDrawer>
  </div>
</template>
