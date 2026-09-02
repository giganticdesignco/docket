<script setup lang="ts">
// The kinds of page a website quote is built from, each with the hours
// it usually takes, an optional rate, and the task type its time logs
// under. The sitemap canvas offers these; "Price the sitemap" makes a
// scope line per template.
definePageMeta({ middleware: 'can', permission: 'manage_settings' })
useHead({ title: 'Page templates' })

const supabase = useSupabaseClient()
const toast = useToast()

const __ad1 = useAsyncData('admin-page-templates', async () => {
  const { data, error } = await supabase.from('page_templates').select('*').order('position').order('name')
  if (error) throw error
  return data
}, fresh)
const __ad2 = useAsyncData('task-types-for-templates', async () => {
  const { data, error } = await supabase.from('tasks').select('id, name').eq('is_active', true).order('name')
  if (error) throw error
  return data
}, fresh)
await Promise.all([__ad1, __ad2])
const { data: rows, refresh } = __ad1
const { data: taskTypes } = __ad2

type Row = NonNullable<typeof rows.value>[number]
const COLORS = ['neutral', 'primary', 'info', 'success', 'warning', 'error']
const taskOptions = computed(() => [{ label: 'No task type', value: '__none__' }, ...(taskTypes.value ?? []).map(t => ({ label: t.name, value: t.id }))])
const taskName = (id: string | null) => taskTypes.value?.find(t => t.id === id)?.name ?? ''

const editing = ref<Row | null>(null)
const adding = ref(false)
const form = reactive({ name: '', hours: 3, rate: '' as number | string, task_id: '__none__', description: '', color: 'neutral', is_active: true })
function openAdd() {
  Object.assign(form, { name: '', hours: 3, rate: '', task_id: '__none__', description: '', color: 'neutral', is_active: true })
  adding.value = true
}
function openEdit(r: Row) {
  Object.assign(form, { name: r.name, hours: r.hours, rate: r.rate ?? '', task_id: r.task_id ?? '__none__', description: r.description ?? '', color: r.color, is_active: r.is_active })
  editing.value = r
}
const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const values = { name: form.name.trim(), hours: Number(form.hours) || 0, rate: form.rate === '' ? null : Number(form.rate), task_id: form.task_id === '__none__' ? null : form.task_id, description: form.description.trim() || null, color: form.color, is_active: form.is_active }
    if (!values.name) throw new Error('Give the template a name.')
    const q = editing.value
      ? supabase.from('page_templates').update(values).eq('id', editing.value.id)
      : supabase.from('page_templates').insert({ ...values, position: (rows.value?.length ?? 0) + 1 })
    const { error } = await q
    if (error) throw error
    adding.value = false
    editing.value = null
    await refresh()
  } catch (e) {
    toast.add({ title: 'Could not save', description: (e as Error).message, color: 'error' })
  } finally {
    saving.value = false
  }
}
async function move(r: Row, dir: -1 | 1) {
  const list = rows.value ?? []
  const i = list.indexOf(r)
  const other = list[i + dir]
  if (!other) return
  await Promise.all([
    supabase.from('page_templates').update({ position: other.position }).eq('id', r.id),
    supabase.from('page_templates').update({ position: r.position }).eq('id', other.id),
  ])
  await refresh()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Page templates</h1>
        <p class="text-sm text-muted">The kinds of page a website quote is built from, with the hours each usually takes. The sitemap on a quote picks from these.</p>
      </div>
      <UButton class="ml-auto" icon="i-lucide-plus" @click="openAdd">New template</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Template</th>
            <th class="px-2 py-2 text-right font-medium">Hours</th>
            <th class="px-2 py-2 text-right font-medium">Rate</th>
            <th class="px-2 py-2 font-medium">Task type</th>
            <th class="px-2 py-2 font-medium">Colour</th>
            <th class="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="r.id" class="border-b border-default last:border-0" :class="r.is_active ? '' : 'text-muted'">
            <td class="px-4 py-1.5">
              <div class="font-medium">{{ r.name }}<span v-if="!r.is_active" class="ml-2 text-xs font-normal text-muted">inactive</span></div>
              <div class="text-xs text-muted">{{ r.description }}</div>
            </td>
            <td class="px-2 py-1.5 text-right tabular-nums">{{ formatHours(r.hours) }}</td>
            <td class="px-2 py-1.5 text-right tabular-nums">{{ r.rate ? `$${r.rate}` : '' }}</td>
            <td class="px-2 py-1.5">{{ taskName(r.task_id) }}</td>
            <td class="px-2 py-1.5"><UBadge :color="r.color as 'neutral'" variant="subtle" size="sm">{{ r.color }}</UBadge></td>
            <td class="px-4 py-1.5 text-right whitespace-nowrap">
              <UButton icon="i-lucide-chevron-up" variant="ghost" color="neutral" size="xs" aria-label="Move up" :disabled="i === 0" @click="move(r, -1)" />
              <UButton icon="i-lucide-chevron-down" variant="ghost" color="neutral" size="xs" aria-label="Move down" :disabled="i === (rows?.length ?? 0) - 1" @click="move(r, 1)" />
              <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="xs" aria-label="Edit" @click="openEdit(r)" />
            </td>
          </tr>
          <tr v-if="!rows?.length"><td colspan="6" class="px-4 py-8 text-center text-muted">No templates yet.</td></tr>
        </tbody>
      </table>
    </UCard>

    <AppDrawer :open="adding || !!editing" :title="editing ? 'Edit template' : 'New template'" @update:open="(v) => { if (!v) { adding = false; editing = null } }">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full" placeholder="Interior" /></UFormField>
          <UFormField label="Description"><UInput v-model="form.description" class="w-full" placeholder="A standard content page on the site template." /></UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Hours" help="What one page of this kind usually takes, all task types together."><UInput v-model.number="form.hours" type="number" step="0.5" min="0" class="w-full" /></UFormField>
            <UFormField label="Rate" help="Blank uses the rate already on the quote for the task type."><UInput v-model="form.rate" type="number" step="1" min="0" class="w-full" /></UFormField>
          </div>
          <UFormField label="Task type" help="Where the time logs when the pages become work."><USelect v-model="form.task_id" :items="taskOptions" class="w-full" /></UFormField>
          <UFormField label="Colour"><USelect v-model="form.color" :items="COLORS" class="w-full" /></UFormField>
          <USwitch v-model="form.is_active" label="Offered on the sitemap" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="adding = false; editing = null;">Cancel</UButton>
          <UButton :loading="saving" @click="save">{{ editing ? 'Save' : 'Add template' }}</UButton>
        </div>
      </template>
    </AppDrawer>
  </div>
</template>
