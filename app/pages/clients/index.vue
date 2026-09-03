<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'

useHead({ title: 'Clients' })
const supabase = useSupabaseClient()
const { can } = useCurrentUser()
const isAdmin = computed(() => can('manage_reference'))

const showInactive = ref(false)
const creating = ref(false)

const __ad1 = useAsyncData('clients', async () => {
  const { data, error } = await supabase.from('clients').select('*').order('name')
  if (error) throw error
  return data
}, fresh)

const __ad2 = useAsyncData('client-project-counts', async () => {
  const { data, error } = await supabase.from('projects').select('client_id').eq('is_active', true)
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const p of data) counts[p.client_id] = (counts[p.client_id] ?? 0) + 1
  return counts
}, fresh)
// Money per client (null without see_money) and the current retainer period.
const __ad3 = useAsyncData('client-money', async () => {
  const { data, error } = await supabase.rpc('client_money')
  if (error) throw error
  return new Map(data.map(r => [r.client_id, r]))
}, fresh)
const __ad4 = useAsyncData('client-retainers', async () => {
  const { data, error } = await supabase.rpc('retainer_status')
  if (error) throw error
  const today = todayString()
  return data.filter(r => r.period_start <= today && r.period_end >= today)
}, fresh)
// Who is on the account: project leads and people on open tasks.
const ws = await useWorkStatuses()
const __ad5 = useAsyncData('client-teams', async () => {
  const [tasks, projects, people] = await Promise.all([
    supabase.from('work_items').select('status, projects(client_id), work_item_assignees(user_id)').limit(5000),
    supabase.from('projects').select('client_id, lead_id').eq('is_active', true).not('lead_id', 'is', null),
    supabase.from('profiles').select('id, full_name').eq('is_active', true),
  ])
  const name = new Map((people.data ?? []).map(p => [p.id, p.full_name]))
  const m = new Map<string, Set<string>>()
  const add = (cid: string | undefined, uid: string | null) => { if (!cid || !uid) return; const set = m.get(cid) ?? new Set<string>(); set.add(uid); m.set(cid, set) }
  for (const p of projects.data ?? []) add(p.client_id, p.lead_id)
  for (const t of tasks.data ?? []) if (!ws.isDone(t.status)) for (const a of t.work_item_assignees) add(t.projects?.client_id, a.user_id)
  return new Map([...m.entries()].map(([cid, set]) => [cid, [...set].map(uid => name.get(uid) ?? '').filter(Boolean).sort()]))
}, fresh)
await Promise.all([__ad1, __ad2, __ad3, __ad4, __ad5])
const { data: clients, refresh } = __ad1
const { data: projectCounts } = __ad2
const { data: moneyById } = __ad3
const { data: retainers } = __ad4
const { data: teams } = __ad5
const team = (id: string) => teams.value?.get(id) ?? []
const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
const unbilled = (id: string) => moneyById.value?.get(id)?.unbilled ?? null
const billed = (id: string) => moneyById.value?.get(id)?.billed_year ?? null
// A client can have more than one retainer running; sum what is left, by basis.
const retainerLeft = (id: string) => {
  const rs = (retainers.value ?? []).filter(r => r.client_id === id)
  if (!rs.length) return null
  const hours = rs.filter(r => r.basis === 'hours').reduce((s, r) => s + r.remaining, 0)
  const dollars = rs.filter(r => r.basis !== 'hours').reduce((s, r) => s + r.remaining, 0)
  return { hours, dollars, hasHours: rs.some(r => r.basis === 'hours'), hasDollars: rs.some(r => r.basis !== 'hours') }
}
const money = (n: number | null) => (n == null ? '' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`)
const retainerText = (id: string) => {
  const r = retainerLeft(id)
  if (!r) return ''
  const parts: string[] = []
  if (r.hasHours) parts.push(r.hours < 0 ? `${formatHours(-r.hours)} over` : `${formatHours(r.hours)} left`)
  if (r.hasDollars) parts.push(r.dollars < 0 ? `${money(-r.dollars)} over` : `${money(r.dollars)} left`)
  return parts.join(', ')
}

const cols = await useColumns<Tables<'clients'>>('clients', [
  { key: 'name', label: 'Name', sort: c => c.name, always: true },
  { key: 'projects', label: 'Active projects', align: 'right', sort: c => projectCounts.value?.[c.id] ?? 0 },
  { key: 'team', label: 'Team', sort: c => team(c.id).join(', ') },
  { key: 'unbilled', label: 'Unbilled', align: 'right', sort: c => unbilled(c.id), permission: 'see_money' },
  { key: 'billed', label: 'Billed this year', align: 'right', sort: c => billed(c.id), permission: 'see_money' },
  { key: 'retainer', label: 'Retainer left', align: 'right', sort: c => { const r = retainerLeft(c.id); return r ? (r.hasHours ? r.hours : r.dollars) : null }, permission: 'see_money' },
  { key: 'status', label: 'Status', sort: c => (c.is_active ? 0 : 1) },
])
const rows = computed(() => cols.sorted(
  (clients.value ?? []).filter(c => showInactive.value || c.is_active),
))

function onSaved(_c: Tables<'clients'>) {
  creating.value = false
  refresh()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-4">
      <h1 class="text-2xl font-semibold">Clients</h1>
      <USwitch v-model="showInactive" label="Show inactive" size="sm" class="ml-auto" />
      <UButton v-if="isAdmin" icon="i-lucide-plus" @click="creating = true;">New client</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="table-scroll"><table class="w-full text-sm">
        <TableHead :cols="cols" />
        <tbody>
          <tr v-for="c in rows" :key="c.id" class="border-b border-default last:border-0">
            <td v-for="col in cols.visible" :key="col.key" class="px-4 py-2" :class="col.align === 'right' ? 'text-right tabular-nums' : ''">
              <NuxtLink v-if="col.key === 'name'" :to="`/clients/${c.id}`" class="font-medium hover:underline">{{ c.name }}</NuxtLink>
              <template v-else-if="col.key === 'projects'">{{ projectCounts?.[c.id] ?? 0 }}</template>
              <span v-else-if="col.key === 'team'" class="flex -space-x-1.5" :title="team(c.id).join(', ')">
                <span v-for="n in team(c.id).slice(0, 6)" :key="n" class="grid size-6 place-items-center rounded-full bg-elevated text-[10px] font-medium ring-2 ring-default">{{ initials(n) }}</span>
                <span v-if="team(c.id).length > 6" class="grid size-6 place-items-center rounded-full bg-accented text-[10px] font-medium ring-2 ring-default">+{{ team(c.id).length - 6 }}</span>
              </span>
              <span v-else-if="col.key === 'unbilled'" :class="(unbilled(c.id) ?? 0) > 0 ? '' : 'text-dimmed'" title="Billable time and expenses not yet on a batch or invoice">{{ unbilled(c.id) ? money(unbilled(c.id)) : '' }}</span>
              <span v-else-if="col.key === 'billed'" title="Invoices sent or paid this year, Docket and Harvest">{{ billed(c.id) ? money(billed(c.id)) : '' }}</span>
              <span v-else-if="col.key === 'retainer'" :class="retainerText(c.id).includes('over') ? 'text-error' : ''" title="What is left of the current retainer period">{{ retainerText(c.id) }}</span>
              <UBadge v-else-if="col.key === 'status'" :color="c.is_active ? 'success' : 'neutral'" variant="subtle" size="sm">
                {{ c.is_active ? 'Active' : 'Inactive' }}
              </UBadge>
            </td>
            <td />
          </tr>
          <tr v-if="rows.length === 0">
            <td :colspan="cols.visible.length + 1" class="px-4 py-8 text-center text-muted">No clients yet.</td>
          </tr>
        </tbody>
      </table></div>
    </UCard>

    <AppDrawer v-model:open="creating" title="New client">
      <template #body>
        <ClientForm @saved="onSaved" @cancel="creating = false" />
      </template>
    </AppDrawer>
  </div>
</template>
