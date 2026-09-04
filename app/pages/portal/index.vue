<script setup lang="ts">
// The client portal: one page. A signed-in client sees their quotes,
// invoices, and tasks shared for review, each linking to the public page
// that already handles accepting, paying, and commenting. RLS limits a
// client to their own rows; the client_id filter here is what lets an
// admin preview the same page for a client with ?as=<client id>.
definePageMeta({ layout: false })
useHead({ title: 'Your portal' })

const supabase = useSupabaseClient()
const route = useRoute()
const { profile, can, signOut } = useCurrentUser()

const isPreview = computed(() => profile.value?.role !== 'client')
const clientId = computed(() => (isPreview.value ? (typeof route.query.as === 'string' ? route.query.as : null) : profile.value?.client_id ?? null))
if (isPreview.value && !(can('manage_invoices') || can('manage_quotes') || can('manage_retainers'))) throw createError({ statusCode: 403, statusMessage: 'Quotes, invoices, or retainers permission needed to preview the portal' })

const { data } = await useAsyncData(`portal-${clientId.value}`, async () => {
  if (!clientId.value) return null
  const [client, settings, quotes, invoices, harvest, reviews, retainers, tasks] = await Promise.all([
    supabase.from('clients').select('id, name').eq('id', clientId.value).single(),
    supabase.from('invoice_settings').select('company_name, company_email, company_phone, payment_instructions').eq('id', true).maybeSingle(),
    supabase.from('quotes').select('id, number, title, status, subtotal, valid_until, public_token, sent_at, accepted_at').eq('client_id', clientId.value).neq('status', 'draft').order('created_at', { ascending: false }),
    supabase.from('invoices').select('id, number, subject, status, issue_date, due_date, total, due_amount, public_token').eq('client_id', clientId.value).in('status', ['sent', 'paid']).order('issue_date', { ascending: false }),
    supabase.from('harvest_invoices').select('id, number, subject, state, issue_date, due_date, amount, due_amount').eq('client_id', clientId.value).order('issue_date', { ascending: false }).limit(50),
    supabase.from('work_items').select('id, title, status, shared_at, client_decision, client_decision_at, public_token, projects!inner(name, client_id)').eq('projects.client_id', clientId.value).not('shared_at', 'is', null).order('shared_at', { ascending: false }),
    supabase.rpc('retainer_status'),
    supabase.from('work_items').select('id, title, status, due_on, priority, projects!inner(id, name, client_id, client_visible)').eq('projects.client_id', clientId.value).eq('projects.client_visible', true).order('due_on', { ascending: true, nullsFirst: false }).limit(300),
  ])
  for (const r of [client, quotes, invoices, harvest, reviews, retainers, tasks]) if (r.error) throw r.error
  return {
    client: client.data, settings: settings.data, quotes: quotes.data, invoices: invoices.data, harvest: harvest.data, reviews: reviews.data,
    retainers: (retainers.data ?? []).filter(r => r.client_id === clientId.value).sort((a, b) => b.period_start.localeCompare(a.period_start)),
    tasks: tasks.data ?? [],
  }
}, fresh)

const today = todayString()
const openQuotes = computed(() => (data.value?.quotes ?? []).filter(q => q.status === 'sent'))
const dueInvoices = computed(() => (data.value?.invoices ?? []).filter(i => i.status === 'sent'))
const dueTotal = computed(() => dueInvoices.value.reduce((t, i) => t + i.due_amount, 0) + (data.value?.harvest ?? []).filter(h => h.state === 'open').reduce((t, h) => t + h.due_amount, 0))
const awaiting = computed(() => (data.value?.reviews ?? []).filter(r => !r.client_decision))
// Retainers: the current period first, then the two before it.
const retainers = computed(() => {
  const all = data.value?.retainers ?? []
  const current = all.filter(r => r.period_start <= today && r.period_end >= today)
  const past = all.filter(r => r.period_end < today).slice(0, 2)
  return [...current, ...past]
})
type RetainerRow = NonNullable<typeof data.value>['retainers'][number]
const qty = (r: RetainerRow, n: number) => (r.basis === 'hours' ? formatHours(n) : money(n))
const pct = (r: RetainerRow) => (r.available > 0 ? Math.round(r.used / r.available * 100) : 0)
const burnColor = (p: number) => (p >= 100 ? 'error' : p >= 80 ? 'warning' : 'primary')
const ws = await useWorkStatuses()
// Tasks on projects marked visible, grouped by project. Open work is
// listed; finished tasks are a count so a long-running project stays
// readable.
const taskGroups = computed(() => {
  const groups = new Map<string, { name: string, items: NonNullable<typeof data.value>['tasks'], done: number }>()
  for (const t of data.value?.tasks ?? []) {
    const g = groups.get(t.projects.id) ?? { name: t.projects.name, items: [], done: 0 }
    if (ws.isDone(t.status)) g.done += 1
    else g.items.push(t)
    groups.set(t.projects.id, g)
  }
  return [...groups.values()]
})

