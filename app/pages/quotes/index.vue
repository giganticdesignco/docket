<script setup lang="ts">
// Quotes: what is out, what was won, what was lost. As a list, or as a
// board with a column per stage. New ones start from a client and a
// title; the rest is built on the quote page.
definePageMeta({ middleware: 'can', permission: 'manage_quotes' })
useHead({ title: 'Quotes' })

const supabase = useSupabaseClient()
const toast = useToast()

const __ad1 = useAsyncData('quotes', async () => {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, number, title, status, subtotal, valid_until, sent_at, accepted_at, created_at, client_id, project_id, created_by, clients(name), profiles(full_name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}, fresh)

const __ad2 = useAsyncData('clients-for-quotes', async () => {
  const { data, error } = await supabase.from('clients').select('id, name').eq('is_active', true).order('name')
  if (error) throw error
  return data
}, fresh)
await Promise.all([__ad1, __ad2])
const { data: quotes } = __ad1
const { data: clients } = __ad2

type Row = NonNullable<typeof quotes.value>[number]
type Filter = 'all' | 'draft' | 'sent' | 'accepted' | 'declined'
type Layout = 'list' | 'board'
const view = await useViewState('quotes', { filter: 'all' as Filter, layout: 'list' as Layout })
const filter = persisted(view, 'filter')
const layout = persisted(view, 'layout')
const filters: { value: Filter, label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'draft', label: 'Drafts' }, { value: 'sent', label: 'Sent' }, { value: 'accepted', label: 'Accepted' }, { value: 'declined', label: 'Declined' },
]
const today = todayString()
const cols = await useColumns<Row>('quotes', [
  { key: 'number', label: 'Number', sort: q => q.number, always: true },
  { key: 'client', label: 'Client', sort: q => q.clients?.name },
  { key: 'title', label: 'Title', sort: q => q.title },
  { key: 'owner', label: 'Owner', sort: q => owner(q) },
  { key: 'valid', label: 'Valid until', sort: q => q.valid_until },
  { key: 'total', label: 'Total', align: 'right', sort: q => q.subtotal },
  { key: 'status', label: 'Status', sort: q => badge(q).label },
])
const rows = computed(() => cols.sorted((quotes.value ?? []).filter(q => filter.value === 'all' || q.status === filter.value)))
const outstanding = computed(() => (quotes.value ?? []).filter(q => q.status === 'sent').reduce((s, q) => s + q.subtotal, 0))
const won = computed(() => (quotes.value ?? []).filter(q => q.status === 'accepted' && q.accepted_at && q.accepted_at.slice(0, 4) === today.slice(0, 4)).reduce((s, q) => s + q.subtotal, 0))
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const badge = (q: Row): { label: string, color: 'neutral' | 'warning' | 'success' | 'error' | 'info' } =>
  q.status === 'sent' && q.valid_until && q.valid_until < today ? { label: 'expired', color: 'error' }
  : q.status === 'sent' ? { label: 'sent', color: 'info' }
  : q.status === 'accepted' ? { label: 'accepted', color: 'success' }
  : q.status === 'declined' ? { label: 'declined', color: 'neutral' }
  : q.status === 'expired' ? { label: 'expired', color: 'error' }
  : { label: 'draft', color: 'neutral' }

// Who wrote it, as initials, the way tasks show assignees.
const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
const owner = (q: Row) => q.profiles?.full_name ?? ''

// A sent quote nobody has answered in five days wants a nudge. Past its
// valid-until date it is expired instead, which the badge already says.
const STALE_DAYS = 5
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
const stale = (q: Row) => q.status === 'sent' && !!q.sent_at && daysSince(q.sent_at) >= STALE_DAYS && !(q.valid_until && q.valid_until < today)
const staleNote = (q: Row) => `Sent ${daysSince(q.sent_at!)} days ago, no reply yet.`

// The board: a column per stage, newest first, with a count and a total.
// Expired-by-date quotes stay in Sent with their red badge; the enum's
// "expired" is never written, so there is no column for it.
const stages: { key: Row['status'], label: string }[] = [
  { key: 'draft', label: 'Draft' }, { key: 'sent', label: 'Sent' }, { key: 'accepted', label: 'Accepted' }, { key: 'declined', label: 'Declined' },
]
const columns = computed(() => stages.map((s) => {
  const items = (quotes.value ?? []).filter(q => q.status === s.key || (s.key === 'sent' && q.status === 'expired'))
  return { ...s, items, total: items.reduce((t, q) => t + q.subtotal, 0) }
}))

