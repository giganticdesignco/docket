<script setup lang="ts">
// The kinds of page a site plan is built from. Each is quoted in parts
// (usually Content, Design, Development), in order, each part under a
// task type with the hours one page usually takes. The site plan canvas
// offers the templates; "Price the plan" on a quote makes a scope line
// per template per part, and acceptance makes a subtask per part.
// Templates carry no rate: a part's scope line takes its task type's
// usual rate.
definePageMeta({ middleware: 'can', permission: 'manage_settings' })
useHead({ title: 'Page templates' })

const supabase = useSupabaseClient()
const toast = useToast()

const __ad1 = useAsyncData('admin-page-templates', async () => {
  const { data, error } = await supabase.from('page_templates')
    .select('id, name, description, color, position, is_active, page_template_parts(id, name, task_id, hours, position, tasks(name))')
    .order('position').order('name')
  if (error) throw error
  return data.map(({ page_template_parts: parts, ...t }) => ({ ...t, parts: [...parts].sort((a, b) => a.position - b.position) }))
}, fresh)
const __ad2 = useTaskTypes()
await Promise.all([__ad1, __ad2])
const { data: rows, refresh } = __ad1
const { data: taskTypes } = __ad2

type Row = NonNullable<typeof rows.value>[number]
type PartDraft = { id: string, name: string, task_id: string | undefined, hours: number | string, taskName: string }
const COLORS = ['neutral', 'primary', 'info', 'success', 'warning', 'error']
const hoursOf = (r: Row) => r.parts.reduce((s, p) => s + Number(p.hours), 0)
const partsText = (r: Row) => (r.parts.length ? r.parts.map(p => `${p.name} ${formatHours(p.hours)}`).join(', ') : 'No parts yet')
// Active task types, plus a retired one a part already uses.
const taskOptions = (p: PartDraft) => [
  ...(taskTypes.value ?? []).map(t => ({ label: t.name, value: t.id })),
  ...(p.task_id && !(taskTypes.value ?? []).some(t => t.id === p.task_id) ? [{ label: p.taskName, value: p.task_id }] : []),
]

// A new template starts with Content on Copywriting, Design on
// Design/Production, and Development on Web Development, matched by the
// task type's exact name. A default whose task type is missing or
// retired is left out rather than guessed.
const DEFAULT_PARTS = [
  { name: 'Content', task: 'Copywriting' },
  { name: 'Design', task: 'Design/Production' },
  { name: 'Development', task: 'Web Development' },
]
function defaultParts(): PartDraft[] {
  const types = taskTypes.value ?? []
  return DEFAULT_PARTS.flatMap(({ name, task }) => {
    const t = types.find(x => x.name === task)
    return t ? [{ id: crypto.randomUUID(), name, task_id: t.id, hours: 0, taskName: t.name }] : []
  })
}
// The names the empty state's button offers, only those whose task type exists.
const defaultPartNames = computed(() => DEFAULT_PARTS.filter(d => (taskTypes.value ?? []).some(x => x.name === d.task)).map(d => d.name))

