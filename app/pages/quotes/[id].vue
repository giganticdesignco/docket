<script setup lang="ts">
import type { QuoteDoc } from '~~/shared/types/quote'
import { groupPages } from '~~/shared/sitePlan'

// One quote. While draft or sent: edit the header and scope lines, link a
// site plan and price it; preview; send; accept or decline on the client's
// behalf. Accepted quotes link to the project they made.
definePageMeta({ middleware: 'can', permission: 'manage_quotes' })

const route = useRoute()
const id = route.params.id as string
const supabase = useSupabaseClient()
const toast = useToast()
const origin = useRequestURL().origin

const __ad1 = useAsyncData(`quote-${id}`, async () => {
  const { data, error } = await supabase.from('quotes').select('*, clients(name), projects(id, name)').eq('id', id).single()
  if (error) throw createError({ statusCode: 404, statusMessage: 'Quote not found' })
  return data
}, fresh)
const __ad2 = useAsyncData(`quote-${id}-lines`, async () => {
  const { data, error } = await supabase.from('quote_line_items').select('*').eq('quote_id', id).order('sort_order').order('created_at')
  if (error) throw error
  return data
}, fresh)
// The linked site plan and its live pages. Not in loadEditor's watch, so
// a refetch never throws away drafts.
const __ad3 = useAsyncData(`quote-${id}-plan`, async () => {
  const { data: q, error } = await supabase.from('quotes').select('site_plan_id, site_plans(id, name, client_id, project_id, projects(id, name))').eq('id', id).single()
  if (error) throw error
  if (!q.site_plan_id || !q.site_plans) return { plan: null, pages: [] }
  const { data: pages, error: pErr } = await supabase.from('site_plan_pages').select('id, parent_id, sort_order, title, path, template, template_id, hours').eq('plan_id', q.site_plan_id).order('sort_order').order('created_at')
  if (pErr) throw pErr
  return { plan: q.site_plans, pages }
}, fresh)
const __ad4 = useAsyncData('task-types-for-quotes', async () => {
  const { data, error } = await supabase.from('tasks').select('id, name, default_rate, default_description').eq('is_active', true).order('name')
  if (error) throw error
  return data
}, fresh)
const __ad5 = useAsyncData('page-templates', async () => {
  const { data, error } = await supabase.from('page_templates').select('id, name, hours, rate, task_id, color').order('position').order('name')
  if (error) throw error
  return data
}, fresh)
const __ad6 = useActivePeople()
// Cost and margin per saved line, for people who see money. Cost rates
// never reach the browser; the function does the arithmetic.
const { can } = useCurrentUser()
const __ad7 = useAsyncData(`quote-${id}-margins`, async () => {
  const { data, error } = await supabase.rpc('quote_line_margins', { p_quote_id: id })
  if (error) throw error
  return data
}, fresh)
await Promise.all([__ad1, __ad2, __ad3, __ad4, __ad5, __ad6, __ad7])
const { data: templates } = __ad5
const { data: quote, refresh: refreshQuote } = __ad1
const { data: lines, refresh: refreshLines } = __ad2
const { data: planData, refresh: refreshPlan } = __ad3
const { data: taskTypes } = __ad4
const { data: people } = __ad6
const { data: margins, refresh: refreshMargins } = __ad7
const { data: doc, refresh: refreshDoc } = await useAsyncData(`quote-${id}-doc`, () => $fetch<QuoteDoc>(`/api/q/${quote.value!.public_token}`), fresh)

useHead({ title: () => (quote.value ? `Quote ${quote.value.number}` : 'Quote') })
useAssistantScreen(() => ({ quote: quote.value ? `Quote ${quote.value.number}` : undefined, client: quote.value?.clients?.name }))
async function refreshAll() {
  await Promise.all([refreshQuote(), refreshLines(), refreshPlan(), refreshMargins()])
  await refreshDoc()
}
// The margin column is cost and margin; rates and amounts on lines are the quote itself.
const seeMoney = computed(() => can('field:cost_margin'))
const marginFor = (lineId: string) => margins.value?.find(m => m.line_item_id === lineId)
const marginTotal = computed(() => round2((margins.value ?? []).reduce((s, m) => s + m.margin, 0)))
const marginLines = computed(() => (margins.value ?? []).length)

