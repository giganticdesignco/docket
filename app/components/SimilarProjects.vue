<script setup lang="ts">
// A baseline for a new project: what similar finished projects took
// (inactive ones and Harvest history). As the name is typed they are scored by
// the words they share with it, dates and job numbers ignored, the same
// client counted extra. The typical hours and amount across the matches
// can be dropped into the budget fields with one click.
const props = defineProps<{ name: string, clientName?: string, hideUse?: boolean }>()
const emit = defineEmits<{ use: [hours: number, amount: number | null] }>()
const supabase = useSupabaseClient()

type Row = { project_id: string | null, name: string, client_name: string, hours: number, amount: number | null, first_on: string | null, last_on: string | null }
const STOP = new Set(['and', 'the', 'of', 'for', 'a', 'an', 'to', 'in', 'on', 'with', 'gp', 'new', 'project'])
// "Photo/Video (8/26) - GP" becomes ["photo", "video"].
function words(s: string) {
  return s.toLowerCase()
    .replace(/\(\s*\d{1,2}\s*\/\s*\d{2,4}\s*\)/g, ' ')
    .replace(/\b\d{1,2}\/\d{2,4}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w))
}
const history = ref<Row[] | null>(null)
// Fetched for the words being typed, a moment after typing stops.
let timer: ReturnType<typeof setTimeout> | undefined
watch(() => words(props.name).join(' '), (key) => {
  clearTimeout(timer)
  if (!key) { history.value = []; return }
  timer = setTimeout(async () => {
    const { data } = await supabase.rpc('project_history', { p_words: key.split(' ') })
    if (words(props.name).join(' ') === key) history.value = (data ?? []) as Row[]
  }, 300)
}, { immediate: true })

const matches = computed(() => {
  const q = words(props.name)
  if (!q.length || !history.value) return []
  const qset = new Set(q)
  return history.value
    .map((r) => {
      const ws = new Set(words(r.name))
      const shared = [...qset].filter(w => ws.has(w)).length
      if (!shared) return null
      const score = shared / qset.size + shared / Math.max(ws.size, 1) * 0.5 + (props.clientName && r.client_name === props.clientName ? 0.4 : 0)
      return { ...r, score }
    })
    .filter((r): r is Row & { score: number } => !!r)
    .sort((a, b) => b.score - a.score || (b.last_on ?? '').localeCompare(a.last_on ?? ''))
    .slice(0, 12)
})
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
const typicalHours = computed(() => median(matches.value.map(m => m.hours)))
const typicalAmount = computed(() => {
  const xs = matches.value.map(m => m.amount).filter((a): a is number => a != null && a > 0)
  return xs.length ? median(xs) : null
})
const shown = computed(() => matches.value.slice(0, 5))
const more = ref(false)
const span = (r: Row) => {
  if (!r.first_on) return ''
  const f = new Date(r.first_on), l = r.last_on ? new Date(r.last_on) : f
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  return f.getFullYear() === l.getFullYear() && f.getMonth() === l.getMonth() ? fmt(f) : `${fmt(f)} to ${fmt(l)}`
}
const roundQuarter = (n: number) => Math.round(n * 4) / 4
const range = computed(() => {
  const hs = matches.value.map(m => m.hours)
  if (hs.length < 2) return null
  return { lo: formatHours(Math.min(...hs)), hi: formatHours(Math.max(...hs)) }
})
</script>

<template>
  <div v-if="matches.length" class="rounded-md border border-default bg-elevated/40 p-3 text-sm">
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <div class="font-medium">Similar completed projects</div>
        <div class="text-xs text-muted">
          Typically <span class="font-medium text-default">{{ formatHours(typicalHours ?? 0) }}</span><template v-if="typicalAmount"> and <span class="font-medium text-default">{{ money0(typicalAmount) }}</span></template>,
          the median of {{ matches.length }}<template v-if="range"> (from {{ range.lo }} to {{ range.hi }})</template>.
        </div>
      </div>
      <UButton v-if="!hideUse" size="xs" variant="outline" color="neutral" class="shrink-0" @click="emit('use', roundQuarter(typicalHours ?? 0), typicalAmount)">Use as budget</UButton>
    </div>
    <table class="mt-2 w-full table-fixed text-xs">
      <tbody>
        <tr v-for="m in (more ? matches : shown)" :key="`${m.project_id ?? m.name}-${m.client_name}`" class="border-t border-default/60">
          <td class="py-1 pr-3">
            <div class="truncate">
              <NuxtLink v-if="m.project_id" :to="`/projects/${m.project_id}`" class="hover:underline">{{ m.name }}</NuxtLink>
              <span v-else>{{ m.name }}</span>
            </div>
            <div class="truncate text-muted">{{ m.client_name }}<template v-if="span(m)"> &middot; {{ span(m) }}</template></div>
          </td>
          <td class="w-16 whitespace-nowrap py-1 pl-2 text-right align-top tabular-nums">{{ formatHours(m.hours) }}</td>
          <td class="w-20 whitespace-nowrap py-1 pl-3 text-right align-top tabular-nums text-muted">{{ m.amount ? money0(m.amount) : '' }}</td>
        </tr>
      </tbody>
    </table>
    <button v-if="matches.length > shown.length" type="button" class="mt-1 text-xs text-muted hover:underline" @click="more = !more">{{ more ? 'Show fewer' : `Show ${matches.length - shown.length} more` }}</button>
  </div>
</template>
