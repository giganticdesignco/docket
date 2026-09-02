<script setup lang="ts">
const { user, profile, load } = useCurrentUser()

// Load the profile on first render and whenever auth state changes.
await callOnce('current-profile', load)
watch(user, () => load())

useHead({ titleTemplate: (t) => (t ? `${t} | Docket` : 'Docket') })
</script>

<template>
  <UApp>
    <AppSidebar v-if="profile" />
    <div class="app-shell" :class="profile ? 'md:pl-14' : ''">
      <UContainer class="py-6">
        <NuxtPage />
      </UContainer>
    </div>
  </UApp>
</template>
