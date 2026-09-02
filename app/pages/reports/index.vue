<script setup lang="ts">
import type { CsvColumn } from '~/composables/useCsv'

// The Harvest-style report: a timeframe across the top, a strip of
// totals, a chart, then one table under four tabs. Clicking a row
// narrows the filters and moves to the next tab, so Clients leads to a
// client's projects, projects to their tasks and people. Everything
// lives in the URL so a view can be bookmarked or sent around.
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Reports' })

const supabase = useSupabaseClient()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const csv = useCsv()

type Kind = 'time' | 'expenses'
type Range = 'week' | 'semimonth' | 'month' | 'quarter' | 'year' | 'custom'
type Tab = 'client' | 'project' | 'task' | 'category' | 'person'
type Billable = 'all' | 'yes' | 'no'

const q = (k: string) => (typeof route.query[k] === 'string' ? route.query[k] as string : '')
const state = reactive({
  kind: (q('kind') || 'time') as Kind,
  range: (q('range') || 'month') as Range,
  from: q('from') || startOfMonth(todayString()),
  to: q('to') || endOfMonth(todayString()),
  tab: (q('tab') || 'client') as Tab,
  client: q('client'),
  project: q('project'),
  person: q('person'),
  task: q('task'),
  category: q('category'),
  billable: (q('billable') || 'all') as Billable,
})
watch(state, () => {
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries(state)) if (v && v !== 'all') query[k] = v
  router.replace({ query })
}, { deep: true })

// ---------- timeframe ----------

