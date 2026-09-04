<script setup lang="ts">

// Project templates: a preset list of tasks (title, task type, hours,
// a suggested role) that the New project form can drop into a project
// of any kind. Page templates, for quoted websites, are separate.
definePageMeta({ middleware: 'can', permission: 'manage_settings' })
useHead({ title: 'Project templates' })

const supabase = useSupabaseClient()
const toast = useToast()

const __ad1 = useAsyncData('admin-project-templates', async () => {
  const { data, error } = await supabase.from('project_templates').select('*, project_template_items(id, title, task_id, estimate_hours, default_role, sort_order)').order('position').order('name')
  if (error) throw error
  return data
}, fresh)
const __ad2 = useTaskTypes()
const __ad3 = useRoles()
await Promise.all([__ad1, __ad2, __ad3])
const { data: rows, refresh } = __ad1
const { data: taskTypes } = __ad2
const { data: roles } = __ad3

type Row = NonNullable<typeof rows.value>[number]
const NONE = '__none__'
const taskOptions = computed(() => [{ label: 'No task type', value: NONE }, ...(taskTypes.value ?? []).map(t => ({ label: t.name, value: t.id }))])
const roleOptions = computed(() => [{ label: 'Anyone', value: NONE }, ...(roles.value ?? []).filter(r => r.key !== 'client').map(r => ({ label: r.label, value: r.key }))])
const hoursOf = (r: Row) => r.project_template_items.reduce((s, i) => s + (i.estimate_hours ?? 0), 0)

