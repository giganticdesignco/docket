<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Sign in' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const error = ref<string | null>(null)
const loading = ref(false)

// Already signed in: go home.
watchEffect(() => {
  if (user.value) navigateTo('/')
})

// Clients are not on the Google Workspace; they get a link by email.
const email = ref('')
const linkSent = ref(false)
const sending = ref(false)
async function sendLink() {
  sending.value = true
  error.value = null
  const { error: err } = await supabase.auth.signInWithOtp({
    email: email.value.trim().toLowerCase(),
    options: { emailRedirectTo: `${window.location.origin}/callback`, shouldCreateUser: false },
  })
  sending.value = false
  if (err) error.value = err.message
  else linkSent.value = true
}

async function signInWithGoogle() {
  loading.value = true
  error.value = null
  const { error: err } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/callback`,
      // hd hints Google to show only agency accounts. The DB trigger
      // and the Supabase "signups off" setting are the real gate.
      queryParams: { hd: 'giganticdesign.com', prompt: 'select_account' },
    },
  })
  if (err) {
    error.value = err.message
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-lg font-semibold">Docket</h1>
        <p class="text-sm text-muted">Gigantic time and expense tracking</p>
      </template>
      <UButton block icon="i-simple-icons-google" :loading="loading" @click="signInWithGoogle">
        Sign in with Google
      </UButton>
      <p class="mt-2 text-xs text-muted">For the Gigantic team, with your giganticdesign.com account.</p>

      <USeparator class="my-5" label="Clients" />
      <form v-if="!linkSent" class="space-y-3" @submit.prevent="sendLink">
        <UFormField label="Email">
          <UInput v-model="email" type="email" class="w-full" placeholder="you@yourcompany.com" required />
        </UFormField>
        <UButton type="submit" block variant="outline" color="neutral" icon="i-lucide-mail" :loading="sending" :disabled="!email.trim()">Email me a sign-in link</UButton>
        <p class="text-xs text-muted">Works for addresses we have invited. No password to remember.</p>
      </form>
      <UAlert v-else color="success" variant="subtle" title="Check your email" description="The link signs you in on this device. It is good for one use." />
      <UAlert v-if="error" class="mt-4" color="error" variant="subtle" :title="error" />
    </UCard>
  </div>
</template>
