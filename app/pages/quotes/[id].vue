<script setup lang="ts">
import type { QuoteDoc } from '~~/shared/types/quote'

// One quote. While draft or sent: edit the header, scope lines, and the
// page sitemap; preview; send; accept or decline on the client's behalf.
// Accepted quotes link to the project they made.
definePageMeta({ middleware: 'admin' })

const route = useRoute()
const id = route.params.id as string
const supabase = useSupabaseClient()
const toast = useToast()
const origin = useRequestURL().origin

const { data: quote, refresh: refreshQuote } = await useAsyncData(`quote-${id}`, async () => {
  const { data, error } = await supabase.from('quotes').select('*, clients(name), projects(id, name)').eq('id', id).single()
  if (error) throw createError({ statusCode: 404, statusMessage: 'Quote not found' })
  return data
}, fresh)
const { data: lines, refresh: refreshLines } = await useAsyncData(`quote-${id}-lines`, async () => {
  const { data, error } = await supabase.from('quote_line_items').select('*').eq('quote_id', id).order('sort_order').order('created_at')
  if (error) throw error
  return data
}, fresh)
const { data: nodes, refresh: refreshNodes } = await useAsyncData(`quote-${id}-nodes`, async () => {
  const { data, error } = await supabase.from('quote_sitemap_nodes').select('*').eq('quote_id', id).order('sort_order').order('created_at')
  if (error) throw error
  return data
}, fresh)
const { data: taskTypes } = await useAsyncData('task-types-for-quotes', async () => {
  const { data, error } = await supabase.from('tasks').select('id, name').eq('is_active', true).order('name')
  if (error) throw error
  return data
}, fresh)
const { data: doc, refresh: refreshDoc } = await useAsyncData(`quote-${id}-doc`, () => $fetch<QuoteDoc>(`/api/q/${quote.value!.public_token}`), fresh)

useHead({ title: () => (quote.value ? `Quote ${quote.value.number}` : 'Quote') })
async function refreshAll() {
  await Promise.all([refreshQuote(), refreshLines(), refreshNodes()])
  await refreshDoc()
}

const editable = computed(() => quote.value?.status === 'draft' || quote.value?.status === 'sent')
const today = todayString()
const badge = computed((): { label: string, color: 'neutral' | 'info' | 'success' | 'error' } => {
  const q = quote.value
  if (!q) return { label: '', color: 'neutral' }
  if (q.status === 'sent' && q.valid_until && q.valid_until < today) return { label: 'expired', color: 'error' }
  return q.status === 'sent' ? { label: 'sent', color: 'info' } : q.status === 'accepted' ? { label: 'accepted', color: 'success' } : q.status === 'expired' ? { label: 'expired', color: 'error' } : { label: q.status, color: 'neutral' }
})
const publicLink = computed(() => `${origin}/q/${quote.value?.public_token}`)
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

// ---------- editor ----------

type LineDraft = { id: string, description: string, task_id: string | null, hours: number | string, rate: number | string, amount: number | string }
type NodeDraft = { id: string, parent_id: string | null, line_item_id: string | null, title: string, path: string, template: string }
const form = reactive({ title: '', intro: '', terms: '', valid_until: '' })
const draftLines = ref<LineDraft[]>([])
const draftNodes = ref<NodeDraft[]>([])
const snapshot = ref('')
const removedLines = new Set<string>()
const removedNodes = new Set<string>()

function loadEditor() {
  const q = quote.value
  if (!q) return
  form.title = q.title
  form.intro = q.intro ?? ''
  form.terms = q.terms ?? ''
  form.valid_until = q.valid_until ?? ''
  draftLines.value = (lines.value ?? []).map(l => ({ id: l.id, description: l.description, task_id: l.task_id, hours: l.hours ?? '', rate: l.rate ?? '', amount: l.amount }))
  draftNodes.value = (nodes.value ?? []).map(n => ({ id: n.id, parent_id: n.parent_id, line_item_id: n.line_item_id, title: n.title, path: n.path ?? '', template: n.template ?? '' }))
  removedLines.clear()
  removedNodes.clear()
  snapshot.value = JSON.stringify([form, draftLines.value, draftNodes.value])
}
loadEditor()
watch([quote, lines, nodes], loadEditor)
const dirty = computed(() => JSON.stringify([form, draftLines.value, draftNodes.value]) !== snapshot.value)

