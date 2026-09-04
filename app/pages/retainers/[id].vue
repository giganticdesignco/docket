<script setup lang="ts">
import type { Database } from '~~/shared/types/database'

// One retainer as a contract: every period that chains onto this one
// (same client, project, and name), a summary of where it stands, and
// the entries behind any period. The route id is any period's id.
type Period = Database['public']['Functions']['retainer_status']['Returns'][number]
type Entry = Database['public']['Functions']['retainer_period_detail']['Returns'][number]

const route = useRoute()
const id = route.params.id as string
const supabase = useSupabaseClient()
const toast = useToast()

const { data: all } = await useAsyncData(`retainer-${id}-chain`, async () => {
  const { data, error } = await supabase.rpc('retainer_status')
  if (error) throw error
  return data
}, fresh)

const chainKey = retainerChainKey
const seed = computed(() => all.value?.find(r => r.retainer_id === id) ?? null)
if (!seed.value) throw createError({ statusCode: 404, statusMessage: 'Retainer not found' })
const periods = computed(() => (all.value ?? []).filter(r => chainKey(r) === chainKey(seed.value!)).sort((a, b) => b.period_start.localeCompare(a.period_start)))
const today = todayString()
const current = computed(() => periods.value.find(p => p.period_start <= today && p.period_end >= today) ?? periods.value[0]!)
const status = computed(() => (periods.value.some(p => p.period_start <= today && p.period_end >= today) ? 'current' : periods.value[0]!.period_end < today ? 'ended' : 'upcoming'))
const startedOn = computed(() => periods.value[periods.value.length - 1]!.period_start)

// Term and renewal live on the retainer row, not in retainer_status().
const __s1 = useAsyncData(`retainer-${id}-terms`, async () => {
  const { data } = await supabase.from('retainers').select('term, renews').eq('id', periods.value[0]!.retainer_id).maybeSingle()
  return data
}, fresh)
const __s2 = useAsyncData(`retainer-${id}-client`, async () => {
  const { data } = await supabase.from('clients').select('id, name').eq('id', seed.value!.client_id).single()
  return data
}, fresh)
const __s3 = useAsyncData(`retainer-${id}-project`, async () => {
  if (!seed.value!.project_id) return null
  const { data } = await supabase.from('projects').select('id, name').eq('id', seed.value!.project_id).single()
  return data
}, fresh)
await Promise.all([__s1, __s2, __s3])
const { data: terms } = __s1
const { data: client } = __s2
const { data: project } = __s3
useHead({ title: () => seed.value?.name ?? 'Retainer' })
useAssistantScreen(() => ({ client: client.value?.name, retainer: seed.value?.name }))

const qty = retainerQty
const pct = retainerPct
const periodState = (r: Period) => periodStatus(r, today)

// ---------- drill-down ----------
const open = ref<string | null>(null)
const entries = ref<Record<string, Entry[] | null>>({})
async function toggle(r: Period) {
  if (open.value === r.retainer_id) { open.value = null; return }
  open.value = r.retainer_id
  if (entries.value[r.retainer_id] !== undefined) return
  entries.value[r.retainer_id] = null
  const { data, error } = await supabase.rpc('retainer_period_detail', { p_retainer_id: r.retainer_id })
  if (error) { toast.add({ title: 'Could not load the entries', description: error.message, color: 'error' }); entries.value[r.retainer_id] = []; return }
  entries.value[r.retainer_id] = data
}
// A client-wide retainer shows which projects it paid for.
const grouped = (rows: Entry[]) => {
  const g = new Map<string, { name: string, hours: number, amount: number | null, rows: Entry[] }>()
  for (const e of rows) {
    const x = g.get(e.project_id) ?? { name: e.project_name, hours: 0, amount: null, rows: [] }
    x.hours += e.hours
    if (e.amount != null) x.amount = (x.amount ?? 0) + e.amount
    x.rows.push(e)
    g.set(e.project_id, x)
  }
  return [...g.values()].sort((a, b) => b.hours - a.hours)
}
const seeMoney = computed(() => useCurrentUser().can('field:amounts'))
</script>

