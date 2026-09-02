<script setup lang="ts">
import { BILLING_METHODS } from '~~/shared/types/app'

const route = useRoute()
const id = route.params.id as string
const supabase = useSupabaseClient()
const { isAdmin } = useCurrentUser()

const editing = ref(false)
const creatingProject = ref(false)

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

useHead({ title: () => client.value?.name ?? 'Client' })

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
