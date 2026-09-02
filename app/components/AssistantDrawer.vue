<script setup lang="ts">
// The Assistant: a drawer on the right (Cmd+J or the round button in
// the corner). It knows the page you are on (route plus whatever the
// page announced through useAssistantScreen) and offers the jobs that
// fit, with real names in them: log time from a sentence on Time,
// summarise or draft a reply on a task, ask about a client's year on
// their page. Answers come from server routes; the model only sees
// what you can already see. Conversations are kept per person
// (assistant_conversations, assistant_messages) under History.
const open = useState('assistant-open', () => false)
const route = useRoute()
const router = useRouter()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const screen = useAssistantScreenState()

type Msg = { role: 'user' | 'assistant', content: string }
type Conversation = { id: string, title: string, updated_at: string }
const messages = ref<Msg[]>([])
const conversationId = ref<string | null>(null)
const conversations = ref<Conversation[] | null>(null)
const showHistory = ref(false)
const input = ref('')
const busy = ref(false)

const context = computed(() => {
  const p = route.path
  const id = typeof route.params.id === 'string' ? route.params.id : undefined
  return { path: p, taskId: p.startsWith('/tasks/') ? id : undefined, quoteId: p.startsWith('/quotes/') ? id : undefined, ...screen.value }
})
const screenLabel = computed(() => {
  const s = screen.value
  return s.task ?? s.quote ?? s.invoice ?? (s.project && s.client ? `${s.client} / ${s.project}` : s.project ?? s.client ?? s.period ?? '')
})
// Questions that fit the screen, with the names that are on it.
const suggestions = computed(() => {
  const p = route.path
  const s = screen.value
  if (p.startsWith('/tasks/')) return [`Summarise ${s.task ? `"${s.task}"` : 'this task'} and where it stands`, 'Draft a short client reply about the latest change', 'What is still open on this task?', `How much time is logged on ${s.project ?? 'this project'}?`]
  if (p === '/time') return ['log: 2h Hills Bank design this morning', 'How many hours have I logged this week?', 'What did I work on yesterday?']
  if (p.startsWith('/reports')) return [s.period ? `Sum up ${s.period}${s.client ? ` for ${s.client}` : ''}` : 'How many hours on Hills Bank in August?', 'Which projects are over budget?', 'What is unbilled right now, by client?']
  if (p.startsWith('/quotes/')) return [`Summarise ${s.quote ?? 'this quote'}`, 'Suggest a tighter intro paragraph', `What did we charge ${s.client ?? 'this client'} before?`]
  if (p.startsWith('/invoices/')) return [`Where does ${s.invoice ?? 'this invoice'} stand?`, `What else is unbilled for ${s.client ?? 'this client'}?`]
  if (p.startsWith('/projects/')) return [`How much of ${s.project ?? 'this project'}'s budget is used?`, `What is open on ${s.project ?? 'this project'}?`, `Who has logged time on ${s.project ?? 'it'} this month?`]
  if (p.startsWith('/clients/')) return [`How much have we billed ${s.client ?? 'this client'} this year?`, `What is open for ${s.client ?? 'this client'}?`, `What is unbilled for ${s.client ?? 'this client'}?`]
  if (p.startsWith('/schedule') || p.startsWith('/capacity')) return ['Who is overbooked next week?', 'What is due this week?']
  return ['What is due this week?', 'Which projects are over budget?', 'What is unbilled, by client?', 'log: 45m CheckAlt meeting']
})

