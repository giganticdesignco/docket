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
      <UAlert v-if="error" class="mt-4" color="error" variant="subtle" :title="error" />
      <p class="mt-4 text-xs text-muted">Use your giganticdesign.com account. Ask an admin if you have not been invited.</p>
    </UCard>
  </div>
</template>
