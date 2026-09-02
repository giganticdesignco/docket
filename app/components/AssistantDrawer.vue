<script setup lang="ts">
// The Assistant: a drawer on the right (Cmd+J or the sparkle in the
// rail). It knows the page you are on and offers the jobs that fit:
// log time from a sentence on Time, summarise or draft a reply on a
// task, and Ask Docket anywhere. Answers come from server routes; the
// model only sees what you can already see.
const open = useState('assistant-open', () => false)
const route = useRoute()
const router = useRouter()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()

type Msg = { role: 'user' | 'assistant', content: string, links?: { label: string, to: string }[] }
const messages = ref<Msg[]>([])
const input = ref('')
const busy = ref(false)
const context = computed(() => {
  const p = route.path
  const id = typeof route.params.id === 'string' ? route.params.id : undefined
  return { path: p, taskId: p.startsWith('/tasks/') ? id : undefined, quoteId: p.startsWith('/quotes/') ? id : undefined }
})
const suggestions = computed(() => {
  const p = route.path
  if (p.startsWith('/tasks/')) return ['Summarise this task and where it stands', 'Draft a short client reply about the latest change', 'What is still open on this task?']
  if (p === '/time') return ['log: 2h Hills Bank design this morning', 'How many hours have I logged this week?', 'What did I work on yesterday?']
  if (p.startsWith('/reports')) return ['How many hours on Hills Bank in August?', 'Which projects are over budget?', 'What is unbilled right now, by client?']
  if (p.startsWith('/quotes/')) return ['Summarise this quote', 'Suggest a tighter intro paragraph', 'What did we charge this client before?']
  if (p.startsWith('/clients/') || p.startsWith('/projects/')) return ['How much have we billed here this year?', 'What is open on this account?']
  return ['What is due this week?', 'Which projects are over budget?', 'What is unbilled, by client?', 'log: 45m CheckAlt meeting']
})

// A message that starts with "log:" is a time entry, parsed by the
// fast model and shown as a card to confirm before saving.
type Proposal = { project_id: string | null, task_id: string | null, hours: number | null, date: string, notes: string, confidence: string, question: string | null, project_name: string | null, task_name: string | null }
const proposal = ref<Proposal | null>(null)
const saving = ref(false)

async function send(text = input.value) {
  const t = text.trim()
  if (!t || busy.value) return
  input.value = ''
  messages.value.push({ role: 'user', content: t })
  busy.value = true
  try {
    if (/^log[:\s]/i.test(t)) {
      const p = await $fetch<Proposal>('/api/ai/parse-time', { method: 'POST', body: { text: t.replace(/^log[:\s]+/i, ''), date: typeof route.query.date === 'string' ? route.query.date : undefined } })
      proposal.value = p
      messages.value.push({ role: 'assistant', content: p.question ?? (p.project_id ? `Here is what I understood. Check it and save.` : 'I could not match that to a project. Which project is it?') })
    } else {
      const r = await $fetch<{ text: string }>('/api/ai/chat', { method: 'POST', body: { messages: messages.value.filter(m => !m.links).map(m => ({ role: m.role, content: m.content })), context: context.value } })
      messages.value.push(withLinks(r.text))
    }
  } catch (e) {
    messages.value.push({ role: 'assistant', content: (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? (e as Error).message })
  } finally {
    busy.value = false
    nextTick(() => document.querySelector('#assistant-end')?.scrollIntoView({ block: 'end' }))
  }
}
// Docket paths in the reply become links under the message.
function withLinks(text: string): Msg {
  const links = [...new Set(text.match(/\/(tasks|projects|clients|quotes|invoices|reports)[^\s)\]]*/g) ?? [])].slice(0, 6).map(to => ({ label: to.split('?')[0]!, to }))
  return { role: 'assistant', content: text, links }
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
function clear() { messages.value = []; proposal.value = null }
function go(to: string) { open.value = false; router.push(to) }
</script>

<template>
  <AppDrawer v-model:open="open" title="Assistant" description="Ask about time, tasks, budgets, and clients, or start a message with log: to record time.">
    <template #body>
      <div class="flex h-full flex-col gap-3">
        <div class="min-h-0 flex-1 space-y-3 overflow-y-auto text-sm">
          <div v-if="!messages.length" class="space-y-2">
            <p class="text-muted">Try one of these, or ask your own question.</p>
            <button v-for="s in suggestions" :key="s" type="button" class="block w-full rounded-md border border-default px-3 py-2 text-left hover:bg-elevated" @click="send(s)">{{ s }}</button>
          </div>
          <div v-for="(m, i) in messages" :key="i" :class="m.role === 'user' ? 'ml-8 rounded-lg bg-primary/10 px-3 py-2' : 'rounded-lg bg-elevated px-3 py-2'">
            <p class="whitespace-pre-line">{{ m.content }}</p>
            <div v-if="m.links?.length" class="mt-2 flex flex-wrap gap-1">
              <UButton v-for="l in m.links" :key="l.to" size="xs" variant="outline" color="neutral" @click="go(l.to)">{{ l.label }}</UButton>
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
        <form class="shrink-0 space-y-2" @submit.prevent="send()">
          <UTextarea v-model="input" :rows="2" autoresize class="w-full" placeholder="Ask, or log: 2h Hills Bank design" @keydown.enter.exact.prevent="send()" />
          <div class="flex items-center gap-2">
            <UButton type="submit" size="sm" :loading="busy" :disabled="!input.trim()">Send</UButton>
            <UButton v-if="messages.length" size="sm" variant="ghost" color="neutral" @click="clear">Clear</UButton>
            <span class="ml-auto text-xs text-dimmed">Sees only what you can. Check numbers before you rely on them.</span>
          </div>
        </form>
      </div>
    </template>
  </AppDrawer>
</template>
