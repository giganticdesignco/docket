<script setup lang="ts">
// Timesheets waiting for a decision, by person and week. Approve a
// week, or send it back with a reason, which the person gets as a
// notification. Only approved time can go on a billing batch.
definePageMeta({ middleware: 'can', permission: 'approve_time', leadOk: true })
useHead({ title: 'Approvals' })

const supabase = useSupabaseClient()
const toast = useToast()
const { can, user, leads } = useCurrentUser()
const seeMoney = computed(() => can('field:amounts'))
// A lead never reviews their own week; approve_time holders do (admins, Tom, Jen).
const backstop = computed(() => can('approve_time'))

const { data: rows, refresh } = await useAsyncData('approvals', async () => {
  const { data, error } = await supabase
    .from('time_detail')
    .select('id, spent_on, user_id, user_name, client_name, project_name, task_name, hours, is_billable, amount, notes')
    .eq('status', 'submitted')
    .order('user_name').order('spent_on')
  if (error) throw error
  return data
}, fresh)
type Row = NonNullable<typeof rows.value>[number]
// Which department each person is in and who leads it, for the labels.
const __pp = useAsyncData('approvals-people', async () => {
  const { data } = await supabase.from('profiles').select('id, full_name, department_id').eq('is_active', true)
  return data ?? []
}, fresh)
const __dd = useAsyncData('approvals-departments', async () => {
  const { data } = await supabase.from('departments').select('id, name, lead_id')
  return data ?? []
}, fresh)
await Promise.all([__pp, __dd])
const { data: people } = __pp
const { data: departments } = __dd
const deptOf = (uid: string) => { const d = people.value?.find(p => p.id === uid)?.department_id; return d ? departments.value?.find(x => x.id === d) ?? null : null }
const leadName = (uid: string) => { const d = deptOf(uid); return d?.lead_id && d.lead_id !== uid ? people.value?.find(p => p.id === d.lead_id)?.full_name ?? null : null }

// Person, then week, newest week first.
const groups = computed(() => {
  const byPerson = new Map<string, { userId: string, name: string, weeks: Map<string, Row[]> }>()
  for (const r of rows.value ?? []) {
    if (r.user_id === user.value?.sub && !backstop.value) continue
    const p = byPerson.get(r.user_id!) ?? { userId: r.user_id!, name: r.user_name ?? '', weeks: new Map() }
    const wk = weekDays(r.spent_on!)[0]!
    p.weeks.set(wk, [...(p.weeks.get(wk) ?? []), r])
    byPerson.set(r.user_id!, p)
  }
  return [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name)).map(p => ({
    ...p,
    weeks: [...p.weeks.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([week, items]) => ({ week, items, hours: items.reduce((s, r) => s + (r.hours ?? 0), 0), amount: items.reduce((s, r) => s + (r.amount ?? 0), 0) })),
  }))
})
const total = computed(() => groups.value.reduce((s, p) => s + p.weeks.reduce((w, x) => w + x.hours, 0), 0))
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const open = ref(new Set<string>())
const toggle = (k: string) => { if (open.value.has(k)) open.value.delete(k); else open.value.add(k) }

