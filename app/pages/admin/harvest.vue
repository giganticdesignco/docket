<script setup lang="ts">
// Harvest import. Years before this one roll up into harvest_archive_monthly;
// this year's entries come in live. Each month is one call to the server
// route so a long run shows progress and survives a Vercel timeout.
// Expenses come in entry by entry for every year, receipts included.
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Harvest import' })

const supabase = useSupabaseClient()
const toast = useToast()

const now = new Date()
const thisYear = now.getFullYear()
const thisMonth = now.getMonth() + 1

const { data: yearly, refresh: refreshYearly } = await useAsyncData('harvest-yearly', async () => {
  const { data, error } = await supabase.from('harvest_archive_yearly').select('*').order('year')
  if (error) throw error
  return data
}, fresh)

const { data: liveCount, refresh: refreshLive } = await useAsyncData('harvest-live-count', async () => {
  const { count, error } = await supabase
    .from('time_entries')
    .select('id', { count: 'exact', head: true })
    .not('harvest_id', 'is', null)
    .gte('spent_on', `${thisYear}-01-01`)
  if (error) throw error
  return count ?? 0
}, fresh)

const { data: expenseCount, refresh: refreshExpenses } = await useAsyncData('harvest-expense-count', async () => {
  const { count, error } = await supabase
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .not('harvest_id', 'is', null)
  if (error) throw error
  return count ?? 0
}, fresh)

const archiveFrom = ref(2015)
const archiveTo = ref(thisYear - 1)
const expensesFrom = ref(thisYear)
const dryRun = ref(false)
const running = ref(false)
const stopRequested = ref(false)
const progress = ref({ done: 0, total: 0, current: '' })

type Mode = 'archive' | 'live' | 'projects' | 'expenses'
type Step = { month: string, mode: Mode }
type Result = {
  month: string
  mode: Mode
  dryRun: boolean
  fetched: number
  skippedRunning: number
  rows?: number
  hours?: number
  amount?: number
  imported?: number
  deleted?: number
  fixedRates?: number
  updatedProjects?: number
  projectsInHarvest?: number
  relinkError?: string | null
  receipts?: number
  receiptErrors?: string[]
  error?: string
  skippedUsers?: string[]
  created?: { clients: number, projects: number, tasks: number, project_tasks: number, categories?: number }
}
const log = ref<Result[]>([])

const pad = (n: number) => String(n).padStart(2, '0')

function months(fromYear: number, toYear: number, lastMonth = 12) {
  const out: string[] = []
  for (let y = fromYear; y <= toYear; y++) {
    for (let m = 1; m <= (y === toYear ? lastMonth : 12); m++) out.push(`${y}-${pad(m)}`)
  }
  return out
}

async function run(steps: Step[]) {
  running.value = true
  stopRequested.value = false
  log.value = []
  progress.value = { done: 0, total: steps.length, current: '' }
  let mode: Mode = steps[0]?.mode ?? 'live'
  try {
    for (const step of steps) {
      if (stopRequested.value) break
      mode = step.mode
      progress.value.current = step.mode === 'projects' ? 'project details' : step.month
      const res = await $fetch<Result>('/api/harvest/import', { method: 'POST', body: { month: step.month, mode: step.mode, dryRun: dryRun.value } })
      log.value.unshift(res)
      progress.value.done++
    }
    toast.add({ title: stopRequested.value ? 'Stopped' : dryRun.value ? 'Dry run finished' : 'Import finished', color: 'success' })
  } catch (e) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    const message = err.data?.statusMessage ?? err.message ?? 'Unknown error'
    // Keep the failure in the log so it is still visible after the toast goes.
    log.value.unshift({ month: progress.value.current, mode, dryRun: dryRun.value, fetched: 0, skippedRunning: 0, error: message })
    toast.add({ title: `Import stopped at ${progress.value.current}`, description: message, color: 'error' })
  } finally {
    running.value = false
    refreshYearly()
    refreshLive()
    refreshExpenses()
  }
}

