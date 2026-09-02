<script setup lang="ts">
// Quotes: what is out, what was won, what was lost. New ones start from
// a client and a title; the rest is built on the quote page.
definePageMeta({ middleware: 'can', permission: 'manage_billing' })
useHead({ title: 'Quotes' })

const supabase = useSupabaseClient()
const toast = useToast()

const __ad1 = useAsyncData('quotes', async () => {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, number, title, status, subtotal, valid_until, sent_at, accepted_at, created_at, client_id, project_id, clients(name)')
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
const view = await useViewState('quotes', { filter: 'all' as Filter })
const filter = persisted(view, 'filter')
const filters: { value: Filter, label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'draft', label: 'Drafts' }, { value: 'sent', label: 'Sent' }, { value: 'accepted', label: 'Accepted' }, { value: 'declined', label: 'Declined' },
]
const today = todayString()
const rows = computed(() => (quotes.value ?? []).filter(q => filter.value === 'all' || q.status === filter.value))
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
      <UButton icon="i-lucide-plus" class="ml-auto" @click="creating = true;">New quote</UButton>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <UCard class="cursor-pointer" @click="filter = 'sent';">
        <div class="text-sm text-muted">Out with clients</div>
        <div class="text-2xl font-semibold tabular-nums">{{ money(outstanding) }}</div>
      </UCard>
      <UCard class="cursor-pointer" @click="filter = 'accepted';">
        <div class="text-sm text-muted">Won this year</div>
        <div class="text-2xl font-semibold tabular-nums">{{ money(won) }}</div>
      </UCard>
    </div>

    <div class="flex flex-wrap gap-1">
      <UButton v-for="f in filters" :key="f.value" size="xs" :variant="filter === f.value ? 'solid' : 'ghost'" :color="filter === f.value ? 'primary' : 'neutral'" @click="filter = f.value;">{{ f.label }}</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Number</th>
            <th class="px-2 py-2 font-medium">Client</th>
            <th class="px-2 py-2 font-medium">Title</th>
            <th class="px-2 py-2 font-medium">Valid until</th>
            <th class="px-2 py-2 text-right font-medium">Total</th>
            <th class="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="q in rows" :key="q.id" class="border-b border-default last:border-0">
            <td class="px-4 py-2 font-medium tabular-nums"><NuxtLink :to="`/quotes/${q.id}`" class="hover:underline">{{ q.number }}</NuxtLink></td>
            <td class="px-2 py-2"><NuxtLink :to="`/clients/${q.client_id}`" class="hover:underline">{{ q.clients?.name }}</NuxtLink></td>
            <td class="max-w-sm truncate px-2 py-2"><NuxtLink :to="`/quotes/${q.id}`" class="hover:underline">{{ q.title }}</NuxtLink></td>
            <td class="px-2 py-2 tabular-nums">{{ q.valid_until ? shortDate(q.valid_until) : '' }}</td>
            <td class="px-2 py-2 text-right tabular-nums">{{ money(q.subtotal) }}</td>
            <td class="px-4 py-2"><UBadge :color="badge(q).color" variant="subtle" size="sm">{{ badge(q).label }}</UBadge></td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="6" class="px-4 py-8 text-center text-muted">No quotes here.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

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
