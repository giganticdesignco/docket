<script setup lang="ts">
const { user, profile, load } = useCurrentUser()
const route = useRoute()
const inSettings = computed(() => route.path === '/admin' || route.path.startsWith('/admin/'))
// Clients get the portal page's own header, none of the staff shell.
// The portal page carries its own header, even when staff preview it.
const staff = computed(() => !!profile.value && profile.value.role !== 'client' && !route.path.startsWith('/portal'))
// The Assistant is a panel beside the page, not over it: the page
// makes room on wide screens so you can read both at once.
const assistantOpen = useState('assistant-open', () => false)

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
  <!-- Toasts sit top right; the Assistant button has the bottom right corner. -->
  <UApp :toaster="{ position: 'top-right' }">
    <AppSidebar v-if="staff" />
    <SearchPalette v-if="staff" />
    <AppShortcuts v-if="staff" />
    <AssistantDrawer v-if="staff" />
    <AssistantButton v-if="staff" />
    <FeedbackTool v-if="staff" />
    <!-- Settings has a second sidebar beside the rail, so the page moves over to make room. -->
    <SettingsNav v-if="staff && inSettings" />
    <div v-if="staff" class="app-shell transition-[padding] duration-200" :class="[inSettings ? 'md:pl-[calc(3.5rem+14rem)]' : 'md:pl-14', assistantOpen ? 'lg:pr-[26rem]' : '']">
      <DesktopUpdateBanner />
      <UContainer class="py-6">
        <NuxtPage />
      </UContainer>
    </div>
    <NuxtPage v-else />
  </UApp>
</template>
