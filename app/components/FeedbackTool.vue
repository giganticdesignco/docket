<script setup lang="ts">
// Report a bug or an idea from any screen. Pick mode covers the page:
// move to outline the element under the pointer and click it, or press
// and drag to draw an area. Then a small form asks which kind and what
// is wrong or wanted. The report keeps the page, a short CSS path to the
// element, its text, and the rectangle, so whoever picks it up can find
// the spot. Cmd+Shift+F, the help menu, or the round button start it.
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()
const toast = useToast()
const picking = useState('feedback-pick', () => false)
const assistantOpen = useState('assistant-open', () => false)

type Box = { x: number, y: number, w: number, h: number }
const hover = ref<Box | null>(null)
const chosen = ref<Box | null>(null)
const target = ref<HTMLElement | null>(null)
const drawing = ref<{ x: number, y: number } | null>(null)
const form = reactive({ kind: 'bug' as 'bug' | 'idea', body: '' })
const sending = ref(false)

const isOurs = (el: Element | null) => !!el?.closest('[data-feedback-tool]')
function elementAt(x: number, y: number): HTMLElement | null {
  const els = document.elementsFromPoint(x, y) as HTMLElement[]
  return els.find(el => !isOurs(el) && el !== document.body && el !== document.documentElement) ?? null
}
const boxOf = (el: Element): Box => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }

function onMove(e: PointerEvent) {
  if (chosen.value) return
  if (drawing.value) {
    hover.value = { x: Math.min(drawing.value.x, e.clientX), y: Math.min(drawing.value.y, e.clientY), w: Math.abs(e.clientX - drawing.value.x), h: Math.abs(e.clientY - drawing.value.y) }
    return
  }
  const el = elementAt(e.clientX, e.clientY)
  target.value = el
  hover.value = el ? boxOf(el) : null
}
function onDown(e: PointerEvent) {
  if (chosen.value || e.button !== 0) return
  drawing.value = { x: e.clientX, y: e.clientY }
}
function onUp(e: PointerEvent) {
  if (chosen.value || !drawing.value) return
  const d = drawing.value
  drawing.value = null
  const moved = Math.abs(e.clientX - d.x) > 6 || Math.abs(e.clientY - d.y) > 6
  if (moved) {
    target.value = null
    chosen.value = { x: Math.min(d.x, e.clientX), y: Math.min(d.y, e.clientY), w: Math.abs(e.clientX - d.x), h: Math.abs(e.clientY - d.y) }
  } else {
    const el = elementAt(e.clientX, e.clientY)
    target.value = el
    chosen.value = el ? boxOf(el) : null
  }
  hover.value = null
}
function cancel() {
  picking.value = false
  hover.value = null
  chosen.value = null
  target.value = null
  drawing.value = null
  form.body = ''
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && picking.value) { e.preventDefault(); cancel() }
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f' && !picking.value) { e.preventDefault(); picking.value = true }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
watch(picking, (v) => { if (v) assistantOpen.value = false })

// A short CSS path: ids stop it early, otherwise tag plus a class or two
// and the position among siblings, five levels up at most.
function pathTo(el: HTMLElement): string {
  const parts: string[] = []
  let node: HTMLElement | null = el
  while (node && node !== document.body && parts.length < 5) {
    if (node.id) { parts.unshift(`#${node.id}`); break }
    const classes = [...node.classList].filter(c => /^[a-z][\w-]*$/i.test(c) && !c.includes(':') && !c.includes('/')).slice(0, 2)
    const same = node.parentElement ? [...node.parentElement.children].filter(c => c.tagName === node!.tagName) : []
    const nth = same.length > 1 ? `:nth-of-type(${same.indexOf(node) + 1})` : ''
    parts.unshift(`${node.tagName.toLowerCase()}${classes.map(c => `.${c}`).join('')}${nth}`)
    node = node.parentElement
  }
  return parts.join(' > ')
}
// Where the form sits: under the selection, or above it near the bottom.
const formStyle = computed(() => {
  const b = chosen.value
  if (!b) return {}
  const below = b.y + b.h + 12
  const top = below + 220 < window.innerHeight ? below : Math.max(12, b.y - 232)
  const left = Math.min(Math.max(12, b.x), window.innerWidth - 372)
  return { top: `${top}px`, left: `${left}px` }
})

