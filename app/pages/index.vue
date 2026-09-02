<script setup lang="ts">
useHead({ title: 'Home' })
const { profile, isAdmin } = useCurrentUser()
</script>

<template>
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold">Hi, {{ profile?.full_name }}</h1>
    <p class="text-muted">
      You are signed in as <strong>{{ isAdmin ? 'an admin' : 'staff' }}</strong>.
      The timer and week view arrive in step 2.
    </p>
  </div>
</template>
