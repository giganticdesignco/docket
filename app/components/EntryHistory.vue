<script setup lang="ts">
// Who changed what on a time entry or expense, from the audit trail,
// newest first. "Restore" on an older version writes its values back
// through a normal update, so the same rules apply as editing by hand
// (locked entries stay as they are).
const props = defineProps<{ table: 'time_entries' | 'expenses', id: string | null, locked?: boolean }>()
const emit = defineEmits<{ close: [], restored: [] }>()
const supabase = useSupabaseClient()
const toast = useToast()

type Change = { changed_at: string, changed_by_name: string | null, action: string, changed_fields: string[] | null, old_data: Record<string, unknown> | null, new_data: Record<string, unknown> | null }
const rows = ref<Change[] | null>(null)
watch(() => props.id, async (id) => {
  rows.value = null
  if (!id) return
  const { data, error } = await supabase.rpc('entry_history', { p_table: props.table, p_id: id })
  if (error) { toast.add({ title: 'Could not load history', description: error.message, color: 'error' }); rows.value = []; return }
  rows.value = (data ?? []) as unknown as Change[]
}, { immediate: true })

// The fields a person edits; the rest (rates, locks, ids) are the app's.
const FIELDS: Record<string, string[]> = {
  time_entries: ['spent_on', 'hours', 'notes', 'is_billable', 'project_id', 'task_id'],
  expenses: ['spent_on', 'amount', 'notes', 'is_billable', 'is_reimbursable', 'project_id', 'category_id'],
}
const LABEL: Record<string, string> = { spent_on: 'Date', hours: 'Hours', notes: 'Notes', is_billable: 'Billable', is_reimbursable: 'Reimbursable', project_id: 'Project', task_id: 'Task type', category_id: 'Category', amount: 'Amount', deleted_at: 'Deleted', started_at: 'Timer started', ended_at: 'Timer stopped' }
const shown = (c: Change) => (c.changed_fields ?? []).filter(f => f in LABEL && f !== 'deleted_at')
// A change that only touched the delete mark is a delete or a put-back, not an edit.
const kind = (c: Change) => {
  if (c.action !== 'update') return c.action
  const fs = c.changed_fields ?? []
  if (fs.length && fs.every(f => f === 'deleted_at' || f === 'deleted_by')) return c.new_data?.deleted_at ? 'deleted' : 'restored'
  return 'update'
}
const VERB: Record<string, string> = { insert: 'created it', update: 'changed it', deleted: 'deleted it', restored: 'put it back', delete: 'deleted it' }
const show = (v: unknown) => (v === null || v === undefined || v === '' ? 'empty' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v).length > 60 ? `${String(v).slice(0, 60)}...` : String(v))
const when = stamp

const restoring = ref<string | null>(null)
async function restore(c: Change) {
  if (!props.id || !c.old_data) return
  restoring.value = c.changed_at
  const values: Record<string, unknown> = {}
  for (const f of FIELDS[props.table] ?? []) if (f in c.old_data) values[f] = c.old_data[f]
  const { error } = await supabase.from(props.table).update(values as never).eq('id', props.id)
  restoring.value = null
  if (error) { toast.add({ title: 'Could not restore', description: error.message, color: 'error' }); return }
  toast.add({ title: 'Restored', description: `Back to how it was at ${when(c.changed_at)}`, color: 'success' })
  emit('restored')
  emit('close')
}
</script>

<template>
  <AppDrawer :open="!!id" title="History" description="Every change to this entry, newest first." @update:open="(v) => { if (!v) emit('close') }">
    <template #body>
      <p v-if="!rows" class="text-sm text-muted">Loading...</p>
      <p v-else-if="!rows.length" class="text-sm text-muted">No history recorded.</p>
      <ol v-else class="space-y-3 text-sm">
        <li v-for="c in rows" :key="c.changed_at" class="rounded-md border border-default p-3">
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ c.changed_by_name ?? 'Docket' }}</span>
            <span class="text-xs text-muted">{{ VERB[kind(c)] }}, {{ when(c.changed_at) }}</span>
            <UButton v-if="kind(c) === 'update' && shown(c).length && !locked" size="xs" variant="ghost" color="neutral" class="ml-auto" :loading="restoring === c.changed_at" @click="restore(c)">Restore this</UButton>
          </div>
          <dl v-if="kind(c) === 'update'" class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <template v-for="f in shown(c)" :key="f">
              <dt class="text-muted">{{ LABEL[f] }}</dt>
              <dd><span class="text-muted line-through">{{ show(c.old_data?.[f]) }}</span> <span>{{ show(c.new_data?.[f]) }}</span></dd>
            </template>
            <template v-if="!shown(c).length"><dt class="text-muted">Changed</dt><dd>{{ (c.changed_fields ?? []).join(', ') }}</dd></template>
          </dl>
        </li>
      </ol>
      <p v-if="locked" class="mt-3 text-xs text-muted">This entry is on an invoice, so it cannot be changed.</p>
    </template>
  </AppDrawer>
</template>
