<script setup lang="ts">
// Listens for the cheat code, keeps the party class on the page, and
// draws the About box. Mounted once, for staff.
const { party, aboutOpen } = useEasterEggs()
const { toggleParty } = useEasterEggs()
const supabase = useSupabaseClient()
const ws = await useWorkStatuses()

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
let typed: string[] = []
function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  typed = [...typed, e.key.length === 1 ? e.key.toLowerCase() : e.key].slice(-KONAMI.length)
  if (typed.length === KONAMI.length && typed.every((k, i) => k === KONAMI[i])) { typed = []; toggleParty() }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
watch(party, v => document.documentElement.classList.toggle('party', v), { immediate: true })

// A couple of numbers for the About box, fetched when it opens.
const year = new Date().getFullYear()
const stats = ref<{ hours: number, done: number } | null>(null)
watch(aboutOpen, async (v) => {
  if (!v) return
  const doneKeys = ws.statuses.value.filter(s => s.is_done).map(s => s.key)
  const [{ data: roll }, { count }] = await Promise.all([
    supabase.rpc('report_rollup', { p_from: `${year}-01-01`, p_to: `${year}-12-31` }).single(),
    supabase.from('work_items').select('id', { count: 'exact', head: true }).in('status', doneKeys),
  ])
  stats.value = { hours: Number(roll?.hours ?? 0), done: count ?? 0 }
})
</script>

<template>
  <UModal v-model:open="aboutOpen" title="About Docket" description="You found the credits" :ui="{ content: 'sm:max-w-md' }">
    <template #body>
      <div class="flex items-start gap-4">
        <img src="/logo.svg" alt="" class="size-14 shrink-0" :class="party ? 'animate-spin [animation-duration:6s]' : ''">
        <div class="space-y-2 text-sm">
          <p><strong>Docket</strong> keeps Gigantic Design Co.'s time, tasks, retainers, quotes and invoices in one place. It replaced Harvest and ClickUp in September 2026.</p>
          <p class="text-muted">Built by Luke David with Claude, in a few very long days.</p>
          <dl v-if="stats" class="grid grid-cols-2 gap-2 pt-2">
            <div><dt class="text-xs text-muted">Hours logged in {{ year }}</dt><dd class="text-lg font-semibold tabular-nums">{{ formatHours(stats.hours) }}</dd></div>
            <div><dt class="text-xs text-muted">Tasks finished</dt><dd class="text-lg font-semibold tabular-nums">{{ stats.done.toLocaleString() }}</dd></div>
          </dl>
          <p class="pt-2 text-xs text-dimmed">There are a few more of these. One of them is older than the web.</p>
        </div>
      </div>
    </template>
  </UModal>
</template>