const thisMonthKey = `${thisYear}-${pad(thisMonth)}`
const importArchive = () => run(months(archiveFrom.value, archiveTo.value).map(month => ({ month, mode: 'archive' as const })))
// Entries first, then budgets and rates for the projects those entries created.
const syncLive = () => run([
  ...months(thisYear, thisYear, thisMonth).map(month => ({ month, mode: 'live' as const })),
  { month: thisMonthKey, mode: 'projects' as const },
])
const syncProjects = () => run([{ month: thisMonthKey, mode: 'projects' as const }])
const syncExpenses = () => run(months(expensesFrom.value, thisYear, thisMonth).map(month => ({ month, mode: 'expenses' as const })))

const skippedUsers = computed(() => [...new Set(log.value.flatMap(r => r.skippedUsers ?? []))])
const receiptErrors = computed(() => log.value.flatMap(r => r.receiptErrors ?? []))
const num = (n: number | null | undefined) => (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
const money = (n: number | null | undefined) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Harvest import</h1>
        <p class="text-sm text-muted">Past years roll up by month. This year comes in entry by entry and can be re-synced until Harvest is cancelled.</p>
      </div>
      <USwitch v-model="dryRun" label="Dry run" size="sm" class="ml-auto" :disabled="running" />
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <UCard>
        <template #header>
          <h2 class="font-semibold">Archive (before {{ thisYear }})</h2>
        </template>
        <div class="space-y-4">
          <div class="flex items-end gap-3">
            <UFormField label="From year" class="w-28">
              <UInput v-model.number="archiveFrom" type="number" :min="2010" :max="thisYear - 1" class="w-full" :disabled="running" />
            </UFormField>
            <UFormField label="To year" class="w-28">
              <UInput v-model.number="archiveTo" type="number" :min="2010" :max="thisYear - 1" class="w-full" :disabled="running" />
            </UFormField>
            <UButton icon="i-lucide-download" :disabled="running || archiveFrom > archiveTo" @click="importArchive">Import archive</UButton>
          </div>
          <table class="w-full text-sm">
            <thead class="text-left text-muted">
              <tr class="border-b border-default">
                <th class="px-2 py-1 font-medium">Year</th>
                <th class="px-2 py-1 text-right font-medium">Rows</th>
                <th class="px-2 py-1 text-right font-medium">Hours</th>
                <th class="px-2 py-1 text-right font-medium">Billable</th>
                <th class="px-2 py-1 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="y in yearly" :key="y.year!" class="border-b border-default last:border-0">
                <td class="px-2 py-1">{{ y.year }}</td>
                <td class="px-2 py-1 text-right tabular-nums">{{ num(y.row_count) }}</td>
                <td class="px-2 py-1 text-right tabular-nums">{{ num(y.hours) }}</td>
                <td class="px-2 py-1 text-right tabular-nums">{{ num(y.billable_hours) }}</td>
                <td class="px-2 py-1 text-right tabular-nums">{{ money(y.amount) }}</td>
              </tr>
              <tr v-if="!yearly?.length">
                <td colspan="5" class="px-2 py-4 text-center text-muted">Nothing imported yet.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">Live ({{ thisYear }})</h2>
        </template>
        <div class="space-y-4">
          <p class="text-sm">
            <strong class="tabular-nums">{{ num(liveCount) }}</strong> entries this year came from Harvest.
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton icon="i-lucide-refresh-cw" :disabled="running" @click="syncLive">Sync January to {{ pad(thisMonth) }}</UButton>
            <UButton icon="i-lucide-briefcase" variant="outline" :disabled="running" @click="syncProjects">Sync project details</UButton>
          </div>
          <p class="text-xs text-muted">
            Entries for people without a Docket profile are skipped and listed below. Add them in Supabase Auth, then sync again.
            Project details (budget, rate, billing method, active) are copied from Harvest at the end of every sync.
          </p>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">Expenses</h2>
        </template>
        <div class="space-y-4">
          <p class="text-sm">
            <strong class="tabular-nums">{{ num(expenseCount) }}</strong> expenses came from Harvest.
          </p>
          <div class="flex items-end gap-3">
            <UFormField label="From year" class="w-28">
              <UInput v-model.number="expensesFrom" type="number" :min="2010" :max="thisYear" class="w-full" :disabled="running" />
            </UFormField>
            <UButton icon="i-lucide-receipt" :disabled="running || expensesFrom > thisYear" @click="syncExpenses">Sync expenses</UButton>
          </div>
          <p class="text-xs text-muted">
            Every expense from that January to today, keyed on its Harvest id, with receipts copied into the receipts bucket. Re-running is safe.
            Expenses for people without a Docket profile are skipped.
          </p>
        </div>
      </UCard>
    </div>

    <UCard v-if="running || log.length">
      <template #header>
        <div class="flex items-center gap-4">
          <h2 class="font-semibold">
            <span v-if="running">Importing {{ progress.current }}</span>
            <span v-else>Last run</span>
          </h2>
          <span class="text-sm text-muted tabular-nums">{{ progress.done }} / {{ progress.total }} months</span>
          <UButton v-if="running" size="xs" variant="outline" color="neutral" class="ml-auto" @click="stopRequested = true;">Stop after this month</UButton>
        </div>
      </template>
      <UProgress v-if="running" :value="progress.done" :max="progress.total" class="mb-4" />

      <div v-if="skippedUsers.length" class="mb-4 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
        <strong>Skipped, no Docket profile:</strong> {{ skippedUsers.join(', ') }}
      </div>
      <div v-if="receiptErrors.length" class="mb-4 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
        <strong>Receipts not copied:</strong>
        <ul class="mt-1 list-disc pl-5">
          <li v-for="(err, i) in receiptErrors" :key="i">{{ err }}</li>
        </ul>
      </div>

      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-2 py-1 font-medium">Month</th>
            <th class="px-2 py-1 font-medium">Mode</th>
            <th class="px-2 py-1 text-right font-medium">Fetched</th>
            <th class="px-2 py-1 text-right font-medium">Rows</th>
            <th class="px-2 py-1 text-right font-medium">Total</th>
            <th class="px-2 py-1 text-right font-medium">Deleted</th>
            <th class="px-2 py-1 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in log" :key="r.month + r.mode" class="border-b border-default last:border-0">
            <td class="px-2 py-1 tabular-nums">{{ r.mode === 'projects' ? 'Projects' : r.month }}</td>
            <td class="px-2 py-1">{{ r.mode }}<span v-if="r.dryRun" class="text-muted"> (dry)</span></td>
            <td class="px-2 py-1 text-right tabular-nums">{{ r.fetched }}<span v-if="r.skippedRunning" class="text-muted"> ({{ r.skippedRunning }} running)</span></td>
            <td class="px-2 py-1 text-right tabular-nums">{{ r.mode === 'archive' ? r.rows : r.mode === 'projects' ? r.updatedProjects : r.imported }}</td>
            <td class="px-2 py-1 text-right tabular-nums">{{ r.mode === 'archive' ? num(r.hours) + ' h' : r.mode === 'expenses' ? money(r.amount) : '' }}</td>
            <td class="px-2 py-1 text-right tabular-nums">{{ r.mode === 'live' || r.mode === 'expenses' ? r.deleted : '' }}</td>
            <td class="px-2 py-1 text-muted">
              <span v-if="r.error" class="text-error">Failed: {{ r.error }}</span>
              <span v-else-if="r.created && (r.created.clients || r.created.projects || r.created.tasks || r.created.project_tasks || r.created.categories)">
                {{ r.created.clients }} clients, {{ r.created.projects }} projects,
                <template v-if="r.mode === 'expenses'">{{ r.created.categories ?? 0 }} categories</template>
                <template v-else>{{ r.created.tasks }} tasks, {{ r.created.project_tasks }} assignments</template>
              </span>
              <span v-if="r.mode === 'expenses' && r.receipts" class="text-muted"> {{ r.receipts }} receipts{{ r.dryRun ? ' to copy' : ' copied' }}</span>
              <span v-if="r.relinkError" class="text-warning"> Archive relink skipped: {{ r.relinkError }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </UCard>
  </div>
</template>