const editable = computed(() => quote.value?.status === 'draft' || quote.value?.status === 'sent')
const today = todayString()
const badge = computed((): Badge => (quote.value ? quoteBadge(quote.value, today) : { label: '', color: 'neutral' }))
const publicLink = computed(() => `${origin}/q/${quote.value?.public_token}`)
const stampYear = (iso: string) => stamp(iso, { year: true })

// ---------- editor ----------

type LineDraft = { id: string, description: string, task_id: string | null, hours: number | string, rate: number | string, amount: number | string, template_id: string | null, assignee_id: string | null, target_week: string }
const form = reactive({ title: '', intro: '', terms: '', valid_until: '', tax_rate: 0 as number | string })
const draftLines = ref<LineDraft[]>([])
const snapshot = ref('')
const removedLines = new Set<string>()

function loadEditor() {
  const q = quote.value
  if (!q) return
  form.title = q.title
  form.intro = q.intro ?? ''
  form.terms = q.terms ?? ''
  form.valid_until = q.valid_until ?? ''
  form.tax_rate = q.tax_rate ?? 0
  draftLines.value = (lines.value ?? []).map(l => ({ id: l.id, description: l.description, task_id: l.task_id, hours: l.hours ?? '', rate: l.rate ?? '', amount: l.amount, template_id: l.template_id, assignee_id: l.assignee_id, target_week: l.target_week ?? '' }))
  removedLines.clear()
  snapshot.value = JSON.stringify([form, draftLines.value])
}
loadEditor()
watch([quote, lines], loadEditor)
const dirty = computed(() => JSON.stringify([form, draftLines.value]) !== snapshot.value)

const lineAmount = (l: LineDraft) => (l.hours !== '' && l.rate !== '' ? round2(Number(l.hours) * Number(l.rate)) : Number(l.amount) || 0)
const editorSubtotal = computed(() => round2(draftLines.value.reduce((s, l) => s + lineAmount(l), 0)))
const editorTax = computed(() => round2(editorSubtotal.value * (Number(form.tax_rate) || 0) / 100))
const editorTotal = computed(() => round2(editorSubtotal.value + editorTax.value))
const taskOptions = computed(() => [{ label: 'No task type', value: '__none__' }, ...(taskTypes.value ?? []).map(t => ({ label: t.name, value: t.id }))])
const peopleOptions = computed(() => [{ label: 'Nobody yet', value: '__none__' }, ...(people.value ?? []).map(p => ({ label: p.full_name, value: p.id }))])

function addLine() {
  draftLines.value.push({ id: crypto.randomUUID(), description: '', task_id: null, hours: '', rate: '', amount: '', template_id: null, assignee_id: null, target_week: '' })
}
// Picking a task type fills in its usual rate and wording where the line
// is still blank; typed values are left alone.
function setTask(l: LineDraft, value: string) {
  l.task_id = value === '__none__' ? null : value
  const t = taskTypes.value?.find(x => x.id === l.task_id)
  if (!t) return
  if (l.rate === '' && t.default_rate != null) l.rate = t.default_rate
  if (!l.description.trim() && t.default_description) l.description = t.default_description
}
// A week is its Monday, whichever day was picked.
function setWeek(l: LineDraft, value: string) {
  l.target_week = value ? weekDays(value)[0]! : ''
}

