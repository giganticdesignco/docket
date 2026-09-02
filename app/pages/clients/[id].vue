<script setup lang="ts">
import { BILLING_METHODS } from '~~/shared/types/app'
import type { Database, Tables } from '~~/shared/types/database'

type RetainerRow = Database['public']['Functions']['retainer_status']['Returns'][number]

const route = useRoute()
const id = route.params.id as string
const supabase = useSupabaseClient()
const { isAdmin } = useCurrentUser()

const editing = ref(false)
const creatingProject = ref(false)
const creatingRetainer = ref(false)
const editingRetainer = ref<Tables<'retainers'> | null>(null)
const deletingRetainer = ref<RetainerRow | null>(null)
const toast = useToast()

const { data: client, refresh } = await useAsyncData(`client-${id}`, async () => {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).single()
  if (error) throw createError({ statusCode: 404, statusMessage: 'Client not found' })
  return data
}, fresh)

const { data: projects, refresh: refreshProjects } = await useAsyncData(`client-${id}-projects`, async () => {
  const { data, error } = await supabase.from('projects').select('*').eq('client_id', id).order('name')
  if (error) throw error
  return data
}, fresh)

// Use and rollover come from retainer_status(), a security definer function,
// so staff see the real burn rather than just their own hours.
const { data: retainers, refresh: refreshRetainers } = await useAsyncData(`client-${id}-retainers`, async () => {
  const { data, error } = await supabase.rpc('retainer_status')
  if (error) throw error
  return data.filter(r => r.client_id === id).sort((a, b) => b.period_start.localeCompare(a.period_start))
}, fresh)

useHead({ title: () => client.value?.name ?? 'Client' })

const projectName = (projectId: string | null) => projects.value?.find(p => p.id === projectId)?.name ?? 'All projects'
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const qty = (r: RetainerRow, n: number) => (r.basis === 'hours' ? formatHours(n) : money(n))
const pct = (r: RetainerRow) => (r.available > 0 ? Math.round(r.used / r.available * 100) : 0)
const burnColor = (p: number) => (p >= 100 ? 'error' : p >= 80 ? 'warning' : 'primary')

function retainerSaved() {
  creatingRetainer.value = false
  editingRetainer.value = null
  refreshRetainers()
}

async function editRetainer(r: RetainerRow) {
  const { data, error } = await supabase.from('retainers').select('*').eq('id', r.retainer_id).single()
  if (error) {
    toast.add({ title: 'Could not load retainer', description: error.message, color: 'error' })
    return
  }
  editingRetainer.value = data
}

async function confirmDeleteRetainer() {
  const r = deletingRetainer.value
  if (!r) return
  const { error } = await supabase.from('retainers').delete().eq('id', r.retainer_id)
  if (error) {
    toast.add({ title: 'Could not delete retainer', description: error.message, color: 'error' })
    return
  }
  deletingRetainer.value = null
  refreshRetainers()
}

const billingLabel = (v: string) => BILLING_METHODS.find(b => b.value === v)?.label ?? v
</script>

