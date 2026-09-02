<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'

definePageMeta({ middleware: 'can', permission: 'manage_settings' })
useHead({ title: 'Expense categories' })
const supabase = useSupabaseClient()

const showInactive = ref(false)
const creating = ref(false)
const editing = ref<Tables<'expense_categories'> | null>(null)

const { data: categories, refresh } = await useAsyncData('expense-categories', async () => {
  const { data, error } = await supabase.from('expense_categories').select('*').order('name')
  if (error) throw error
  return data
}, fresh)

const rows = computed(() => (categories.value ?? []).filter(c => showInactive.value || c.is_active))

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
        <h1 class="text-2xl font-semibold">Expense categories</h1>
        <p class="text-sm text-muted">Seeded from Harvest. Deactivate rather than delete once anything uses one.</p>
      </div>
      <USwitch v-model="showInactive" label="Show inactive" size="sm" class="ml-auto" />
      <UButton icon="i-lucide-plus" @click="creating = true;">New category</UButton>
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
          <tr v-for="c in rows" :key="c.id" class="border-b border-default last:border-0">
            <td class="px-4 py-2 font-medium">{{ c.name }}</td>
            <td class="px-4 py-2">
              <UBadge :color="c.is_active ? 'success' : 'neutral'" variant="subtle" size="sm">{{ c.is_active ? 'Active' : 'Inactive' }}</UBadge>
            </td>
            <td class="px-4 py-2 text-right">
              <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" @click="editing = c;" />
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="3" class="px-4 py-8 text-center text-muted">No categories yet.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <UModal v-model:open="creating" title="New category">
      <template #body>
        <ExpenseCategoryForm @saved="done" @cancel="creating = false;" />
      </template>
    </UModal>

    <UModal :open="!!editing" title="Edit category" @update:open="(v) => { if (!v) editing = null }">
      <template #body>
        <ExpenseCategoryForm v-if="editing" :category="editing" @saved="done" @cancel="editing = null;" />
      </template>
    </UModal>
  </div>
</template>