// ---------- assistant ----------
// Draft the intro from the quote, or propose scope lines from a brief.
// Both land in the editor for the person to change before saving.
const drafting = ref<'intro' | 'lines' | null>(null)
const briefOpen = ref(false)
const brief = ref('')
const briefNotes = ref('')
async function draftIntro() {
  drafting.value = 'intro'
  try {
    const r = await $fetch<{ text: string }>('/api/ai/draft', { method: 'POST', body: { kind: 'quote_intro', quoteId: id, current: form.intro, instruction: form.intro ? 'Improve the current text; keep its facts.' : undefined } })
    form.intro = r.text
  } catch (e) {
    toast.add({ title: 'Could not draft', description: apiError(e), color: 'error' })
  } finally {
    drafting.value = null
  }
}
async function draftLinesFromBrief() {
  if (!brief.value.trim()) return
  drafting.value = 'lines'
  try {
    const r = await $fetch<{ lines: { description: string, task_id: string | null, hours: number, rate: number }[], notes: string }>('/api/ai/quote-draft', { method: 'POST', body: { quoteId: id, brief: brief.value } })
    for (const l of r.lines) draftLines.value.push({ id: crypto.randomUUID(), description: l.description, task_id: l.task_id, hours: l.hours, rate: l.rate, amount: '', template_id: null, assignee_id: null, target_week: '' })
    briefNotes.value = r.notes
    briefOpen.value = false
    toast.add({ title: `${r.lines.length} lines proposed`, description: 'Edit them, then save the quote.', color: 'success' })
  } catch (e) {
    toast.add({ title: 'Could not draft lines', description: apiError(e), color: 'error' })
  } finally {
    drafting.value = null
  }
}
function removeLine(i: number) {
  const l = draftLines.value[i]!
  removedLines.add(l.id)
  draftLines.value.splice(i, 1)
}

// Site plan: the linked plan's live pages, grouped by template.
const planGroups = computed(() => groupPages(planData.value?.pages ?? [], templates.value ?? []))
const planHours = computed(() => planGroups.value.reduce((s, g) => s + g.hours, 0))
// One scope line per template: "4 x Interior pages", the pages' hours,
// the template's rate (or the rate already used for that task type on
// this quote). It reads the plan fresh first, and run again it updates
// the same lines instead of adding more. Lines are drafts until Save.
async function pricePlan() {
  await refreshPlan()
  const pages = planData.value?.pages ?? []
  if (!pages.length) {
    toast.add({ title: 'The site plan has no pages yet', color: 'neutral' })
    return
  }
  const groups = groupPages(pages, templates.value ?? [])
  let made = 0, updated = 0
  for (const g of groups) {
    if (!g.template || !g.pages.length) continue
    const desc = `${g.pages.length} x ${g.template.name} ${g.pages.length === 1 ? 'page' : 'pages'}`
    const hours = round2(g.hours)
    const line = draftLines.value.find(l => l.template_id === g.template!.id)
    if (line) {
      line.description = desc
      line.hours = hours
      updated++
    } else {
      const sameTask = draftLines.value.find(l => l.task_id && l.task_id === g.template!.task_id && l.rate !== '')
      draftLines.value.push({ id: crypto.randomUUID(), description: desc, task_id: g.template.task_id, hours, rate: g.template.rate ?? (sameTask ? sameTask.rate : ''), amount: '', template_id: g.template.id, assignee_id: null, target_week: '' })
      made++
    }
  }
  const untyped = groups.find(g => !g.template)?.pages.length ?? 0
  toast.add({ title: `${made} ${made === 1 ? 'line' : 'lines'} added, ${updated} updated`, description: untyped ? `${untyped} ${untyped === 1 ? 'page has' : 'pages have'} no template and ${untyped === 1 ? 'was' : 'were'} left out.` : 'Check the rates, then save.', color: 'success' })
}
const pagesFor = (l: LineDraft) => (l.template_id ? (planData.value?.pages ?? []).filter(p => p.template_id === l.template_id).length : 0)

