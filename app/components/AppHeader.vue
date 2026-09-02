<script setup lang="ts">
const { profile, isAdmin, signOut } = useCurrentUser()

// Light or dark, remembered per browser by the color-mode module. Rendered
// client-only so the server (which cannot know the preference) never
// hydrates the wrong icon.
const colorMode = useColorMode()
const isDark = computed({
  get: () => colorMode.value === 'dark',
  set: (v: boolean) => { colorMode.preference = v ? 'dark' : 'light' },
})

const links = computed(() => [
  { label: 'Time', to: '/time' },
  { label: 'Expenses', to: '/expenses' },
  { label: 'Clients', to: '/clients' },
  { label: 'Projects', to: '/projects' },
  ...(isAdmin.value ? [{ label: 'Reports', to: '/reports' }, { label: 'Billing', to: '/billing' }, { label: 'Invoices', to: '/invoices' }] : []),
])

// Admin pages live in one menu so the bar stays short as they accumulate.
const adminItems = [[
  { label: 'People', to: '/admin/users', icon: 'i-lucide-users' },
  { label: 'Tasks', to: '/admin/tasks', icon: 'i-lucide-list-checks' },
  { label: 'Expense categories', to: '/admin/expense-categories', icon: 'i-lucide-tags' },
  { label: 'Invoice settings', to: '/admin/invoice-settings', icon: 'i-lucide-file-text' },
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
        <ClientOnly>
          <UButton :icon="isDark ? 'i-lucide-moon' : 'i-lucide-sun'" variant="ghost" color="neutral" size="sm" :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'" @click="isDark = !isDark;" />
          <template #fallback>
            <div class="size-8" />
          </template>
        </ClientOnly>
        <UButton variant="ghost" size="sm" @click="signOut">Sign out</UButton>
      </div>
    </UContainer>
  </header>
</template>
