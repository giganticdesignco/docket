<script setup lang="ts">
// OAuth landing page. The Supabase module exchanges the code for a session;
// once the user appears, send them on. Excluded from the auth redirect.
definePageMeta({ layout: false })
const user = useSupabaseUser()
const saved = useSupabaseCookieRedirect()
// Back to where they were headed, or home. Portal middleware sends clients on to /portal.
watch(user, (u) => { if (u) navigateTo(saved.pluck() || '/', { replace: true }) }, { immediate: true })
</script>

<template>
  <div class="flex min-h-screen items-center justify-center text-sm text-muted">
    Signing you in...
  </div>
</template>
