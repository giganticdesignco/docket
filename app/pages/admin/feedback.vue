<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'

// Bugs, changes and ideas the team sent from inside the app, pinned to the
// screen it came from. Open ones first; Done keeps the history.
definePageMeta({ middleware: 'can', permission: 'manage_settings' })
useHead({ title: 'Feedback' })
const supabase = useSupabaseClient()
const toast = useToast()

const showDone = ref(false)
const { data: rows, refresh } = await useAsyncData('feedback', async () => {
  const { data, error } = await supabase.from('feedback').select('*, by:profiles!feedback_created_by_fkey(full_name), closer:profiles!feedback_done_by_fkey(full_name)').order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  return data
}, fresh)
type Row = NonNullable<typeof rows.value>[number]
const shown = computed(() => (rows.value ?? []).filter(r => showDone.value || r.status === 'open'))
const openCount = computed(() => (rows.value ?? []).filter(r => r.status === 'open').length)

const busy = ref<string | null>(null)
async function setStatus(r: Row, status: 'open' | 'done') {
  busy.value = r.id
  try {
    const { error } = await supabase.from('feedback').update({ status }).eq('id', r.id)
    if (error) throw error
    await refresh()
  } catch (e) {
    toast.add({ title: 'Not saved', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = null
  }
}
async function remove(r: Tables<'feedback'>) {
  const { error } = await supabase.from('feedback').delete().eq('id', r.id)
  if (error) toast.add({ title: 'Not deleted', description: error.message, color: 'error' })
  else await refresh()
}
const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Feedback <span class="text-base font-normal text-muted">{{ openCount }} open</span></h1>
        <p class="text-sm text-muted">Bugs, changes and ideas sent from inside Docket with the Feedback pill, the rail icon, or Cmd+Shift+F. Each one says which screen and what was picked. Claude reads the open list through the connector.</p>
      </div>
      <USwitch v-model="showDone" label="Show done" size="sm" class="ml-auto" />
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <ul v-if="shown.length" class="divide-y divide-default text-sm">
        <li v-for="r in shown" :key="r.id" class="flex items-start gap-3 px-4 py-3" :class="r.status === 'done' ? 'opacity-60' : ''">
          <UBadge :color="r.kind === 'bug' ? 'error' : r.kind === 'change' ? 'warning' : 'primary'" variant="subtle" size="sm" class="mt-0.5 w-16 justify-center">{{ r.kind === 'bug' ? 'Bug' : r.kind === 'change' ? 'Change' : 'Idea' }}</UBadge>
          <div class="min-w-0 flex-1">
            <p class="whitespace-pre-line">{{ r.body }}</p>
            <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <NuxtLink :to="r.path" class="hover:underline" :title="r.path">{{ r.page_title || r.path }}</NuxtLink>
              <span v-if="r.element_text" class="min-w-0 max-w-md truncate" :title="r.selector ?? ''">on "{{ r.element_text }}"</span>
              <span v-else-if="r.rect" :title="`${r.rect} in ${r.viewport}`">an area of the page</span>
              <span>{{ r.by?.full_name }}, {{ stamp(r.created_at) }}</span>
              <span v-if="r.status === 'done' && r.done_at">done by {{ r.closer?.full_name }}, {{ stamp(r.done_at) }}</span>
            </div>
          </div>
          <UButton v-if="r.status === 'open'" size="xs" variant="outline" color="neutral" icon="i-lucide-check" :loading="busy === r.id" @click="setStatus(r, 'done')">Done</UButton>
          <UButton v-else size="xs" variant="ghost" color="neutral" :loading="busy === r.id" @click="setStatus(r, 'open')">Reopen</UButton>
          <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-trash-2" aria-label="Delete" @click="remove(r)" />
        </li>
      </ul>
      <p v-else class="px-4 py-10 text-center text-sm text-muted">{{ showDone ? 'Nothing yet.' : 'Nothing open. Cmd+Shift+F on any screen sends the next one.' }}</p>
    </UCard>
  </div>
</template>
