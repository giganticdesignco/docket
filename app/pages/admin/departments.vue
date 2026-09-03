<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'

// The labels a project can carry, so the Projects list filters to one.
definePageMeta({ middleware: 'can', permission: 'manage_settings' })
useHead({ title: 'Departments' })
const supabase = useSupabaseClient()

const showInactive = ref(false)
const creating = ref(false)
const editing = ref<Tables<'departments'> | null>(null)

const { data: departments, refresh } = await useAsyncData('departments', async () => {
  const { data, error } = await supabase.from('departments').select('*').order('name')
  if (error) throw error
  return data
}, fresh)

const rows = computed(() => (departments.value ?? []).filter(d => showInactive.value || d.is_active))

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
        <h1 class="text-2xl font-semibold">Departments</h1>
        <p class="text-sm text-muted">A label on a project, so the Projects list can show one kind of work. Deactivate rather than delete once a project uses one.</p>
      </div>
      <USwitch v-model="showInactive" label="Show inactive" size="sm" class="ml-auto" />
      <UButton icon="i-lucide-plus" @click="creating = true;">New department</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Name</th>
            <th class="px-4 py-2 font-medium">Status</th>
            <th class="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in rows" :key="d.id" class="border-b border-default last:border-0">
            <td class="px-4 py-2 font-medium">{{ d.name }}</td>
            <td class="px-4 py-2">
              <UBadge :color="d.is_active ? 'success' : 'neutral'" variant="subtle" size="sm">{{ d.is_active ? 'Active' : 'Inactive' }}</UBadge>
            </td>
            <td class="px-4 py-2 text-right">
              <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" aria-label="Edit" @click="editing = d;" />
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="3" class="px-4 py-8 text-center text-muted">No departments yet.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <AppDrawer v-model:open="creating" title="New department">
      <template #body>
        <DepartmentForm @saved="done" @cancel="creating = false;" />
      </template>
    </AppDrawer>

    <AppDrawer :open="!!editing" title="Edit department" @update:open="(v) => { if (!v) editing = null }">
      <template #body>
        <DepartmentForm v-if="editing" :department="editing" @saved="done" @cancel="editing = null;" />
      </template>
    </AppDrawer>
  </div>
</template>
