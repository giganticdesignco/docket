<script setup lang="ts">
// The pages of a site plan as a tree on a canvas, Octopus style: a card
// per page, children under their parent, lines between them. Type on the
// card to name the page and set its path, pick a template, click the
// hours to type over a part for this page, add a child or a sibling from
// the card, drag a card onto another to move it there. The array handed
// in is edited in place; removed ids are reported so the page can delete
// them on save.
import { pageHours, pageParts, typedHours } from '~~/shared/sitePlan'

export type CanvasNode = { id: string, parent_id: string | null, title: string, path: string, template: string, template_id: string | null, part_hours: Record<string, number | string> }
export type TemplatePart = { id: string, name: string, hours: number }
export type PageTemplate = { id: string, name: string, color: string, is_active?: boolean, parts: TemplatePart[] }

const props = defineProps<{ nodes: CanvasNode[], templates: PageTemplate[], editable: boolean }>()
const emit = defineEmits<{ removed: [ids: string[]] }>()

const CARD_W = 190
const CARD_H = 98
const GAP_X = 18
const GAP_Y = 44

// ---------- layout ----------
type Placed = { node: CanvasNode, x: number, y: number, depth: number }
const children = computed(() => {
  const m = new Map<string | null, CanvasNode[]>()
  for (const n of props.nodes) m.set(n.parent_id, [...(m.get(n.parent_id) ?? []), n])
  return m
})
// Leaves take one slot; a parent spans its children and sits centered over them.
const widths = computed(() => {
  const w = new Map<string, number>()
  const measure = (n: CanvasNode): number => {
    const kids = children.value.get(n.id) ?? []
    const width = kids.length ? kids.reduce((s, k) => s + measure(k), 0) : 1
    w.set(n.id, width)
    return width
  }
  for (const r of children.value.get(null) ?? []) measure(r)
  return w
})
const placed = computed<Placed[]>(() => {
  const out: Placed[] = []
  const place = (n: CanvasNode, slot: number, depth: number) => {
    const width = widths.value.get(n.id) ?? 1
    out.push({ node: n, x: (slot + width / 2) * (CARD_W + GAP_X) - CARD_W / 2, y: depth * (CARD_H + GAP_Y), depth })
    let s = slot
    for (const k of children.value.get(n.id) ?? []) { place(k, s, depth + 1); s += widths.value.get(k.id) ?? 1 }
  }
  let slot = 0
  for (const r of children.value.get(null) ?? []) { place(r, slot, 0); slot += widths.value.get(r.id) ?? 1 }
  return out
})
const byId = computed(() => new Map(placed.value.map(p => [p.node.id, p])))
const size = computed(() => {
  const slots = (children.value.get(null) ?? []).reduce((s, r) => s + (widths.value.get(r.id) ?? 1), 0)
  const depth = Math.max(0, ...placed.value.map(p => p.depth))
  return { w: Math.max(slots, 1) * (CARD_W + GAP_X), h: (depth + 1) * (CARD_H + GAP_Y) }
})
// Elbow from the bottom of the parent to the top of the child.
const links = computed(() => placed.value.filter(p => p.node.parent_id && byId.value.has(p.node.parent_id)).map((p) => {
  const from = byId.value.get(p.node.parent_id!)!
  const x1 = from.x + CARD_W / 2, y1 = from.y + CARD_H, x2 = p.x + CARD_W / 2, y2 = p.y, ym = y1 + GAP_Y / 2
  return { id: p.node.id, d: `M${x1},${y1} V${ym} H${x2} V${y2}` }
}))

