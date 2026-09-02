<script setup lang="ts">
// OAuth landing page. The Supabase module exchanges the code for a session;
// once the user appears, send them on. Excluded from the auth redirect.
definePageMeta({ layout: false })
const user = useSupabaseUser()
watch(user, (u) => { if (u) navigateTo('/', { replace: true }) }, { immediate: true })
</script>

<template>
  <div class="flex min-h-screen items-center justify-center text-sm text-muted">
    Signing you in...
  </div>
</template>
