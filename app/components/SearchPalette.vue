<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'

// Cmd+K. One box that finds tasks, projects, clients, quotes, invoices,
// and comments as you type, with a few actions mixed in. Results come
// from the search() function under the caller's RLS. Prefixes narrow
// the kind: t: tasks, p: projects, c: clients, q: quotes, i: invoices.
const open = useState('search-open', () => false)
const supabase = useSupabaseClient()
const router = useRouter()
const { can } = useCurrentUser()


const term = ref('')
const loading = ref(false)
type Hit = { kind: string, id: string, title: string, subtitle: string }
const hits = ref<Hit[]>([])

const PREFIX: Record<string, string> = { t: 'task', p: 'project', c: 'client', q: 'quote', i: 'invoice' }
function parse(raw: string): { q: string, kind: string | null } {
  const m = raw.match(/^([tpcqi]):\s*(.*)$/i)
  if (m) return { q: m[2] ?? '', kind: PREFIX[m[1]!.toLowerCase()] ?? null }
  return { q: raw.replace(/^#/, ''), kind: null }
}

let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0
watch(term, (raw) => {
  clearTimeout(timer)
  const { q, kind } = parse(raw)
  if (q.trim().length < 2) { hits.value = []; loading.value = false; return }
  loading.value = true
  const mine = ++seq
  timer = setTimeout(async () => {
    const { data } = await supabase.rpc('search', { p_q: q, p_kind: kind ?? undefined, p_limit: 20 })
    if (mine !== seq) return
    hits.value = data ?? []
    loading.value = false
  }, 150)
})
watch(open, (o) => { if (!o) { term.value = ''; hits.value = [] } })

const ICON: Record<string, string> = { task: 'i-lucide-list-todo', comment: 'i-lucide-message-square', project: 'i-lucide-folder-kanban', client: 'i-lucide-building-2', quote: 'i-lucide-file-signature', invoice: 'i-lucide-file-text' }
const LABEL: Record<string, string> = { task: 'Tasks', comment: 'Comments', project: 'Projects', client: 'Clients', quote: 'Quotes', invoice: 'Invoices' }
const PATH: Record<string, string> = { task: '/tasks', comment: '/tasks', project: '/projects', client: '/clients', quote: '/quotes', invoice: '/invoices' }

// Last ten things opened from here, per browser.
const RECENT_KEY = 'docket-search-recent'
const recent = ref<Hit[]>([])
function loadRecent() {
  try { recent.value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') } catch { recent.value = [] }
}
function remember(h: Hit) {
  const next = [h, ...recent.value.filter(r => r.id !== h.id)].slice(0, 10)
  recent.value = next
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* private mode */ }
}
onMounted(loadRecent)

function go(h: Hit) {
  remember({ ...h, kind: h.kind === 'comment' ? 'task' : h.kind })
  open.value = false
  router.push(`${PATH[h.kind]}/${h.id}`)
}
const toItem = (h: Hit): CommandPaletteItem => ({ label: h.title, suffix: h.subtitle, icon: ICON[h.kind], onSelect: () => go(h) })

const actions = computed<CommandPaletteItem[]>(() => {
  const nav = (label: string, to: string, icon: string, kbds?: string[]) => ({ label, icon, kbds, onSelect: () => { open.value = false; router.push(to) } })
  return [
    nav('New task', '/tasks?new=1', 'i-lucide-plus'),
    nav('Log time', '/time?new=1', 'i-lucide-timer'),
    nav('Go to Time', '/time', 'i-lucide-clock'),
    nav('Go to Tasks', '/tasks', 'i-lucide-list-todo'),
    nav('Go to Projects', '/projects', 'i-lucide-folder-kanban'),
    nav('Go to Clients', '/clients', 'i-lucide-building-2'),
    nav('Go to Expenses', '/expenses', 'i-lucide-receipt'),
    nav('Go to Schedule', '/schedule', 'i-lucide-gantt-chart'),
    nav('Go to Estimator', '/estimator', 'i-lucide-calculator'),
    ...(can('see_all_time') ? [nav('Go to Reports', '/reports', 'i-lucide-chart-column')] : []),
    ...(can('see_capacity') ? [nav('Go to Planner', '/planner', 'i-lucide-move')] : []),
    ...(can('manage_quotes') ? [nav('Go to Quotes', '/quotes', 'i-lucide-file-signature')] : []),
    ...(can('manage_invoices') ? [nav('Go to Invoices', '/invoices', 'i-lucide-file-text')] : []),
    ...(can('manage_settings') ? [nav('Go to Settings', '/admin', 'i-lucide-settings')] : []),
  ]
})

const groups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => {
  const { q } = parse(term.value)
  if (q.trim().length < 2) {
    return [
      ...(recent.value.length ? [{ id: 'recent', label: 'Recent', ignoreFilter: true, items: recent.value.map(toItem) }] : []),
      { id: 'actions', label: 'Actions', items: actions.value },
    ]
  }
  const byKind = new Map<string, Hit[]>()
  for (const h of hits.value) byKind.set(h.kind, [...(byKind.get(h.kind) ?? []), h])
  const out: CommandPaletteGroup<CommandPaletteItem>[] = []
  for (const kind of ['client', 'project', 'task', 'comment', 'quote', 'invoice']) {
    const list = byKind.get(kind)
    if (list?.length) out.push({ id: kind, label: LABEL[kind], ignoreFilter: true, items: list.map(toItem) })
  }
  out.push({ id: 'actions', label: 'Actions', items: actions.value })
  return out
})
</script>

<template>
  <UModal v-model:open="open" title="Search" description="Find tasks, projects, clients, quotes, and invoices" :ui="{ content: 'sm:max-w-xl' }">
    <template #content>
      <UCommandPalette
        v-model:search-term="term"
        :groups="groups"
        :loading="loading"
        placeholder="Search tasks, projects, clients, quotes, invoices"
        class="h-96"
        :close="true"
        @update:open="open = $event"
      />
      <p class="border-t border-default px-4 py-2 text-xs text-muted">
        Start with <UKbd>t:</UKbd> tasks, <UKbd>p:</UKbd> projects, <UKbd>c:</UKbd> clients, <UKbd>q:</UKbd> quotes, or <UKbd>i:</UKbd> invoices to search only that kind, for example <span class="font-mono">t: email</span>.
      </p>
    </template>
  </UModal>
</template>