const busy = ref<string | null>(null)
async function approve(key: string, items: Row[]) {
  busy.value = key
  try {
    const { data, error } = await supabase.rpc('approve_time_entries', { p_ids: items.map(r => r.id!) })
    if (error) throw error
    toast.add({ title: `${data} ${data === 1 ? 'entry' : 'entries'} approved`, color: 'success', duration: 2500 })
    await refresh()
  } catch (e) {
    toast.add({ title: 'Could not approve', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = null
  }
}
const rejecting = ref<{ key: string, name: string, week: string, items: Row[] } | null>(null)
const reason = ref('')
async function reject() {
  const r = rejecting.value
  if (!r || !reason.value.trim()) return
  busy.value = r.key
  try {
    const { data, error } = await supabase.rpc('reject_time_entries', { p_ids: r.items.map(x => x.id!), p_reason: reason.value.trim() })
    if (error) throw error
    toast.add({ title: `${data} ${data === 1 ? 'entry' : 'entries'} sent back to ${r.name}`, color: 'success', duration: 2500 })
    rejecting.value = null
    reason.value = ''
    await refresh()
  } catch (e) {
    toast.add({ title: 'Could not send back', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Approvals <span class="text-base font-normal text-muted">{{ formatHours(total) }} waiting</span></h1>
        <p class="text-sm text-muted">Timesheets people have submitted, by week. Approve a week and it can be billed; send it back and they get a note saying what to fix.<template v-if="leads.length"> You review {{ leads.map(l => l.name).join(' and ') }}.</template></p>
      </div>
    </div>

    <p v-if="!groups.length" class="py-12 text-center text-sm text-muted">Nothing waiting. People submit a week from their Time page.</p>

    <UCard v-for="p in groups" :key="p.userId" :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex items-baseline gap-3">
          <h2 class="font-semibold">{{ p.name }}</h2>
          <span class="text-xs text-muted">{{ p.weeks.length }} {{ p.weeks.length === 1 ? 'week' : 'weeks' }}</span>
          <span v-if="deptOf(p.userId)" class="text-xs text-muted">&middot; {{ deptOf(p.userId)!.name }}<template v-if="leadName(p.userId)">, reviewed by {{ leadName(p.userId) }}</template></span>
          <UBadge v-if="backstop && !leadName(p.userId)" color="warning" variant="subtle" size="sm" title="No department lead to review this person, so it falls to you">No lead</UBadge>
        </div>
      </template>
      <div class="divide-y divide-default">
        <div v-for="w in p.weeks" :key="w.week">
          <div class="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
            <button type="button" class="inline-flex items-center gap-2 font-medium hover:underline" @click="toggle(`${p.userId}|${w.week}`)">
              <UIcon :name="open.has(`${p.userId}|${w.week}`) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-dimmed" />
              Week of {{ shortDate(w.week) }}
            </button>
            <span class="tabular-nums text-muted">{{ formatHours(w.hours) }} in {{ w.items.length }} {{ w.items.length === 1 ? 'entry' : 'entries' }}<template v-if="seeMoney && w.amount"> &middot; {{ money(w.amount) }}</template></span>
            <div class="ml-auto flex gap-2">
              <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-undo-2" :disabled="!!busy" @click="rejecting = { key: `${p.userId}|${w.week}`, name: p.name, week: w.week, items: w.items }; reason = '';">Send back</UButton>
              <UButton size="xs" icon="i-lucide-check" :loading="busy === `${p.userId}|${w.week}`" :disabled="!!busy && busy !== `${p.userId}|${w.week}`" @click="approve(`${p.userId}|${w.week}`, w.items)">Approve week</UButton>
            </div>
          </div>
          <table v-if="open.has(`${p.userId}|${w.week}`)" class="w-full border-t border-default bg-elevated/20 text-xs">
            <tbody>
              <tr v-for="r in w.items" :key="r.id!" class="border-b border-default/60 last:border-0">
                <td class="w-16 whitespace-nowrap px-4 py-1 tabular-nums">{{ shortDate(r.spent_on!) }}</td>
                <td class="px-2 py-1">{{ r.client_name }} / {{ r.project_name }}</td>
                <td class="px-2 py-1 text-muted">{{ r.task_name }}</td>
                <td class="max-w-md truncate px-2 py-1 text-muted">{{ r.notes }}</td>
                <td class="px-2 py-1"><UBadge v-if="!r.is_billable" color="neutral" variant="subtle" size="xs">Non-billable</UBadge></td>
                <td class="w-14 px-2 py-1 text-right tabular-nums">{{ formatHours(r.hours ?? 0) }}</td>
                <td v-if="seeMoney" class="w-20 px-4 py-1 text-right tabular-nums text-muted">{{ r.amount != null ? money(r.amount) : '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </UCard>

    <UModal :open="!!rejecting" :title="rejecting ? `Send back ${rejecting.name}'s week of ${shortDate(rejecting.week)}?` : ''" @update:open="(v) => { if (!v) rejecting = null }">
      <template #body>
        <UFormField label="What needs to change" required help="They get this as a notification, and the entries open up for editing.">
          <UTextarea v-model="reason" :rows="3" class="w-full" autofocus placeholder="Split the Tuesday entry by project, and the Friday one looks like it should be non-billable." />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="rejecting = null;">Cancel</UButton>
          <UButton color="error" :disabled="!reason.trim()" :loading="!!busy" @click="reject">Send back</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
