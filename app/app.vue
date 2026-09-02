<script setup lang="ts">
const { user, profile, load } = useCurrentUser()
const route = useRoute()
const inSettings = computed(() => route.path === '/admin' || route.path.startsWith('/admin/'))
// Clients get the portal page's own header, none of the staff shell.
// The portal page carries its own header, even when staff preview it.
const staff = computed(() => !!profile.value && profile.value.role !== 'client' && !route.path.startsWith('/portal'))

// A page's walkthrough starts on its first visit, after the page has
// had a moment to render. Skippable, once per person.
const tour = useTour()
onMounted(() => { watch(() => route.path, () => nextTick(() => { if (staff.value) tour.maybeStart() }), { immediate: true }) })

// Load the profile on first render and whenever auth state changes.
await callOnce('current-profile', load)
watch(user, () => load())

useHead({ titleTemplate: (t) => (t ? `${t} | Docket` : 'Docket') })
</script>

<template>
  <UApp>
    <AppSidebar v-if="staff" />
    <SearchPalette v-if="staff" />
    <AppShortcuts v-if="staff" />
    <AssistantDrawer v-if="staff" />
    <div v-if="staff" class="app-shell md:pl-14">
      <UContainer class="py-6">
        <SettingsNav v-if="inSettings" />
        <NuxtPage />
      </UContainer>
    </div>
    <NuxtPage v-else />
  </UApp>
</template>