const editing = ref<Row | null>(null)
const adding = ref(false)
const form = reactive({ name: '', description: '', color: 'neutral', is_active: true, parts: [] as PartDraft[] })
const removedParts = ref<string[]>([])
// A new template already inserted by a save whose parts then failed, so
// saving again updates it instead of inserting it twice.
let createdId: string | null = null
function openAdd() {
  Object.assign(form, { name: '', description: '', color: 'neutral', is_active: true, parts: defaultParts() })
  removedParts.value = []
  adding.value = true
}
function openEdit(r: Row) {
  Object.assign(form, {
    name: r.name, description: r.description ?? '', color: r.color, is_active: r.is_active,
    parts: r.parts.map(p => ({ id: p.id, name: p.name, task_id: p.task_id, hours: p.hours, taskName: p.tasks?.name ?? '' })),
  })
  removedParts.value = []
  editing.value = r
}
function close() {
  adding.value = false
  createdId = null
  editing.value = null
}
function addPart() {
  form.parts.push({ id: crypto.randomUUID(), name: '', task_id: undefined, hours: 0, taskName: '' })
}
function removePart(i: number) {
  const [p] = form.parts.splice(i, 1)
  if (p && editing.value?.parts.some(x => x.id === p.id)) removedParts.value.push(p.id)
}
function movePart(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= form.parts.length) return
  const [p] = form.parts.splice(i, 1)
  form.parts.splice(j, 0, p!)
}
// A part with no name yet takes the name of the task type picked for it.
function setPartTask(p: PartDraft, id: string) {
  p.task_id = id
  const t = taskTypes.value?.find(x => x.id === id)
  if (!t) return
  p.taskName = t.name
  if (!p.name.trim()) p.name = t.name
}

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const name = form.name.trim()
    if (!name) throw new Error('Give the template a name.')
    if (form.parts.some(p => !p.name.trim())) throw new Error('Every part needs a name.')
    if (form.parts.some(p => !p.task_id)) throw new Error('Every part needs a task type.')
    if (form.parts.some(p => p.hours === '' || !(Number(p.hours) >= 0) || Number(p.hours) > 9999)) throw new Error('Part hours go from 0 to 9999.')
    const seen = new Set<string>()
    for (const p of form.parts) {
      const k = p.name.trim().toLowerCase()
      if (seen.has(k)) throw new Error(`Two parts are both called ${p.name.trim()}.`)
      seen.add(k)
    }
    const values = { name, description: form.description.trim() || null, color: form.color, is_active: form.is_active }
    let id = editing.value?.id ?? createdId ?? undefined
    if (id) {
      const { error } = await supabase.from('page_templates').update(values).eq('id', id)
      if (error) throw error
    } else {
      const { data, error } = await supabase.from('page_templates').insert({ ...values, position: (rows.value?.length ?? 0) + 1 }).select('id').single()
      if (error) throw error
      id = data.id
      createdId = data.id
    }
    // Removed parts first, then the list in its order.
    if (removedParts.value.length) {
      const { error } = await supabase.from('page_template_parts').delete().in('id', removedParts.value)
      if (error) throw error
    }
    if (form.parts.length) {
      const { error } = await supabase.from('page_template_parts').upsert(form.parts.map((p, i) => ({
        id: p.id, template_id: id!, name: p.name.trim(), task_id: p.task_id!, hours: Number(p.hours), position: i + 1,
      })), { onConflict: 'id' })
      if (error) throw error
    }
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
        <p class="text-sm text-muted">The kinds of page a site plan is built from, and the parts each is quoted in, with the hours each part usually takes.</p>
      </div>
      <UButton class="ml-auto" icon="i-lucide-plus" @click="openAdd">New template</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Template</th>
            <th class="px-2 py-2 text-right font-medium">Hours</th>
            <th class="px-2 py-2 font-medium">Color</th>
            <th class="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="r.id" class="border-b border-default last:border-0 align-top" :class="r.is_active ? '' : 'text-muted'">
            <td class="px-4 py-1.5">
              <div class="font-medium">{{ r.name }}<span v-if="!r.is_active" class="ml-2 text-xs font-normal text-muted">inactive</span></div>
              <div class="text-xs text-muted">{{ r.description }}</div>
              <div class="mt-0.5 text-xs text-muted">{{ partsText(r) }}</div>
            </td>
            <td class="px-2 py-1.5 text-right tabular-nums">{{ formatHours(hoursOf(r)) }}</td>
            <td class="px-2 py-1.5"><UBadge :color="r.color as 'neutral'" variant="subtle" size="sm">{{ r.color }}</UBadge></td>
            <td class="px-4 py-1.5 text-right whitespace-nowrap">
              <UButton icon="i-lucide-chevron-up" variant="ghost" color="neutral" size="xs" aria-label="Move up" :disabled="i === 0" @click="move(r, -1)" />
              <UButton icon="i-lucide-chevron-down" variant="ghost" color="neutral" size="xs" aria-label="Move down" :disabled="i === (rows?.length ?? 0) - 1" @click="move(r, 1)" />
              <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="xs" aria-label="Edit" @click="openEdit(r)" />
            </td>
          </tr>
          <tr v-if="!rows?.length"><td colspan="4" class="px-4 py-8 text-center text-muted">No templates yet.</td></tr>
        </tbody>
      </table>
    </UCard>

    <AppDrawer :open="adding || !!editing" :title="editing ? 'Edit template' : 'New template'" wide @update:open="(v) => { if (!v) close() }">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full" placeholder="Interior" /></UFormField>
          <UFormField label="Description"><UInput v-model="form.description" class="w-full" placeholder="A standard content page on the site template." /></UFormField>
          <div>
            <div class="mb-1 flex flex-wrap items-center gap-x-2">
              <span class="text-sm font-medium">Parts</span>
              <span class="text-xs text-muted">In the order they are quoted and made. Each part is a scope line on the quote and a subtask on each page's task. A page can type over the hours, or 0 to skip a part. A part's scope line takes its task type's usual rate.</span>
            </div>
            <div class="space-y-2">
              <div v-for="(p, i) in form.parts" :key="p.id" class="grid grid-cols-[1fr_5rem_auto] items-center gap-2 sm:grid-cols-[1fr_11rem_5rem_auto]">
                <UInput v-model="p.name" size="sm" placeholder="Design" />
                <USelectMenu :model-value="p.task_id" :items="taskOptions(p)" value-key="value" size="sm" placeholder="Task type" class="order-last col-span-full sm:order-none sm:col-span-1" @update:model-value="setPartTask(p, $event as string)" />
                <UInput v-model="p.hours" type="number" step="0.25" min="0" size="sm" placeholder="hours" :ui="{ base: 'text-right' }" />
                <div class="flex">
                  <UButton icon="i-lucide-chevron-up" variant="ghost" color="neutral" size="xs" aria-label="Move up" :disabled="i === 0" @click="movePart(i, -1)" />
                  <UButton icon="i-lucide-chevron-down" variant="ghost" color="neutral" size="xs" aria-label="Move down" :disabled="i === form.parts.length - 1" @click="movePart(i, 1)" />
                  <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" aria-label="Remove part" @click="removePart(i)" />
                </div>
              </div>
            </div>
            <div v-if="!form.parts.length" class="flex flex-wrap items-center gap-2">
              <p class="text-sm text-muted">No parts yet. A template with no parts prices nothing, and its pages get a task with no subtasks.</p>
              <UButton v-if="defaultPartNames.length" size="xs" variant="outline" color="neutral" @click="form.parts = defaultParts();">Add {{ defaultPartNames.join(', ') }}</UButton>
            </div>
            <p v-if="removedParts.length" class="mt-2 text-xs text-warning">Removed parts come off every site plan page on this template when you save. Quote lines already priced for them stay as they are; on quotes not yet accepted they lose their page count.</p>
            <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-plus" class="mt-2" @click="addPart">Add part</UButton>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Color"><USelect v-model="form.color" :items="COLORS" class="w-full" /></UFormField>
          </div>
          <USwitch v-model="form.is_active" label="Offered on site plans" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="close">Cancel</UButton>
          <UButton :loading="saving" @click="save">{{ editing ? 'Save' : 'Add template' }}</UButton>
        </div>
      </template>
    </AppDrawer>
  </div>
</template>
