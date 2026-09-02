<script setup lang="ts">
// The sitemap as a tree on a canvas, Octopus style: a card per page,
// children under their parent, lines between them. Type on the card to
// name the page and set its path, pick a template for its hours (or
// type your own), add a child or a sibling from the card, drag a card
// onto another to move it there. The array handed in is edited in
// place; removed ids are reported so the page can delete them on save.
export type CanvasNode = { id: string, parent_id: string | null, line_item_id: string | null, title: string, path: string, template: string, template_id: string | null, hours: number | string | null }
export type PageTemplate = { id: string, name: string, hours: number, color: string }

const props = defineProps<{ nodes: CanvasNode[], templates: PageTemplate[], editable: boolean }>()
onMounted(() => { for (const n of props.nodes) if (n.path) pathTouched.add(n.id) })
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
// Leaves take one slot; a parent spans its children and sits centred over them.
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
const hoursOf = (n: CanvasNode) => (n.hours !== null && n.hours !== '' ? Number(n.hours) : (n.template_id ? templateById.value.get(n.template_id)?.hours ?? 0 : 0))
const templateOptions = computed(() => [{ label: 'No template', value: '__none__' }, ...props.templates.map(t => ({ label: `${t.name} (${formatHours(t.hours)})`, value: t.id }))])
const selected = ref<string | null>(null)
// The path follows the title (/about-us) until someone edits it by hand.
const pathTouched = new Set<string>()
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
function autoPath(n: CanvasNode) {
  if (pathTouched.has(n.id)) return
  const parent = props.nodes.find(x => x.id === n.parent_id)
  const base = parent ? (parent.path || '').replace(/\/$/, '') : ''
  const isHome = !parent && props.nodes.filter(x => !x.parent_id)[0]?.id === n.id
  n.path = isHome ? '/' : n.title.trim() ? `${base}/${slug(n.title)}` : (parent ? `${base}/` : '/')
}
function add(parent: CanvasNode | null, after?: CanvasNode) {
  const n: CanvasNode = { id: crypto.randomUUID(), parent_id: parent?.id ?? null, line_item_id: parent?.line_item_id ?? null, title: '', path: parent ? `${(parent.path || '').replace(/\/$/, '')}/` : '/', template: '', template_id: null, hours: null }
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
}
function setTemplate(n: CanvasNode, id: string) {
  n.template_id = id === '__none__' ? null : id
  n.template = n.template_id ? templateById.value.get(n.template_id)?.name ?? '' : ''
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
}
function onKey(n: CanvasNode, e: KeyboardEvent) {
  if (e.key === 'Enter') { e.preventDefault(); add(props.nodes.find(x => x.id === n.parent_id) ?? null, n) }
  if (e.key === 'Tab' && !e.shiftKey && !e.altKey) {
    // Tab on a card makes it a child of the card before it.
    const i = props.nodes.indexOf(n)
    const prev = props.nodes.slice(0, i).reverse().find(x => x.parent_id === n.parent_id)
    if (prev) { e.preventDefault(); n.parent_id = prev.id }
  }
  if (e.key === 'Tab' && e.shiftKey && n.parent_id) {
    e.preventDefault()
    const parent = props.nodes.find(x => x.id === n.parent_id)
    n.parent_id = parent?.parent_id ?? null
  }
}

// ---------- view ----------
const zoom = ref(1)
const fit = ref<HTMLElement | null>(null)
function fitToWidth() {
  const w = fit.value?.clientWidth ?? 0
  zoom.value = w ? Math.min(1, Math.max(0.4, (w - 24) / size.value.w)) : 1
}
onMounted(fitToWidth)
watch(() => size.value.w, () => { if (zoom.value < 1) fitToWidth() })
const COLOR: Record<string, string> = {
  primary: 'border-primary/50 bg-primary/5', info: 'border-info/50 bg-info/5', success: 'border-success/50 bg-success/5',
  warning: 'border-warning/50 bg-warning/5', error: 'border-error/50 bg-error/5', neutral: 'border-default bg-default',
}
const cardClass = (n: CanvasNode) => COLOR[n.template_id ? templateById.value.get(n.template_id)?.color ?? 'neutral' : 'neutral'] ?? COLOR.neutral
const totalHours = computed(() => props.nodes.reduce((s, n) => s + hoursOf(n), 0))
defineExpose({ hoursOf })
</script>

<template>
  <div>
    <div class="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>{{ nodes.length }} {{ nodes.length === 1 ? 'page' : 'pages' }}, {{ formatHours(totalHours) }}</span>
      <span class="hidden sm:inline">Enter adds a page beside, Tab nests it, drag a card onto another to move it.</span>
      <div class="ml-auto flex items-center gap-1">
        <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-minus" aria-label="Zoom out" @click="zoom = Math.max(0.4, zoom - 0.1);" />
        <span class="w-10 text-center tabular-nums">{{ Math.round(zoom * 100) }}%</span>
        <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-plus" aria-label="Zoom in" @click="zoom = Math.min(1.5, zoom + 0.1);" />
        <UButton size="xs" variant="ghost" color="neutral" @click="fitToWidth">Fit</UButton>
        <UButton v-if="editable" size="xs" variant="outline" color="neutral" icon="i-lucide-plus" @click="add(null)">Top-level page</UButton>
      </div>
    </div>
    <div ref="fit" class="overflow-auto rounded-md border border-default bg-elevated/30" style="max-height: 70vh">
      <div v-if="!nodes.length" class="flex h-40 items-center justify-center text-sm text-muted">
        <UButton v-if="editable" variant="outline" color="neutral" icon="i-lucide-plus" @click="add(null)">Add the home page</UButton>
        <span v-else>No pages yet.</span>
      </div>
      <div v-else class="relative origin-top-left p-4" :style="{ width: `${size.w * zoom + 32}px`, height: `${size.h * zoom + 32}px` }">
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
              <USelect :model-value="p.node.template_id ?? '__none__'" :items="templateOptions" size="xs" class="min-w-0 flex-1" :disabled="!editable" @update:model-value="setTemplate(p.node, $event as string)" />
              <input v-model="p.node.hours" :readonly="!editable" type="number" step="0.5" min="0" class="w-12 rounded border border-default bg-default px-1 py-0.5 text-right text-xs tabular-nums outline-none" :placeholder="String(hoursOf(p.node))" title="Hours for this page. Blank uses the template's.">
            </div>
            <div v-if="editable" class="absolute -right-2 -top-2 hidden gap-0.5 group-hover:flex">
              <button type="button" class="grid size-5 place-items-center rounded-full border border-default bg-default text-muted hover:text-highlighted" title="Add a page under this one" @click.stop="add(p.node)"><UIcon name="i-lucide-corner-down-right" class="size-3" /></button>
              <button type="button" class="grid size-5 place-items-center rounded-full border border-default bg-default text-muted hover:text-highlighted" title="Add a page beside this one" @click.stop="add(nodes.find(x => x.id === p.node.parent_id) ?? null, p.node)"><UIcon name="i-lucide-plus" class="size-3" /></button>
              <button type="button" class="grid size-5 place-items-center rounded-full border border-default bg-default text-muted hover:text-error" title="Remove this page and what is under it" @click.stop="remove(p.node)"><UIcon name="i-lucide-x" class="size-3" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
