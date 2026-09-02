<script setup lang="ts">
const { user, profile, load } = useCurrentUser()

// Load the profile on first render and whenever auth state changes.
await callOnce('current-profile', load)
watch(user, () => load())

useHead({ titleTemplate: (t) => (t ? `${t} | Docket` : 'Docket') })
</script>

<template>
  <UApp>
    <AppHeader v-if="profile" />
    <UContainer class="py-6">
      <NuxtPage />
    </UContainer>
  </UApp>
</template>
