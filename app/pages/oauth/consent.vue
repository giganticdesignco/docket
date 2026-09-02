<script setup lang="ts">
// The consent screen for Supabase's OAuth 2.1 server. Claude (or any
// MCP client) sends a signed-in team member here with an
// authorization_id; they see who is asking and approve or deny, and
// Supabase sends them back to the client with a code. Clients of the
// agency are refused: the MCP endpoint is for the team.
definePageMeta({ layout: false })
useHead({ title: 'Connect an app' })

const supabase = useSupabaseClient()
const route = useRoute()
const { profile } = useCurrentUser()

const authorizationId = typeof route.query.authorization_id === 'string' ? route.query.authorization_id : ''
type Details = { authorization_id?: string, redirect_url?: string, client?: { name?: string, uri?: string }, redirect_uri?: string, scope?: string }
const details = ref<Details | null>(null)
const error = ref('')
const busy = ref(false)
const scopes = computed(() => (details.value?.scope ?? '').split(' ').filter(Boolean))

onMounted(async () => {
  if (!authorizationId) { error.value = 'This link is missing its authorization id. Start again from the app that asked to connect.'; return }
  if (profile.value?.role === 'client') { error.value = 'Connecting apps is for the Gigantic team.'; return }
  const { data, error: e } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  if (e || !data) { error.value = e?.message ?? 'That authorization request is no longer valid.'; return }
  const d = data as Details
  // Already approved once: Supabase only hands back where to go.
  if (!('authorization_id' in d) && d.redirect_url) { window.location.href = d.redirect_url; return }
  details.value = d
})

async function decide(approve: boolean) {
  busy.value = true
  const { data, error: e } = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId)
    : await supabase.auth.oauth.denyAuthorization(authorizationId)
  busy.value = false
  if (e || !data?.redirect_url) { error.value = e?.message ?? 'Could not finish. Try again from the app.'; return }
  window.location.href = data.redirect_url
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-elevated p-6">
    <UCard class="w-full max-w-md">
      <template #header>
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-plug" class="size-5 text-primary" />
          <h1 class="font-semibold">Connect to Docket</h1>
        </div>
      </template>
      <div v-if="error" class="space-y-3 text-sm">
        <p class="text-error">{{ error }}</p>
        <UButton to="/" variant="outline" color="neutral" size="sm">Back to Docket</UButton>
      </div>
      <div v-else-if="!details" class="text-sm text-muted">Checking the request...</div>
      <div v-else class="space-y-4 text-sm">
        <p><span class="font-medium">{{ details.client?.name || 'An app' }}</span> wants to use Docket as <span class="font-medium">{{ profile?.full_name }}</span>.</p>
        <p class="text-muted">It will be able to do what you can do: read your time, tasks, and reports, log time, and add comments. It cannot delete anything. You can disconnect it any time from your account page.</p>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted">
          <dt>Sends you back to</dt><dd class="truncate" :title="details.redirect_uri">{{ details.redirect_uri }}</dd>
          <template v-if="scopes.length"><dt>Asks for</dt><dd>{{ scopes.join(', ') }}</dd></template>
        </dl>
        <div class="flex justify-end gap-2 pt-2">
          <UButton variant="ghost" color="neutral" :disabled="busy" @click="decide(false)">Deny</UButton>
          <UButton :loading="busy" @click="decide(true)">Approve</UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>
