<script setup lang="ts">
import type { Tables } from '~~/shared/types/database'

// Bugs, changes and ideas the team sent from inside the app, pinned to the
// screen it came from. Open ones first; Done keeps the history.
definePageMeta({ middleware: 'can', permission: 'manage_settings' })
useHead({ title: 'Feedback' })
const supabase = useSupabaseClient()
const toast = useToast()

// Open is what came in; Approved is what Luke said to do, which is what
// Claude works from; On hold is not now; Done is done.
type Tab = 'open' | 'approved' | 'hold' | 'done'
const tab = ref<Tab>('open')
const { data: rows, refresh } = await useAsyncData('feedback', async () => {
  const { data, error } = await supabase.from('feedback').select('*, by:profiles!feedback_created_by_fkey(full_name), closer:profiles!feedback_done_by_fkey(full_name)').order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  return data
}, fresh)
type Row = NonNullable<typeof rows.value>[number]
const shown = computed(() => (rows.value ?? []).filter(r => r.status === tab.value))
const count = (s: Tab) => (rows.value ?? []).filter(r => r.status === s).length
const openCount = computed(() => count('open'))
const tabs: { key: Tab, label: string }[] = [{ key: 'open', label: 'Open' }, { key: 'approved', label: 'Approved' }, { key: 'hold', label: 'On hold' }, { key: 'done', label: 'Done' }]

const busy = ref<string | null>(null)
async function setStatus(r: Row, status: Tab) {
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
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Feedback <span class="text-base font-normal text-muted">{{ openCount }} open</span></h1>
        <p class="text-sm text-muted">Bugs, changes and ideas sent from inside Docket with the Feedback pill, the rail icon, or Cmd+Shift+F. Each one says which screen and what was picked. Approve the ones to do; Claude works from the Approved list through the connector.</p>
      </div>
      <div class="ml-auto flex gap-0.5 rounded-md bg-elevated p-0.5">
        <UButton v-for="t in tabs" :key="t.key" size="xs" :variant="tab === t.key ? 'solid' : 'ghost'" :color="tab === t.key ? 'primary' : 'neutral'" @click="tab = t.key;">{{ t.label }} <span class="opacity-70">{{ count(t.key) }}</span></UButton>
      </div>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <ul v-if="shown.length" class="divide-y divide-default text-sm">
        <li v-for="r in shown" :key="r.id" class="flex items-start gap-3 px-4 py-3" :class="r.status === 'done' ? 'opacity-60' : ''">
          <UBadge :color="r.kind === 'bug' ? 'error' : r.kind === 'change' ? 'warning' : 'primary'" variant="subtle" size="sm" class="mt-0.5 w-16 justify-center">{{ r.kind === 'bug' ? 'Bug' : r.kind === 'change' ? 'Change' : 'Idea' }}</UBadge>
          <div class="min-w-0 flex-1">
            <template v-if="r.plain">
              <p class="whitespace-pre-line">{{ r.plain }}</p>
              <details class="mt-1 text-xs text-muted">
                <summary class="cursor-pointer select-none hover:text-highlighted">The technical version</summary>
                <p class="mt-1 whitespace-pre-line">{{ r.body }}</p>
              </details>
            </template>
            <p v-else class="whitespace-pre-line">{{ r.body }}</p>
            <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <NuxtLink :to="r.path" class="hover:underline" :title="r.path">{{ r.page_title || r.path }}</NuxtLink>
              <span v-if="r.element_text" class="min-w-0 max-w-md truncate" :title="r.selector ?? ''">on "{{ r.element_text }}"</span>
              <span v-else-if="r.rect" :title="`${r.rect} in ${r.viewport}`">an area of the page</span>
              <span>{{ r.by?.full_name }}, {{ stamp(r.created_at) }}</span>
              <span v-if="r.status === 'done' && r.done_at">done by {{ r.closer?.full_name }}, {{ stamp(r.done_at) }}</span>
            </div>
          </div>
          <template v-if="r.status === 'open' || r.status === 'hold'">
            <UButton v-if="r.status === 'hold'" size="xs" variant="ghost" color="neutral" :loading="busy === r.id" @click="setStatus(r, 'open')">Reopen</UButton>
            <UButton v-else size="xs" variant="ghost" color="neutral" icon="i-lucide-pause" :loading="busy === r.id" title="Not now. It leaves the open list without counting as done." @click="setStatus(r, 'hold')">Hold</UButton>
            <UButton size="xs" variant="outline" icon="i-lucide-thumbs-up" :loading="busy === r.id" title="Do it. Claude works from the Approved list." @click="setStatus(r, 'approved')">Approve</UButton>
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-check" :loading="busy === r.id" @click="setStatus(r, 'done')">Done</UButton>
          </template>
          <template v-else-if="r.status === 'approved'">
            <UButton size="xs" variant="ghost" color="neutral" :loading="busy === r.id" @click="setStatus(r, 'open')">Reopen</UButton>
            <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-check" :loading="busy === r.id" @click="setStatus(r, 'done')">Done</UButton>
          </template>
          <UButton v-else size="xs" variant="ghost" color="neutral" :loading="busy === r.id" @click="setStatus(r, 'open')">Reopen</UButton>
          <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-trash-2" aria-label="Delete" @click="remove(r)" />
        </li>
      </ul>
      <p v-else class="px-4 py-10 text-center text-sm text-muted">{{ tab === 'open' ? 'Nothing open. Cmd+Shift+F on any screen sends the next one.' : tab === 'approved' ? 'Nothing approved. Approve open items and Claude works from this list.' : tab === 'hold' ? 'Nothing on hold.' : 'Nothing done yet.' }}</p>
    </UCard>
  </div>
</template>
