<script setup lang="ts">
// The signed-in user's expenses for one year. Admins can switch to everyone.
useHead({ title: 'Expenses' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { can } = useCurrentUser()
const isAdmin = computed(() => can('see_all_time'))
const receipts = useReceipts()
const toast = useToast()

const year = ref(new Date().getFullYear())
const undo = useUndo()
const prefs = await useViewState('expenses', { everyone: false })
const everyone = persisted(prefs, 'everyone')

const __ad1 = useAsyncData('expenses', async () => {
  let query = supabase
    .from('expenses')
    .select('*, projects(name, clients(name)), expense_categories(name), profiles(full_name)')
    .gte('spent_on', `${year.value}-01-01`)
    .lte('spent_on', `${year.value}-12-31`)
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (!(isAdmin.value && everyone.value)) query = query.eq('user_id', user.value!.sub)
  const { data, error } = await query
  if (error) throw error
  return data
}, { ...fresh, watch: [year, everyone] })

const __ad2 = useAsyncData('projects-for-expenses', async () => {
  const { data, error } = await supabase.from('projects').select('id, name, clients(name)').eq('is_active', true).order('name')
  if (error) throw error
  return data
}, fresh)

const __ad3 = useAsyncData('expense-categories-active', async () => {
  const { data, error } = await supabase.from('expense_categories').select('id, name').eq('is_active', true).order('name')
  if (error) throw error
  return data
}, fresh)
await Promise.all([__ad1, __ad2, __ad3])
const { data: expenses, refresh } = __ad1
const { data: projects } = __ad2
const { data: categories } = __ad3

type Row = NonNullable<typeof expenses.value>[number]

const creating = ref(false)
const editing = ref<Row | null>(null)
const deleting = ref<Row | null>(null)
const busy = ref<string | null>(null)

const total = computed(() => (expenses.value ?? []).reduce((sum, e) => sum + e.amount, 0))
const cols = await useColumns<Row>('expenses', [
  { key: 'date', label: 'Date', sort: e => e.spent_on, always: true },
  { key: 'person', label: 'Person', sort: e => e.profiles?.full_name },
  { key: 'project', label: 'Project', sort: e => e.projects?.name },
  { key: 'category', label: 'Category', sort: e => e.expense_categories?.name },
  { key: 'notes', label: 'Notes', sort: e => e.notes },
  { key: 'amount', label: 'Amount', align: 'right', sort: e => e.amount },
])
// The Person column only means something when the list shows everyone.
const visibleCols = computed(() => cols.visible.filter(c => c.key !== 'person' || everyone.value))
const rows = computed(() => cols.sorted(expenses.value ?? []))
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function saved() {
  creating.value = false
  editing.value = null
  refresh()
}

async function view(e: Row) {
  try {
    await receipts.open(e.receipt_path!)
  } catch (err) {
    toast.add({ title: 'Could not open receipt', description: (err as Error).message, color: 'error' })
  }
}

async function confirmDelete() {
  const e = deleting.value
  if (!e) return
  busy.value = e.id
  try {
    const { error } = await supabase.from('expenses').delete().eq('id', e.id)
    if (error) throw error
    // The receipt file stays until the purge, so Undo brings it back too.
    deleting.value = null
    await refresh()
    undo.offerRestore('Expense deleted', 'expenses', e.id, refresh)
  } catch (err) {
    toast.add({ title: 'Could not delete expense', description: (err as Error).message, color: 'error' })
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-4">
      <h1 class="text-2xl font-semibold">Expenses</h1>
      <div class="ml-auto flex items-center gap-1">
        <UButton icon="i-lucide-chevron-left" variant="ghost" color="neutral" size="sm" aria-label="Previous year" @click="year--;" />
        <span class="w-12 text-center text-sm tabular-nums">{{ year }}</span>
        <UButton icon="i-lucide-chevron-right" variant="ghost" color="neutral" size="sm" aria-label="Next year" @click="year++;" />
      </div>
      <USwitch v-if="isAdmin" v-model="everyone" label="Everyone" size="sm" />
      <ColumnsMenu :cols="cols" />
      <UButton icon="i-lucide-plus" @click="creating = true;">New expense</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="overflow-x-auto"><table class="w-full text-sm">
        <TableHead :cols="cols" :only="visibleCols" />
        <tbody>
          <tr v-for="e in rows" :key="e.id" class="border-b border-default last:border-0">
            <td v-for="c in visibleCols" :key="c.key" class="px-4 py-2" :class="[c.align === 'right' ? 'text-right tabular-nums' : '', c.key === 'date' ? 'whitespace-nowrap tabular-nums' : '', c.key === 'notes' ? 'max-w-xs' : '']">
              <template v-if="c.key === 'date'">{{ shortDate(e.spent_on) }}</template>
              <template v-else-if="c.key === 'person'">{{ e.profiles?.full_name }}</template>
              <template v-else-if="c.key === 'project'">
                <div class="font-medium">{{ e.projects?.name }}</div>
                <div class="text-muted">{{ e.projects?.clients?.name }}</div>
              </template>
              <template v-else-if="c.key === 'category'">{{ e.expense_categories?.name }}</template>
              <template v-else-if="c.key === 'notes'">
                <div class="truncate">{{ e.notes }}</div>
                <div class="flex gap-1">
                  <UBadge v-if="!e.is_billable" color="neutral" variant="subtle" size="sm">Non-billable</UBadge>
                  <UBadge v-if="e.is_reimbursable" color="primary" variant="subtle" size="sm">Reimburse</UBadge>
                </div>
              </template>
              <template v-else-if="c.key === 'amount'">{{ money(e.amount) }}</template>
            </td>
            <td class="px-4 py-2">
              <div class="flex justify-end gap-1">
                <UButton v-if="e.receipt_path" icon="i-lucide-paperclip" variant="ghost" color="neutral" size="sm" aria-label="View receipt" @click="view(e)" />
                <UIcon v-if="e.is_locked" name="i-lucide-lock" class="mx-2 self-center text-muted" title="Locked by a billing batch" />
                <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" aria-label="Edit" :disabled="e.is_locked" @click="editing = e;" />
                <UButton icon="i-lucide-trash-2" variant="ghost" color="neutral" size="sm" aria-label="Delete" :disabled="e.is_locked" @click="deleting = e;" />
              </div>
            </td>
          </tr>
          <tr v-if="!expenses?.length">
            <td :colspan="visibleCols.length + 1" class="px-4 py-8 text-center text-muted">No expenses in {{ year }}.</td>
          </tr>
        </tbody>
        <tfoot v-if="expenses?.length">
          <tr class="border-t border-default font-medium">
            <td :colspan="visibleCols.length" class="px-4 py-2 text-right tabular-nums"><span class="mr-3 text-muted">Total</span>{{ money(total) }}</td>
            <td />
          </tr>
        </tfoot>
      </table></div>
    </UCard>

    <AppDrawer v-model:open="creating" title="New expense">
      <template #body>
        <ExpenseForm :projects="projects ?? []" :categories="categories ?? []" @saved="saved" @cancel="creating = false;" />
      </template>
    </AppDrawer>

    <AppDrawer :open="!!editing" title="Edit expense" @update:open="(v) => { if (!v) editing = null }">
      <template #body>
        <ExpenseForm v-if="editing" :expense="editing" :projects="projects ?? []" :categories="categories ?? []" @saved="saved" @cancel="editing = null;" />
      </template>
    </AppDrawer>

    <UModal :open="!!deleting" title="Delete expense?" @update:open="(v) => { if (!v) deleting = null }">
      <template #body>
        <p v-if="deleting" class="text-sm">
          This removes {{ money(deleting.amount) }} on {{ deleting.projects?.name }}<span v-if="deleting.receipt_path"> and its receipt</span>. You can undo it for thirty seconds afterwards.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deleting = null;">Cancel</UButton>
          <UButton color="error" :loading="!!deleting && busy === deleting.id" @click="confirmDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