// ---------- editing ----------
const templateById = computed(() => new Map(props.templates.map(t => [t.id, t])))
const hoursOf = (n: CanvasNode) => pageHours(n, templateById.value)
// Retired templates are offered only where a page already uses one.
const templateOptions = computed(() => [{ label: 'No template', value: '__none__' }, ...props.templates.filter(t => t.is_active !== false || props.nodes.some(n => n.template_id === t.id)).map(t => ({ label: `${t.name} (${formatHours(t.parts.reduce((s, p) => s + Number(p.hours), 0))})`, value: t.id }))])
const selected = ref<string | null>(null)
const selectedNode = computed(() => props.nodes.find(n => n.id === selected.value) ?? null)
const parentOf = (n: CanvasNode) => props.nodes.find(x => x.id === n.parent_id) ?? null
// The path follows the title (/about-us) until someone edits it by hand.
// A saved page counts as edited by hand only when its path is not the one
// its parent and title build, so a generated path still follows a move.
const pathTouched = new Set<string>()
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
function builtPath(n: CanvasNode) {
  const parent = parentOf(n)
  const base = parent ? (parent.path || '').replace(/\/$/, '') : ''
  const isHome = !parent && props.nodes.filter(x => !x.parent_id)[0]?.id === n.id
  return isHome ? '/' : n.title.trim() ? `${base}/${slug(n.title)}` : (parent ? `${base}/` : '/')
}
function autoPath(n: CanvasNode) {
  if (!pathTouched.has(n.id)) n.path = builtPath(n)
}
onMounted(() => { for (const n of props.nodes) if (n.path && n.path !== builtPath(n)) pathTouched.add(n.id) })
// After a page moves, its path and the paths under it follow the new
// parent, except paths edited by hand.
function followMove(n: CanvasNode) {
  autoPath(n)
  for (const k of props.nodes.filter(x => x.parent_id === n.id)) followMove(k)
}
function add(parent: CanvasNode | null, after?: CanvasNode) {
  const n: CanvasNode = { id: crypto.randomUUID(), parent_id: parent?.id ?? null, title: '', path: parent ? `${(parent.path || '').replace(/\/$/, '')}/` : '/', template: '', template_id: null, part_hours: {} }
  if (after) {
    const i = props.nodes.indexOf(after)
    props.nodes.splice(i + 1, 0, n)
  } else {
    props.nodes.push(n)
  }
  selected.value = n.id
  nextTick(() => document.querySelector<HTMLInputElement>(`[data-node="${n.id}"] input`)?.focus())
}
function remove(n: CanvasNode) {
  const ids = new Set<string>([n.id])
  let grew = true
  while (grew) {
    grew = false
    for (const x of props.nodes) if (x.parent_id && ids.has(x.parent_id) && !ids.has(x.id)) { ids.add(x.id); grew = true }
  }
  for (let i = props.nodes.length - 1; i >= 0; i--) if (ids.has(props.nodes[i]!.id)) props.nodes.splice(i, 1)
  emit('removed', [...ids])
  if (selected.value && ids.has(selected.value)) selected.value = null
  if (partsNode.value && ids.has(partsNode.value)) partsNode.value = null
}
function setTemplate(n: CanvasNode, id: string) {
  n.template_id = id === '__none__' ? null : id
  n.template = n.template_id ? templateById.value.get(n.template_id)?.name ?? '' : ''
  // Typed hours belong to the old template's parts.
  n.part_hours = {}
}
const isDescendant = (maybeChild: CanvasNode, of: CanvasNode) => {
  let p = maybeChild.parent_id
  while (p) { if (p === of.id) return true; p = props.nodes.find(x => x.id === p)?.parent_id ?? null }
  return false
}
// Drag a card onto another card to move it (and its children) under it.
const dragging = ref<string | null>(null)
const over = ref<string | null>(null)
function onDrop(target: CanvasNode) {
  const src = props.nodes.find(x => x.id === dragging.value)
  dragging.value = null
  over.value = null
  if (!src || src.id === target.id || isDescendant(target, src)) return
  src.parent_id = target.id
  followMove(src)
}
// Siblings sit in array order, so moving a page among them moves it in the array.
function moveAfter(n: CanvasNode, anchor: CanvasNode) {
  props.nodes.splice(props.nodes.indexOf(n), 1)
  props.nodes.splice(props.nodes.indexOf(anchor) + 1, 0, n)
}
const prevSibling = (n: CanvasNode) => props.nodes.slice(0, props.nodes.indexOf(n)).reverse().find(x => x.parent_id === n.parent_id) ?? null
// Nest: the page becomes the last child of the page before it. False when there is none.
function nest(n: CanvasNode) {
  const prev = prevSibling(n)
  if (!prev) return false
  const last = props.nodes.filter(x => x.parent_id === prev.id).at(-1)
  n.parent_id = prev.id
  if (last && props.nodes.indexOf(last) > props.nodes.indexOf(n)) moveAfter(n, last)
  followMove(n)
  return true
}
// Move out: the page becomes a sibling right after its parent. False at the top level.
function unnest(n: CanvasNode) {
  const parent = parentOf(n)
  if (!parent) return false
  n.parent_id = parent.parent_id
  moveAfter(n, parent)
  followMove(n)
  return true
}
function onKey(n: CanvasNode, e: KeyboardEvent) {
  if (e.key === 'Enter') { e.preventDefault(); add(parentOf(n), n) }
  if (e.key === 'Tab' && !e.shiftKey && !e.altKey && nest(n)) e.preventDefault()
  if (e.key === 'Tab' && e.shiftKey && n.parent_id && unnest(n)) e.preventDefault()
}

