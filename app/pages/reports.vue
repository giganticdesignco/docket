<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Tables } from '~~/shared/types/database'
import type { CsvColumn } from '~/composables/useCsv'

// Report builder for admins. Three sources, filters, grouping for the
// monthly source, totals, and a CSV built from exactly the rows shown.
// Saved reports store the configuration, not the output.
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Reports' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const csv = useCsv()

type Source = 'time_monthly_all' | 'time_detail' | 'expenses'
const SOURCES: { label: string, value: Source }[] = [
  { label: 'Time by month (live + Harvest history)', value: 'time_monthly_all' },
  { label: 'Time entries', value: 'time_detail' },
  { label: 'Expenses', value: 'expenses' },
]
const GROUPS = [
  { label: 'Month', value: 'month' },
  { label: 'Client', value: 'client' },
  { label: 'Project', value: 'project' },
  { label: 'Person', value: 'person' },
  { label: 'Task', value: 'task' },
]

const year = new Date().getFullYear()
const config = reactive({
  source: 'time_monthly_all' as Source,
  from: `${year}-01-01`,
  to: todayString(),
  client: '',
  project: '',
  person: '',
  groupBy: ['client'] as string[],
})

// Filter options come from live tables. Archive-only names still show up
// in results, they just cannot be picked as a filter.
const { data: clients } = await useAsyncData('report-clients', async () => {
  const { data, error } = await supabase.from('clients').select('name').order('name')
  if (error) throw error
  return data
}, fresh)
const { data: projects } = await useAsyncData('report-projects', async () => {
  const { data, error } = await supabase.from('projects').select('name, clients(name)').order('name')
  if (error) throw error
  return data
}, fresh)
const { data: people } = await useAsyncData('report-people', async () => {
  const { data, error } = await supabase.from('profiles').select('full_name').order('full_name')
  if (error) throw error
  return data
}, fresh)
const { data: saved, refresh: refreshSaved } = await useAsyncData('saved-reports', async () => {
  const { data, error } = await supabase.from('saved_reports').select('*').order('name')
  if (error) throw error
  return data
}, fresh)

const clientOptions = computed(() => [{ label: 'All clients', value: '' }, ...(clients.value ?? []).map(c => ({ label: c.name, value: c.name }))])
const projectOptions = computed(() => [
  { label: 'All projects', value: '' },
  ...(projects.value ?? [])
    .filter(p => !config.client || p.clients?.name === config.client)
    .map(p => ({ label: config.client ? p.name : `${p.clients?.name} / ${p.name}`, value: p.name })),
])
const personOptions = computed(() => [{ label: 'Everyone', value: '' }, ...(people.value ?? []).map(p => ({ label: p.full_name, value: p.full_name }))])
watch(() => config.client, () => { config.project = '' })

// ---------- running ----------

const rows = ref<Record<string, unknown>[]>([])
const columns = ref<CsvColumn[]>([])
const running = ref(false)
const ran = ref(false)