// Link a site plan of this client that is not on a project yet, start a
// new one, or take the link off. Unsaved edits are saved first.
const planOpen = ref(false)
const planChoice = ref('__new__')
const planList = ref<{ id: string, name: string, site_plan_pages: { count: number }[] }[]>([])
const planBusy = ref<'use' | 'remove' | null>(null)
const planItems = computed(() => [
  ...planList.value.map((p) => {
    const count = p.site_plan_pages[0]?.count ?? 0
    return { label: `${p.name} (${count} ${count === 1 ? 'page' : 'pages'})`, value: p.id }
  }),
  { label: 'Start a new site plan', value: '__new__' },
])
async function openPlanDrawer() {
  const { data, error } = await supabase.from('site_plans').select('id, name, site_plan_pages(count)').eq('client_id', quote.value!.client_id).is('project_id', null).order('created_at', { ascending: false })
  if (error) { toast.add({ title: 'Could not load the site plans', description: error.message, color: 'error' }); return }
  planList.value = data
  const current = planData.value?.plan?.id
  planChoice.value = current && data.some(p => p.id === current) ? current : data[0]?.id ?? '__new__'
  planOpen.value = true
}
async function usePlan() {
  if (dirty.value && !(await save())) return
  planBusy.value = 'use'
  try {
    let planId = planChoice.value
    if (planId === '__new__') {
      const { data, error } = await supabase.from('site_plans').insert({ client_id: quote.value!.client_id, name: form.title.trim() || quote.value!.title }).select('id').single()
      if (error) throw error
      planId = data.id
    }
    const { error } = await supabase.from('quotes').update({ site_plan_id: planId, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    if (planChoice.value === '__new__') {
      toast.add({ title: 'Site plan started', color: 'success' })
      await navigateTo(`/site-plans/${planId}`)
      return
    }
    planOpen.value = false
    await refreshAll()
    toast.add({ title: 'Site plan added', color: 'success' })
  } catch (e) {
    fail((e as Error).message)
  } finally {
    planBusy.value = null
  }
}
async function removePlan() {
  if (dirty.value && !(await save())) return
  planBusy.value = 'remove'
  try {
    const { error } = await supabase.from('quotes').update({ site_plan_id: null, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    planOpen.value = false
    await refreshAll()
    toast.add({ title: 'Site plan removed from the quote', color: 'success' })
  } catch (e) {
    fail((e as Error).message)
  } finally {
    planBusy.value = null
  }
}

const saving = ref(false)
async function save(): Promise<boolean> {
  if (!form.title.trim()) return fail('Give the quote a title')
  if (draftLines.value.some(l => !l.description.trim())) return fail('Every scope line needs a description')
  saving.value = true
  try {
    const { error: qErr } = await supabase.from('quotes').update({
      title: form.title.trim(), intro: form.intro.trim() || null, terms: form.terms.trim() || null, valid_until: form.valid_until || null,
      tax_rate: Number(form.tax_rate) || 0, updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (qErr) throw qErr
    if (removedLines.size) {
      const { error } = await supabase.from('quote_line_items').delete().in('id', [...removedLines])
      if (error) throw error
    }
    if (draftLines.value.length) {
      const { error } = await supabase.from('quote_line_items').upsert(draftLines.value.map((l, i) => ({
        id: l.id, quote_id: id, sort_order: i + 1, description: l.description.trim(), task_id: l.task_id, template_id: l.template_id,
        hours: l.hours === '' ? null : Number(l.hours), rate: l.rate === '' ? null : Number(l.rate), amount: lineAmount(l),
        assignee_id: l.assignee_id, target_week: l.assignee_id && l.target_week ? l.target_week : null,
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
    toast.add({ title: 'Not sent', description: apiError(e), color: 'error' })
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
    <AppCrumbs :items="[{ label: 'Quotes', to: '/quotes' }]" class="mb-3" />
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-semibold">
        {{ quote.number }}
        <span class="font-normal text-muted">for <NuxtLink :to="`/clients/${quote.client_id}`" class="hover:underline">{{ quote.clients?.name }}</NuxtLink></span>
      </h1>
      <UBadge :color="badge.color" variant="subtle">{{ badge.label }}</UBadge>
      <PageActions
        class="ml-auto"
        :primary="{ label: 'Save', icon: 'i-lucide-save', loading: saving, disabled: !dirty, show: editable, onSelect: save }"
        :items="[
          { label: 'Send to the client', icon: 'i-lucide-send', show: editable, onSelect: () => { sendTo = ''; sendMessage = ''; sendOpen = true } },
          { label: 'Preview', icon: 'i-lucide-external-link', to: publicLink, target: '_blank' },
          { label: 'Copy link', icon: 'i-lucide-link', onSelect: copyLink },
        ]"
        :more="[
          { label: 'Mark as sent', icon: 'i-lucide-check', show: quote.status === 'draft', onSelect: markSent },
          { label: 'Accept on their behalf', icon: 'i-lucide-check-check', show: editable, onSelect: () => { decideName = ''; decideNote = ''; decideOpen = 'accept'; refreshPlan() } },
          { label: 'Decline on their behalf', icon: 'i-lucide-x', show: editable, onSelect: () => { decideName = ''; decideNote = ''; decideOpen = 'decline' } },
          { label: 'Delete quote', icon: 'i-lucide-trash-2', color: 'error', show: quote.status === 'draft', onSelect: () => { deleting = true } },
        ]"
      />
    </div>

    <p class="text-sm text-muted">
      <span v-if="quote.sent_at">Sent {{ stampYear(quote.sent_at) }}. </span>
      <span v-if="quote.status === 'accepted'">Accepted by {{ quote.accepted_by }}<span v-if="quote.accepted_email"> ({{ quote.accepted_email }})</span>, {{ stampYear(quote.accepted_at!) }}.
        <NuxtLink v-if="quote.projects" :to="`/projects/${quote.projects.id}`" class="underline">Open the project</NuxtLink>.</span>
      <span v-if="quote.status === 'declined'">Declined<span v-if="quote.declined_by"> by {{ quote.declined_by }}</span>, {{ stampYear(quote.declined_at!) }}.<span v-if="quote.decline_reason"> "{{ quote.decline_reason }}"</span></span>
      <span v-if="(quote.status === 'accepted' || quote.status === 'declined') && quote.site_plan_id"> <NuxtLink :to="`/site-plans/${quote.site_plan_id}`" class="underline">Open the site plan</NuxtLink>.</span>
    </p>

    <template v-if="editable">
      <UCard>
        <div class="grid gap-4 md:grid-cols-4">
          <UFormField label="Title" class="md:col-span-3" help="Becomes the project name when accepted.">
            <UInput v-model="form.title" class="w-full" />
            <SimilarProjects v-if="editable" :name="form.title" :client-name="quote?.clients?.name" hide-use class="mt-2" />
          </UFormField>
          <UFormField label="Valid until">
            <UInput v-model="form.valid_until" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Tax rate (%)" help="Optional. Leave at 0 for no tax line.">
            <UInput v-model="form.tax_rate" type="number" :min="0" step="0.01" class="w-full" />
          </UFormField>
          <UFormField label="Introduction" class="md:col-span-4" help="Scope narrative, printed above the lines.">
            <UTextarea v-model="form.intro" :rows="4" class="w-full" />
            <div class="mt-1 flex justify-end"><UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-sparkles" :loading="drafting === 'intro'" @click="draftIntro">{{ form.intro ? 'Improve with the assistant' : 'Draft with the assistant' }}</UButton></div>
          </UFormField>
          <UFormField label="Terms" class="md:col-span-4">
            <UTextarea v-model="form.terms" :rows="3" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 class="text-lg font-semibold">Scope</h2>
        <span class="text-sm text-muted">Hours x rate, or a flat amount.</span>
        <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-sparkles" class="ml-auto" @click="briefOpen = true;">Draft lines</UButton>
        <UButton v-if="!planData?.plan" size="xs" variant="outline" color="neutral" icon="i-lucide-list-tree" @click="openPlanDrawer">Add site plan</UButton>
        <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-calculator" :to="`/estimator?quote=${id}`">Add signage job</UButton>
        <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-plus" @click="addLine">Add line</UButton>
      </div>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <div class="table-scroll"><table class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr class="border-b border-default">
              <th class="min-w-48 px-4 py-2 font-medium">Description</th>
              <th class="w-40 px-2 py-2 font-medium">Task type</th>
              <th class="w-40 px-2 py-2 font-medium" title="Who will do it. Their week shows on Planner as quoted, not yet won.">Who, week</th>
              <th class="w-20 px-2 py-2 text-right font-medium">Hours</th>
              <th class="w-24 px-2 py-2 text-right font-medium">Rate</th>
              <th class="w-28 px-2 py-2 text-right font-medium">Amount</th>
              <th v-if="seeMoney" class="w-24 px-2 py-2 text-right font-medium" title="Amount minus hours at the person's cost rate, as last saved">Margin</th>
              <th class="w-12 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="(l, i) in draftLines" :key="l.id" class="border-b border-default last:border-0 align-top">
              <td class="px-4 py-1.5">
                <UInput v-model="l.description" class="w-full" size="sm" />
                <div v-if="pagesFor(l)" class="mt-0.5 text-xs text-muted">{{ pagesFor(l) }} page{{ pagesFor(l) === 1 ? '' : 's' }} in the site plan</div>
              </td>
              <td class="px-2 py-1.5"><USelectMenu :model-value="l.task_id ?? '__none__'" :items="taskOptions" value-key="value" size="sm" class="w-full" @update:model-value="setTask(l, $event as string)" /></td>
              <td class="px-2 py-1.5">
                <USelectMenu :model-value="l.assignee_id ?? '__none__'" :items="peopleOptions" value-key="value" size="sm" class="w-full" @update:model-value="l.assignee_id = $event === '__none__' ? null : ($event as string)" />
                <UInput v-if="l.assignee_id" :model-value="l.target_week" type="date" size="sm" class="mt-1 w-full" title="The week the work lands, shown on Planner as quoted" @update:model-value="setWeek(l, $event as string)" />
              </td>
              <td class="px-2 py-1.5"><UInput v-model="l.hours" type="number" step="0.25" size="sm" class="w-full" :ui="{ base: 'text-right' }" /></td>
              <td class="px-2 py-1.5"><UInput v-model="l.rate" type="number" step="1" size="sm" class="w-full" :ui="{ base: 'text-right' }" /></td>
              <td class="px-2 py-1.5">
                <UInput v-if="l.hours === '' || l.rate === ''" v-model="l.amount" type="number" step="0.01" size="sm" class="w-full" :ui="{ base: 'text-right' }" placeholder="flat" />
                <div v-else class="py-1 text-right tabular-nums">{{ money(lineAmount(l)) }}</div>
              </td>
              <td v-if="seeMoney" class="px-2 py-1.5 text-right tabular-nums" :class="(marginFor(l.id)?.margin ?? 0) < 0 ? 'text-error' : 'text-muted'">
                <div v-if="marginFor(l.id)" class="py-1">{{ money(marginFor(l.id)!.margin) }}</div>
              </td>
              <td class="px-2 py-1.5 text-right"><UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" aria-label="Remove line" @click="removeLine(i)" /></td>
            </tr>
            <tr v-if="!draftLines.length">
              <td :colspan="seeMoney ? 8 : 7" class="px-4 py-6 text-center text-muted">No scope lines yet.</td>
            </tr>
          </tbody>
          <tfoot>
            <tr v-if="editorTax" class="border-t border-default">
              <td colspan="5" class="px-4 py-1 text-right text-muted">Subtotal</td>
              <td class="px-2 py-1 text-right tabular-nums">{{ money(editorSubtotal) }}</td>
              <td v-if="seeMoney" /><td />
            </tr>
            <tr v-if="editorTax">
              <td colspan="5" class="px-4 py-1 text-right text-muted">Tax ({{ form.tax_rate }}%)</td>
              <td class="px-2 py-1 text-right tabular-nums">{{ money(editorTax) }}</td>
              <td v-if="seeMoney" /><td />
            </tr>
            <tr :class="editorTax ? '' : 'border-t border-default'">
              <td colspan="5" class="px-4 py-2 text-right font-medium">Total</td>
              <td class="px-2 py-2 text-right font-semibold tabular-nums">{{ money(editorTotal) }}</td>
              <td v-if="seeMoney" class="px-2 py-2 text-right tabular-nums" :class="marginTotal < 0 ? 'text-error' : 'text-muted'" :title="marginLines ? `Across the ${marginLines} saved ${marginLines === 1 ? 'line' : 'lines'} with a person and a cost rate` : 'Give a line a person with a cost rate, then save'">
                {{ marginLines ? money(marginTotal) : '' }}
              </td>
              <td />
            </tr>
          </tfoot>
        </table></div>
      </UCard>

      <template v-if="planData?.plan">
        <div class="flex flex-wrap items-center gap-4">
          <h2 class="text-lg font-semibold">Site plan</h2>
          <span class="text-sm text-muted">The pages the site will have. Price the plan writes one scope line per template.</span>
          <UButton v-if="planData.pages.length" size="xs" variant="outline" color="neutral" icon="i-lucide-calculator" class="ml-auto" @click="pricePlan">Price the plan</UButton>
          <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-link" :class="planData.pages.length ? '' : 'ml-auto'" @click="openPlanDrawer">Change</UButton>
        </div>
        <UCard>
          <div class="text-sm">
            <NuxtLink :to="`/site-plans/${planData.plan.id}`" class="font-medium hover:underline">{{ planData.plan.name }}</NuxtLink>
            <span class="text-muted">, {{ planData.pages.length }} {{ planData.pages.length === 1 ? 'page' : 'pages' }}, {{ formatHours(planHours) }}</span>
          </div>
          <div v-if="planData.pages.length" class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span v-for="g in planGroups" :key="g.template?.id ?? 'none'">
              <span class="font-medium text-default">{{ g.pages.length }}</span> {{ g.template?.name ?? 'untyped' }}, {{ formatHours(g.hours) }}
            </span>
          </div>
          <p v-else class="mt-2 text-sm text-muted">No pages yet. Build the tree on the site plan.</p>
          <p v-if="planData.plan.project_id" class="mt-2 text-sm text-warning">
            This site plan is on <NuxtLink :to="`/projects/${planData.plan.project_id}`" class="underline">{{ planData.plan.projects?.name ?? 'a project' }}</NuxtLink> now.
          </p>
        </UCard>
      </template>
      <p v-if="dirty" class="text-sm text-warning">Unsaved changes. Save before sending; the preview shows the saved version.</p>
    </template>

    <h2 class="text-lg font-semibold">{{ editable ? 'Preview' : 'Quote' }}</h2>
    <QuoteDocument v-if="doc" :doc="doc" />

    <AppDrawer v-model:open="sendOpen" title="Send quote">
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
    </AppDrawer>

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
          <p v-if="decideOpen === 'accept' && planData?.plan?.project_id" class="text-sm text-warning">This site plan is already on {{ planData.plan.projects?.name }}. Accepting copies its pages onto this quote but makes no tasks from them.</p>
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
      <template #body><p class="text-sm">Its lines go with it. Its site plan stays. The quote number is not reused.</p></template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deleting = false;">Cancel</UButton>
          <UButton color="error" @click="deleteQuote">Delete</UButton>
        </div>
      </template>
    </UModal>

    <AppDrawer v-model:open="planOpen" title="Site plan" :description="`Site plans for ${quote.clients?.name ?? 'this client'} that are not on a project yet. One plan can be on more than one open quote.`">
      <template #body>
        <UFormField label="Plan">
          <USelectMenu v-model="planChoice" :items="planItems" value-key="value" class="w-full" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap items-center gap-2">
          <UButton v-if="planData?.plan" variant="ghost" color="neutral" :loading="planBusy === 'remove'" @click="removePlan">Remove from this quote</UButton>
          <UButton variant="ghost" color="neutral" class="ml-auto" @click="planOpen = false;">Cancel</UButton>
          <UButton :loading="planBusy === 'use'" :disabled="planChoice === planData?.plan?.id" @click="usePlan">Use this plan</UButton>
        </div>
      </template>
    </AppDrawer>

    <AppDrawer v-model:open="briefOpen" title="Draft scope lines" description="Describe the project in a few sentences. The assistant proposes lines with hours based on this client's history; you edit and save.">
      <template #body>
        <div class="space-y-3">
          <UTextarea v-model="brief" :rows="5" class="w-full" placeholder="A five-page marketing site on WordPress with a blog, two landing pages, and a contact form, plus a logo refresh. Photography is theirs." autofocus />
          <p v-if="briefNotes" class="rounded-md bg-elevated p-3 text-xs text-muted">{{ briefNotes }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="briefOpen = false;">Cancel</UButton>
          <UButton icon="i-lucide-sparkles" :loading="drafting === 'lines'" :disabled="!brief.trim()" @click="draftLinesFromBrief">Propose lines</UButton>
        </div>
      </template>
    </AppDrawer>
  </div>
</template>