const clientQuoteBadge = (q: { status: string, valid_until: string | null }) => quoteBadge(q, today, 'client')
const clientInvoiceBadge = (i: { status?: string, state?: string, due_date: string | null }) => invoiceBadge(i, today, 'client')
</script>

<template>
  <div class="min-h-screen bg-default">
    <header class="border-b border-default">
      <div class="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
        <span class="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-inverted">D</span>
        <div class="min-w-0">
          <div class="font-semibold leading-tight">{{ data?.settings?.company_name ?? 'Gigantic Design Co.' }}</div>
          <div class="truncate text-xs text-muted">{{ data?.client?.name ?? 'Client portal' }}</div>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <UBadge v-if="isPreview" color="warning" variant="subtle">Previewing as {{ data?.client?.name ?? 'client' }}</UBadge>
          <UButton v-if="isPreview" :to="clientId ? `/clients/${clientId}` : '/clients'" variant="ghost" color="neutral" size="sm">Back to Docket</UButton>
          <UButton v-else variant="ghost" color="neutral" size="sm" @click="signOut">Sign out</UButton>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div v-if="!clientId" class="py-12 text-center text-sm text-muted">
        <template v-if="isPreview">Pick a client to preview: open a client and choose View as client.</template>
        <template v-else>Your account is not linked to a client yet. Ask {{ data?.settings?.company_name ?? 'Gigantic' }} to set that up.</template>
      </div>

      <template v-else-if="data">
        <div class="grid gap-3 sm:grid-cols-3">
          <UCard :ui="{ body: 'p-3 sm:p-4' }">
            <div class="text-xs text-muted">Quotes waiting on you</div>
            <div class="text-2xl font-semibold tabular-nums">{{ openQuotes.length }}</div>
          </UCard>
          <UCard :ui="{ body: 'p-3 sm:p-4' }">
            <div class="text-xs text-muted">Balance due</div>
            <div class="text-2xl font-semibold tabular-nums" :class="dueTotal > 0 ? 'text-warning' : ''">{{ money(dueTotal) }}</div>
          </UCard>
          <UCard :ui="{ body: 'p-3 sm:p-4' }">
            <div class="text-xs text-muted">Waiting for your review</div>
            <div class="text-2xl font-semibold tabular-nums">{{ awaiting.length }}</div>
          </UCard>
        </div>

        <section v-if="retainers.length" class="space-y-2">
          <h2 class="text-lg font-semibold">Retainer</h2>
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <ul class="divide-y divide-default text-sm">
              <li v-for="r in retainers" :key="r.retainer_id" class="space-y-2 px-4 py-3">
                <div class="flex items-center gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="font-medium">{{ r.name }}</div>
                    <div class="text-xs text-muted">{{ shortDate(r.period_start) }} to {{ shortDate(r.period_end) }}, {{ r.period_end < today ? 'ended' : 'current' }}<template v-if="r.carried_in > 0"> · {{ qty(r, r.carried_in) }} carried in</template></div>
                  </div>
                  <div class="text-right tabular-nums">
                    <div><strong>{{ qty(r, r.used) }}</strong> <span class="text-muted">of {{ qty(r, r.available) }}</span></div>
                    <div class="text-xs" :class="r.remaining < 0 ? 'text-error' : 'text-muted'">{{ r.remaining < 0 ? `${qty(r, -r.remaining)} over` : `${qty(r, r.remaining)} left` }}</div>
                  </div>
                </div>
                <UProgress :model-value="Math.min(pct(r), 100)" :color="burnColor(pct(r))" size="sm" />
              </li>
            </ul>
          </UCard>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">For review</h2>
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <ul v-if="data.reviews?.length" class="divide-y divide-default text-sm">
              <li v-for="r in data.reviews" :key="r.id" class="flex items-center gap-3 px-4 py-3">
                <div class="min-w-0 flex-1">
                  <a :href="`/r/${r.public_token}`" class="font-medium hover:underline">{{ r.title }}</a>
                  <div class="text-xs text-muted">{{ r.projects?.name }} · shared {{ shortDate(r.shared_at!.slice(0, 10)) }}</div>
                </div>
                <UBadge :color="r.client_decision === 'approved' ? 'success' : r.client_decision ? 'warning' : 'info'" variant="subtle" size="sm">
                  {{ r.client_decision === 'approved' ? 'Approved' : r.client_decision === 'changes_requested' ? 'Changes requested' : ws.label(r.status) }}
                </UBadge>
                <UButton :to="`/r/${r.public_token}`" external size="xs" variant="outline" color="neutral">Open</UButton>
              </li>
            </ul>
            <p v-else class="px-4 py-6 text-center text-sm text-muted">Nothing shared for review right now.</p>
          </UCard>
        </section>

        <section v-if="taskGroups.length" class="space-y-2">
          <h2 class="text-lg font-semibold">Tasks</h2>
          <UCard v-for="g in taskGroups" :key="g.name" :ui="{ body: 'p-0 sm:p-0' }">
            <div class="border-b border-default px-4 py-2 text-sm font-semibold">{{ g.name }} <span class="font-normal text-muted">{{ g.items.length }} open<template v-if="g.done">, {{ g.done }} done</template></span></div>
            <ul v-if="g.items.length" class="divide-y divide-default text-sm">
              <li v-for="t in g.items" :key="t.id" class="flex items-center gap-3 px-4 py-2">
                <span class="size-2.5 shrink-0 rounded-full" :class="ws.dot(t.status)" />
                <span class="min-w-0 flex-1 truncate">{{ t.title }}</span>
                <span v-if="t.due_on" class="text-xs tabular-nums text-muted">{{ shortDate(t.due_on) }}</span>
                <UBadge :color="ws.color(t.status)" variant="subtle" size="sm">{{ ws.label(t.status) }}</UBadge>
              </li>
            </ul>
            <p v-else class="px-4 py-3 text-sm text-muted">Everything on this project is done.</p>
          </UCard>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">Quotes</h2>
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <ul v-if="data.quotes?.length" class="divide-y divide-default text-sm">
              <li v-for="q in data.quotes" :key="q.id" class="flex items-center gap-3 px-4 py-3">
                <div class="min-w-0 flex-1">
                  <a :href="`/q/${q.public_token}`" class="font-medium hover:underline">{{ q.number }} {{ q.title }}</a>
                  <div class="text-xs text-muted">{{ money(q.subtotal) }}<template v-if="q.valid_until && q.status === 'sent'"> · valid until {{ shortDate(q.valid_until) }}</template></div>
                </div>
                <UBadge :color="clientQuoteBadge(q).color" variant="subtle" size="sm">{{ clientQuoteBadge(q).label }}</UBadge>
                <UButton :to="`/q/${q.public_token}`" external size="xs" variant="outline" color="neutral">{{ q.status === 'sent' ? 'Review' : 'Open' }}</UButton>
              </li>
            </ul>
            <p v-else class="px-4 py-6 text-center text-sm text-muted">No quotes yet.</p>
          </UCard>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">Invoices</h2>
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <ul v-if="data.invoices?.length || data.harvest?.length" class="divide-y divide-default text-sm">
              <li v-for="i in data.invoices" :key="i.id" class="flex items-center gap-3 px-4 py-3">
                <div class="min-w-0 flex-1">
                  <a :href="`/i/${i.public_token}`" class="font-medium hover:underline">Invoice {{ i.number }}<template v-if="i.subject"> · {{ i.subject }}</template></a>
                  <div class="text-xs text-muted">{{ shortDate(i.issue_date) }} · {{ money(i.total) }}<template v-if="i.status === 'sent'"> · {{ money(i.due_amount) }} due {{ shortDate(i.due_date) }}</template></div>
                </div>
                <UBadge :color="clientInvoiceBadge(i).color" variant="subtle" size="sm">{{ clientInvoiceBadge(i).label }}</UBadge>
                <UButton :to="`/i/${i.public_token}`" external size="xs" variant="outline" color="neutral">{{ i.status === 'sent' ? 'View and pay' : 'Open' }}</UButton>
              </li>
              <li v-for="h in data.harvest" :key="h.id" class="flex items-center gap-3 px-4 py-3">
                <div class="min-w-0 flex-1">
                  <div class="font-medium">Invoice {{ h.number }}<template v-if="h.subject"> · {{ h.subject }}</template></div>
                  <div class="text-xs text-muted">{{ shortDate(h.issue_date) }} · {{ money(h.amount) }}<template v-if="h.state === 'open' && h.due_date"> · {{ money(h.due_amount) }} due {{ shortDate(h.due_date) }}</template></div>
                </div>
                <UBadge :color="clientInvoiceBadge(h).color" variant="subtle" size="sm">{{ clientInvoiceBadge(h).label }}</UBadge>
              </li>
            </ul>
            <p v-else class="px-4 py-6 text-center text-sm text-muted">No invoices yet.</p>
          </UCard>
        </section>

        <p class="text-xs text-muted">
          Questions? <template v-if="data.settings?.company_email">Email <a :href="`mailto:${data.settings.company_email}`" class="hover:underline">{{ data.settings.company_email }}</a></template><template v-if="data.settings?.company_phone"> or call {{ data.settings.company_phone }}</template>.
        </p>
      </template>
    </main>
  </div>
</template>