// PostgREST caps a response at 1000 rows; page through.
async function selectAll<T>(query: { range: (a: number, b: number) => PromiseLike<{ data: T[] | null, error: { message: string } | null }> }) {
  const out: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

async function run() {
  running.value = true
  try {
    if (config.source === 'time_monthly_all') {
      const { data, error } = await supabase.rpc('report_time_monthly', {
        p_from: config.from,
        p_to: config.to,
        p_client: config.client || undefined,
        p_project: config.project || undefined,
        p_user: config.person || undefined,
        p_group_by: config.groupBy,
      })
      if (error) throw error
      const g = config.groupBy
      columns.value = [
        ...(g.includes('month') ? [{ key: 'period_month', label: 'Month', kind: 'date' as const }] : []),
        ...(g.includes('client') ? [{ key: 'client_name', label: 'Client' }] : []),
        ...(g.includes('project') ? [{ key: 'project_name', label: 'Project' }] : []),
        ...(g.includes('person') ? [{ key: 'user_name', label: 'Person' }] : []),
        ...(g.includes('task') ? [{ key: 'task_name', label: 'Task' }] : []),
        { key: 'hours', label: 'Hours', kind: 'hours' },
        { key: 'billable_hours', label: 'Billable hours', kind: 'hours' },
        { key: 'amount', label: 'Amount', kind: 'money' },
      ]
      rows.value = data.map(r => ({ ...r, period_month: r.period_month?.slice(0, 7) ?? null }))
    } else if (config.source === 'time_detail') {
      let q = supabase
        .from('time_detail')
        .select('id, spent_on, client_name, project_name, project_code, task_name, user_name, hours, is_billable, amount, notes')
        .gte('spent_on', config.from)
        .lte('spent_on', config.to)
        .order('spent_on')
        .order('client_name')
      if (config.client) q = q.eq('client_name', config.client)
      if (config.project) q = q.eq('project_name', config.project)
      if (config.person) q = q.eq('user_name', config.person)
      const data = await selectAll(q)
      columns.value = [
        { key: 'spent_on', label: 'Date', kind: 'date' },
        { key: 'client_name', label: 'Client' },
        { key: 'project_name', label: 'Project' },
        { key: 'task_name', label: 'Task' },
        { key: 'user_name', label: 'Person' },
        { key: 'hours', label: 'Hours', kind: 'hours' },
        { key: 'billable', label: 'Billable' },
        { key: 'amount', label: 'Amount', kind: 'money' },
        { key: 'notes', label: 'Notes' },
      ]
      rows.value = data.map(r => ({ ...r, billable: r.is_billable ? 'Yes' : 'No' }))
    } else {
      const q = supabase
        .from('expenses')
        .select('id, spent_on, amount, notes, is_billable, is_reimbursable, projects(name, clients(name)), expense_categories(name), profiles(full_name)')
        .gte('spent_on', config.from)
        .lte('spent_on', config.to)
        .order('spent_on')
      const data = await selectAll(q)
      columns.value = [
        { key: 'spent_on', label: 'Date', kind: 'date' },
        { key: 'client_name', label: 'Client' },
        { key: 'project_name', label: 'Project' },
        { key: 'category', label: 'Category' },
        { key: 'user_name', label: 'Person' },
        { key: 'amount', label: 'Amount', kind: 'money' },
        { key: 'billable', label: 'Billable' },
        { key: 'reimbursable', label: 'Reimbursable' },
        { key: 'notes', label: 'Notes' },
      ]
      rows.value = data
        .map(e => ({
          id: e.id,
          spent_on: e.spent_on,
          client_name: e.projects?.clients?.name ?? '',
          project_name: e.projects?.name ?? '',
          category: e.expense_categories?.name ?? '',
          user_name: e.profiles?.full_name ?? '',
          amount: e.amount,
          billable: e.is_billable ? 'Yes' : 'No',
          reimbursable: e.is_reimbursable ? 'Yes' : 'No',
          notes: e.notes,
        }))
        .filter(r => (!config.client || r.client_name === config.client)
          && (!config.project || r.project_name === config.project)
          && (!config.person || r.user_name === config.person))
    }
    ran.value = true
  } catch (e) {
    toast.add({ title: 'Report failed', description: (e as Error).message, color: 'error' })
  } finally {
    running.value = false
  }
}

const numericColumns = computed(() => columns.value.filter(c => c.kind === 'hours' || c.kind === 'money'))
const totals = computed(() => {
  const t: Record<string, number> = {}
  for (const c of numericColumns.value) {
    t[c.key] = Math.round(rows.value.reduce((sum, r) => sum + Number(r[c.key] ?? 0), 0) * 100) / 100
  }
  return t
})

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
function show(c: CsvColumn, v: unknown) {
  if (v == null || v === '') return ''
  if (c.kind === 'hours') return Number(v).toFixed(2)
  if (c.kind === 'money') return money(Number(v))
  return String(v)
}

function exportCsv() {
  const name = `${config.source}-${config.from}-to-${config.to}.csv`
  csv.download(name, csv.toCsv(columns.value, rows.value, totals.value))
}

// ---------- saved reports ----------

type Saved = Tables<'saved_reports'>
type Filters = { from?: string, to?: string, client?: string, project?: string, person?: string }
// shallowRef: saved_reports.filters is the recursive Json type, which a
// deep ref unwraps forever in the type checker.
const loaded = shallowRef<Saved | null>(null)
const saving = ref(false)
const saveState = reactive({ name: '', is_shared: false })

const savedItems = computed<DropdownMenuItem[][]>(() => [
  (saved.value ?? []).map(r => ({
    label: r.name + (r.is_shared ? ' (shared)' : ''),
    icon: 'i-lucide-file-text',
    onSelect: () => load(r),
  })),
])

function load(r: Saved) {
  const f = (r.filters ?? {}) as Filters
  config.source = (r.base_view as Source) || 'time_monthly_all'
  config.from = f.from ?? config.from
  config.to = f.to ?? config.to
  config.client = f.client ?? ''
  nextTick(() => { config.project = f.project ?? '' })
  config.person = f.person ?? ''
  config.groupBy = r.group_by?.length ? [...r.group_by] : ['client']
  loaded.value = r
  run()
}

async function save() {
  const { data, error } = await supabase.from('saved_reports').insert({
    name: saveState.name.trim(),
    base_view: config.source,
    filters: { from: config.from, to: config.to, client: config.client, project: config.project, person: config.person },
    group_by: config.source === 'time_monthly_all' ? config.groupBy : null,
    owner_id: user.value!.sub,
    is_shared: saveState.is_shared,
  }).select().single()
  if (error) {
    toast.add({ title: 'Could not save report', description: error.message, color: 'error' })
    return
  }
  saving.value = false
  saveState.name = ''
  loaded.value = data
  refreshSaved()
}

const canDelete = computed(() => !!loaded.value && loaded.value.owner_id === user.value?.sub)
function removeLoaded() {
  if (loaded.value) remove(loaded.value)
}

async function remove(r: Saved) {
  const { error } = await supabase.from('saved_reports').delete().eq('id', r.id)
  if (error) {
    toast.add({ title: 'Could not delete report', description: error.message, color: 'error' })
    return
  }
  if (loaded.value?.id === r.id) loaded.value = null
  refreshSaved()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-4">
      <h1 class="text-2xl font-semibold">Reports</h1>
      <div class="ml-auto flex items-center gap-2">
        <UDropdownMenu v-if="saved?.length" :items="savedItems">
          <UButton variant="outline" color="neutral" trailing-icon="i-lucide-chevron-down">Saved reports</UButton>
        </UDropdownMenu>
        <UButton variant="outline" icon="i-lucide-save" :disabled="!ran" @click="saving = true;">Save</UButton>
        <UButton v-if="canDelete" variant="ghost" color="neutral" icon="i-lucide-trash-2" aria-label="Delete saved report" @click="removeLoaded" />
      </div>
    </div>

    <UCard>
      <div class="grid gap-4 md:grid-cols-4">
        <UFormField label="Source" class="md:col-span-2">
          <USelect v-model="config.source" :items="SOURCES" class="w-full" />
        </UFormField>
        <UFormField label="From">
          <UInput v-model="config.from" type="date" class="w-full" />
        </UFormField>
        <UFormField label="To">
          <UInput v-model="config.to" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Client">
          <USelectMenu v-model="config.client" :items="clientOptions" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="Project">
          <USelectMenu v-model="config.project" :items="projectOptions" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="Person">
          <USelectMenu v-model="config.person" :items="personOptions" value-key="value" class="w-full" />
        </UFormField>
        <UFormField v-if="config.source === 'time_monthly_all'" label="Group by" class="md:col-span-4">
          <UCheckboxGroup v-model="config.groupBy" :items="GROUPS" orientation="horizontal" />
        </UFormField>
      </div>
      <template #footer>
        <div class="flex items-center gap-3">
          <span v-if="loaded" class="text-sm text-muted">Loaded: {{ loaded.name }}</span>
          <UButton class="ml-auto" icon="i-lucide-play" :loading="running" @click="run">Run report</UButton>
        </div>
      </template>
    </UCard>

    <UCard v-if="ran" :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex items-center gap-3">
          <h2 class="font-semibold">Results</h2>
          <span class="text-sm text-muted tabular-nums">{{ rows.length.toLocaleString() }} rows</span>
          <UButton class="ml-auto" variant="outline" icon="i-lucide-download" :disabled="!rows.length" @click="exportCsv">Export CSV</UButton>
        </div>
      </template>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr class="border-b border-default">
              <th v-for="c in columns" :key="c.key" class="px-4 py-2 font-medium" :class="c.kind === 'hours' || c.kind === 'money' ? 'text-right' : ''">{{ c.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="(r.id as string) ?? i" class="border-b border-default last:border-0">
              <td v-for="c in columns" :key="c.key" class="px-4 py-1.5" :class="c.kind === 'hours' || c.kind === 'money' ? 'text-right tabular-nums' : c.key === 'notes' ? 'max-w-xs truncate text-muted' : ''">
                {{ show(c, r[c.key]) }}
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td :colspan="columns.length" class="px-4 py-8 text-center text-muted">Nothing matches.</td>
            </tr>
          </tbody>
          <tfoot v-if="rows.length">
            <tr class="border-t border-default font-medium">
              <td v-for="(c, i) in columns" :key="c.key" class="px-4 py-2" :class="c.kind === 'hours' || c.kind === 'money' ? 'text-right tabular-nums' : ''">
                <template v-if="i === 0 && !(c.kind === 'hours' || c.kind === 'money')">Total</template>
                <template v-else-if="c.kind === 'hours' || c.kind === 'money'">{{ show(c, totals[c.key]) }}</template>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </UCard>

    <UModal v-model:open="saving" title="Save report">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required>
            <UInput v-model="saveState.name" class="w-full" placeholder="Hours by client, this year" autofocus />
          </UFormField>
          <USwitch v-model="saveState.is_shared" label="Share with other admins" />
          <p class="text-xs text-muted">Saves the source, filters, and grouping. Dates are saved as picked, not relative.</p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="saving = false;">Cancel</UButton>
            <UButton :disabled="!saveState.name.trim()" @click="save">Save</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
