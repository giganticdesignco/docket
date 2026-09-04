<script setup lang="ts">
import { LAYERS, priceJob, describeJob, DEFAULT_SETTINGS, type Layer, type Material, type JobInput, type JobPrice } from '~~/shared/estimator'

// The print, cut, and signage estimator, brought in from
// estimator.giganticdesign.com. Pick the materials, size, and quantity;
// add the job to a list; the list can go onto a draft quote as lines.
// Pricing is shared/estimator.ts, the same rules as the old tool.
useHead({ title: 'Estimator' })

const supabase = useSupabaseClient()
const route = useRoute()
const toast = useToast()
const { can } = useCurrentUser()

const __ad1 = useAsyncData('estimator-materials', async () => {
  const { data, error } = await supabase.from('estimator_materials').select('*').eq('is_active', true).order('position').order('name')
  if (error) throw error
  return data as Material[]
}, fresh)
const __ad2 = useAsyncData('estimator-settings', async () => {
  const { data } = await supabase.from('estimator_settings').select('*').eq('id', true).maybeSingle()
  return data ?? { id: true, ...DEFAULT_SETTINGS }
}, fresh)
const __ad3 = useAsyncData('estimator-quotes', async () => {
  if (!can('manage_quotes')) return []
  const { data } = await supabase.from('quotes').select('id, number, title, status, clients(name)').eq('status', 'draft').order('created_at', { ascending: false }).limit(50)
  return data ?? []
}, fresh)
const __ad4 = useAsyncData('estimator-clients', async () => {
  if (!can('manage_quotes')) return []
  const { data } = await supabase.from('clients').select('id, name').eq('is_active', true).order('name')
  return data ?? []
}, fresh)
await Promise.all([__ad1, __ad2, __ad3, __ad4])
const { data: materials } = __ad1
const { data: settings } = __ad2
const { data: quotes } = __ad3
const { data: clients } = __ad4

// ---------- the job being built ----------
const NONE = '__none__'
const picked = reactive<Record<Layer, string>>({ primary: NONE, overlam: NONE, transfertape: NONE, bannertape: NONE, substrate: NONE, mountingtape: NONE })
const width = ref(24)
const height = ref(36)
const quantity = ref(1)
const columns = ref(2)
const noMarkup = ref(false)
const showDetails = ref(false)

const optionsFor = (layer: Layer) => {
  const types = LAYERS.find(l => l.key === layer)!.types
  const list = (materials.value ?? []).filter(m => m.types.some(t => (types as string[]).includes(t)))
  if (layer !== 'primary') return [{ label: 'None', value: NONE }, ...list.map(m => ({ label: m.name, value: m.id }))]
  const print = list.filter(m => m.types.includes('Print Vinyl')).map(m => ({ label: m.name, value: m.id }))
  const cut = list.filter(m => m.types.includes('Cut Vinyl') && !m.types.includes('Print Vinyl')).map(m => ({ label: m.name, value: m.id }))
  return [{ label: 'None', value: NONE }, ...print, ...cut]
}
const material = (id: string) => (materials.value ?? []).find(m => m.id === id) ?? null
const job = computed<JobInput>(() => ({
  width: Number(width.value), height: Number(height.value), quantity: Number(quantity.value), mountingColumns: Number(columns.value), noMarkup: noMarkup.value,
  materials: Object.fromEntries(LAYERS.map(l => [l.key, material(picked[l.key])])) as JobInput['materials'],
}))
const price = computed<JobPrice>(() => priceJob(job.value, settings.value!))
const SIZES: [number, number][] = [[24, 36], [18, 24], [12, 18], [36, 48], [48, 96], [8.5, 11]]

// ---------- the project: a list of jobs ----------
type SavedJob = { id: string, job: JobInput, price: JobPrice, description: string }
const jobs = ref<SavedJob[]>([])
const projectTotal = computed(() => jobs.value.reduce((t, j) => t + j.price.total, 0))
function addJob() {
  if (!job.value.materials.primary && !job.value.materials.substrate) { toast.add({ title: 'Pick a primary material or a substrate first', color: 'error' }); return }
  const p = priceJob({ ...job.value, noMarkup: false }, settings.value!)
  jobs.value.push({ id: crypto.randomUUID(), job: JSON.parse(JSON.stringify({ ...job.value, noMarkup: false })), price: p, description: describeJob(job.value, p) })
}
const removeJob = (id: string) => { jobs.value = jobs.value.filter(j => j.id !== id) }
function loadJob(j: SavedJob) {
  width.value = j.job.width
  height.value = j.job.height
  quantity.value = j.job.quantity
  columns.value = j.job.mountingColumns
  for (const l of LAYERS) picked[l.key] = j.job.materials[l.key]?.id ?? NONE
}

