<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'
import { STATUS_COLORS, type StatusColor } from '~~/shared/types/app'

// The task status list: order, label, colour, and the flags the app relies
// on. Keys never change once made; deleting is only possible while no task
// uses the status (deactivate instead).
definePageMeta({ middleware: 'can', permission: 'manage_settings' })
useHead({ title: 'Task statuses' })

const supabase = useSupabaseClient()
const toast = useToast()
const ws = await useWorkStatuses()

type Status = Tables<'work_statuses'>
const editing = ref<Status | null>(null)
const creating = ref(false)
const form = reactive({ key: '', label: '', color: 'neutral' as StatusColor, is_done: false, is_paused: false, is_client_review: false, is_return: false, is_active: true })

const { data: usage, refresh: refreshUsage } = await useAsyncData('status-usage', async () => {
  const { data, error } = await supabase.from('work_items').select('status')
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const r of data ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1
  return counts
}, fresh)

function openCreate() {
  Object.assign(form, { key: '', label: '', color: 'neutral', is_done: false, is_paused: false, is_client_review: false, is_return: false, is_active: true })
  creating.value = true
}
function openEdit(s: Status) {
  Object.assign(form, { key: s.key, label: s.label, color: s.color as StatusColor, is_done: s.is_done, is_paused: s.is_paused, is_client_review: s.is_client_review, is_return: s.is_return, is_active: s.is_active })
  editing.value = s
}
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

const saving = ref(false)
async function save() {
  const label = form.label.trim()
  if (!label) return fail('Give the status a label')
  saving.value = true
  try {
    const values = { label, color: form.color, is_done: form.is_done, is_paused: form.is_paused, is_client_review: form.is_client_review, is_return: form.is_return, is_active: form.is_active }
    if (editing.value) {
      const { error } = await supabase.from('work_statuses').update(values).eq('key', editing.value.key)
      if (error) throw error
    } else {
      const key = slug(label)
      if (!key) return fail('Use letters or numbers in the label')
      const position = (ws.statuses.value.at(-1)?.position ?? 0) + 1
      const { error } = await supabase.from('work_statuses').insert({ key, position, ...values })
      if (error) throw error.code === '23505' ? new Error('A status with that name already exists') : error
    }
    editing.value = null
    creating.value = false
    await ws.reload()
  } catch (e) {
    fail((e as Error).message)
  } finally {
    saving.value = false
  }
}
function fail(message: string) {
  toast.add({ title: 'Not saved', description: message, color: 'error' })
}

// Order: swap positions with the neighbour, then renumber so gaps never grow.
async function move(s: Status, dir: -1 | 1) {
  const list = [...ws.statuses.value]
  const i = list.findIndex(x => x.key === s.key)
  const j = i + dir
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j]!, list[i]!]
  try {
    for (const [idx, st] of list.entries()) {
      if (st.position !== idx + 1) {
        const { error } = await supabase.from('work_statuses').update({ position: idx + 1 }).eq('key', st.key)
        if (error) throw error
      }
    }
    await ws.reload()
  } catch (e) {
    fail((e as Error).message)
  }
}

async function remove(s: Status) {
  const { error } = await supabase.from('work_statuses').delete().eq('key', s.key)
  if (error) {
    toast.add({ title: 'Cannot delete', description: error.code === '23503' ? 'Tasks still use this status. Move them, or deactivate the status instead.' : error.message, color: 'error' })
    return
  }
  await Promise.all([ws.reload(), refreshUsage()])
}
const flags = (s: Status) => [s.is_done && 'done', s.is_paused && 'paused', s.is_client_review && 'client review', s.is_return && 'changes requested'].filter(Boolean).join(', ')
</script>

<template>
  <div class="max-w-3xl space-y-4">
    <div class="flex items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Task statuses</h1>
        <p class="text-sm text-muted">The order here is the order in every status menu. Flags tell Docket what a status means.</p>
      </div>
      <UButton icon="i-lucide-plus" class="ml-auto" @click="openCreate">New status</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="w-16 px-4 py-2" />
            <th class="px-2 py-2 font-medium">Status</th>
            <th class="px-2 py-2 font-medium">Means</th>
            <th class="px-2 py-2 text-right font-medium">Tasks</th>
            <th class="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(s, i) in ws.statuses.value" :key="s.key" class="border-b border-default last:border-0" :class="s.is_active ? '' : 'opacity-60'">
            <td class="px-4 py-1.5">
              <div class="flex">
                <UButton icon="i-lucide-chevron-up" variant="ghost" color="neutral" size="xs" :disabled="i === 0" aria-label="Move up" @click="move(s, -1)" />
                <UButton icon="i-lucide-chevron-down" variant="ghost" color="neutral" size="xs" :disabled="i === ws.statuses.value.length - 1" aria-label="Move down" @click="move(s, 1)" />
              </div>
            </td>
            <td class="px-2 py-1.5"><UBadge :color="(s.color as any)" variant="subtle">{{ s.label }}</UBadge><span v-if="!s.is_active" class="ml-2 text-xs text-muted">inactive</span></td>
            <td class="px-2 py-1.5 text-muted">{{ flags(s) }}</td>
            <td class="px-2 py-1.5 text-right tabular-nums text-muted">{{ usage?.[s.key] ?? 0 }}</td>
            <td class="px-4 py-1.5 text-right">
              <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" aria-label="Edit" @click="openEdit(s)" />
              <UButton icon="i-lucide-trash-2" variant="ghost" color="neutral" size="sm" aria-label="Delete" :disabled="(usage?.[s.key] ?? 0) > 0" @click="remove(s)" />
            </td>
          </tr>
        </tbody>
      </table>
    </UCard>
    <p class="text-xs text-muted">Exactly one status should be flagged done, one paused, one client review, and one changes requested. A status in use cannot be deleted; deactivate it to hide it from menus.</p>

    <AppDrawer :open="creating || !!editing" :title="editing ? 'Edit status' : 'New status'" @update:open="(v) => { if (!v) { creating = false; editing = null } }">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Label">
            <UInput v-model="form.label" class="w-full" autofocus />
          </UFormField>
          <UFormField label="Colour">
            <USelect v-model="form.color" :items="STATUS_COLORS" class="w-full" />
          </UFormField>
          <div class="grid gap-2 sm:grid-cols-2">
            <UCheckbox v-model="form.is_done" label="Means done" description="Sets completed date, hides from open lists and capacity." />
            <UCheckbox v-model="form.is_paused" label="Means paused" description="Hidden from capacity." />
            <UCheckbox v-model="form.is_client_review" label="Client review" description="Share for review moves tasks here." />
            <UCheckbox v-model="form.is_return" label="Changes requested" description="A client's request moves tasks here." />
          </div>
          <UCheckbox v-model="form.is_active" label="Active" description="Inactive statuses stay on old tasks but leave the menus." />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="creating = false; editing = null;">Cancel</UButton>
          <UButton :loading="saving" @click="save">{{ editing ? 'Save' : 'Create' }}</UButton>
        </div>
      </template>
    </AppDrawer>
  </div>
</template>