// ---------- editor ----------
type ItemDraft = { title: string, task_id: string, estimate_hours: number | string, default_role: string }
const editing = ref<Row | null>(null)
const adding = ref(false)
const form = reactive({ name: '', description: '', is_active: true, items: [] as ItemDraft[] })
const blank = (): ItemDraft => ({ title: '', task_id: NONE, estimate_hours: '', default_role: NONE })
function openAdd() {
  Object.assign(form, { name: '', description: '', is_active: true, items: [blank()] })
  adding.value = true
}
function openEdit(r: Row) {
  Object.assign(form, {
    name: r.name, description: r.description ?? '', is_active: r.is_active,
    items: [...r.project_template_items].sort((a, b) => a.sort_order - b.sort_order).map(i => ({ title: i.title, task_id: i.task_id ?? NONE, estimate_hours: i.estimate_hours ?? '', default_role: i.default_role ?? NONE })),
  })
  editing.value = r
}
function close() { adding.value = false; editing.value = null }
function moveItem(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= form.items.length) return
  const [it] = form.items.splice(i, 1)
  form.items.splice(j, 0, it!)
}
const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const name = form.name.trim()
    if (!name) throw new Error('Give the template a name.')
    const items = form.items.filter(i => i.title.trim())
    if (!items.length) throw new Error('Add at least one task.')
    let id = editing.value?.id
    const values = { name, description: form.description.trim() || null, is_active: form.is_active }
    if (id) {
      const { error } = await supabase.from('project_templates').update(values).eq('id', id)
      if (error) throw error
    } else {
      const { data, error } = await supabase.from('project_templates').insert({ ...values, position: (rows.value?.length ?? 0) + 1 }).select('id').single()
      if (error) throw error
      id = data.id
    }
    // The items are rewritten whole: nothing else points at them.
    const del = await supabase.from('project_template_items').delete().eq('template_id', id)
    if (del.error) throw del.error
    const ins = await supabase.from('project_template_items').insert(items.map((i, n) => ({
      template_id: id!, title: i.title.trim(), task_id: i.task_id === NONE ? null : i.task_id,
      estimate_hours: i.estimate_hours === '' ? null : Number(i.estimate_hours), default_role: i.default_role === NONE ? null : i.default_role, sort_order: n + 1,
    })))
    if (ins.error) throw ins.error
    close()
    await refresh()
  } catch (e) {
    toast.add({ title: 'Could not save', description: (e as Error).message, color: 'error' })
  } finally {
    saving.value = false
  }
}
async function move(r: Row, dir: -1 | 1) {
  const list = rows.value ?? []
  const other = list[list.indexOf(r) + dir]
  if (!other) return
  await Promise.all([
    supabase.from('project_templates').update({ position: other.position }).eq('id', r.id),
    supabase.from('project_templates').update({ position: r.position }).eq('id', other.id),
  ])
  await refresh()
}
const deleting = ref<Row | null>(null)
async function remove() {
  if (!deleting.value) return
  const { error } = await supabase.from('project_templates').delete().eq('id', deleting.value.id)
  if (error) toast.add({ title: 'Could not delete', description: error.message, color: 'error' })
  deleting.value = null
  await refresh()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Project templates</h1>
        <p class="text-sm text-muted">A starting set of tasks for a new project. Pick one on the New project form and the tasks are made with their hours; the projects that already exist are not touched.</p>
      </div>
      <UButton class="ml-auto" icon="i-lucide-plus" @click="openAdd">New template</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Template</th>
            <th class="px-2 py-2 text-right font-medium">Tasks</th>
            <th class="px-2 py-2 text-right font-medium">Hours</th>
            <th class="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="r.id" class="border-b border-default last:border-0 align-top" :class="r.is_active ? '' : 'text-muted'">
            <td class="px-4 py-2">
              <div class="font-medium">{{ r.name }}<span v-if="!r.is_active" class="ml-2 text-xs font-normal text-muted">inactive</span></div>
              <div class="text-xs text-muted">{{ r.description }}</div>
              <div class="mt-1 text-xs text-muted">{{ [...r.project_template_items].sort((a, b) => a.sort_order - b.sort_order).map(t => t.title).join(', ') }}</div>
            </td>
            <td class="px-2 py-2 text-right tabular-nums">{{ r.project_template_items.length }}</td>
            <td class="px-2 py-2 text-right tabular-nums">{{ formatHours(hoursOf(r)) }}</td>
            <td class="px-4 py-2 text-right whitespace-nowrap">
              <UButton icon="i-lucide-chevron-up" variant="ghost" color="neutral" size="xs" aria-label="Move up" :disabled="i === 0" @click="move(r, -1)" />
              <UButton icon="i-lucide-chevron-down" variant="ghost" color="neutral" size="xs" aria-label="Move down" :disabled="i === (rows?.length ?? 0) - 1" @click="move(r, 1)" />
              <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="xs" aria-label="Edit" @click="openEdit(r)" />
              <UButton icon="i-lucide-trash-2" variant="ghost" color="neutral" size="xs" aria-label="Delete" @click="deleting = r;" />
            </td>
          </tr>
          <tr v-if="!rows?.length"><td colspan="4" class="px-4 py-8 text-center text-muted">No templates yet. Make one for the kind of job you start most.</td></tr>
        </tbody>
      </table>
    </UCard>

    <AppDrawer :open="adding || !!editing" :title="editing ? 'Edit template' : 'New template'" wide @update:open="(v) => { if (!v) close() }">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full" placeholder="Brand identity" /></UFormField>
          <UFormField label="Description"><UInput v-model="form.description" class="w-full" placeholder="Logo, color, type, and a short standards sheet." /></UFormField>
          <div>
            <div class="mb-1 flex items-center gap-2">
              <span class="text-sm font-medium">Tasks</span>
              <span class="text-xs text-muted">In the order they are made. Hours become each task's estimate; the role is a hint for who to assign.</span>
            </div>
            <div class="space-y-2">
              <div v-for="(it, i) in form.items" :key="i" class="grid grid-cols-[1fr_9rem_5rem_8rem_auto] items-center gap-2">
                <UInput v-model="it.title" size="sm" placeholder="Task title" />
                <USelectMenu v-model="it.task_id" :items="taskOptions" value-key="value" size="sm" />
                <UInput v-model="it.estimate_hours" type="number" step="0.25" min="0" size="sm" placeholder="hours" :ui="{ base: 'text-right' }" />
                <USelect v-model="it.default_role" :items="roleOptions" size="sm" />
                <div class="flex">
                  <UButton icon="i-lucide-chevron-up" variant="ghost" color="neutral" size="xs" aria-label="Move up" :disabled="i === 0" @click="moveItem(i, -1)" />
                  <UButton icon="i-lucide-chevron-down" variant="ghost" color="neutral" size="xs" aria-label="Move down" :disabled="i === form.items.length - 1" @click="moveItem(i, 1)" />
                  <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" aria-label="Remove" @click="form.items.splice(i, 1);" />
                </div>
              </div>
            </div>
            <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-plus" class="mt-2" @click="form.items.push(blank());">Add task</UButton>
          </div>
          <USwitch v-model="form.is_active" label="Offered on the New project form" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="close">Cancel</UButton>
          <UButton :loading="saving" @click="save">{{ editing ? 'Save' : 'Add template' }}</UButton>
        </div>
      </template>
    </AppDrawer>

    <UModal :open="!!deleting" title="Delete this template?" @update:open="(v) => { if (!v) deleting = null }">
      <template #body><p class="text-sm">Projects already made from it keep their tasks.</p></template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deleting = null;">Cancel</UButton>
          <UButton color="error" @click="remove">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
