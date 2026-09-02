<script setup lang="ts">
// Docket as a connector for Claude: the URL to add, the one-line
// command for Claude Code, and the apps this person has approved, with
// a way to disconnect them. Approval itself happens on /oauth/consent
// when the app first connects.
const supabase = useSupabaseClient()
const toast = useToast()
const url = computed(() => `${window.location.origin}/api/mcp`)
const command = computed(() => `claude mcp add --transport http docket ${url.value}`)

type Grant = { client_id: string, client_name?: string, client_uri?: string, scopes?: string[], granted_at?: string }
const grants = ref<Grant[] | null>(null)
const grantsError = ref('')
async function loadGrants() {
  const { data, error } = await supabase.auth.oauth.listGrants()
  if (error) { grantsError.value = error.message; grants.value = []; return }
  grants.value = (data ?? []) as unknown as Grant[]
}
onMounted(loadGrants)

async function revoke(g: Grant) {
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId: g.client_id })
  if (error) { toast.add({ title: 'Could not disconnect', description: error.message, color: 'error' }); return }
  toast.add({ title: 'Disconnected', description: g.client_name ?? g.client_id, color: 'success' })
  await loadGrants()
}
async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast.add({ title: 'Copied', color: 'success' }) } catch { toast.add({ title: 'Select and copy it by hand', color: 'warning' }) }
}
const when = (s?: string) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-3">
        <h2 class="font-semibold">Claude</h2>
        <span class="text-sm text-muted">Let Claude log your time, run your timer, read your tasks, and pull reports. It signs in as you and sees only what you see.</span>
      </div>
    </template>
    <div class="space-y-4 text-sm">
      <div>
        <div class="text-xs font-medium uppercase tracking-wider text-muted">Connector URL</div>
        <div class="mt-1 flex items-center gap-2">
          <code class="rounded bg-elevated px-2 py-1 text-xs">{{ url }}</code>
          <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-copy" aria-label="Copy URL" @click="copy(url)" />
        </div>
        <p class="mt-1 text-xs text-muted">In the Claude app or claude.ai: Settings, Connectors, Add custom connector, paste the URL. Then approve it here in Docket when asked.</p>
      </div>
      <div>
        <div class="text-xs font-medium uppercase tracking-wider text-muted">Claude Code</div>
        <div class="mt-1 flex items-center gap-2">
          <code class="rounded bg-elevated px-2 py-1 text-xs">{{ command }}</code>
          <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-copy" aria-label="Copy command" @click="copy(command)" />
        </div>
        <p class="mt-1 text-xs text-muted">Then run /mcp in Claude Code to sign in.</p>
      </div>
      <div>
        <div class="text-xs font-medium uppercase tracking-wider text-muted">Connected apps</div>
        <p v-if="grantsError" class="mt-1 text-xs text-muted">{{ grantsError }}</p>
        <p v-else-if="grants && !grants.length" class="mt-1 text-xs text-muted">Nothing connected yet.</p>
        <ul v-else-if="grants" class="mt-1 divide-y divide-default">
          <li v-for="g in grants" :key="g.client_id" class="flex items-center gap-3 py-2">
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium">{{ g.client_name ?? g.client_id }}</div>
              <div class="text-xs text-muted">{{ g.client_uri }}<span v-if="g.granted_at"> since {{ when(g.granted_at) }}</span></div>
            </div>
            <UButton size="xs" variant="outline" color="neutral" @click="revoke(g)">Disconnect</UButton>
          </li>
        </ul>
      </div>
    </div>
  </UCard>
</template>