const creating = ref(false)
const newClientId = ref<string | undefined>()
const newTitle = ref('')
const busy = ref(false)
async function create() {
  if (!newClientId.value || !newTitle.value.trim()) return
  busy.value = true
  try {
    const { data, error } = await supabase.rpc('create_quote', { p_client_id: newClientId.value, p_title: newTitle.value.trim() })
    if (error) throw error
    await navigateTo(`/quotes/${data}`)
  } catch (e) {
    toast.add({ title: 'Could not create the quote', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Quotes</h1>
        <p class="text-sm text-muted">Accepted quotes become projects with the quoted hours as their budget.</p>
      </div>
      <div class="ml-auto flex items-center gap-3">
        <div class="flex gap-0.5 rounded-md bg-elevated p-0.5">
          <UButton size="xs" icon="i-lucide-list" :variant="layout === 'list' ? 'solid' : 'ghost'" :color="layout === 'list' ? 'primary' : 'neutral'" aria-label="List" title="List" @click="layout = 'list';" />
          <UButton size="xs" icon="i-lucide-layout-grid" :variant="layout === 'board' ? 'solid' : 'ghost'" :color="layout === 'board' ? 'primary' : 'neutral'" aria-label="Board" title="Board, a column per stage" @click="layout = 'board';" />
        </div>
        <UButton icon="i-lucide-plus" @click="creating = true;">New quote</UButton>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <UCard class="cursor-pointer" @click="layout = 'list'; filter = 'sent';">
        <div class="text-sm text-muted">Out with clients</div>
        <div class="text-2xl font-semibold tabular-nums">{{ money(outstanding) }}</div>
      </UCard>
      <UCard class="cursor-pointer" @click="layout = 'list'; filter = 'accepted';">
        <div class="text-sm text-muted">Won this year</div>
        <div class="text-2xl font-semibold tabular-nums">{{ money(won) }}</div>
      </UCard>
    </div>

    <template v-if="layout === 'list'">
      <div class="flex flex-wrap gap-1">
        <UButton v-for="f in filters" :key="f.value" size="xs" :variant="filter === f.value ? 'solid' : 'ghost'" :color="filter === f.value ? 'primary' : 'neutral'" @click="filter = f.value;">{{ f.label }}</UButton>
      </div>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <div class="overflow-x-auto"><table class="w-full text-sm">
          <TableHead :cols="cols" />
          <tbody>
            <tr v-for="q in rows" :key="q.id" class="border-b border-default last:border-0">
              <td v-for="c in cols.visible" :key="c.key" class="px-4 py-2" :class="[c.align === 'right' ? 'text-right tabular-nums' : '', c.key === 'title' ? 'max-w-sm truncate' : '']">
                <NuxtLink v-if="c.key === 'number'" :to="`/quotes/${q.id}`" class="font-medium tabular-nums hover:underline">{{ q.number }}</NuxtLink>
                <NuxtLink v-else-if="c.key === 'client'" :to="`/clients/${q.client_id}`" class="hover:underline">{{ q.clients?.name }}</NuxtLink>
                <NuxtLink v-else-if="c.key === 'title'" :to="`/quotes/${q.id}`" class="hover:underline">{{ q.title }}</NuxtLink>
                <span v-else-if="c.key === 'owner' && owner(q)" class="grid size-6 place-items-center rounded-full bg-elevated text-[10px] font-medium ring-2 ring-default" :title="owner(q)">{{ initials(owner(q)) }}</span>
                <span v-else-if="c.key === 'valid'" class="tabular-nums">{{ q.valid_until ? shortDate(q.valid_until) : '' }}</span>
                <template v-else-if="c.key === 'total'">{{ money(q.subtotal) }}</template>
                <span v-else-if="c.key === 'status'" class="inline-flex items-center gap-1.5">
                  <UBadge :color="badge(q).color" variant="subtle" size="sm">{{ badge(q).label }}</UBadge>
                  <UTooltip v-if="stale(q)" :text="staleNote(q)"><span class="block size-2 rounded-full bg-warning" aria-label="Waiting on a reply" /></UTooltip>
                </span>
              </td>
              <td />
            </tr>
            <tr v-if="!rows.length">
              <td :colspan="cols.visible.length + 1" class="px-4 py-8 text-center text-muted">No quotes here.</td>
            </tr>
          </tbody>
        </table></div>
      </UCard>
    </template>

    <div v-else class="overflow-x-auto">
      <div class="grid min-w-[56rem] grid-cols-4 gap-4">
        <UCard v-for="col in columns" :key="col.key" :ui="{ body: 'p-2 sm:p-2' }">
          <template #header>
            <div class="flex items-baseline gap-2">
              <span class="font-semibold">{{ col.label }}</span>
              <span class="text-xs text-muted">{{ col.items.length }}</span>
              <span class="ml-auto text-xs tabular-nums text-muted">{{ money(col.total) }}</span>
            </div>
          </template>
          <div class="space-y-2">
            <NuxtLink v-for="q in col.items" :key="q.id" :to="`/quotes/${q.id}`" class="block rounded-md border border-default bg-default p-3 text-sm hover:bg-elevated">
              <div class="flex items-start gap-2">
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium">{{ q.title }}</div>
                  <div class="truncate text-xs text-muted">{{ q.clients?.name }} &middot; {{ q.number }}</div>
                </div>
                <span v-if="owner(q)" class="grid size-6 shrink-0 place-items-center rounded-full bg-elevated text-[10px] font-medium ring-2 ring-default" :title="owner(q)">{{ initials(owner(q)) }}</span>
              </div>
              <div class="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <span class="font-medium tabular-nums text-default">{{ money(q.subtotal) }}</span>
                <span v-if="q.valid_until" class="tabular-nums">&middot; until {{ shortDate(q.valid_until) }}</span>
                <span class="ml-auto inline-flex items-center gap-1.5">
                  <UBadge v-if="badge(q).label !== col.key" :color="badge(q).color" variant="subtle" size="xs">{{ badge(q).label }}</UBadge>
                  <UTooltip v-if="stale(q)" :text="staleNote(q)"><span class="block size-2 rounded-full bg-warning" aria-label="Waiting on a reply" /></UTooltip>
                </span>
              </div>
            </NuxtLink>
            <p v-if="!col.items.length" class="py-6 text-center text-xs text-muted">Nothing here.</p>
          </div>
        </UCard>
      </div>
    </div>

    <AppDrawer v-model:open="creating" title="New quote">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Client">
            <ClientPicker v-model="newClientId" :clients="clients ?? []" @created="c => clients?.push(c)" />
          </UFormField>
          <UFormField label="Title" help="Becomes the project name when accepted.">
            <UInput v-model="newTitle" class="w-full" placeholder="Website redesign" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="creating = false;">Cancel</UButton>
          <UButton :loading="busy" :disabled="!newClientId || !newTitle.trim()" @click="create">Create draft</UButton>
        </div>
      </template>
    </AppDrawer>
  </div>
</template>
