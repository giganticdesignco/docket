<script setup lang="ts">
// One-time import of ClickUp's open tasks into Docket tasks, for the
// cutover. Re-runnable: tasks are keyed on their ClickUp id.
definePageMeta({ middleware: 'admin' })
useHead({ title: 'ClickUp import' })

const supabase = useSupabaseClient()
const toast = useToast()

const { data: imported, refresh } = await useAsyncData('clickup-imported-count', async () => {
  const { count, error } = await supabase.from('work_items').select('id', { count: 'exact', head: true }).not('clickup_id', 'is', null)
  if (error) throw error
  return count ?? 0
}, fresh)

type Result = {
  dryRun: boolean, fetched: number, created: number, updated: number, assignments: number, droppedAssignees: number,
  skippedNoClient: number, inCatchAll: number, createdProjects: number, unmatchedLists: string[],
}
const dryRun = ref(true)
const running = ref(false)
const result = ref<Result | null>(null)
const error = ref<string | null>(null)

async function run() {
  running.value = true
  error.value = null
  try {
    result.value = await $fetch<Result>('/api/clickup/import', { method: 'POST', body: { dryRun: dryRun.value } })
    toast.add({ title: dryRun.value ? 'Dry run finished' : 'Import finished', color: 'success' })
    await refresh()
  } catch (e) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    error.value = err.data?.statusMessage ?? err.message ?? 'Unknown error'
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">ClickUp import</h1>
      <p class="text-sm text-muted">Copies every open ClickUp task into Docket tasks once, for the cutover. Running it again updates the same tasks.</p>
    </div>

    <UCard>
      <div class="space-y-4">
        <p class="text-sm"><strong class="tabular-nums">{{ imported }}</strong> tasks in Docket came from ClickUp.</p>
        <div class="flex items-center gap-4">
          <USwitch v-model="dryRun" label="Dry run" size="sm" :disabled="running" />
          <UButton icon="i-lucide-download" :loading="running" @click="run">{{ dryRun ? 'Preview import' : 'Import open tasks' }}</UButton>
        </div>
        <p class="text-xs text-muted">
          Lists match clients by name; a task matches the client's project whose name appears in the task name, otherwise it goes into a "General" project made for that client. Assignees match people by email; client guests are dropped. Statuses map to Docket's. Needs NUXT_CLICKUP_TOKEN and NUXT_CLICKUP_TEAM_ID on the server.
        </p>
      </div>
    </UCard>

    <UCard v-if="error">
      <p class="text-sm text-error">{{ error }}</p>
    </UCard>

    <UCard v-if="result">
      <template #header><h2 class="font-semibold">{{ result.dryRun ? 'What would happen' : 'What happened' }}</h2></template>
      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt class="text-muted">Open tasks in ClickUp</dt><dd class="tabular-nums">{{ result.fetched }}</dd>
        <dt class="text-muted">Created</dt><dd class="tabular-nums">{{ result.created }}</dd>
        <dt class="text-muted">Updated</dt><dd class="tabular-nums">{{ result.updated }}</dd>
        <dt class="text-muted">Assignments</dt><dd class="tabular-nums">{{ result.assignments }} <span class="text-muted">({{ result.droppedAssignees }} guests dropped)</span></dd>
        <dt class="text-muted">Into "General" projects</dt><dd class="tabular-nums">{{ result.inCatchAll }} <span class="text-muted">({{ result.createdProjects }} projects made)</span></dd>
        <dt class="text-muted">Skipped, list not a client</dt><dd class="tabular-nums">{{ result.skippedNoClient }}</dd>
      </dl>
      <p v-if="result.unmatchedLists.length" class="mt-3 text-sm"><strong>Lists that matched no client:</strong> {{ result.unmatchedLists.join(', ') }}</p>
    </UCard>
  </div>
</template>