// ---------- a new quote from the jobs ----------
// Same drawer as Quotes' New quote, then the jobs go straight on.
const creating = ref(false)
const newClientId = ref<string | undefined>()
const newTitle = ref('')
const creatingBusy = ref(false)
async function createQuote() {
  if (!newClientId.value || !newTitle.value.trim()) return
  creatingBusy.value = true
  try {
    const { data, error } = await supabase.rpc('create_quote', { p_client_id: newClientId.value, p_title: newTitle.value.trim() })
    if (error) throw error
    creating.value = false
    await addToQuote(data)
  } catch (e) {
    toast.add({ title: 'Could not create the quote', description: (e as Error).message, color: 'error' })
  } finally {
    creatingBusy.value = false
  }
}

// ---------- onto a quote ----------
const quoteId = ref<string | undefined>(typeof route.query.quote === 'string' ? route.query.quote : undefined)
const quoteOptions = computed(() => (quotes.value ?? []).map(q => ({ label: `${q.number} ${q.title} (${q.clients?.name})`, value: q.id })))
// Grayed until there is a quote picked and a job to add, so it reads as off.
const canAddToQuote = computed(() => !!quoteId.value && jobs.value.length > 0)
const adding = ref(false)
async function addToQuote(target = quoteId.value) {
  if (!target || !jobs.value.length) return
  adding.value = true
  try {
    const { data: existing } = await supabase.from('quote_line_items').select('sort_order').eq('quote_id', target).order('sort_order', { ascending: false }).limit(1)
    let order = (existing?.[0]?.sort_order ?? 0) + 1
    const rows = jobs.value.map(j => ({
      quote_id: target, sort_order: order++, description: j.description, amount: j.price.total,
      details: JSON.parse(JSON.stringify({ job: { ...j.job, materials: Object.fromEntries(Object.entries(j.job.materials).filter(([, m]) => m).map(([k, m]) => [k, { id: m!.id, name: m!.name }])) }, price: j.price })),
    }))
    const { error } = await supabase.from('quote_line_items').insert(rows)
    if (error) throw error
    toast.add({ title: `${rows.length} ${rows.length === 1 ? 'line' : 'lines'} added to the quote`, color: 'success' })
    await navigateTo(`/quotes/${target}`)
  } catch (e) {
    toast.add({ title: 'Could not add to the quote', description: (e as Error).message, color: 'error' })
  } finally {
    adding.value = false
  }
}

