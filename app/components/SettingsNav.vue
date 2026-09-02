<script setup lang="ts">
// The strip across the top of every settings page, so the gear in the
// rail is one entry and the pages find each other here.
const route = useRoute()
const { isAdmin } = useCurrentUser()

const links = [
  { label: 'People', to: '/admin/users' },
  { label: 'Projects', to: '/admin/project-settings' },
  { label: 'Task statuses', to: '/admin/task-statuses' },
  { label: 'Task types', to: '/admin/tasks' },
  { label: 'Expense categories', to: '/admin/expense-categories' },
  { label: 'Invoices and quotes', to: '/admin/invoice-settings' },
  { label: 'Imports', to: '/admin/imports', also: ['/admin/harvest', '/admin/clickup'] },
]
const active = (l: { to: string, also?: string[] }) => [l.to, ...(l.also ?? [])].some(p => route.path === p || route.path.startsWith(`${p}/`))
</script>

<template>
  <nav v-if="isAdmin" class="mb-6 -mt-1 flex flex-wrap items-center gap-1 border-b border-default pb-2 text-sm" aria-label="Settings">
    <NuxtLink to="/admin" class="mr-2 flex items-center gap-1.5 font-semibold" :class="route.path === '/admin' ? 'text-highlighted' : 'text-muted hover:text-highlighted'">
      <UIcon name="i-lucide-settings" class="size-4" />Settings
    </NuxtLink>
    <NuxtLink
      v-for="l in links" :key="l.to" :to="l.to"
      class="rounded-md px-2.5 py-1 transition-colors"
      :class="active(l) ? 'bg-elevated text-highlighted' : 'text-muted hover:bg-elevated hover:text-highlighted'"
    >{{ l.label }}</NuxtLink>
  </nav>
</template>
