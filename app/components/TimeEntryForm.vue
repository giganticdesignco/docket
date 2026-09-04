<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Tables } from '~~/shared/types/database'

type Entry = Omit<Tables<'time_entries'>, 'rate_snapshot' | 'cost_snapshot'>
type ProjectOption = Pick<Tables<'projects'>, 'id' | 'name' | 'billing_method'> & { clients: { name: string } | null }
type ProjectTaskOption = Pick<Tables<'project_tasks'>, 'project_id' | 'task_id'> & {
  tasks: Pick<Tables<'tasks'>, 'id' | 'name' | 'is_billable_default' | 'is_active'> | null
}

// Create or edit one of the signed-in user's time entries for a given day.
// A new entry can also be saved with its timer already running.
const props = defineProps<{
  entry?: Entry & { tasks?: { name: string } | null }
  date: string
  projects: ProjectOption[]
  projectTasks: ProjectTaskOption[]
  // Logging time against a task: prefills the project and notes and links
  // the entry to it.
  workItem?: { id: string, title: string, project_id: string }
}>()
const emit = defineEmits<{ saved: [entry: Entry]; cancel: [] }>()

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const timer = useTimer()
const toast = useToast()

const running = computed(() => !!props.entry && timer.isRunning(props.entry))

const state = reactive({
  project_id: (props.entry?.project_id ?? props.workItem?.project_id) as string | undefined,
  task_id: props.entry?.task_id as string | undefined,
  notes: props.entry?.notes ?? props.workItem?.title ?? '',
  hours: props.entry ? formatHours(props.entry.hours) : '',
  is_billable: props.entry?.is_billable ?? true,
})
const mode = ref<'save' | 'start'>('save')
const saving = ref<'save' | 'start' | null>(null)

const projectOptions = computed(() => props.projects.map(p => ({
  label: p.clients ? `${p.clients.name} / ${p.name}` : p.name,
  value: p.id,
})))

const taskOptions = computed(() => {
  const opts = props.projectTasks
    .filter(pt => pt.project_id === state.project_id && pt.tasks?.is_active)
    .map(pt => ({ label: pt.tasks!.name, value: pt.task_id }))
    .sort((a, b) => a.label.localeCompare(b.label))
  // Keep an existing entry's task selectable even if it was since unassigned.
  const e = props.entry
  if (e && e.project_id === state.project_id && !opts.some(o => o.value === e.task_id)) {
    opts.unshift({ label: e.tasks?.name ?? 'Current task', value: e.task_id })
  }
  return opts
})

const selectedProject = computed(() => props.projects.find(p => p.id === state.project_id))

watch(() => state.project_id, () => {
  if (!taskOptions.value.some(o => o.value === state.task_id)) state.task_id = undefined
})

// New entries default billable from the task, unless the project is
// non-billable. Edits keep whatever was saved.
watch(() => state.task_id, (taskId) => {
  if (props.entry || !taskId) return
  const task = props.projectTasks.find(pt => pt.project_id === state.project_id && pt.task_id === taskId)?.tasks
  state.is_billable = selectedProject.value?.billing_method !== 'non_billable' && (task?.is_billable_default ?? true)
})

function validate(s: typeof state) {
  const errors = []
  if (!s.project_id) errors.push({ name: 'project_id', message: 'Pick a project' })
  if (!s.task_id) errors.push({ name: 'task_id', message: 'Pick a task' })
  if (s.hours.trim() && parseHours(s.hours) == null) errors.push({ name: 'hours', message: 'Use h:mm or decimal hours' })
  return errors
}

async function onSubmit(_e: FormSubmitEvent<typeof state>) {
  saving.value = mode.value
  const values = {
    user_id: user.value!.sub,
    project_id: state.project_id!,
    task_id: state.task_id!,
    spent_on: props.entry?.spent_on ?? props.date,
    notes: state.notes.trim() || null,
    is_billable: state.is_billable,
    work_item_id: props.workItem?.id ?? props.entry?.work_item_id ?? null,
    // A running entry's hours are owned by the timer; leave them alone.
    ...(running.value ? {} : { hours: parseHours(state.hours) ?? 0 }),
  }
  try {
    let saved: Entry
    if (mode.value === 'start') {
      saved = await timer.startNew(values)
    } else {
      const query = props.entry
        ? supabase.from('time_entries').update(values).eq('id', props.entry.id)
        : supabase.from('time_entries').insert(values)
      const { data, error } = await query.select(TIME_ENTRY_COLS).single()
      if (error) throw error
      saved = data
    }
    emit('saved', saved)
  } catch (e) {
    toast.add({ title: 'Could not save entry', description: (e as Error).message, color: 'error' })
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
    <UFormField label="Project" name="project_id" required>
      <USelectMenu v-model="state.project_id" :items="projectOptions" value-key="value" class="w-full" placeholder="Pick a project" />
    </UFormField>
    <UFormField label="Task" name="task_id" required>
      <USelectMenu
        v-model="state.task_id"
        :items="taskOptions"
        value-key="value"
        class="w-full"
        :disabled="!state.project_id"
        :placeholder="state.project_id ? 'Pick a task' : 'Pick a project first'"
      />
      <p v-if="state.project_id && taskOptions.length === 0" class="mt-1 text-xs text-muted">
        No tasks are assigned to this project yet. Ask an admin to add some in the project settings.
      </p>
    </UFormField>
    <UFormField label="Notes" name="notes">
      <UTextarea v-model="state.notes" :rows="3" class="w-full" />
    </UFormField>
    <div class="flex items-end gap-6">
      <UFormField label="Hours" name="hours" :hint="running ? 'Timer running' : 'h:mm or decimal'" class="w-44">
        <UInput v-model="state.hours" placeholder="0:00" class="w-full" :disabled="running" />
      </UFormField>
      <UFormField name="is_billable" class="pb-2">
        <USwitch v-model="state.is_billable" label="Billable" />
      </UFormField>
    </div>
    <div class="flex justify-end gap-2">
      <UButton variant="ghost" color="neutral" @click="emit('cancel')">Cancel</UButton>
      <UButton v-if="!entry" type="submit" variant="outline" icon="i-lucide-play" :loading="saving === 'start'" :disabled="!!saving" @click="mode = 'start';">
        Start timer
      </UButton>
      <UButton type="submit" :loading="saving === 'save'" :disabled="!!saving" @click="mode = 'save';">
        {{ entry ? 'Save' : 'Save entry' }}
      </UButton>
    </div>
  </UForm>
</template>