const RANGES: { value: Range, label: string }[] = [
  { value: 'week', label: 'Week' }, { value: 'semimonth', label: 'Semimonth' }, { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' }, { value: 'year', label: 'Year' }, { value: 'custom', label: 'Custom' },
]
function bounds(range: Range, anchor: string): [string, string] {
  const d = parseDateString(anchor)
  const y = d.getFullYear()
  const m = d.getMonth()
  if (range === 'week') { const w = weekDays(anchor); return [w[0]!, w[6]!] }
  if (range === 'semimonth') return d.getDate() <= 15 ? [startOfMonth(anchor), anchor.slice(0, 8) + '15'] : [anchor.slice(0, 8) + '16', endOfMonth(anchor)]
  if (range === 'month') return [startOfMonth(anchor), endOfMonth(anchor)]
  if (range === 'quarter') { const qm = m - (m % 3); return [toDateString(new Date(y, qm, 1)), toDateString(new Date(y, qm + 3, 0))] }
  if (range === 'year') return [`${y}-01-01`, `${y}-12-31`]
  return [state.from, state.to]
}
function setRange(range: Range) {
  state.range = range
  if (range !== 'custom') [state.from, state.to] = bounds(range, state.from <= todayString() && state.to >= todayString() ? todayString() : state.from)
}
function step(dir: -1 | 1) {
  if (state.range === 'custom') {
    const len = Math.round((parseDateString(state.to).getTime() - parseDateString(state.from).getTime()) / 86_400_000) + 1
    state.from = addDays(state.from, dir * len)
    state.to = addDays(state.to, dir * len)
    return
  }
  const anchor = dir < 0 ? addDays(state.from, -1) : addDays(state.to, 1)
  ;[state.from, state.to] = bounds(state.range, anchor)
}
const monthYear = (s: string) => parseDateString(s).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
const periodLabel = computed(() => {
  const d = parseDateString(state.from)
  if (state.range === 'month') return monthYear(state.from)
  if (state.range === 'year') return String(d.getFullYear())
  if (state.range === 'quarter') return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
  const sameYear = state.from.slice(0, 4) === state.to.slice(0, 4)
  return `${shortDate(state.from)}${sameYear ? '' : ', ' + state.from.slice(0, 4)} to ${shortDate(state.to)}, ${state.to.slice(0, 4)}`
})
const days = computed(() => Math.round((parseDateString(state.to).getTime() - parseDateString(state.from).getTime()) / 86_400_000) + 1)

// ---------- filters ----------

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
const { data: tasks } = await useAsyncData('report-tasks', async () => {
  const { data, error } = await supabase.from('tasks').select('name').order('name')
  if (error) throw error
  return data
}, fresh)
const { data: categories } = await useAsyncData('report-categories', async () => {
  const { data, error } = await supabase.from('expense_categories').select('name').order('name')
  if (error) throw error
  return data
}, fresh)

// Reka menus refuse an empty-string value, so "any" is a sentinel.
const ALL = '__all__'
type FilterKey = 'client' | 'project' | 'person' | 'task' | 'category'
const pick = (key: FilterKey) => computed({
  get: () => state[key] || ALL,
  set: (v: string) => { state[key] = v === ALL ? '' : v },
})
const clientPick = pick('client')
const projectPick = pick('project')
const personPick = pick('person')
const taskPick = pick('task')
const categoryPick = pick('category')
const opts = (all: string, names: string[]) => [{ label: all, value: ALL }, ...names.map(n => ({ label: n, value: n }))]
const clientOptions = computed(() => opts('All clients', (clients.value ?? []).map(c => c.name)))
const projectOptions = computed(() => [
  { label: 'All projects', value: ALL },
  ...(projects.value ?? [])
    .filter(p => !state.client || p.clients?.name === state.client)
    .map(p => ({ label: state.client ? p.name : `${p.clients?.name} / ${p.name}`, value: p.name })),
])
const personOptions = computed(() => opts('Everyone', (people.value ?? []).map(p => p.full_name)))
const taskOptions = computed(() => opts('All tasks', (tasks.value ?? []).map(t => t.name)))
const categoryOptions = computed(() => opts('All categories', (categories.value ?? []).map(c => c.name)))
const BILLABLE: { value: Billable, label: string }[] = [{ value: 'all', label: 'Billable and not' }, { value: 'yes', label: 'Billable only' }, { value: 'no', label: 'Non-billable only' }]
watch(() => state.client, () => { if (state.project && !projectOptions.value.some(o => o.value === state.project)) state.project = '' })

const filterChips = computed(() => ([
  ['client', state.client], ['project', state.project], ['person', state.person], ['task', state.task], ['category', state.category],
] as [FilterKey, string][]).filter(([, v]) => v))
function clearFilters() {
  state.client = ''
  state.project = ''
  state.person = ''
  state.task = ''
  state.category = ''
  state.billable = 'all'
}

// ---------- tabs ----------

const TABS = computed<{ value: Tab, label: string }[]>(() => [
  { value: 'client', label: 'Clients' },
  { value: 'project', label: 'Projects' },
  state.kind === 'time' ? { value: 'task', label: 'Tasks' } : { value: 'category', label: 'Categories' },
  { value: 'person', label: 'Team' },
])
watch(() => state.kind, (kind) => {
  if (kind === 'time' && state.tab === 'category') state.tab = 'task'
  if (kind === 'expenses' && state.tab === 'task') state.tab = 'category'
})
function setKind(kind: Kind) { state.kind = kind }

// ---------- data ----------

type Row = { key: string, label: string, sublabel: string | null, hours?: number, billable_hours?: number, amount?: number, billable_amount: number, uninvoiced_amount: number }
const rpcArgs = computed(() => ({
  p_from: state.from,
  p_to: state.to,
  p_client: state.client || undefined,
  p_project: state.project || undefined,
  p_person: state.person || undefined,
  p_billable: state.billable === 'all' ? undefined : state.billable === 'yes',
}))
const yearAgo = (s: string) => `${Number(s.slice(0, 4)) - 1}${s.slice(4)}`.replace(/-02-29$/, '-02-28')

async function fetchRows(group: string): Promise<Row[]> {
  if (state.kind === 'time') {
    const { data, error } = await supabase.rpc('report_time', { ...rpcArgs.value, p_group: group, p_task: state.task || undefined })
    if (error) throw error
    return data as Row[]
  }
  const { data, error } = await supabase.rpc('report_expenses', { ...rpcArgs.value, p_group: group, p_category: state.category || undefined })
  if (error) throw error
  return data as Row[]
}
type Rollup = { hours: number, billable_hours: number, billable_amount: number, uninvoiced_amount: number, expenses: number }
// Time uses report_rollup. Expenses sum their own rows so the strip
// honours the category filter, which the time rollup does not know.
async function fetchRollup(from: string, to: string): Promise<Rollup> {
  if (state.kind === 'time') {
    const { data, error } = await supabase.rpc('report_rollup', { ...rpcArgs.value, p_from: from, p_to: to, p_task: state.task || undefined }).single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase.rpc('report_expenses', { ...rpcArgs.value, p_from: from, p_to: to, p_group: 'month', p_category: state.category || undefined })
  if (error) throw error
  const sum = (k: 'amount' | 'billable_amount' | 'uninvoiced_amount') => data.reduce((t, r) => t + Number(r[k]), 0)
  return { hours: 0, billable_hours: 0, billable_amount: sum('billable_amount'), uninvoiced_amount: sum('uninvoiced_amount'), expenses: sum('amount') }
}

const key = computed(() => JSON.stringify([state.kind, state.tab, state.from, state.to, state.client, state.project, state.person, state.task, state.category, state.billable]))
const { data: report, status } = await useAsyncData('report', async () => {
  try {
    const seriesGroup = days.value <= 31 ? 'day' : days.value <= 400 ? 'week' : 'month'
    // A period still in progress compares against the same days last
    // year, not the whole of it.
    const compareTo = state.to > todayString() ? todayString() : state.to
    const [rows, series, now, then] = await Promise.all([
      fetchRows(state.tab),
      fetchRows(seriesGroup),
      fetchRollup(state.from, state.to),
      fetchRollup(yearAgo(state.from), yearAgo(compareTo)),
    ])
    return { rows, series, seriesGroup, now, then }
  } catch (e) {
    toast.add({ title: 'Report failed', description: (e as Error).message, color: 'error' })
    return null
  }
}, { ...fresh, watch: [key] })
const loading = computed(() => status.value === 'pending')
const rows = computed(() => report.value?.rows ?? [])

// ---------- rollup strip ----------

const money = (n: number) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// h:mm like the rest of the app, with a thousands separator since a
// year of everyone's time runs to five figures.
const hoursText = (h: number) => formatHours(h).replace(/^(\d+)/, m => Number(m).toLocaleString())
const money0 = (n: number) => `$${Math.round(Number(n)).toLocaleString()}`
type Stat = { label: string, value: string, then: number, now: number }
const stats = computed<Stat[]>(() => {
  const now = report.value?.now
  const then = report.value?.then
  if (!now || !then) return []
  const s = (label: string, k: keyof typeof now, fmt: (n: number) => string) => ({ label, value: fmt(Number(now[k])), now: Number(now[k]), then: Number(then[k]) })
  return state.kind === 'time'
    ? [
        s('Total hours', 'hours', hoursText),
        s('Billable hours', 'billable_hours', hoursText),
        s('Billable amount', 'billable_amount', money0),
        s('Uninvoiced amount', 'uninvoiced_amount', money0),
        s('Expenses', 'expenses', money0),
      ]
    : [
        s('Expenses', 'expenses', money0),
        s('Billable expenses', 'billable_amount', money0),
        s('Uninvoiced expenses', 'uninvoiced_amount', money0),
      ]
})
function delta(st: Stat): { text: string, color: string } {
  if (!st.then) return { text: 'nothing last year', color: 'text-muted' }
  const pct = Math.round((st.now - st.then) / st.then * 100)
  const toDate = state.to > todayString() ? ' to date' : ''
  return { text: `${pct >= 0 ? '+' : ''}${pct}% vs last year${toDate}`, color: pct >= 0 ? 'text-success' : 'text-error' }
}

// ---------- chart ----------

type Bar = { key: string, label: string, total: number, billable: number }
const bars = computed<Bar[]>(() => (report.value?.series ?? []).map(r => ({
  key: r.key,
  label: r.label,
  total: Number(state.kind === 'time' ? r.hours : r.amount),
  billable: Number(state.kind === 'time' ? r.billable_hours : r.billable_amount),
})))
const chartMax = computed(() => Math.max(1, ...bars.value.map(b => b.total)))
const barLabel = (b: Bar) => {
  const g = report.value?.seriesGroup
  const when = g === 'day' ? shortDate(b.key) : g === 'week' ? `Week of ${shortDate(b.key)}` : monthYear(b.key)
  const amount = state.kind === 'time' ? `${hoursText(b.total)} (${hoursText(b.billable)} billable)` : `${money(b.total)} (${money(b.billable)} billable)`
  return `${when}: ${amount}`
}
const axisLabel = (b: Bar, i: number) => {
  const g = report.value?.seriesGroup
  if (g === 'day') return days.value <= 7 ? dayName(b.key) : (i % 3 === 0 ? shortDate(b.key) : '')
  if (g === 'week') return i % 4 === 0 ? shortDate(b.key) : ''
  return parseDateString(b.key).toLocaleDateString('en-US', { month: 'short' })
}

// ---------- table ----------

const columns = computed<CsvColumn[]>(() => state.kind === 'time'
  ? [
      { key: 'label', label: TABS.value.find(t => t.value === state.tab)?.label.replace(/s$/, '') ?? 'Name' },
      { key: 'hours', label: 'Hours', kind: 'hours' },
      { key: 'billable_hours', label: 'Billable hours', kind: 'hours' },
      { key: 'billable_amount', label: 'Billable amount', kind: 'money' },
      { key: 'uninvoiced_amount', label: 'Uninvoiced amount', kind: 'money' },
    ]
  : [
      { key: 'label', label: TABS.value.find(t => t.value === state.tab)?.label.replace(/ies$/, 'y').replace(/s$/, '') ?? 'Name' },
      { key: 'amount', label: 'Amount', kind: 'money' },
      { key: 'billable_amount', label: 'Billable amount', kind: 'money' },
      { key: 'uninvoiced_amount', label: 'Uninvoiced amount', kind: 'money' },
    ])
const totals = computed(() => {
  const t: Record<string, number> = {}
  for (const c of columns.value) if (c.kind) t[c.key] = round2(rows.value.reduce((s, r) => s + Number((r as unknown as Record<string, unknown>)[c.key] ?? 0), 0))
  return t
})
function show(c: CsvColumn, v: unknown) {
  if (v == null || v === '') return ''
  if (c.kind === 'hours') return hoursText(Number(v))
  if (c.kind === 'money') return money(Number(v))
  return String(v)
}

// A row leads to the next level down: client to its projects, project to
// its tasks (or categories), task to the people who did it, person to
// their projects.
function drill(r: Row) {
  if (state.tab === 'client') { state.client = r.label; state.tab = 'project' }
  else if (state.tab === 'project') { if (r.sublabel) state.client = r.sublabel; state.project = r.label; state.tab = state.kind === 'time' ? 'task' : 'category' }
  else if (state.tab === 'task') { state.task = r.label; state.tab = 'person' }
  else if (state.tab === 'category') { state.category = r.label; state.tab = 'person' }
  else { state.person = r.label; state.tab = 'project' }
}

function exportCsv() {
  const name = `${state.kind}-${state.tab}-${state.from}-to-${state.to}.csv`
  const plain = rows.value.map(r => ({ ...r, label: r.sublabel ? `${r.sublabel} / ${r.label}` : r.label }))
  csv.download(name, csv.toCsv(columns.value, plain, totals.value))
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-semibold">Reports</h1>
      <div class="flex gap-1 rounded-md bg-elevated p-0.5">
        <UButton size="xs" :variant="state.kind === 'time' ? 'solid' : 'ghost'" :color="state.kind === 'time' ? 'primary' : 'neutral'" @click="setKind('time')">Time</UButton>
        <UButton size="xs" :variant="state.kind === 'expenses' ? 'solid' : 'ghost'" :color="state.kind === 'expenses' ? 'primary' : 'neutral'" @click="setKind('expenses')">Expenses</UButton>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <UButton to="/reports/detailed" variant="outline" color="neutral" icon="i-lucide-table-2">Detailed report</UButton>
        <UButton variant="outline" icon="i-lucide-download" :disabled="!rows.length" @click="exportCsv">Export CSV</UButton>
      </div>
    </div>

    <UCard>
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex gap-1">
          <UButton v-for="r in RANGES" :key="r.value" size="xs" :variant="state.range === r.value ? 'solid' : 'ghost'" :color="state.range === r.value ? 'primary' : 'neutral'" @click="setRange(r.value)">{{ r.label }}</UButton>
        </div>
        <div class="flex items-center gap-1">
          <UButton icon="i-lucide-chevron-left" variant="ghost" color="neutral" size="sm" aria-label="Previous period" @click="step(-1)" />
          <span class="min-w-40 text-center text-sm font-medium tabular-nums">{{ periodLabel }}</span>
          <UButton icon="i-lucide-chevron-right" variant="ghost" color="neutral" size="sm" aria-label="Next period" @click="step(1)" />
        </div>
        <div v-if="state.range === 'custom'" class="flex items-center gap-2">
          <UInput v-model="state.from" type="date" size="sm" />
          <span class="text-sm text-muted">to</span>
          <UInput v-model="state.to" type="date" size="sm" />
        </div>
        <UButton v-if="loading" loading variant="ghost" color="neutral" size="sm" aria-label="Loading" />
      </div>
      <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <USelectMenu v-model="clientPick" :items="clientOptions" value-key="value" size="sm" />
        <USelectMenu v-model="projectPick" :items="projectOptions" value-key="value" size="sm" />
        <USelectMenu v-if="state.kind === 'time'" v-model="taskPick" :items="taskOptions" value-key="value" size="sm" />
        <USelectMenu v-else v-model="categoryPick" :items="categoryOptions" value-key="value" size="sm" />
        <USelectMenu v-model="personPick" :items="personOptions" value-key="value" size="sm" />
        <USelect v-model="state.billable" :items="BILLABLE" size="sm" />
      </div>
    </UCard>

    <div v-if="stats.length" class="grid gap-3 sm:grid-cols-2" :class="stats.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-3'">
      <UCard v-for="st in stats" :key="st.label" :ui="{ body: 'p-3 sm:p-4' }">
        <div class="text-xs text-muted">{{ st.label }}</div>
        <div class="text-xl font-semibold tabular-nums">{{ st.value }}</div>
        <div class="text-xs" :class="delta(st).color">{{ delta(st).text }}</div>
      </UCard>
    </div>

    <UCard v-if="bars.length" :ui="{ body: 'p-3 sm:p-4' }">
      <div class="flex items-baseline gap-3 text-xs text-muted">
        <span>{{ state.kind === 'time' ? 'Hours' : 'Amount' }} by {{ report?.seriesGroup }}</span>
        <span class="ml-auto flex items-center gap-1"><span class="inline-block size-2 rounded-sm bg-primary" /> billable</span>
        <span class="flex items-center gap-1"><span class="inline-block size-2 rounded-sm bg-accented" /> non-billable</span>
      </div>
      <svg class="mt-2 block w-full" :viewBox="`0 0 ${Math.max(bars.length * 12, 120)} 100`" preserveAspectRatio="none" height="120" role="img" aria-label="Chart">
        <g v-for="(b, i) in bars" :key="b.key">
          <title>{{ barLabel(b) }}</title>
          <rect :x="i * 12 + 1" :y="88 - (b.total / chartMax) * 84" width="10" :height="(b.total / chartMax) * 84" class="fill-accented" />
          <rect :x="i * 12 + 1" :y="88 - (b.billable / chartMax) * 84" width="10" :height="(b.billable / chartMax) * 84" class="fill-primary" />
        </g>
        <line x1="0" y1="88.5" :x2="Math.max(bars.length * 12, 120)" y2="88.5" class="stroke-default" stroke-width="0.5" />
      </svg>
      <div class="flex text-[10px] text-muted">
        <span v-for="(b, i) in bars" :key="b.key" class="flex-1 truncate">{{ axisLabel(b, i) }}</span>
      </div>
    </UCard>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex gap-1">
            <UButton v-for="t in TABS" :key="t.value" size="sm" :variant="state.tab === t.value ? 'solid' : 'ghost'" :color="state.tab === t.value ? 'primary' : 'neutral'" @click="state.tab = t.value;">{{ t.label }}</UButton>
          </div>
          <div v-if="filterChips.length || state.billable !== 'all'" class="flex flex-wrap items-center gap-1 text-sm">
            <UBadge v-for="[k, v] in filterChips" :key="k" color="neutral" variant="subtle" class="gap-1">
              {{ v }}
              <button type="button" class="ml-0.5 opacity-60 hover:opacity-100" :aria-label="`Remove ${k} filter`" @click="state[k] = '';">×</button>
            </UBadge>
            <UBadge v-if="state.billable !== 'all'" color="neutral" variant="subtle">{{ state.billable === 'yes' ? 'Billable only' : 'Non-billable only' }}</UBadge>
            <UButton size="xs" variant="ghost" color="neutral" @click="clearFilters">Clear</UButton>
          </div>
          <span class="ml-auto text-sm text-muted tabular-nums">{{ rows.length.toLocaleString() }} rows</span>
        </div>
      </template>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr class="border-b border-default">
              <th v-for="c in columns" :key="c.key" class="px-4 py-2 font-medium" :class="c.kind ? 'text-right' : ''">{{ c.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.key" class="cursor-pointer border-b border-default last:border-0 hover:bg-elevated/50" :title="`Show ${r.label} by ${TABS.find(t => t.value === (state.tab === 'client' ? 'project' : state.tab === 'project' ? (state.kind === 'time' ? 'task' : 'category') : state.tab === 'person' ? 'project' : 'person'))?.label.toLowerCase()}`" @click="drill(r)">
              <td v-for="c in columns" :key="c.key" class="px-4 py-1.5" :class="c.kind ? 'text-right tabular-nums' : ''">
                <template v-if="c.key === 'label'">
                  <span class="font-medium">{{ r.label || 'No task' }}</span>
                  <span v-if="r.sublabel" class="ml-2 text-xs text-muted">{{ r.sublabel }}</span>
                </template>
                <template v-else>{{ show(c, (r as unknown as Record<string, unknown>)[c.key]) }}</template>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td :colspan="columns.length" class="px-4 py-8 text-center text-muted">{{ loading ? 'Loading' : 'Nothing in this period.' }}</td>
            </tr>
          </tbody>
          <tfoot v-if="rows.length">
            <tr class="border-t border-default font-medium">
              <td v-for="(c, i) in columns" :key="c.key" class="px-4 py-2" :class="c.kind ? 'text-right tabular-nums' : ''">
                <template v-if="i === 0">Total</template>
                <template v-else>{{ show(c, totals[c.key]) }}</template>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </UCard>
  </div>
</template>