const money5 = (n: number) => `$${n.toFixed(5)}`
const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 })
const layerLabel = (l: Layer) => LAYERS.find(x => x.key === l)!.label
const printPage = () => window.print()
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-3 print:hidden">
      <div>
        <h1 class="text-2xl font-semibold">Estimator</h1>
        <p class="text-sm text-muted">Print, cut, and signage jobs priced by material, size, and quantity. Add jobs to a list, then put the list on a quote.</p>
      </div>
      <div class="ml-auto flex items-center gap-3">
        <USwitch v-model="noMarkup" label="Show our cost" size="sm" />
        <UButton v-if="can('manage_settings')" to="/admin/estimator" variant="outline" color="neutral" size="sm" icon="i-lucide-settings">Materials</UButton>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-5">
      <UCard class="lg:col-span-3 print:hidden">
        <div class="grid gap-4">
          <UFormField v-for="l in LAYERS" :key="l.key" :label="l.label">
            <div class="flex gap-2">
              <USelectMenu v-model="picked[l.key]" :items="optionsFor(l.key)" value-key="value" class="w-full" :placeholder="l.key === 'primary' ? 'Pick a material' : 'None'" />
              <UInput v-if="l.key === 'mountingtape' && picked.mountingtape !== NONE" v-model.number="columns" type="number" min="0" step="1" class="w-24" placeholder="Columns" title="Strips of tape per unit" />
            </div>
          </UFormField>
          <div class="grid grid-cols-3 gap-4">
            <UFormField label="Quantity"><UInput v-model.number="quantity" type="number" min="1" step="1" class="w-full" /></UFormField>
            <UFormField label="Width (in)"><UInput v-model.number="width" type="number" min="0" step="0.25" class="w-full" /></UFormField>
            <UFormField label="Height (in)"><UInput v-model.number="height" type="number" min="0" step="0.25" class="w-full" /></UFormField>
          </div>
          <div class="flex flex-wrap gap-1">
            <UButton v-for="[w, h] in SIZES" :key="`${w}x${h}`" size="xs" variant="ghost" color="neutral" @click="width = w; height = h;">{{ w }} x {{ h }}</UButton>
          </div>
          <div class="flex items-center gap-3">
            <UButton icon="i-lucide-plus" @click="addJob">Add job to list</UButton>
            <UButton variant="ghost" color="neutral" size="sm" @click="showDetails = !showDetails;">{{ showDetails ? 'Hide details' : 'Show details' }}</UButton>
          </div>
        </div>
      </UCard>

      <UCard class="lg:col-span-2 print:hidden">
        <template #header>
          <div class="flex items-baseline gap-3">
            <h2 class="font-semibold">This job</h2>
            <span class="text-xs text-muted">{{ num(price.sqInPerUnit) }} sq in, {{ num(price.sqFtPerUnit) }} sq ft each</span>
          </div>
        </template>
        <div class="space-y-3 text-sm">
          <div class="text-3xl font-semibold tabular-nums">{{ money(price.total) }}</div>
          <div class="text-muted">{{ money(price.perUnit) }} each · {{ money(price.perSqFt) }} per sq ft<template v-if="noMarkup"> · at cost</template></div>
          <ul class="divide-y divide-default">
            <li v-for="l in price.layers" :key="l.layer" class="flex items-center gap-3 py-1.5">
              <span class="min-w-0 flex-1 truncate" :title="l.material.name"><span class="text-muted">{{ layerLabel(l.layer) }}:</span> {{ l.material.name }}</span>
              <span class="shrink-0 tabular-nums">{{ money(l.price) }}</span>
            </li>
            <li v-if="price.ink" class="flex items-center gap-3 py-1.5 text-muted"><span class="flex-1">Ink (inside the primary line)</span><span class="tabular-nums">{{ money(price.ink) }}</span></li>
          </ul>
          <div v-if="showDetails" class="rounded-md bg-elevated p-3 text-xs text-muted">
            <div>Materials cost us {{ money(price.mediaCost) }} for this job.</div>
            <div v-for="l in price.layers" :key="l.layer">{{ layerLabel(l.layer) }}: {{ money5(l.material.cost / (l.material.width_in * l.material.length_in)) }} per sq in at cost, x{{ (l.material.markup_pct / 100).toFixed(2) }} material markup where it applies.</div>
            <div>Ink {{ money5(settings!.ink_sq_in_cost) }} per sq in. Default markup x{{ settings!.default_markup }}, cut vinyl x{{ settings!.cut_vinyl_markup }}, substrate x{{ settings!.substrate_markup }}, mounting tape x{{ settings!.mounting_tape_markup }}.</div>
          </div>
        </div>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="font-semibold">Jobs <span class="font-normal text-muted">{{ jobs.length }}</span></h2>
          <span class="text-lg font-semibold tabular-nums">{{ money(projectTotal) }}</span>
          <div class="ml-auto flex items-center gap-2 print:hidden">
            <UButton variant="outline" color="neutral" size="sm" icon="i-lucide-printer" :disabled="!jobs.length" @click="printPage">Print</UButton>
            <template v-if="can('manage_quotes')">
              <USelectMenu v-model="quoteId" :items="quoteOptions" value-key="value" size="sm" class="w-64" placeholder="Pick a draft quote" />
              <UButton size="sm" icon="i-lucide-file-signature" :loading="adding" :disabled="!canAddToQuote" :variant="canAddToQuote ? 'solid' : 'subtle'" :color="canAddToQuote ? 'primary' : 'neutral'" :title="canAddToQuote ? 'Put these jobs on the quote as lines' : !jobs.length ? 'Save a job first' : 'Pick a draft quote first'" @click="addToQuote()">Add to quote</UButton>
              <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-plus" :disabled="!jobs.length" @click="creating = true;">New quote</UButton>
            </template>
          </div>
        </div>
      </template>
      <ul v-if="jobs.length" class="divide-y divide-default text-sm">
        <li v-for="j in jobs" :key="j.id" class="flex items-center gap-3 py-2">
          <button type="button" class="min-w-0 flex-1 text-left hover:underline print:no-underline" title="Load into the form" @click="loadJob(j)">{{ j.description }}</button>
          <span class="tabular-nums">{{ money(j.price.total) }}</span>
          <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" class="print:hidden" aria-label="Remove" @click="removeJob(j.id)" />
        </li>
      </ul>
      <p v-else class="py-4 text-center text-sm text-muted">Price a job above and add it here. Each becomes a line on the quote.</p>
    </UCard>

    <AppDrawer v-model:open="creating" title="New quote from these jobs">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Client">
            <ClientPicker v-model="newClientId" :clients="clients ?? []" @created="c => clients?.push(c)" />
          </UFormField>
          <UFormField label="Title" help="Becomes the project name when accepted.">
            <UInput v-model="newTitle" class="w-full" placeholder="Vinyl banners" />
          </UFormField>
          <p class="text-sm text-muted">{{ jobs.length }} {{ jobs.length === 1 ? 'job goes' : 'jobs go' }} on the draft as lines, and you land on the quote.</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="creating = false;">Cancel</UButton>
          <UButton :loading="creatingBusy || adding" :disabled="!newClientId || !newTitle.trim()" @click="createQuote">Create draft</UButton>
        </div>
      </template>
    </AppDrawer>
  </div>
</template>
