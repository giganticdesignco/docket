<script setup lang="ts">
import { BILLING_METHODS } from '~~/shared/types/database'

const route = useRoute()
const id = route.params.id as string
const supabase = useSupabaseClient()
const { isAdmin } = useCurrentUser()
const editing = ref(false)

const { data: project, refresh } = await useAsyncData(`project-${id}`, async () => {
  const { data, error } = await supabase.from('projects').select('*, clients(id, name)').eq('id', id).single()
  if (error) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  return data
})

const { data: clients } = await useAsyncData('clients-for-projects', async () => {
  const { data, error } = await supabase.from('clients').select('id, name').order('name')
  if (error) throw error
  return data
})

useHead({ title: () => project.value?.name ?? 'Project' })

const billingLabel = (v: string) => BILLING_METHODS.find(b => b.value === v)?.label ?? v
const money = (n: number | null) => (n == null ? 'Not set' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)
</script>

<template>
  <div v-if="project" class="space-y-6">
    <div class="flex items-center gap-3">
      <UButton to="/projects" icon="i-lucide-arrow-left" variant="ghost" color="neutral" size="sm" />
      <div>
        <h1 class="text-2xl font-semibold">{{ project.name }}</h1>
        <NuxtLink :to="`/clients/${project.client_id}`" class="text-sm text-muted hover:underline">{{ project.clients?.name }}</NuxtLink>
      </div>
      <UBadge v-if="!project.is_active" color="neutral" variant="subtle">Inactive</UBadge>
      <UButton v-if="isAdmin" class="ml-auto" variant="outline" icon="i-lucide-pencil" @click="editing = true;">Edit</UButton>
    </div>

    <UCard>
      <dl class="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <div><dt class="text-muted">Job code</dt><dd>{{ project.code || 'None' }}</dd></div>
        <div><dt class="text-muted">Billing</dt><dd>{{ billingLabel(project.billing_method) }}</dd></div>
        <div><dt class="text-muted">Hourly rate</dt><dd>{{ money(project.hourly_rate) }}</dd></div>
        <div><dt class="text-muted">Budget hours</dt><dd>{{ project.budget_hours ?? 'No budget' }}</dd></div>
        <div><dt class="text-muted">Budget amount</dt><dd>{{ money(project.budget_amount) }}</dd></div>
      </dl>
    </UCard>

    <p class="text-sm text-muted">Tasks and rate overrides come in the next increment. Budget burn arrives in step 5.</p>

    <UModal v-model:open="editing" title="Edit project">
      <template #body>
        <ProjectForm :project="project" :clients="clients ?? []" @saved="editing = false; refresh()" @cancel="editing = false" />
      </template>
    </UModal>
  </div>
</template>