const lineAmount = (l: LineDraft) => (l.hours !== '' && l.rate !== '' ? round2(Number(l.hours) * Number(l.rate)) : Number(l.amount) || 0)
const editorTotal = computed(() => round2(draftLines.value.reduce((s, l) => s + lineAmount(l), 0)))
const taskOptions = computed(() => [{ label: 'No task type', value: '__none__' }, ...(taskTypes.value ?? []).map(t => ({ label: t.name, value: t.id }))])
const lineOptions = computed(() => [{ label: 'Not priced', value: '__none__' }, ...draftLines.value.map(l => ({ label: l.description || 'Untitled line', value: l.id }))])

function addLine() {
  draftLines.value.push({ id: crypto.randomUUID(), description: '', task_id: null, hours: '', rate: '', amount: '' })
}
function removeLine(i: number) {
  const l = draftLines.value[i]!
  removedLines.add(l.id)
  draftLines.value.splice(i, 1)
  for (const n of draftNodes.value) if (n.line_item_id === l.id) n.line_item_id = null
}

// Sitemap: a flat list with parent links, shown indented.
type Flat = { node: NodeDraft, depth: number }
const flatNodes = computed<Flat[]>(() => {
  const byParent = new Map<string | null, NodeDraft[]>()
  for (const n of draftNodes.value) byParent.set(n.parent_id, [...(byParent.get(n.parent_id) ?? []), n])
  const walk = (parent: string | null, depth: number): Flat[] => (byParent.get(parent) ?? []).flatMap(n => [{ node: n, depth }, ...walk(n.id, depth + 1)])
  return walk(null, 0)
})
function addNode(parent: NodeDraft | null) {
  draftNodes.value.push({ id: crypto.randomUUID(), parent_id: parent?.id ?? null, line_item_id: parent?.line_item_id ?? null, title: '', path: '', template: parent?.template ?? '' })
}
function removeNode(n: NodeDraft) {
  const ids = new Set<string>([n.id])
  let grew = true
  while (grew) {
    grew = false
    for (const x of draftNodes.value) if (x.parent_id && ids.has(x.parent_id) && !ids.has(x.id)) { ids.add(x.id); grew = true }
  }
  for (const x of ids) removedNodes.add(x)
  draftNodes.value = draftNodes.value.filter(x => !ids.has(x.id))
}
const pagesFor = (lineId: string) => draftNodes.value.filter(n => n.line_item_id === lineId).length