// ---------- parts ----------
const partsOf = (n: CanvasNode) => pageParts(n, templateById.value)
const isTyped = (n: CanvasNode, partId: string) => typedHours(n)[partId] !== undefined && typedHours(n)[partId] !== ''
const typedOver = (n: CanvasNode) => partsOf(n).some(x => isTyped(n, x.part.id))
// "skipped" only when the page typed 0; a part at 0 in the template is "off".
const summary = (n: CanvasNode) => partsOf(n).map(x => (x.hours > 0 ? `${x.part.name} ${formatHours(x.hours)}` : `${x.part.name} ${isTyped(n, x.part.id) ? 'skipped' : 'off'}`)).join(', ')
// The page whose parts are open in the drawer.
const partsNode = ref<string | null>(null)
const partsPage = computed(() => props.nodes.find(n => n.id === partsNode.value) ?? null)
function openParts(n: CanvasNode) { selected.value = n.id; partsNode.value = n.id }
// Typing sets the page's own hours; clearing the box goes back to the template's.
function setPart(n: CanvasNode, partId: string, v: string | number | null | undefined) {
  if (v === '' || v === null || v === undefined) delete n.part_hours[partId]
  else n.part_hours[partId] = v
}
function partNote(n: CanvasNode, x: { part: TemplatePart, hours: number }) {
  const template = `Template: ${formatHours(x.part.hours)}`
  if (isTyped(n, x.part.id)) return x.hours > 0 ? `Typed for this page. ${template}` : `Skipped on this page. ${template}`
  return x.part.hours > 0 ? 'The template\'s hours' : 'Off in the template. Type hours to add it to this page.'
}

// ---------- view ----------
const zoom = ref(1)
const fit = ref<HTMLElement | null>(null)
const root = ref<HTMLElement | null>(null)
function fitToWidth() {
  const w = fit.value?.clientWidth ?? 0
  zoom.value = w ? Math.min(1, Math.max(0.4, (w - 24) / size.value.w)) : 1
}
// Fit on its own only in a box 640px or wider. On a phone a fitted tree
// is too small to tap, so it starts at 100% and the box scrolls; the Fit
// button still fits.
function autoFit() {
  if ((fit.value?.clientWidth ?? 0) >= 640) fitToWidth()
}
onMounted(autoFit)
watch(() => size.value.w, () => { if (zoom.value < 1) autoFit() })
const COLOR: Record<string, string> = {
  primary: 'border-primary/50 bg-primary/5', info: 'border-info/50 bg-info/5', success: 'border-success/50 bg-success/5',
  warning: 'border-warning/50 bg-warning/5', error: 'border-error/50 bg-error/5', neutral: 'border-default bg-default',
}
const cardClass = (n: CanvasNode) => COLOR[n.template_id ? templateById.value.get(n.template_id)?.color ?? 'neutral' : 'neutral'] ?? COLOR.neutral
const totalHours = computed(() => props.nodes.reduce((s, n) => s + hoursOf(n), 0))
defineExpose({ hoursOf })

// Full screen: the same canvas over the whole window, Esc brings the
// page back. Fit again on the way in, since the width changes. An open
// drawer takes Esc first, and while in full screen it opens inside the
// full-screen layer so it shows above the canvas.
const fullscreen = ref(false)
const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && fullscreen.value && !document.querySelector('[role="dialog"]')) fullscreen.value = false }
watch(fullscreen, (v) => { if (v) nextTick(autoFit) })
onMounted(() => window.addEventListener('keydown', onEsc))
onBeforeUnmount(() => window.removeEventListener('keydown', onEsc))
</script>

