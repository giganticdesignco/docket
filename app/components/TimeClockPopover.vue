<script setup lang="ts">
// The clock in the rail: a link to Time, and on hover a popover with
// the running timer (and a Stop) plus the person's open assigned tasks
// with logged against estimate. Read-only otherwise; starting a timer
// happens on the task.
const props = defineProps<{ active: boolean }>()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const timer = useTimer()
const ws = await useWorkStatuses()
const open = ref(false)
const toast = useToast()

// Loaded when the popover opens, not on every page load.
const { data: tasks, refresh } = await useAsyncData('clock-my-tasks', async () => {
  if (!user.value) return []
  const { data, error } = await supabase
    .from('work_items')
    .select('id, title, status, due_on, estimate_hours, assignee_id, projects(name, clients(name)), work_item_assignees!inner(user_id)')
    .eq('work_item_assignees.user_id', user.value.sub)
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(60)
  if (error) throw error
  // Up now: what you are up on, then what has nobody up (starting a timer
  // on one of those claims it). Tasks someone else is up on are left out.
  const open = (data ?? []).filter(w => !ws.isDone(w.status) && !ws.isPaused(w.status) && (!w.assignee_id || w.assignee_id === user.value?.sub)).slice(0, 25)
  if (!open.length) return []
  const { data: hours } = await supabase.from('time_entries').select('work_item_id, hours').in('work_item_id', open.map(w => w.id))
  const logged = new Map<string, number>()
  for (const e of hours ?? []) if (e.work_item_id) logged.set(e.work_item_id, (logged.get(e.work_item_id) ?? 0) + e.hours)
  return open.map(w => ({ ...w, logged: logged.get(w.id) ?? 0 }))
}, { ...fresh, server: false, immediate: false })

// The rail is always mounted, so this is where the running timer is
// loaded for the whole app. The list is fetched again on each open.
onMounted(() => { timer.load().catch(() => {}) })
watch(open, (v) => { if (v) refresh() })
const busy = ref(false)
async function stopRunning() {
  busy.value = true
  try { await timer.stop(); refresh() } catch (e) { toast.add({ title: 'Could not stop the timer', description: (e as Error).message, color: 'error' }) } finally { busy.value = false }
}
const runningTask = computed(() => tasks.value?.find(t => t.id === timer.running.value?.work_item_id))
const mine = computed(() => (tasks.value ?? []).filter(t => t.assignee_id === user.value?.sub))
const unowned = computed(() => (tasks.value ?? []).filter(t => !t.assignee_id))
const today = todayString()
</script>

<template>
  <UPopover v-model:open="open" mode="hover" :content="{ side: 'right', align: 'start', sideOffset: 8 }" :open-delay="250" :close-delay="150">
    <NuxtLink
      to="/time" title="Time"
      class="mx-2 flex h-9 items-center gap-3 rounded-md px-2 text-sm transition-colors"
      :class="props.active ? 'bg-elevated text-highlighted' : 'text-muted hover:bg-elevated hover:text-highlighted'"
    >
      <span class="relative shrink-0">
        <UIcon name="i-lucide-clock" class="size-5" />
        <span v-if="timer.running.value" class="absolute -right-1 -top-1 size-2 rounded-full bg-primary" aria-label="Timer running" />
      </span>
      <span class="hidden truncate group-hover:inline">Time</span>
      <span v-if="timer.running.value" class="ml-auto hidden text-xs tabular-nums text-primary group-hover:inline">{{ formatHours(timer.liveHours(timer.running.value)) }}</span>
    </NuxtLink>
    <template #content>
      <div class="w-80">
        <div class="flex items-center gap-2 border-b border-default px-3 py-2 text-sm">
          <template v-if="timer.running.value">
            <UIcon name="i-lucide-timer" class="size-4 text-primary" />
            <span class="min-w-0 flex-1 truncate"><strong class="tabular-nums">{{ formatHours(timer.liveHours(timer.running.value)) }}</strong> on {{ runningTask?.title ?? timer.running.value.notes ?? 'an entry' }}</span>
            <UButton size="xs" icon="i-lucide-square" :loading="busy" @click="stopRunning">Stop</UButton>
          </template>
          <template v-else>
            <span class="font-semibold">Your tasks</span>
            <span class="ml-auto text-xs text-muted">No timer running</span>
          </template>
        </div>
        <ul v-if="tasks?.length" class="max-h-96 divide-y divide-default overflow-y-auto">
          <li v-for="t in mine" :key="t.id">
            <NuxtLink :to="`/tasks/${t.id}`" class="flex items-start gap-3 px-3 py-2 text-sm hover:bg-elevated" @click="open = false">
              <span class="min-w-0 flex-1">
                <span class="block truncate" :class="t.id === timer.running.value?.work_item_id ? 'font-medium text-primary' : ''">{{ t.title }}</span>
                <span class="block truncate text-xs text-muted">{{ t.projects?.clients?.name }} / {{ t.projects?.name }}</span>
              </span>
              <span class="shrink-0 text-right text-xs tabular-nums">
                <span class="block" :class="t.estimate_hours && t.logged > t.estimate_hours ? 'text-error' : 'text-muted'">{{ formatHours(t.logged) }}<template v-if="t.estimate_hours"> of {{ formatHours(t.estimate_hours) }}</template></span>
                <span v-if="t.due_on" class="block" :class="t.due_on < today ? 'text-error' : 'text-dimmed'">{{ shortDate(t.due_on) }}</span>
              </span>
            </NuxtLink>
          </li>
          <li v-if="unowned.length" class="bg-elevated/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-warning">Nobody up <span class="font-normal">{{ unowned.length }}</span></li>
          <li v-for="t in unowned" :key="t.id">
            <NuxtLink :to="`/tasks/${t.id}`" class="flex items-start gap-3 px-3 py-2 text-sm opacity-70 hover:bg-elevated hover:opacity-100" @click="open = false">
              <span class="min-w-0 flex-1">
                <span class="block truncate">{{ t.title }}</span>
                <span class="block truncate text-xs text-muted">{{ t.projects?.clients?.name }} / {{ t.projects?.name }}</span>
              </span>
              <span class="shrink-0 text-right text-xs tabular-nums">
                <span class="block" :class="t.estimate_hours && t.logged > t.estimate_hours ? 'text-error' : 'text-muted'">{{ formatHours(t.logged) }}<template v-if="t.estimate_hours"> of {{ formatHours(t.estimate_hours) }}</template></span>
                <span v-if="t.due_on" class="block" :class="t.due_on < today ? 'text-error' : 'text-dimmed'">{{ shortDate(t.due_on) }}</span>
              </span>
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="px-3 py-6 text-center text-sm text-muted">Nothing is on you right now.</p>
        <div class="border-t border-default px-3 py-2 text-xs">
          <NuxtLink to="/time" class="text-muted hover:underline" @click="open = false">Open Time</NuxtLink>
        </div>
      </div>
    </template>
  </UPopover>
</template>