// ---------- history ----------
async function loadConversations() {
  const { data } = await supabase.from('assistant_conversations').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(40)
  conversations.value = data ?? []
}
watch([open, showHistory], ([o, h]) => { if ((o || h) && !conversations.value) loadConversations() }, { immediate: true })
async function openConversation(c: Conversation) {
  const { data } = await supabase.from('assistant_messages').select('role, content').eq('conversation_id', c.id).order('id')
  messages.value = (data ?? []).map(m => ({ role: m.role as Msg['role'], content: m.content }))
  conversationId.value = c.id
  proposal.value = null
  showHistory.value = false
  scrollDown()
}
async function removeConversation(c: Conversation) {
  const { error } = await supabase.from('assistant_conversations').delete().eq('id', c.id)
  if (error) { toast.add({ title: 'Could not remove', description: error.message, color: 'error' }); return }
  conversations.value = (conversations.value ?? []).filter(x => x.id !== c.id)
  if (conversationId.value === c.id) newChat()
}
function newChat() {
  messages.value = []
  conversationId.value = null
  proposal.value = null
  showHistory.value = false
}
// Saves a line of the conversation; the first user line makes the row.
async function persist(m: Msg) {
  if (!user.value) return
  try {
    if (!conversationId.value) {
      if (m.role !== 'user') return
      const title = m.content.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 70)
      const { data, error } = await supabase.from('assistant_conversations').insert({ user_id: user.value.sub, title }).select('id, title, updated_at').single()
      if (error) throw error
      conversationId.value = data.id
      conversations.value = [data, ...(conversations.value ?? [])]
    }
    const { error } = await supabase.from('assistant_messages').insert({ conversation_id: conversationId.value, role: m.role, content: m.content })
    if (error) throw error
    const now = new Date().toISOString()
    await supabase.from('assistant_conversations').update({ updated_at: now }).eq('id', conversationId.value)
    const c = (conversations.value ?? []).find(x => x.id === conversationId.value)
    if (c) c.updated_at = now
  } catch (e) {
    console.warn('Could not save the conversation', (e as Error).message)
  }
}
const when = (s: string) => {
  const d = new Date(s)
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ---------- talking ----------
// A message that starts with "log:" is a time entry, parsed by the
// fast model and shown as a card to confirm before saving. Those are
// not kept in the history.
type Proposal = { project_id: string | null, task_id: string | null, hours: number | null, date: string, notes: string, confidence: string, question: string | null, project_name: string | null, task_name: string | null }
const proposal = ref<Proposal | null>(null)
const saving = ref(false)

async function send(text = input.value) {
  const t = text.trim()
  if (!t || busy.value) return
  input.value = ''
  busy.value = true
  try {
    if (/^log[:\s]/i.test(t)) {
      messages.value.push({ role: 'user', content: t })
      const p = await $fetch<Proposal>('/api/ai/parse-time', { method: 'POST', body: { text: t.replace(/^log[:\s]+/i, ''), date: typeof route.query.date === 'string' ? route.query.date : undefined } })
      proposal.value = p
      messages.value.push({ role: 'assistant', content: p.question ?? (p.project_id ? 'Here is what I understood. Check it and save.' : 'I could not match that to a project. Which project is it?') })
    } else {
      const used = mentions.value.filter(x => t.includes(x.title))
      mentions.value = []
      const mine: Msg = { role: 'user', content: withMentionLinks(t, used) }
      messages.value.push(mine)
      await persist(mine)
      const r = await $fetch<{ text: string, acted?: boolean }>('/api/ai/chat', { method: 'POST', body: { messages: messages.value.map(m => ({ role: m.role, content: m.content })), context: { ...context.value, mentions: used } } })
      const reply: Msg = { role: 'assistant', content: r.text }
      messages.value.push(reply)
      await persist(reply)
      // Something was logged, made, or changed: the page behind should show it.
      if (r.acted) refreshNuxtData()
    }
  } catch (e) {
    messages.value.push({ role: 'assistant', content: (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? (e as Error).message })
  } finally {
    busy.value = false
    scrollDown()
  }
}
const scrollDown = () => nextTick(() => document.querySelector('#assistant-end')?.scrollIntoView({ block: 'end' }))

// Docket paths in a reply become chips under it, named by the link
// text when the reply used one.
function linksFor(text: string) {
  const named = new Map<string, string>()
  for (const m of text.matchAll(/\[([^\]]+)\]\((\/(?:tasks|projects|clients|quotes|invoices|reports)[^\s)]*)\)/g)) named.set(m[2]!, m[1]!)
  const all = [...new Set(text.match(/\/(tasks|projects|clients|quotes|invoices|reports)[^\s)\]]*/g) ?? [])]
  return (named.size ? all.filter(to => named.has(to)) : all).slice(0, 6).map(to => ({ label: named.get(to) ?? to.split('?')[0]!, to }))
}
// The model answers in light markdown: bold, links, bullets. Render
// those and nothing else; everything is escaped first.
function renderMd(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s: string) => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => (href.startsWith('/') ? `<a href="${href}" class="underline decoration-primary/40 hover:decoration-primary" data-internal>${label}</a>` : `<a href="${href}" class="underline" target="_blank" rel="noopener">${label}</a>`))
    .replace(/`([^`]+)`/g, '<code class="rounded bg-elevated px-1 text-xs">$1</code>')
    // A bare Docket path the model forgot to name becomes a short link.
    .replace(/(^|[\s(])(\/(?:tasks|projects|clients|quotes|invoices|reports)(?:\/[A-Za-z0-9-]+|\?)[^\s)<.,]*)/g, (_, pre: string, href: string) => `${pre}<a href="${href}" class="underline decoration-primary/40 hover:decoration-primary" data-internal>${href.startsWith('/reports') ? 'open the report' : 'open'}</a>`)
  const out: string[] = []
  let list: string[] = []
  const flush = () => { if (list.length) { out.push(`<ul class="my-1 list-disc space-y-0.5 pl-4">${list.join('')}</ul>`); list = [] } }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const li = line.match(/^\s*[-*]\s+(.*)$/)
    if (li) { list.push(`<li>${inline(li[1]!)}</li>`); continue }
    flush()
    if (!line.trim()) { out.push('<div class="h-2"></div>'); continue }
    const h = line.match(/^#{1,3}\s+(.*)$/)
    out.push(h ? `<p class="font-semibold">${inline(h[1]!)}</p>` : `<p>${inline(line)}</p>`)
  }
  flush()
  return out.join('')
}
function onBodyClick(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest('a[data-internal]') as HTMLAnchorElement | null
  if (a) { e.preventDefault(); go(a.getAttribute('href')!) }
}
async function saveProposal() {
  const p = proposal.value
  if (!p?.project_id || !p.task_id || !p.hours) { toast.add({ title: 'Project, task type, and hours are all needed', color: 'error' }); return }
  saving.value = true
  try {
    const { error } = await supabase.from('time_entries').insert({ user_id: user.value!.sub, project_id: p.project_id, task_id: p.task_id, spent_on: p.date, hours: p.hours, notes: p.notes || null })
    if (error) throw error
    toast.add({ title: 'Time saved', description: `${p.hours}h on ${p.project_name}`, color: 'success' })
    messages.value.push({ role: 'assistant', content: `Saved ${p.hours}h to ${p.project_name} (${p.task_name}) on ${p.date}.` })
    proposal.value = null
    refreshNuxtData('time-week')
  } catch (e) {
    toast.add({ title: 'Could not save', description: (e as Error).message, color: 'error' })
  } finally {
    saving.value = false
  }
}
function go(to: string) { open.value = false; router.push(to) }

// ---------- "/" picker ----------
// Typing / in the box opens a list of clients, projects, tasks, quotes,
// and invoices that match what follows. Picking one puts its name in
// the message and remembers its id, so the model gets the exact record.
type Hit = { kind: string, id: string, title: string, subtitle: string | null }
type Mention = { kind: string, id: string, title: string }
const mentions = ref<Mention[]>([])
const picker = ref<{ query: string, start: number, hits: Hit[], index: number } | null>(null)
const textarea = () => document.querySelector<HTMLTextAreaElement>('aside[aria-label="Assistant"] textarea') ?? undefined
let pickerTimer: ReturnType<typeof setTimeout> | undefined
function onInput() {
  const el = textarea()
  if (!el) return
  const before = input.value.slice(0, el.selectionStart ?? input.value.length)
  const m = before.match(/(?:^|\s)\/([^\s/]*)$/)
  if (!m) { picker.value = null; return }
  const query = m[1] ?? ''
  const start = before.length - query.length - 1
  picker.value = { query, start, hits: picker.value?.start === start ? picker.value.hits : [], index: 0 }
  clearTimeout(pickerTimer)
  pickerTimer = setTimeout(async () => {
    if (!query) { if (picker.value) picker.value.hits = []; return }
    const { data } = await supabase.rpc('search', { p_q: query, p_limit: 8 })
    if (picker.value?.query === query) picker.value.hits = (data ?? []) as Hit[]
  }, 150)
}
function pick(h: Hit) {
  const p = picker.value
  if (!p) return
  const after = input.value.slice(p.start + 1 + p.query.length)
  input.value = `${input.value.slice(0, p.start)}${h.title}${after.startsWith(' ') ? '' : ' '}${after}`
  if (!mentions.value.some(x => x.id === h.id)) mentions.value.push({ kind: h.kind, id: h.id, title: h.title })
  picker.value = null
  nextTick(() => { const el = textarea(); if (el) { el.focus(); const pos = p.start + h.title.length + 1; el.setSelectionRange(pos, pos) } })
}
function onKeydown(e: KeyboardEvent) {
  const p = picker.value
  if (p) {
    if (e.key === 'ArrowDown') { e.preventDefault(); p.index = Math.min(p.index + 1, p.hits.length - 1); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); p.index = Math.max(p.index - 1, 0); return }
    if ((e.key === 'Enter' || e.key === 'Tab') && p.hits[p.index]) { e.preventDefault(); pick(p.hits[p.index]!); return }
    if (e.key === 'Escape') { e.preventDefault(); picker.value = null; return }
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); send() }
}
const PATHS: Record<string, string> = { task: '/tasks', project: '/projects', client: '/clients', quote: '/quotes', invoice: '/invoices' }
// Picked names become links in the message itself, so they show as
// linked in the bubble and in History, and the model sees the id too.
function withMentionLinks(text: string, used: Mention[]) {
  let out = text
  for (const m of used) out = out.replace(m.title, `[${m.title}](${PATHS[m.kind] ?? '/' + m.kind}/${m.id})`)
  return out
}
// The box is a plain textarea over a mirror that paints the same text
// with each picked name highlighted, so the links show inside the box.
// The textarea's text sits on top; the mirror's text is transparent
// and only its highlights show through.
const activeMentions = computed(() => mentions.value.filter(m => input.value.includes(m.title)))
const mirrorHtml = computed(() => {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  let html = esc(input.value)
  for (const m of activeMentions.value) html = html.replace(esc(m.title), `<span class="rounded-sm bg-primary/15 ring-1 ring-primary/30">${esc(m.title)}</span>`)
  return html.endsWith('\n') ? `${html}&#8203;` : html
})
const mirror = ref<HTMLElement | null>(null)
function syncBox() {
  const el = textarea()
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  if (mirror.value) mirror.value.scrollTop = el.scrollTop
}
watch(input, () => nextTick(syncBox))
const KIND_ICON: Record<string, string> = { task: 'i-lucide-check-square', project: 'i-lucide-folder', client: 'i-lucide-building-2', quote: 'i-lucide-file-signature', invoice: 'i-lucide-receipt' }
function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && open.value && (e.target as HTMLElement)?.closest('aside[aria-label="Assistant"]')) open.value = false }
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <!-- A panel beside the page, not over it. The page keeps working
       behind it and makes room on wide screens (app.vue). -->
  <Transition enter-active-class="transition-transform duration-200" enter-from-class="translate-x-full" leave-active-class="transition-transform duration-200" leave-to-class="translate-x-full">
    <aside v-if="open" class="fixed inset-y-0 right-0 z-30 flex w-full max-w-[26rem] flex-col border-l border-default bg-default shadow-xl print:hidden" aria-label="Assistant">
      <div class="flex shrink-0 items-start gap-3 border-b border-default px-4 py-3">
        <div class="min-w-0 flex-1">
          <h2 class="font-semibold">Assistant</h2>
          <p class="text-xs text-muted">Ask about time, tasks, budgets, and clients, or start a message with log: to record time.</p>
        </div>
        <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="sm" aria-label="Close" title="Close (Cmd+J)" @click="open = false;" />
      </div>
      <div class="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div class="flex shrink-0 items-center gap-2">
          <UButton size="xs" :variant="showHistory ? 'solid' : 'outline'" color="neutral" icon="i-lucide-history" @click="showHistory = !showHistory;">History</UButton>
          <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-plus" @click="newChat">New chat</UButton>
          <span v-if="conversationId && !showHistory" class="ml-auto truncate text-xs text-muted">{{ conversations?.find(c => c.id === conversationId)?.title }}</span>
        </div>

        <!-- Past conversations -->
        <div v-if="showHistory" class="min-h-0 flex-1 overflow-y-auto text-sm">
          <p v-if="!conversations" class="text-muted">Loading...</p>
          <p v-else-if="!conversations.length" class="text-muted">Nothing yet. Ask something and it will be kept here.</p>
          <ul v-else class="divide-y divide-default">
            <li v-for="c in conversations" :key="c.id" class="flex items-center gap-2 py-2">
              <button type="button" class="min-w-0 flex-1 text-left hover:underline" :class="c.id === conversationId ? 'font-medium' : ''" @click="openConversation(c)">
                <span class="block truncate">{{ c.title }}</span>
                <span class="text-xs text-muted">{{ when(c.updated_at) }}</span>
              </button>
              <UButton icon="i-lucide-x" size="xs" variant="ghost" color="neutral" aria-label="Remove" @click="removeConversation(c)" />
            </li>
          </ul>
        </div>

        <!-- The conversation -->
        <div v-else class="min-h-0 flex-1 space-y-3 overflow-y-auto text-sm">
          <div v-if="!messages.length" class="space-y-2">
            <p class="text-muted">
              <template v-if="screenLabel">Looking at <span class="font-medium text-default">{{ screenLabel }}</span>. </template>Try one of these, or ask your own question.
            </p>
            <button v-for="s in suggestions" :key="s" type="button" class="block w-full rounded-md border border-default px-3 py-2 text-left hover:bg-elevated" @click="send(s)">{{ s }}</button>
          </div>
          <div v-for="(m, i) in messages" :key="i" :class="m.role === 'user' ? 'ml-8 rounded-lg bg-primary/10 px-3 py-2' : 'rounded-lg bg-elevated px-3 py-2'">
            <div class="space-y-1" :class="m.role === 'user' ? '[&_a]:font-medium' : ''" @click="onBodyClick" v-html="renderMd(m.content)" />
            <div v-if="m.role === 'assistant' && linksFor(m.content).length" class="mt-2 flex flex-wrap gap-1">
              <UButton v-for="l in linksFor(m.content)" :key="l.to" size="xs" variant="outline" color="neutral" @click="go(l.to)">{{ l.label }}</UButton>
            </div>
          </div>
          <div v-if="proposal && proposal.project_id" class="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <div class="text-xs font-semibold uppercase tracking-wider text-muted">Time entry</div>
            <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              <dt class="text-muted">Project</dt><dd>{{ proposal.project_name }}</dd>
              <dt class="text-muted">Task</dt><dd>{{ proposal.task_name ?? 'not sure' }}</dd>
              <dt class="text-muted">Hours</dt><dd><UInput v-model.number="proposal.hours" type="number" step="0.25" size="xs" class="w-24" /></dd>
              <dt class="text-muted">Date</dt><dd><UInput v-model="proposal.date" type="date" size="xs" class="w-40" /></dd>
              <dt class="text-muted">Notes</dt><dd><UInput v-model="proposal.notes" size="xs" class="w-full" /></dd>
            </dl>
            <div class="mt-2 flex items-center gap-2">
              <UButton size="xs" :loading="saving" @click="saveProposal">Save entry</UButton>
              <UButton size="xs" variant="ghost" color="neutral" @click="proposal = null;">Discard</UButton>
              <span v-if="proposal.confidence !== 'high'" class="text-xs text-warning">Best guess, check the task type.</span>
            </div>
          </div>
          <p v-if="busy" class="text-xs text-muted">Thinking</p>
          <div id="assistant-end" />
        </div>

        <!-- input and keydown are caught here as they bubble up from the box. -->
        <form v-if="!showHistory" class="relative shrink-0 space-y-2" @submit.prevent="send()" @input="onInput" @keydown="onKeydown">
          <div v-if="picker" class="absolute bottom-full left-0 z-10 mb-1 w-full overflow-hidden rounded-md border border-default bg-default text-sm shadow-lg">
            <p v-if="!picker.query" class="px-3 py-2 text-xs text-muted">Type to find a client, project, task, quote, or invoice.</p>
            <p v-else-if="!picker.hits.length" class="px-3 py-2 text-xs text-muted">Nothing matches "{{ picker.query }}" yet.</p>
            <button v-for="(h, i) in picker.hits" :key="h.id" type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-left" :class="i === picker.index ? 'bg-elevated' : 'hover:bg-elevated'" @mousedown.prevent="pick(h)">
              <UIcon :name="KIND_ICON[h.kind] ?? 'i-lucide-circle'" class="size-4 shrink-0 text-muted" />
              <span class="min-w-0 flex-1 truncate">{{ h.title }}</span>
              <span class="truncate text-xs text-muted">{{ h.subtitle }}</span>
            </button>
          </div>
          <div class="relative">
            <div ref="mirror" aria-hidden="true" class="pointer-events-none absolute inset-px overflow-hidden whitespace-pre-wrap break-words rounded-md px-3 py-2 text-sm leading-5 text-transparent" v-html="mirrorHtml" />
            <textarea
              v-model="input" rows="2"
              class="relative block w-full resize-none rounded-md border border-default bg-transparent px-3 py-2 text-sm leading-5 text-default outline-none placeholder:text-dimmed focus:border-primary focus:ring-2 focus:ring-primary/30"
              placeholder="Ask, or log: 2h Hills Bank design. Type / to pick a client, project, or task."
              @click="onInput" @scroll="syncBox"
            />
          </div>
          <div class="flex items-center gap-2">
            <UButton type="submit" size="sm" :loading="busy" :disabled="!input.trim()">Send</UButton>
            <span class="ml-auto text-xs text-dimmed">Sees only what you can. Check numbers before you rely on them.</span>
          </div>
        </form>
      </div>
    </aside>
  </Transition>
</template>
