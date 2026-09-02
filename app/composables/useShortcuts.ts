// Keyboard shortcuts with a registry, so the "?" sheet can list what is
// active. Wraps Nuxt UI's defineShortcuts: keys use its syntax
// ("meta_k", "g-t" for a chord, "arrowleft"), and nothing fires while
// typing in a field. A page registers its own set and it goes away with
// the page.
export type ShortcutDef = { label: string, handler: () => void, kbds?: string[] }
export type Registered = { scope: string, key: string, label: string, kbds: string[] }

const SYMBOL: Record<string, string> = { meta: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃', arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', enter: '↩', escape: 'esc', delete: '⌦', backspace: '⌫', ' ': 'space' }
function keysFor(key: string): string[] {
  if (key.includes('-') && key !== '-' && !key.includes('_')) return key.split('-').map(k => `${SYMBOL[k] ?? k}`).join(' then ').split(' ')
  return key.split('_').map(k => SYMBOL[k] ?? k)
}

export function useShortcutRegistry() {
  return useState<Registered[]>('shortcut-registry', () => [])
}

export function useShortcuts(scope: string, defs: Record<string, ShortcutDef>) {
  const registry = useShortcutRegistry()
  const mine: Registered[] = Object.entries(defs).map(([key, d]) => ({ scope, key, label: d.label, kbds: d.kbds ?? keysFor(key) }))

  // While a dialog is open only Escape and the sheet toggle get through,
  // so J and K never move rows behind a form.
  const guarded = (key: string, handler: () => void) => () => {
    if (key !== 'escape' && key !== '?' && document.querySelector('[role="dialog"]')) return
    handler()
  }
  defineShortcuts(Object.fromEntries(Object.entries(defs).map(([key, d]) => [key, { handler: guarded(key, d.handler), usingInput: false }])))

  onMounted(() => { registry.value = [...registry.value.filter(r => r.scope !== scope), ...mine] })
  onBeforeUnmount(() => { registry.value = registry.value.filter(r => !mine.includes(r)) })
}
