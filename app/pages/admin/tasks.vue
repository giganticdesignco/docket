<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'

definePageMeta({ middleware: 'admin' })
useHead({ title: 'Task types' })
const supabase = useSupabaseClient()

const showInactive = ref(false)
const creating = ref(false)
const editing = ref<Tables<'tasks'> | null>(null)

const { data: tasks, refresh } = await useAsyncData('tasks', async () => {
  const { data, error } = await supabase.from('tasks').select('*').order('name')
  if (error) throw error
  return data
}, fresh)

const rows = computed(() => (tasks.value ?? []).filter(t => showInactive.value || t.is_active))

function done() {
  creating.value = false
  editing.value = null
  refresh()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Task types</h1>
        <p class="text-sm text-muted">Global list. Assign them to projects from each project's settings.</p>
      </div>
      <USwitch v-model="showInactive" label="Show inactive" size="sm" class="ml-auto" />
      <UButton icon="i-lucide-plus" @click="creating = true;">New task</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Name</th>
            <th class="px-4 py-2 font-medium">Billable by default</th>
            <th class="px-4 py-2 font-medium">QBO item</th>
            <th class="px-4 py-2 font-medium">Status</th>
            <th class="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in rows" :key="t.id" class="border-b border-default last:border-0">
            <td class="px-4 py-2 font-medium">{{ t.name }}</td>
            <td class="px-4 py-2">{{ t.is_billable_default ? 'Yes' : 'No' }}</td>
            <td class="px-4 py-2 text-muted">{{ t.qbo_item_id }}</td>
            <td class="px-4 py-2">
              <UBadge :color="t.is_active ? 'success' : 'neutral'" variant="subtle" size="sm">{{ t.is_active ? 'Active' : 'Inactive' }}</UBadge>
            </td>
            <td class="px-4 py-2 text-right">
              <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" @click="editing = t;" />
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="5" class="px-4 py-8 text-center text-muted">No tasks yet.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <UModal v-model:open="creating" title="New task">
      <template #body>
        <TaskForm @saved="done" @cancel="creating = false;" />
      </template>
    </UModal>

    <UModal :open="!!editing" title="Edit task" @update:open="(v) => { if (!v) editing = null }">
      <template #body>
        <TaskForm v-if="editing" :task="editing" @saved="done" @cancel="editing = null;" />
      </template>
    </UModal>
  </div>
</template>