<template>
  <div ref="root" :class="fullscreen ? 'fixed inset-0 z-50 flex flex-col bg-default p-4' : ''">
    <div class="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>{{ nodes.length }} {{ nodes.length === 1 ? 'page' : 'pages' }}, {{ formatHours(totalHours) }}</span>
      <span class="hidden sm:inline">Enter adds a page beside, Tab nests it, drag a card onto another to move it.</span>
      <div class="ml-auto flex flex-wrap items-center gap-1">
        <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-minus" class="min-h-8 min-w-8" aria-label="Zoom out" @click="zoom = Math.max(0.4, zoom - 0.1);" />
        <span class="w-10 text-center tabular-nums">{{ Math.round(zoom * 100) }}%</span>
        <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-plus" class="min-h-8 min-w-8" aria-label="Zoom in" @click="zoom = Math.min(1.5, zoom + 0.1);" />
        <UButton size="sm" variant="ghost" color="neutral" class="min-h-8" @click="fitToWidth">Fit</UButton>
        <UButton size="sm" variant="ghost" color="neutral" :icon="fullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'" class="min-h-8 min-w-8" :aria-label="fullscreen ? 'Back to the page' : 'Full screen'" :title="fullscreen ? 'Back to the page (Esc)' : 'Full screen'" @click="fullscreen = !fullscreen;" />
        <UButton v-if="editable" size="sm" variant="outline" color="neutral" icon="i-lucide-plus" class="min-h-8" @click="add(null)">Top-level page</UButton>
      </div>
    </div>
    <!-- The selected page's actions, outside the zoomed layer so they work on a touch screen, where the card's hover buttons never show. -->
    <div v-if="editable && selectedNode" class="mb-2 flex flex-wrap items-center gap-1.5">
      <span class="mr-1 max-w-48 truncate text-xs text-muted">{{ selectedNode.title.trim() || 'Untitled page' }}</span>
      <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-corner-down-right" class="min-h-8" @click="add(selectedNode)">Add under</UButton>
      <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-plus" class="min-h-8" @click="add(parentOf(selectedNode), selectedNode)">Add beside</UButton>
      <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-arrow-down-right" class="min-h-8" :disabled="!prevSibling(selectedNode)" title="Put it under the page before it" @click="nest(selectedNode);">Nest</UButton>
      <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-arrow-up-left" class="min-h-8" :disabled="!selectedNode.parent_id" title="Put it beside its parent" @click="unnest(selectedNode);">Move out</UButton>
      <UButton size="sm" variant="outline" color="error" icon="i-lucide-trash-2" class="min-h-8" title="Remove this page and what is under it" @click="remove(selectedNode)">Remove</UButton>
    </div>
    <div ref="fit" class="overflow-auto rounded-md border border-default bg-elevated/30" :class="fullscreen ? 'min-h-0 flex-1' : ''" :style="fullscreen ? '' : 'max-height: 70vh'">
      <div v-if="!nodes.length" class="flex h-40 items-center justify-center text-sm text-muted">
        <UButton v-if="editable" variant="outline" color="neutral" icon="i-lucide-plus" @click="add(null)">Add the home page</UButton>
        <span v-else>No pages yet.</span>
      </div>
      <div v-else class="relative mx-auto origin-top-left p-4" :style="{ width: `${size.w * zoom + 32}px`, height: `${size.h * zoom + 32}px` }">
        <div class="absolute left-4 top-4 origin-top-left" :style="{ transform: `scale(${zoom})`, width: `${size.w}px`, height: `${size.h}px` }">
          <svg class="pointer-events-none absolute inset-0 overflow-visible" :width="size.w" :height="size.h">
            <path v-for="l in links" :key="l.id" :d="l.d" fill="none" stroke="currentColor" class="text-muted opacity-60" stroke-width="1.5" />
          </svg>
          <div
            v-for="p in placed" :key="p.node.id" :data-node="p.node.id"
            class="group absolute flex flex-col rounded-md border shadow-sm transition-shadow"
            :class="[cardClass(p.node), selected === p.node.id ? 'ring-2 ring-primary' : '', over === p.node.id && dragging && dragging !== p.node.id ? 'ring-2 ring-primary/50' : '']"
            :style="{ left: `${p.x}px`, top: `${p.y}px`, width: `${CARD_W}px`, height: `${CARD_H}px` }"
            :draggable="editable"
            @click="selected = p.node.id"
            @dragstart="dragging = p.node.id" @dragend="dragging = null; over = null"
            @dragover.prevent="over = p.node.id" @dragleave="over = null" @drop.prevent="onDrop(p.node)"
          >
            <input v-model="p.node.title" :readonly="!editable" class="w-full rounded-t-md bg-transparent px-2 pt-1.5 text-sm font-medium outline-none placeholder:text-dimmed" placeholder="Page title" @input="autoPath(p.node)" @keydown="onKey(p.node, $event)">
            <input v-model="p.node.path" :readonly="!editable" class="w-full bg-transparent px-2 text-[11px] text-muted outline-none placeholder:text-dimmed" placeholder="/path" @input="pathTouched.add(p.node.id)" @keydown="onKey(p.node, $event)">
            <div class="mt-auto flex items-center gap-1 px-1.5 pb-1.5">
              <USelectMenu :model-value="p.node.template_id ?? '__none__'" :items="templateOptions" value-key="value" size="xs" class="min-w-0 flex-1" :disabled="!editable" @update:model-value="setTemplate(p.node, $event as string)" />
              <button
                v-if="p.node.template_id" type="button"
                class="h-8 min-w-14 shrink-0 rounded border px-1.5 text-right text-xs tabular-nums"
                :class="typedOver(p.node) ? 'border-primary/60 font-medium text-primary' : 'border-default text-muted hover:text-highlighted'"
                :title="summary(p.node) || 'This template has no parts yet'"
                :aria-label="`Parts and hours for ${p.node.title || 'this page'}`"
                @click.stop="openParts(p.node)"
              >
                {{ formatHours(hoursOf(p.node)) }}
              </button>
            </div>
            <div v-if="editable" class="absolute -right-2 -top-2 hidden gap-0.5 group-hover:flex">
              <button type="button" class="grid size-5 place-items-center rounded-full border border-default bg-default text-muted hover:text-highlighted" title="Add a page under this one" @click.stop="add(p.node)"><UIcon name="i-lucide-corner-down-right" class="size-3" /></button>
              <button type="button" class="grid size-5 place-items-center rounded-full border border-default bg-default text-muted hover:text-highlighted" title="Add a page beside this one" @click.stop="add(parentOf(p.node), p.node)"><UIcon name="i-lucide-plus" class="size-3" /></button>
              <button type="button" class="grid size-5 place-items-center rounded-full border border-default bg-default text-muted hover:text-error" title="Remove this page and what is under it" @click.stop="remove(p.node)"><UIcon name="i-lucide-x" class="size-3" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <AppDrawer
      :open="!!partsPage"
      :title="partsPage?.title.trim() || 'Untitled page'"
      :description="partsPage ? `${partsPage.template || 'No template'} page. Type hours to change a part on this page only, or 0 to skip it. Save the plan to keep them.` : undefined"
      :portal="(fullscreen && root) || true"
      @update:open="(v) => { if (!v) partsNode = null }"
    >
      <template #body>
        <div v-if="partsPage" class="space-y-3">
          <p v-if="!partsOf(partsPage).length" class="text-sm text-muted">
            The {{ partsPage.template }} template has no parts yet. Add them in Settings, Page templates.
          </p>
          <div v-for="x in partsOf(partsPage)" :key="x.part.id" class="grid grid-cols-[1fr_6rem_2rem] items-center gap-2">
            <div class="min-w-0">
              <div class="text-sm font-medium" :class="x.hours > 0 ? '' : 'text-muted line-through'">{{ x.part.name }}</div>
              <div class="text-xs text-muted">{{ partNote(partsPage, x) }}</div>
            </div>
            <UInput
              :model-value="partsPage.part_hours[x.part.id] ?? ''" type="number" step="0.25" min="0"
              :placeholder="String(x.part.hours)" :readonly="!editable" :ui="{ base: 'text-right' }"
              :aria-label="`${x.part.name} hours`"
              @update:model-value="setPart(partsPage, x.part.id, $event)"
            />
            <UButton v-if="editable && isTyped(partsPage, x.part.id)" icon="i-lucide-undo-2" variant="ghost" color="neutral" aria-label="Use the template's hours" title="Use the template's hours" @click="setPart(partsPage, x.part.id, '')" />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap items-center gap-2">
          <span v-if="partsPage" class="text-sm tabular-nums text-muted">This page: {{ formatHours(hoursOf(partsPage)) }}</span>
          <UButton v-if="editable && partsPage && typedOver(partsPage)" variant="ghost" color="neutral" class="ml-auto" @click="partsPage.part_hours = {};">Use the template's hours</UButton>
          <UButton :class="editable && partsPage && typedOver(partsPage) ? '' : 'ml-auto'" @click="partsNode = null;">Done</UButton>
        </div>
      </template>
    </AppDrawer>
  </div>
</template>
