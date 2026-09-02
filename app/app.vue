<script setup lang="ts">
const { user, profile, load } = useCurrentUser()
const route = useRoute()
const inSettings = computed(() => route.path === '/admin' || route.path.startsWith('/admin/'))

// Load the profile on first render and whenever auth state changes.
await callOnce('current-profile', load)
watch(user, () => load())

useHead({ titleTemplate: (t) => (t ? `${t} | Docket` : 'Docket') })
</script>

<template>
  <UApp>
    <AppSidebar v-if="profile" />
    <SearchPalette v-if="profile" />
    <div class="app-shell" :class="profile ? 'md:pl-14' : ''">
      <UContainer class="py-6">
        <SettingsNav v-if="profile && inSettings" />
        <NuxtPage />
      </UContainer>
    </div>
  </UApp>
</template>
