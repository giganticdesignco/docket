<script setup lang="ts">
// The strip of totals from the report page, for a client, project, or
// person on their own page. Same report_rollup function, same filters,
// so the numbers here match the report the link opens. Runs under the
// caller's RLS: staff see their own hours, and money stays admin only.
const props = withDefaults(defineProps<{
  from: string
  to: string
  client?: string
  project?: string
  person?: string
  title?: string
  compare?: boolean
  // 'tiles' draws each number in its own bordered box, for a page that
  // wants a dashboard across the top. `extra` adds tiles the caller owns,
  // so a page can put its own numbers in the same grid.
  variant?: 'card' | 'tiles'
  extra?: { label: string, value: string, sub?: string, subClass?: string }[]
  // Labels to leave out, for a page where one of them says nothing new.
  omit?: string[]
  // What an hour of billable work actually earned, billable amount over
  // billable hours. Off by default, since it only reads as a rate where
  // the work is mostly hourly.
  rate?: boolean
}>(), { title: 'This year', compare: true, variant: 'card' })

const supabase = useSupabaseClient()
const { can } = useCurrentUser()
const seeMoney = computed(() => can('field:amounts'))
const seeAll = computed(() => can('see_all_time'))

const args = computed(() => ({
  p_client: props.client || undefined,
  p_project: props.project || undefined,
  p_person: props.person || undefined,
}))
const yearAgo = (s: string) => `${Number(s.slice(0, 4)) - 1}${s.slice(4)}`.replace(/-02-29$/, '-02-28')
async function rollup(from: string, to: string) {
  const { data, error } = await supabase.rpc('report_rollup', { ...args.value, p_from: from, p_to: to }).single()
  if (error) throw error
  return data
}

const key = computed(() => JSON.stringify([props.from, props.to, props.client, props.project, props.person]))
const { data } = await useAsyncData(`rollup-${key.value}`, async () => {
  const compareTo = props.to > todayString() ? todayString() : props.to
  const [now, then] = await Promise.all([
    rollup(props.from, props.to),
    props.compare ? rollup(yearAgo(props.from), yearAgo(compareTo)) : null,
  ])
  return { now, then }
}, { ...fresh, watch: [key] })

const money0 = (n: number) => `$${Math.round(Number(n)).toLocaleString()}`
const hoursText = (h: number) => formatHours(h).replace(/^(\d+)/, m => Number(m).toLocaleString())
type Stat = { label: string, value: string, now: number, then: number | null }
const stats = computed<Stat[]>(() => {
  const now = data.value?.now
  if (!now) return []
  const then = data.value?.then ?? null
  const s = (label: string, k: keyof typeof now, fmt: (n: number) => string): Stat => ({ label, value: fmt(Number(now[k])), now: Number(now[k]), then: then ? Number(then[k]) : null })
  const base = [s('Hours', 'hours', hoursText), s('Billable hours', 'billable_hours', hoursText)]
  if (!seeMoney.value) return base
  const out = [...base, s('Billable amount', 'billable_amount', money0), s('Uninvoiced', 'uninvoiced_amount', money0), s('Expenses', 'expenses', money0)]
  if (props.rate) {
    // Fixed fee and non-billable work skew this, so it is an average, not a rate card.
    const per = (r: typeof now | null) => (r && Number(r.billable_hours) > 0 ? Number(r.billable_amount) / Number(r.billable_hours) : 0)
    out.push({ label: 'Effective rate', value: per(now) ? `${money0(per(now))} / hour` : '', now: per(now), then: then ? per(then) : null })
  }
  return out
})
function delta(st: Stat): { text: string, color: string } | null {
  if (st.then == null) return null
  if (!st.then) return { text: 'nothing last year', color: 'text-muted' }
  const pct = Math.round((st.now - st.then) / st.then * 100)
  const toDate = props.to > todayString() ? ' to date' : ''
  return { text: `${pct >= 0 ? '+' : ''}${pct}% vs last year${toDate}`, color: pct >= 0 ? 'text-success' : 'text-error' }
}

// One list the tile layout renders: this component's own stats, then
// whatever the page handed in.
const tiles = computed(() => [
  ...stats.value.filter(st => !(props.omit ?? []).includes(st.label))
    .map(st => ({ label: st.label, value: st.value, sub: delta(st)?.text, subClass: delta(st)?.color })),
  ...(props.extra ?? []),
])

const reportLink = computed(() => ({
  path: '/reports',
  query: {
    range: 'custom', from: props.from, to: props.to,
    ...(props.client ? { client: props.client } : {}),
    ...(props.project ? { project: props.project, tab: 'task' } : {}),
    ...(props.person ? { person: props.person, tab: 'project' } : {}),
  },
}))
</script>

<template>
  <!-- Tiles: one box per number, so a page reads as a dashboard. -->
  <div v-if="variant === 'tiles' && tiles.length" class="space-y-2">
    <div class="flex items-baseline gap-3">
      <h2 class="font-semibold">{{ title }}</h2>
      <span v-if="!seeAll" class="text-xs text-muted">Your time</span>
      <NuxtLink v-if="seeAll" :to="reportLink" class="ml-auto text-xs text-muted hover:underline">Full report</NuxtLink>
    </div>
    <div class="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <div v-for="t in tiles" :key="t.label" class="rounded-lg border border-default bg-default p-3">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-dimmed">{{ t.label }}</div>
        <div class="mt-0.5 text-xl font-semibold tabular-nums">{{ t.value }}</div>
        <div v-if="t.sub" class="text-xs tabular-nums" :class="t.subClass ?? 'text-muted'">{{ t.sub }}</div>
      </div>
    </div>
  </div>

  <UCard v-else-if="stats.length" :ui="{ body: 'p-3 sm:p-4' }">
    <div class="flex items-baseline gap-3">
      <h2 class="font-semibold">{{ title }}</h2>
      <span v-if="!seeAll" class="text-xs text-muted">Your time</span>
      <NuxtLink v-if="seeAll" :to="reportLink" class="ml-auto text-xs text-muted hover:underline">Full report</NuxtLink>
    </div>
    <div class="mt-3 grid gap-4" :class="stats.length > 2 ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2'">
      <div v-for="st in stats" :key="st.label">
        <div class="text-xs text-muted">{{ st.label }}</div>
        <div class="text-lg font-semibold tabular-nums">{{ st.value }}</div>
        <div v-if="delta(st)" class="text-xs" :class="delta(st)!.color">{{ delta(st)!.text }}</div>
      </div>
    </div>
  </UCard>
</template>
