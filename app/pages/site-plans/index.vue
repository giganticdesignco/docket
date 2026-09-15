<script setup lang="ts">
// Site plans: every website page tree, the client it is for, and the
// quote or project it is on. New ones start from a client and a name;
// the tree is built on the plan.
useHead({ title: 'Site plans' })

const supabase = useSupabaseClient()
const toast = useToast()
const { can } = useCurrentUser()

const __ad1 = useAsyncData('site-plans', async () => {
  const { data, error } = await supabase
    .from('site_plans')
    .select('id, name, created_at, client_id, project_id, clients(name), projects(id, name), site_plan_pages(count), quotes(id, number, status)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}, fresh)
const __ad2 = useClientNames()
await Promise.all([__ad1, __ad2])
const { data: plans } = __ad1
const { data: clients } = __ad2

const creating = ref(false)
const newClientId = ref<string | undefined>()
const newName = ref('')
const busy = ref(false)
function openNew() {
  newClientId.value = undefined
  newName.value = ''
  creating.value = true
}
async function create() {
  if (!newClientId.value || !newName.value.trim()) return
  busy.value = true
  try {
    const { data, error } = await supabase.from('site_plans').insert({ client_id: newClientId.value, name: newName.value.trim() }).select('id').single()
    if (error) throw error
    await navigateTo(`/site-plans/${data.id}`)
  } catch (e) {
    toast.add({ title: 'Could not create the site plan', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div>
        <h1 class="text-2xl font-semibold">Site plans</h1>
        <p class="text-sm text-muted">The pages a website will have. Start one here or from a quote, price it on the quote, and it moves to the project when the quote is accepted.</p>
      </div>
      <UButton v-if="can('manage_quotes')" icon="i-lucide-plus" class="ml-auto shrink-0" @click="openNew">New site plan</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="table-scroll"><table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="px-4 py-2 font-medium">Name</th>
            <th class="px-4 py-2 font-medium">Client</th>
            <th class="px-4 py-2 text-right font-medium">Pages</th>
            <th class="px-4 py-2 font-medium">On</th>
            <th class="px-4 py-2 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in plans ?? []" :key="p.id" class="border-b border-default last:border-0">
            <td class="px-4 py-2"><NuxtLink :to="`/site-plans/${p.id}`" class="font-medium hover:underline">{{ p.name }}</NuxtLink></td>
            <td class="px-4 py-2"><NuxtLink :to="`/clients/${p.client_id}`" class="hover:underline">{{ p.clients?.name }}</NuxtLink></td>
            <td class="px-4 py-2 text-right tabular-nums">{{ p.site_plan_pages[0]?.count ?? 0 }}</td>
            <td class="px-4 py-2">
              <template v-if="p.projects">Project: <NuxtLink :to="`/projects/${p.projects.id}`" class="hover:underline">{{ p.projects.name }}</NuxtLink></template>
              <template v-else-if="p.quotes.length">
                <template v-for="(q, i) in p.quotes" :key="q.id"><template v-if="i">, </template><NuxtLink :to="`/quotes/${q.id}`" class="tabular-nums hover:underline">{{ q.number }}</NuxtLink></template>
              </template>
              <span v-else class="text-muted">Not on a quote yet</span>
            </td>
            <td class="px-4 py-2 tabular-nums">{{ shortDate(p.created_at.slice(0, 10)) }}</td>
          </tr>
          <tr v-if="!plans?.length">
            <td colspan="5" class="px-4 py-8 text-center text-muted">No site plans yet.</td>
          </tr>
        </tbody>
      </table></div>
    </UCard>

    <AppDrawer v-model:open="creating" title="New site plan">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Client">
            <ClientPicker v-model="newClientId" :clients="clients ?? []" @created="c => clients?.push(c)" />
          </UFormField>
          <UFormField label="Name">
            <UInput v-model="newName" class="w-full" placeholder="Website redesign" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="creating = false;">Cancel</UButton>
          <UButton :loading="busy" :disabled="!newClientId || !newName.trim()" @click="create">Create</UButton>
        </div>
      </template>
    </AppDrawer>
  </div>
</template>