<template>
  <div v-if="client" class="space-y-6">
    <div class="flex items-center gap-3">
      <UButton to="/clients" icon="i-lucide-arrow-left" variant="ghost" color="neutral" size="sm" />
      <h1 class="text-2xl font-semibold">{{ client.name }}</h1>
      <UBadge v-if="!client.is_active" color="neutral" variant="subtle">Inactive</UBadge>
      <UButton v-if="isAdmin" class="ml-auto" variant="outline" icon="i-lucide-pencil" @click="editing = true;">Edit</UButton>
    </div>

    <dl v-if="client.qbo_customer_id" class="text-sm">
      <dt class="text-muted">QuickBooks customer ID</dt>
      <dd>{{ client.qbo_customer_id }}</dd>
    </dl>

    <div class="flex items-center gap-4">
      <h2 class="text-lg font-semibold">Projects</h2>
      <UButton v-if="isAdmin" class="ml-auto" size="sm" icon="i-lucide-plus" @click="creatingProject = true;">New project</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Name</th>
            <th class="px-4 py-2 font-medium">Code</th>
            <th class="px-4 py-2 font-medium">Billing</th>
            <th class="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in projects" :key="p.id" class="border-b border-default last:border-0">
            <td class="px-4 py-2"><NuxtLink :to="`/projects/${p.id}`" class="font-medium hover:underline">{{ p.name }}</NuxtLink></td>
            <td class="px-4 py-2 text-muted">{{ p.code }}</td>
            <td class="px-4 py-2">{{ billingLabel(p.billing_method) }}</td>
            <td class="px-4 py-2">
              <UBadge :color="p.is_active ? 'success' : 'neutral'" variant="subtle" size="sm">{{ p.is_active ? 'Active' : 'Inactive' }}</UBadge>
            </td>
          </tr>
          <tr v-if="!projects?.length">
            <td colspan="4" class="px-4 py-8 text-center text-muted">No projects for this client.</td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <div class="flex items-center gap-4">
      <h2 class="text-lg font-semibold">Retainers</h2>
      <UButton v-if="isAdmin" class="ml-auto" size="sm" icon="i-lucide-plus" @click="creatingRetainer = true;">New retainer</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <ul v-if="retainers?.length" class="divide-y divide-default text-sm">
        <li v-for="r in retainers" :key="r.retainer_id" class="space-y-2 px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="min-w-0 flex-1">
              <div class="font-medium">{{ r.name }} <span class="font-normal text-muted">&middot; {{ projectName(r.project_id) }}</span></div>
              <div class="text-muted">{{ shortDate(r.period_start) }} to {{ shortDate(r.period_end) }}, {{ r.period_end < todayString() ? 'ended' : r.period_start > todayString() ? 'upcoming' : 'current' }}</div>
            </div>
            <div class="text-right tabular-nums">
              <div><strong>{{ qty(r, r.used) }}</strong> <span class="text-muted">of {{ qty(r, r.available) }}</span></div>
              <div class="text-xs text-muted">
                <span v-if="r.carried_in > 0">{{ qty(r, r.allotted) }} + {{ qty(r, r.carried_in) }} carried in &middot; </span>
                <span :class="r.remaining < 0 ? 'text-error' : ''">{{ r.remaining < 0 ? qty(r, -r.remaining) + ' over' : qty(r, r.remaining) + ' left' }}</span>
              </div>
            </div>
            <div v-if="isAdmin" class="flex gap-1">
              <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" aria-label="Edit" @click="editRetainer(r)" />
              <UButton icon="i-lucide-trash-2" variant="ghost" color="neutral" size="sm" aria-label="Delete" @click="deletingRetainer = r;" />
            </div>
          </div>
          <UProgress :model-value="Math.min(pct(r), 100)" :color="burnColor(pct(r))" size="sm" />
        </li>
      </ul>
      <p v-else class="px-4 py-6 text-center text-sm text-muted">No retainers for this client.</p>
    </UCard>

    <UModal v-model:open="creatingRetainer" title="New retainer">
      <template #body>
        <RetainerForm :client-id="id" :projects="projects ?? []" @saved="retainerSaved" @cancel="creatingRetainer = false;" />
      </template>
    </UModal>

    <UModal :open="!!editingRetainer" title="Edit retainer" @update:open="(v) => { if (!v) editingRetainer = null }">
      <template #body>
        <RetainerForm v-if="editingRetainer" :retainer="editingRetainer" :client-id="id" :projects="projects ?? []" @saved="retainerSaved" @cancel="editingRetainer = null;" />
      </template>
    </UModal>

    <UModal :open="!!deletingRetainer" title="Delete retainer?" @update:open="(v) => { if (!v) deletingRetainer = null }">
      <template #body>
        <p v-if="deletingRetainer" class="text-sm">This removes "{{ deletingRetainer.name }}" for {{ shortDate(deletingRetainer.period_start) }} to {{ shortDate(deletingRetainer.period_end) }}. Time entries are not affected.</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deletingRetainer = null;">Cancel</UButton>
          <UButton color="error" @click="confirmDeleteRetainer">Delete</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="editing" title="Edit client">
      <template #body>
        <ClientForm :client="client" @saved="editing = false; refresh()" @cancel="editing = false" />
      </template>
    </UModal>

    <UModal v-model:open="creatingProject" title="New project">
      <template #body>
        <ProjectForm :clients="[client]" :default-client-id="client.id" @saved="creatingProject = false; refreshProjects()" @cancel="creatingProject = false" />
      </template>
    </UModal>
  </div>
</template>
