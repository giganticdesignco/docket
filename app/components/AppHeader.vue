<script setup lang="ts">
const { profile, isAdmin, signOut } = useCurrentUser()

const links = [
  { label: 'Time', to: '/time' },
  { label: 'Expenses', to: '/expenses' },
  { label: 'Clients', to: '/clients' },
  { label: 'Projects', to: '/projects' },
]

// Admin pages live in one menu so the bar stays short as they accumulate.
const adminItems = [[
  { label: 'Tasks', to: '/admin/tasks', icon: 'i-lucide-list-checks' },
  { label: 'Expense categories', to: '/admin/expense-categories', icon: 'i-lucide-tags' },
  { label: 'Harvest import', to: '/admin/harvest', icon: 'i-lucide-download' },
]]
</script>

<template>
  <header class="border-b border-default">
    <UContainer class="flex h-14 items-center gap-6">
      <NuxtLink to="/" class="font-semibold">Docket</NuxtLink>
      <nav class="flex items-center gap-4 text-sm">
        <NuxtLink v-for="l in links" :key="l.to" :to="l.to" class="text-muted hover:text-highlighted" active-class="text-highlighted">
          {{ l.label }}
        </NuxtLink>
        <UDropdownMenu v-if="isAdmin" :items="adminItems">
          <UButton label="Admin" variant="ghost" color="neutral" size="sm" trailing-icon="i-lucide-chevron-down" class="-my-1" />
        </UDropdownMenu>
      </nav>
      <div class="ml-auto flex items-center gap-3 text-sm">
        <span class="text-muted">{{ profile?.full_name }}</span>
        <UBadge v-if="isAdmin" color="primary" variant="subtle" size="sm">admin</UBadge>
        <UButton variant="ghost" size="sm" @click="signOut">Sign out</UButton>
      </div>
    </UContainer>
  </header>
</template>
