<script setup lang="ts">
const { profile, isAdmin, signOut } = useCurrentUser()

const links = computed(() => [
  { label: 'Time', to: '/time' },
  { label: 'Clients', to: '/clients' },
  { label: 'Projects', to: '/projects' },
  ...(isAdmin.value ? [{ label: 'Tasks', to: '/admin/tasks' }, { label: 'Harvest', to: '/admin/harvest' }] : []),
])
</script>

<template>
  <header class="border-b border-default">
    <UContainer class="flex h-14 items-center gap-6">
      <NuxtLink to="/" class="font-semibold">Docket</NuxtLink>
      <nav class="flex gap-4 text-sm">
        <NuxtLink v-for="l in links" :key="l.to" :to="l.to" class="text-muted hover:text-highlighted" active-class="text-highlighted">
          {{ l.label }}
        </NuxtLink>
      </nav>
      <div class="ml-auto flex items-center gap-3 text-sm">
        <span class="text-muted">{{ profile?.full_name }}</span>
        <UBadge v-if="isAdmin" color="primary" variant="subtle" size="sm">admin</UBadge>
        <UButton variant="ghost" size="sm" @click="signOut">Sign out</UButton>
      </div>
    </UContainer>
  </header>
</template>