async function send() {
  const body = form.body.trim()
  if (!body || !user.value) return
  sending.value = true
  try {
    const el = target.value
    const b = chosen.value
    const { error } = await supabase.from('feedback').insert({
      created_by: user.value.sub,
      kind: form.kind,
      body,
      path: route.fullPath,
      page_title: document.title.replace(/ \| Docket$/, ''),
      selector: el ? pathTo(el) : null,
      element_text: el ? (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 160) || null : null,
      rect: b ? { x: Math.round(b.x + window.scrollX), y: Math.round(b.y + window.scrollY), w: Math.round(b.w), h: Math.round(b.h) } : null,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    })
    if (error) throw error
    toast.add({ title: form.kind === 'bug' ? 'Bug reported' : 'Idea sent', description: 'Thanks. It is on the Feedback page in Settings.', color: 'success', duration: 3000 })
    cancel()
  } catch (e) {
    toast.add({ title: 'Not sent', description: (e as Error).message, color: 'error' })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div data-feedback-tool>
    <button
      v-show="!picking && !assistantOpen"
      type="button"
      class="fixed bottom-6 right-20 z-40 flex h-10 items-center gap-2 rounded-full border border-default bg-default px-3 text-sm text-muted shadow-md transition hover:text-highlighted hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 print:hidden"
      title="Report a bug or an idea (Cmd+Shift+F)"
      aria-label="Report a bug or an idea"
      @click="picking = true"
    >
      <UIcon name="i-lucide-message-square-warning" class="size-4" />
      <span class="hidden sm:inline">Report</span>
    </button>

    <Teleport to="body">
      <div v-if="picking" data-feedback-tool class="fixed inset-0 z-[60]" :class="chosen ? '' : 'cursor-crosshair'" @pointermove="onMove" @pointerdown="onDown" @pointerup="onUp">
        <div v-if="!chosen" class="pointer-events-none fixed left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-default bg-default px-4 py-1.5 text-sm shadow-lg">
          Click the thing, or drag around an area. <span class="text-muted">Esc to stop.</span>
        </div>
        <div v-if="hover && !chosen" class="pointer-events-none fixed rounded border-2 border-primary bg-primary/10" :style="{ left: `${hover.x}px`, top: `${hover.y}px`, width: `${hover.w}px`, height: `${hover.h}px` }" />
        <div v-if="chosen" class="pointer-events-none fixed rounded border-2 border-primary bg-primary/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" :style="{ left: `${chosen.x}px`, top: `${chosen.y}px`, width: `${chosen.w}px`, height: `${chosen.h}px` }" />
        <div v-if="chosen" class="fixed z-10 w-90 rounded-lg border border-default bg-default p-3 shadow-xl" :style="formStyle" @pointerdown.stop @pointerup.stop @pointermove.stop>
          <div class="mb-2 flex gap-1 rounded-md bg-elevated p-0.5">
            <UButton size="xs" class="flex-1 justify-center" :variant="form.kind === 'bug' ? 'solid' : 'ghost'" :color="form.kind === 'bug' ? 'error' : 'neutral'" icon="i-lucide-bug" @click="form.kind = 'bug';">Bug</UButton>
            <UButton size="xs" class="flex-1 justify-center" :variant="form.kind === 'idea' ? 'solid' : 'ghost'" :color="form.kind === 'idea' ? 'primary' : 'neutral'" icon="i-lucide-lightbulb" @click="form.kind = 'idea';">Idea</UButton>
          </div>
          <UTextarea v-model="form.body" :rows="3" autofocus class="w-full" :placeholder="form.kind === 'bug' ? 'What went wrong, and what you expected' : 'What would help here'" @keydown.meta.enter.prevent="send" @keydown.ctrl.enter.prevent="send" />
          <div class="mt-2 flex items-center gap-2">
            <span v-if="target" class="min-w-0 flex-1 truncate text-xs text-muted" :title="target.innerText?.trim()">{{ target.tagName.toLowerCase() }}<template v-if="target.innerText?.trim()">: {{ target.innerText.trim().slice(0, 40) }}</template></span>
            <span v-else class="flex-1 text-xs text-muted">An area of the page</span>
            <UButton size="xs" variant="ghost" color="neutral" @click="cancel">Cancel</UButton>
            <UButton size="xs" :loading="sending" :disabled="!form.body.trim()" @click="send">Send</UButton>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
