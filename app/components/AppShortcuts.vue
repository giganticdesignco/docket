<script setup lang="ts">
// The shortcuts that work on every page, and the "?" sheet that lists
// everything registered right now, grouped by where it applies.
const router = useRouter()
const { can } = useCurrentUser()
const searchOpen = useState('search-open', () => false)
const assistantOpen = useState('assistant-open', () => false)
const timer = useTimer()
const toast = useToast()
const sheetOpen = useState('shortcut-sheet-open', () => false)
const registry = useShortcutRegistry()

const go = (to: string) => () => { router.push(to) }
async function toggleTimer() {
  if (timer.running.value) {
    try {
      await timer.stop()
      toast.add({ title: 'Timer stopped', color: 'success' })
    } catch (e) {
      toast.add({ title: 'Could not stop the timer', description: (e as Error).message, color: 'error' })
    }
    return
  }
  router.push('/time?new=1')
}

useShortcuts('Everywhere', {
  'meta_k': { label: 'Search', handler: () => { searchOpen.value = !searchOpen.value } },
  'meta_j': { label: 'Assistant', handler: () => { assistantOpen.value = !assistantOpen.value } },
  'n': { label: 'New task', handler: go('/tasks?new=1') },
  't': { label: 'Stop the running timer, or log time', handler: toggleTimer },
  'g-t': { label: 'Go to Time', handler: go('/time') },
  'g-k': { label: 'Go to Tasks', handler: go('/tasks') },
  'g-p': { label: 'Go to Projects', handler: go('/projects') },
  'g-c': { label: 'Go to Clients', handler: go('/clients') },
  'g-e': { label: 'Go to Expenses', handler: go('/expenses') },
  ...(can('see_all_time') ? { 'g-r': { label: 'Go to Reports', handler: go('/reports') } } : {}),
  ...(can('manage_invoices') ? { 'g-i': { label: 'Go to Invoices', handler: go('/invoices') } } : {}),
  ...(can('manage_settings') ? { 'g-s': { label: 'Go to Settings', handler: go('/admin') } } : {}),
  '?': { label: 'This sheet', handler: () => { sheetOpen.value = !sheetOpen.value }, kbds: ['?'] },
})

const groups = computed(() => {
  const order = ['Everywhere']
  const scopes = [...new Set(registry.value.map(r => r.scope))].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
  return scopes.map(scope => ({ scope, items: registry.value.filter(r => r.scope === scope) }))
})
</script>

<template>
  <UModal v-model:open="sheetOpen" title="Keyboard shortcuts" description="What works on this page. Nothing fires while you are typing in a field.">
    <template #body>
      <div class="grid gap-6 sm:grid-cols-2">
        <div v-for="g in groups" :key="g.scope">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{{ g.scope }}</h3>
          <dl class="space-y-1.5 text-sm">
            <div v-for="r in g.items" :key="r.key" class="flex items-center gap-3">
              <dt class="flex shrink-0 items-center gap-1">
                <template v-for="(k, i) in r.kbds" :key="i">
                  <span v-if="k === 'then'" class="text-xs text-muted">then</span>
                  <UKbd v-else>{{ k }}</UKbd>
                </template>
              </dt>
              <dd class="text-muted">{{ r.label }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </template>
  </UModal>
</template>
