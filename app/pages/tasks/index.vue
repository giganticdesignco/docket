<script setup lang="ts">
import { WORK_STATUSES, workStatusColor, workStatusLabel } from '~~/shared/types/app'

// Tasks across every project. Mine by default; everyone's on a switch.
// Open tasks group by when they are due; completed ones hide unless asked.
useHead({ title: 'Tasks' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()

const everyone = ref(false)
const showCompleted = ref(false)
const statusFilter = ref<string>('')
const search = ref('')

const { data: items, refresh } = await useAsyncData('work-items', async () => {
  const { data, error } = await supabase
    .from('work_items')
    .select('id, title, status, priority, due_on, estimate_hours, updated_at, projects(id, name, clients(name)), work_item_assignees(user_id, profiles(full_name))')
    .order('due_on', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return data
}, fresh)

const { data: projects } = await useAsyncData('projects-for-tasks', async () => {
  const { data, error } = await supabase.from('projects').select('id, name, clients(name)').eq('is_active', true).order('name')
  if (error) throw error
  return data
}, fresh)

const { data: people } = await useAsyncData('people-for-tasks', async () => {
  const { data, error } = await supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
  if (error) throw error
  return data
}, fresh)

type Item = NonNullable<typeof items.value>[number]
const today = todayString()
const weekEnd = addDays(weekDays(today)[0]!, 6)

const visible = computed(() => (items.value ?? []).filter((i) => {
  if (!everyone.value && !i.work_item_assignees.some(a => a.user_id === user.value?.sub)) return false
  if (!showCompleted.value && i.status === 'completed') return false
  if (statusFilter.value && i.status !== statusFilter.value) return false
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    const hay = `${i.title} ${i.projects?.name ?? ''} ${i.projects?.clients?.name ?? ''}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}))

const groups = computed(() => {
  const g: { label: string, items: Item[] }[] = [
    { label: 'Overdue', items: [] }, { label: 'This week', items: [] }, { label: 'Later', items: [] }, { label: 'No due date', items: [] }, { label: 'Completed', items: [] },
  ]
  for (const i of visible.value) {
    if (i.status === 'completed') g[4]!.items.push(i)
    else if (!i.due_on) g[3]!.items.push(i)
    else if (i.due_on < today) g[0]!.items.push(i)
    else if (i.due_on <= weekEnd) g[1]!.items.push(i)
    else g[2]!.items.push(i)
  }
  return g.filter(x => x.items.length)
})

const statusOptions = [{ label: 'Any status', value: '__any__' }, ...WORK_STATUSES.map(s => ({ label: s.label, value: s.value }))]
const statusPick = computed({ get: () => statusFilter.value || '__any__', set: (v: string) => { statusFilter.value = v === '__any__' ? '' : v } })
const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
const priorityIcon = (p: string) => (p === 'urgent' ? 'i-lucide-flame' : p === 'high' ? 'i-lucide-arrow-up' : p === 'low' ? 'i-lucide-arrow-down' : '')

const creating = ref(false)
function created(id: string) {
  creating.value = false
  navigateTo(`/tasks/${id}`)
}

async function setStatus(i: Item, status: string) {
  const { error } = await supabase.from('work_items').update({ status: status as Item['status'] }).eq('id', i.id)
  if (error) toast.add({ title: 'Could not update', description: error.message, color: 'error' })
  else await refresh()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Tasks</h1>
        <p class="text-sm text-muted">{{ everyone ? 'Everything open across the team.' : 'What is on your plate.' }}</p>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-3">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search" size="sm" class="w-48" />
        <USelectMenu v-model="statusPick" :items="statusOptions" value-key="value" size="sm" class="w-44" />
        <USwitch v-model="everyone" label="Everyone" size="sm" />
        <USwitch v-model="showCompleted" label="Completed" size="sm" />
        <UButton icon="i-lucide-plus" @click="creating = true;">New task</UButton>
      </div>
    </div>

    <div v-for="g in groups" :key="g.label" class="space-y-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">{{ g.label }} <span class="font-normal">{{ g.items.length }}</span></h2>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default text-sm">
          <li v-for="i in g.items" :key="i.id" class="flex items-center gap-3 px-4 py-2">
            <UIcon v-if="priorityIcon(i.priority)" :name="priorityIcon(i.priority)" :class="i.priority === 'urgent' ? 'text-error' : i.priority === 'high' ? 'text-warning' : 'text-muted'" />
            <div class="min-w-0 flex-1">
              <NuxtLink :to="`/tasks/${i.id}`" class="font-medium hover:underline">{{ i.title }}</NuxtLink>
              <div class="truncate text-muted">{{ i.projects?.clients?.name }} / {{ i.projects?.name }}</div>
            </div>
            <div class="hidden gap-1 sm:flex">
              <span v-for="a in i.work_item_assignees" :key="a.user_id" class="flex size-6 items-center justify-center rounded-full bg-elevated text-[10px] font-medium" :title="a.profiles?.full_name ?? ''">{{ initials(a.profiles?.full_name ?? '?') }}</span>
            </div>
            <span class="w-16 text-right tabular-nums" :class="i.due_on && i.due_on < today && i.status !== 'completed' ? 'text-error' : 'text-muted'">{{ i.due_on ? shortDate(i.due_on) : '' }}</span>
            <USelect :model-value="i.status" :items="[...WORK_STATUSES]" size="xs" class="w-40" :color="workStatusColor(i.status)" variant="subtle" @update:model-value="setStatus(i, $event as string)" />
          </li>
        </ul>
      </UCard>
    </div>
    <p v-if="!groups.length" class="py-8 text-center text-sm text-muted">{{ everyone ? 'No open tasks.' : 'Nothing assigned to you. Switch to Everyone to see the team.' }}</p>

    <UModal v-model:open="creating" title="New task">
      <template #body>
        <WorkItemForm :projects="projects ?? []" :people="people ?? []" @saved="created" @cancel="creating = false;" />
      </template>
    </UModal>
  </div>
</template>
