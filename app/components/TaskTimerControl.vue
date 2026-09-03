<script setup lang="ts">
// Start or stop the clock on a task without leaving the page. One
// active task type on the project starts at once; more than one asks
// which first. Starting stops whatever else was running (useTimer).
type TaskType = { task_id: string, tasks: { id: string, name: string, is_active: boolean } | null }
const props = withDefaults(defineProps<{
  workItem: { id: string, title: string, project_id: string }
  projectTasks: TaskType[]
  compact?: boolean
}>(), { compact: false })
const emit = defineEmits<{ changed: [] }>()

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const timer = useTimer()
const toast = useToast()

const mine = computed(() => timer.running.value?.work_item_id === props.workItem.id ? timer.running.value : null)
const options = computed(() => props.projectTasks.filter(pt => pt.tasks?.is_active).map(pt => ({ label: pt.tasks!.name, value: pt.task_id })).sort((a, b) => a.label.localeCompare(b.label)))
const busy = ref(false)
// More than one task type: the Start button opens a menu of them.
const menu = computed(() => [options.value.map(o => ({ label: o.label, onSelect: () => { start(o.value) } }))])

async function start(taskId: string) {
  busy.value = true
  try {
    await timer.startNew({ user_id: user.value!.sub, project_id: props.workItem.project_id, task_id: taskId, work_item_id: props.workItem.id, spent_on: todayString(), notes: props.workItem.title, hours: 0 })
    emit('changed')
  } catch (e) {
    toast.add({ title: 'Could not start the timer', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = false
  }
}
function onStart() {
  if (options.value.length === 1) start(options.value[0]!.value)
  else if (!options.value.length) toast.add({ title: 'No task types on this project', description: 'Ask an admin to add some in the project settings.', color: 'warning' })
}
async function onStop() {
  busy.value = true
  try {
    await timer.stop(mine.value)
    emit('changed')
  } catch (e) {
    toast.add({ title: 'Could not stop the timer', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <template v-if="mine">
      <span class="tabular-nums text-primary" :class="compact ? 'text-xs' : 'text-sm font-medium'">{{ formatHours(timer.liveHours(mine)) }}</span>
      <UButton icon="i-lucide-square" :size="compact ? 'xs' : 'sm'" :variant="compact ? 'ghost' : 'solid'" :color="compact ? 'primary' : 'primary'" :loading="busy" :aria-label="`Stop timer on ${workItem.title}`" title="Stop timer" @click="onStop">{{ compact ? '' : 'Stop' }}</UButton>
    </template>
    <UDropdownMenu v-else-if="options.length > 1" :items="menu" :content="{ align: 'end' }">
      <UButton icon="i-lucide-play" :size="compact ? 'xs' : 'sm'" :variant="compact ? 'ghost' : 'outline'" color="neutral" :loading="busy" :aria-label="`Start timer on ${workItem.title}`" title="Start timer: pick the task type">{{ compact ? '' : 'Start timer' }}</UButton>
    </UDropdownMenu>
    <UButton v-else icon="i-lucide-play" :size="compact ? 'xs' : 'sm'" :variant="compact ? 'ghost' : 'outline'" color="neutral" :loading="busy" :aria-label="`Start timer on ${workItem.title}`" title="Start timer" @click="onStart">{{ compact ? '' : 'Start timer' }}</UButton>
  </span>
</template>