<template>
  <div v-if="seed" class="space-y-6">
    <AppCrumbs :items="[{ label: 'Clients', to: '/clients' }, { label: client?.name ?? '', to: `/clients/${seed.client_id}` }]" class="mb-3" />
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-2xl font-semibold">{{ seed.name }}</h1>
        <div class="text-sm text-muted">
          <NuxtLink :to="`/clients/${seed.client_id}`" class="hover:underline">{{ client?.name }}</NuxtLink>
          &middot;
          <NuxtLink v-if="project" :to="`/projects/${project.id}`" class="hover:underline">{{ project.name }}</NuxtLink>
          <span v-else>Client-wide</span>
        </div>
      </div>
      <UBadge :color="status === 'current' ? 'success' : status === 'upcoming' ? 'info' : 'neutral'" variant="subtle">{{ status }}</UBadge>
      <UBadge v-if="terms && terms.term !== 'custom'" color="neutral" variant="subtle" :title="terms.renews ? 'The next period opens on its own when this one ends' : 'Stops after this period unless renewal is turned back on'">{{ terms.term }}<template v-if="terms.renews">, renews</template><template v-else>, ends</template></UBadge>
    </div>

    <UCard>
      <dl class="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
        <div><dt class="text-muted">Periods</dt><dd>{{ periods.length }}</dd></div>
        <div><dt class="text-muted">Since</dt><dd>{{ shortDate(startedOn) }}</dd></div>
        <div><dt class="text-muted">{{ periodState(current) === 'current' ? 'This period' : 'Latest period' }}</dt><dd class="tabular-nums"><strong>{{ qty(current, current.used) }}</strong> <span class="text-muted">of {{ qty(current, current.available) }}</span></dd></div>
        <div><dt class="text-muted">Left</dt><dd class="tabular-nums" :class="current.remaining < 0 ? 'text-error' : ''">{{ current.remaining < 0 ? qty(current, -current.remaining) + ' over' : qty(current, current.remaining) }}</dd></div>
      </dl>
      <UProgress :model-value="Math.min(pct(current), 100)" :color="burnColor(pct(current))" size="sm" class="mt-3" />
    </UCard>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex items-baseline gap-3">
          <h2 class="font-semibold">Periods</h2>
          <span class="text-xs text-muted">Newest first. Click one for the entries behind it.</span>
        </div>
      </template>
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Period</th>
            <th class="px-2 py-2 text-right font-medium">Allotted</th>
            <th class="px-2 py-2 text-right font-medium">Carried in</th>
            <th class="px-2 py-2 text-right font-medium">Used</th>
            <th class="px-2 py-2 text-right font-medium">Left</th>
            <th class="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="r in periods" :key="r.retainer_id">
            <tr class="cursor-pointer border-b border-default hover:bg-elevated/50" :class="open === r.retainer_id ? 'bg-elevated/40' : ''" @click="toggle(r)">
              <td class="px-4 py-2">
                <span class="inline-flex items-center gap-2">
                  <UIcon :name="open === r.retainer_id ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-dimmed" />
                  <span class="tabular-nums">{{ shortDate(r.period_start) }} to {{ shortDate(r.period_end) }}</span>
                </span>
              </td>
              <td class="px-2 py-2 text-right tabular-nums">{{ qty(r, r.allotted) }}</td>
              <td class="px-2 py-2 text-right tabular-nums text-muted">{{ r.carried_in > 0 ? qty(r, r.carried_in) : '' }}</td>
              <td class="px-2 py-2 text-right tabular-nums">{{ qty(r, r.used) }}</td>
              <td class="px-2 py-2 text-right tabular-nums" :class="r.remaining < 0 ? 'text-error' : ''">{{ r.remaining < 0 ? qty(r, -r.remaining) + ' over' : qty(r, r.remaining) }}</td>
              <td class="px-4 py-2"><UBadge :color="periodState(r) === 'current' ? 'success' : periodState(r) === 'upcoming' ? 'info' : 'neutral'" variant="subtle" size="sm">{{ periodState(r) }}</UBadge></td>
            </tr>
            <tr v-if="open === r.retainer_id" class="border-b border-default">
              <td colspan="6" class="bg-elevated/20 px-4 py-3">
                <p v-if="entries[r.retainer_id] === null" class="text-sm text-muted">Loading</p>
                <p v-else-if="!entries[r.retainer_id]?.length" class="text-sm text-muted">
                  {{ r.used > 0 ? 'Logged before the cutover, so only the total is known.' : 'Nothing logged in this period.' }}
                </p>
                <div v-else class="space-y-4">
                  <div v-for="g in grouped(entries[r.retainer_id]!)" :key="g.name">
                    <div v-if="!seed.project_id" class="mb-1 flex items-baseline gap-2 text-sm">
                      <span class="font-medium">{{ g.name }}</span>
                      <span class="text-xs tabular-nums text-muted">{{ formatHours(g.hours) }}<template v-if="seeMoney && g.amount != null"> &middot; {{ money(g.amount) }}</template></span>
                    </div>
                    <table class="w-full text-xs">
                      <tbody>
                        <tr v-for="e in g.rows" :key="e.entry_id" class="border-t border-default/60">
                          <td class="w-16 whitespace-nowrap py-1 pr-3 tabular-nums">{{ shortDate(e.spent_on) }}</td>
                          <td class="w-36 py-1 pr-3">{{ e.user_name }}</td>
                          <td class="w-36 py-1 pr-3 text-muted">{{ e.task_name }}</td>
                          <td class="max-w-md truncate py-1 pr-3 text-muted">{{ e.notes }}</td>
                          <td class="w-14 py-1 text-right tabular-nums">{{ formatHours(e.hours) }}</td>
                          <td v-if="seeMoney" class="w-20 py-1 pl-3 text-right tabular-nums text-muted">{{ e.amount != null ? money(e.amount) : '' }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </UCard>
  </div>
</template>