const saving = ref(false)
async function save(): Promise<boolean> {
  if (!form.title.trim()) return fail('Give the quote a title')
  if (draftLines.value.some(l => !l.description.trim())) return fail('Every scope line needs a description')
  if (draftNodes.value.some(n => !n.title.trim())) return fail('Every page needs a title')
  saving.value = true
  try {
    const { error: qErr } = await supabase.from('quotes').update({
      title: form.title.trim(), intro: form.intro.trim() || null, terms: form.terms.trim() || null, valid_until: form.valid_until || null, updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (qErr) throw qErr
    if (removedNodes.size) {
      const { error } = await supabase.from('quote_sitemap_nodes').delete().in('id', [...removedNodes])
      if (error) throw error
    }
    if (removedLines.size) {
      const { error } = await supabase.from('quote_line_items').delete().in('id', [...removedLines])
      if (error) throw error
    }
    if (draftLines.value.length) {
      const { error } = await supabase.from('quote_line_items').upsert(draftLines.value.map((l, i) => ({
        id: l.id, quote_id: id, sort_order: i + 1, description: l.description.trim(), task_id: l.task_id,
        hours: l.hours === '' ? null : Number(l.hours), rate: l.rate === '' ? null : Number(l.rate), amount: lineAmount(l),
      })), { onConflict: 'id' })
      if (error) throw error
    }
    if (draftNodes.value.length) {
      // Parents before children, so a new child never points at an unsaved parent.
      const ordered = flatNodes.value.map((f, i) => ({ ...f.node, sort_order: i + 1 }))
      const { error } = await supabase.from('quote_sitemap_nodes').upsert(ordered.map(n => ({
        id: n.id, quote_id: id, parent_id: n.parent_id, line_item_id: n.line_item_id, sort_order: n.sort_order,
        title: n.title.trim(), path: n.path.trim() || null, template: n.template.trim() || null,
      })), { onConflict: 'id' })
      if (error) throw error
    }
    await refreshAll()
    toast.add({ title: 'Quote saved', color: 'success' })
    return true
  } catch (e) {
    return fail((e as Error).message)
  } finally {
    saving.value = false
  }
}
function fail(message: string) {
  toast.add({ title: 'Not saved', description: message, color: 'error' })
  return false
}

// ---------- actions ----------

async function copyLink() {
  await navigator.clipboard.writeText(publicLink.value)
  toast.add({ title: 'Quote link copied', color: 'success' })
}
const sendOpen = ref(false)
const sendTo = ref('')
const sendMessage = ref('')
const sending = ref(false)
async function send() {
  if (dirty.value && !(await save())) return
  sending.value = true
  try {
    const res = await $fetch<{ to: string[] }>('/api/quotes/send', { method: 'POST', body: { quoteId: id, to: sendTo.value.split(/[\s,;]+/).filter(Boolean), message: sendMessage.value } })
    sendOpen.value = false
    toast.add({ title: 'Quote sent', description: `To ${res.to.join(', ')}`, color: 'success' })
    await refreshAll()
  } catch (e) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Not sent', description: err.data?.statusMessage ?? err.message, color: 'error' })
  } finally {
    sending.value = false
  }
}
async function markSent() {
  if (dirty.value && !(await save())) return
  const { error } = await supabase.from('quotes').update({ status: 'sent', sent_at: quote.value?.sent_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)
  if (error) fail(error.message)
  else await refreshAll()
}
const decideOpen = ref<'accept' | 'decline' | null>(null)
const decideName = ref('')
const decideNote = ref('')
const deciding = ref(false)
async function decide() {
  if (dirty.value && !(await save())) return
  deciding.value = true
  try {
    if (decideOpen.value === 'accept') {
      const { data, error } = await supabase.rpc('accept_quote', { p_quote_id: id, p_name: decideName.value, p_email: decideNote.value.trim() || undefined })
      if (error) throw error
      toast.add({ title: 'Quote accepted', description: 'A project was created from it.', color: 'success' })
      decideOpen.value = null
      await refreshAll()
      await navigateTo(`/projects/${data}`)
      return
    }
    const { error } = await supabase.rpc('decline_quote', { p_quote_id: id, p_name: decideName.value, p_reason: decideNote.value.trim() || undefined })
    if (error) throw error
    decideOpen.value = null
    await refreshAll()
  } catch (e) {
    fail((e as Error).message)
  } finally {
    deciding.value = false
  }
}
const deleting = ref(false)
async function deleteQuote() {
  const { error } = await supabase.from('quotes').delete().eq('id', id)
  if (error) fail(error.message)
  else await navigateTo('/quotes')
}
</script>

<template>
  <div v-if="quote" class="space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <UButton to="/quotes" icon="i-lucide-arrow-left" variant="ghost" color="neutral" size="sm" />
      <h1 class="text-2xl font-semibold">
        {{ quote.number }}
        <span class="font-normal text-muted">for <NuxtLink :to="`/clients/${quote.client_id}`" class="hover:underline">{{ quote.clients?.name }}</NuxtLink></span>
      </h1>
      <UBadge :color="badge.color" variant="subtle">{{ badge.label }}</UBadge>
      <div class="ml-auto flex flex-wrap gap-2">
        <UButton v-if="editable" :loading="saving" :disabled="!dirty" icon="i-lucide-save" @click="save();">Save</UButton>
        <UButton :to="publicLink" target="_blank" variant="outline" color="neutral" icon="i-lucide-external-link">Preview</UButton>
        <UButton variant="outline" color="neutral" icon="i-lucide-link" @click="copyLink">Copy link</UButton>
        <UButton v-if="editable" icon="i-lucide-send" @click="sendTo = ''; sendMessage = ''; sendOpen = true;">Send</UButton>
        <UButton v-if="quote.status === 'draft'" variant="outline" icon="i-lucide-check" @click="markSent">Mark as sent</UButton>
        <UButton v-if="editable" variant="outline" color="success" icon="i-lucide-check-check" @click="decideName = ''; decideNote = ''; decideOpen = 'accept';">Accept</UButton>
        <UButton v-if="editable" variant="outline" color="neutral" icon="i-lucide-x" @click="decideName = ''; decideNote = ''; decideOpen = 'decline';">Decline</UButton>
        <UButton v-if="quote.status === 'draft'" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete quote" @click="deleting = true;" />
      </div>
    </div>

    <p class="text-sm text-muted">
      <span v-if="quote.sent_at">Sent {{ stamp(quote.sent_at) }}. </span>
      <span v-if="quote.status === 'accepted'">Accepted by {{ quote.accepted_by }}<span v-if="quote.accepted_email"> ({{ quote.accepted_email }})</span>, {{ stamp(quote.accepted_at!) }}.
        <NuxtLink v-if="quote.projects" :to="`/projects/${quote.projects.id}`" class="underline">Open the project</NuxtLink>.</span>
      <span v-if="quote.status === 'declined'">Declined<span v-if="quote.declined_by"> by {{ quote.declined_by }}</span>, {{ stamp(quote.declined_at!) }}.<span v-if="quote.decline_reason"> "{{ quote.decline_reason }}"</span></span>
    </p>

    <template v-if="editable">
      <UCard>
        <div class="grid gap-4 md:grid-cols-4">
          <UFormField label="Title" class="md:col-span-3" help="Becomes the project name when accepted.">
            <UInput v-model="form.title" class="w-full" />
          </UFormField>
          <UFormField label="Valid until">
            <UInput v-model="form.valid_until" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Introduction" class="md:col-span-4" help="Scope narrative, printed above the lines.">
            <UTextarea v-model="form.intro" :rows="4" class="w-full" />
          </UFormField>
          <UFormField label="Terms" class="md:col-span-4">
            <UTextarea v-model="form.terms" :rows="3" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <div class="flex items-center gap-4">
        <h2 class="text-lg font-semibold">Scope</h2>
        <span class="text-sm text-muted">Hours x rate, or a flat amount.</span>
        <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-plus" class="ml-auto" @click="addLine">Add line</UButton>
      </div>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <table class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr class="border-b border-default">
              <th class="px-4 py-2 font-medium">Description</th>
              <th class="w-44 px-2 py-2 font-medium">Task type</th>
              <th class="w-24 px-2 py-2 text-right font-medium">Hours</th>
              <th class="w-28 px-2 py-2 text-right font-medium">Rate</th>
              <th class="w-32 px-2 py-2 text-right font-medium">Amount</th>
              <th class="w-12 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="(l, i) in draftLines" :key="l.id" class="border-b border-default last:border-0 align-top">
              <td class="px-4 py-1.5">
                <UInput v-model="l.description" class="w-full" size="sm" />
                <div v-if="pagesFor(l.id)" class="mt-0.5 text-xs text-muted">{{ pagesFor(l.id) }} page{{ pagesFor(l.id) === 1 ? '' : 's' }} in the sitemap</div>
              </td>
              <td class="px-2 py-1.5"><USelect :model-value="l.task_id ?? '__none__'" :items="taskOptions" size="sm" class="w-full" @update:model-value="l.task_id = $event === '__none__' ? null : ($event as string)" /></td>
              <td class="px-2 py-1.5"><UInput v-model="l.hours" type="number" step="0.25" size="sm" class="w-full" :ui="{ base: 'text-right' }" /></td>
              <td class="px-2 py-1.5"><UInput v-model="l.rate" type="number" step="1" size="sm" class="w-full" :ui="{ base: 'text-right' }" /></td>
              <td class="px-2 py-1.5">
                <UInput v-if="l.hours === '' || l.rate === ''" v-model="l.amount" type="number" step="0.01" size="sm" class="w-full" :ui="{ base: 'text-right' }" placeholder="flat" />
                <div v-else class="py-1 text-right tabular-nums">{{ money(lineAmount(l)) }}</div>
              </td>
              <td class="px-2 py-1.5 text-right"><UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" aria-label="Remove line" @click="removeLine(i)" /></td>
            </tr>
            <tr v-if="!draftLines.length">
              <td colspan="6" class="px-4 py-6 text-center text-muted">No scope lines yet.</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="border-t border-default">
              <td colspan="4" class="px-4 py-2 text-right font-medium">Total</td>
              <td class="px-2 py-2 text-right font-semibold tabular-nums">{{ money(editorTotal) }}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </UCard>

      <div class="flex items-center gap-4">
        <h2 class="text-lg font-semibold">Sitemap</h2>
        <span class="text-sm text-muted">Pages the site will have. Link pages to a scope line so the line shows its page count.</span>
        <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-plus" class="ml-auto" @click="addNode(null)">Add page</UButton>
      </div>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <table class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr class="border-b border-default">
              <th class="px-4 py-2 font-medium">Page</th>
              <th class="w-44 px-2 py-2 font-medium">Path</th>
              <th class="w-36 px-2 py-2 font-medium">Template</th>
              <th class="w-48 px-2 py-2 font-medium">Priced by</th>
              <th class="w-20 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ node, depth } in flatNodes" :key="node.id" class="border-b border-default last:border-0">
              <td class="px-4 py-1.5"><div :style="{ paddingLeft: `${depth * 1.25}rem` }"><UInput v-model="node.title" size="sm" class="w-full" placeholder="About us" /></div></td>
              <td class="px-2 py-1.5"><UInput v-model="node.path" size="sm" class="w-full" placeholder="/about" /></td>
              <td class="px-2 py-1.5"><UInput v-model="node.template" size="sm" class="w-full" placeholder="Landing" /></td>
              <td class="px-2 py-1.5"><USelect :model-value="node.line_item_id ?? '__none__'" :items="lineOptions" size="sm" class="w-full" @update:model-value="node.line_item_id = $event === '__none__' ? null : ($event as string)" /></td>
              <td class="px-2 py-1.5 text-right whitespace-nowrap">
                <UButton icon="i-lucide-corner-down-right" variant="ghost" color="neutral" size="xs" aria-label="Add child page" title="Add a page under this one" @click="addNode(node)" />
                <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" aria-label="Remove page" @click="removeNode(node)" />
              </td>
            </tr>
            <tr v-if="!flatNodes.length">
              <td colspan="5" class="px-4 py-6 text-center text-muted">No pages yet. Optional; useful for website quotes.</td>
            </tr>
          </tbody>
        </table>
      </UCard>
      <p v-if="dirty" class="text-sm text-warning">Unsaved changes. Save before sending; the preview shows the saved version.</p>
    </template>

    <h2 class="text-lg font-semibold">{{ editable ? 'Preview' : 'Quote' }}</h2>
    <QuoteDocument v-if="doc" :doc="doc" />

    <UModal v-model:open="sendOpen" title="Send quote">
      <template #body>
        <div class="space-y-4">
          <UFormField label="To" help="Comma separated.">
            <UInput v-model="sendTo" class="w-full" placeholder="name@client.com" />
          </UFormField>
          <UFormField label="Message" help="Optional. The email always includes the number, total, valid-until date, and the link.">
            <UTextarea v-model="sendMessage" :rows="4" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="sendOpen = false;">Cancel</UButton>
          <UButton :loading="sending" :disabled="!sendTo.trim()" icon="i-lucide-send" @click="send">Send</UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="!!decideOpen" :title="decideOpen === 'accept' ? 'Accept on the client\'s behalf' : 'Decline this quote'" @update:open="(v) => { if (!v) decideOpen = null }">
      <template #body>
        <div class="space-y-4">
          <UFormField :label="decideOpen === 'accept' ? 'Who accepted' : 'Who declined'">
            <UInput v-model="decideName" class="w-full" placeholder="Client's name" />
          </UFormField>
          <UFormField :label="decideOpen === 'accept' ? 'Their email (optional)' : 'Reason (optional)'">
            <UInput v-model="decideNote" class="w-full" />
          </UFormField>
          <p v-if="decideOpen === 'accept'" class="text-sm text-muted">Accepting creates the project with the quoted hours as its budget and assigns the task types on the lines.</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="decideOpen = null;">Cancel</UButton>
          <UButton :loading="deciding" :disabled="decideName.trim().length < 2" :color="decideOpen === 'accept' ? 'success' : 'neutral'" @click="decide">{{ decideOpen === 'accept' ? 'Accept and create project' : 'Decline' }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="deleting" title="Delete this draft?">
      <template #body><p class="text-sm">Its lines and sitemap go with it. The quote number is not reused.</p></template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deleting = false;">Cancel</UButton>
          <UButton color="error" @click="deleteQuote">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
