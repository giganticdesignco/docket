<script setup lang="ts">
// Which tasks are available on this project, with optional rate overrides.
// Rate resolution is project_task -> project -> user default (resolve_rate()).
definePageMeta({ middleware: 'admin' })

const route = useRoute()
const id = route.params.id as string
const supabase = useSupabaseClient()
const toast = useToast()

const { data: project } = await useAsyncData(`project-${id}`, async () => {
  const { data, error } = await supabase.from('projects').select('*, clients(id, name)').eq('id', id).single()
  if (error) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  return data
})

const { data: tasks } = await useAsyncData('tasks-active', async () => {
  const { data, error } = await supabase.from('tasks').select('*').eq('is_active', true).order('name')
  if (error) throw error
  return data
})

const { data: assigned, refresh } = await useAsyncData(`project-${id}-tasks`, async () => {
  const { data, error } = await supabase.from('project_tasks').select('*').eq('project_id', id)
  if (error) throw error
  return data
})

useHead({ title: () => `${project.value?.name ?? 'Project'} settings` })

// Local editable copy: task_id -> { on, rate }
const rows = ref<Record<string, { on: boolean, rate: string }>>({})
watchEffect(() => {
  const map: typeof rows.value = {}
  for (const t of tasks.value ?? []) {
    const a = assigned.value?.find(x => x.task_id === t.id)
    map[t.id] = { on: !!a, rate: a?.hourly_rate == null ? '' : String(a.hourly_rate) }
  }
  rows.value = map
})

const saving = ref(false)

async function save() {
  saving.value = true
  const wanted = Object.entries(rows.value).filter(([, r]) => r.on)
  const upserts = wanted.map(([task_id, r]) => ({
    project_id: id,
    task_id,
    hourly_rate: r.rate.trim() === '' ? null : Number(r.rate),
  }))
  const removeIds = (assigned.value ?? [])
    .map(a => a.task_id)
    .filter(tid => !rows.value[tid]?.on)

  const { error: upErr } = upserts.length
    ? await supabase.from('project_tasks').upsert(upserts)
    : { error: null }
  const { error: delErr } = removeIds.length
    ? await supabase.from('project_tasks').delete().eq('project_id', id).in('task_id', removeIds)
    : { error: null }

  saving.value = false
  const error = upErr ?? delErr
  if (error) {
    toast.add({ title: 'Could not save tasks', description: error.message, color: 'error' })
    return
  }
  toast.add({ title: 'Tasks saved', color: 'success' })
  refresh()
}

const fallbackRate = computed(() => project.value?.hourly_rate)
</script>

<template>
  <div v-if="project" class="space-y-6">
    <div class="flex items-center gap-3">
      <UButton :to="`/projects/${id}`" icon="i-lucide-arrow-left" variant="ghost" color="neutral" size="sm" />
      <div>
        <h1 class="text-2xl font-semibold">{{ project.name }} settings</h1>
        <p class="text-sm text-muted">{{ project.clients?.name }}</p>
      </div>
    </div>

    <UCard>
      <template #header>
        <h2 class="font-semibold">Tasks on this project</h2>
        <p class="text-sm text-muted">
          Leave the rate blank to use the project rate
          <span v-if="fallbackRate != null">(${{ fallbackRate }})</span>
          <span v-else>(not set, so each person's default rate applies)</span>.
        </p>
      </template>

      <div class="divide-y divide-default">
        <div v-for="t in tasks" :key="t.id" class="flex items-center gap-4 py-2">
          <USwitch v-model="rows[t.id]!.on" :label="t.name" class="flex-1" />
          <UInput
            v-model="rows[t.id]!.rate"
            :disabled="!rows[t.id]!.on"
            type="number" step="0.01" min="0"
            placeholder="Project rate"
            class="w-40"
            icon="i-lucide-dollar-sign"
          />
        </div>
        <p v-if="!tasks?.length" class="py-6 text-center text-sm text-muted">
          No active tasks. <NuxtLink to="/admin/tasks" class="underline">Create some first.</NuxtLink>
        </p>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton :loading="saving" @click="save">Save tasks</UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>
