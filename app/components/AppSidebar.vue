<script setup lang="ts">
// Left rail, Supabase style: icons only until you hover, then it widens
// over the page with labels and section headings. On phones it becomes a
// top bar with a menu that slides in from the left.
const { profile, isAdmin, signOut } = useCurrentUser()
const route = useRoute()

type Link = { label: string, to: string, icon: string }
type Section = { label: string, links: Link[] }

const sections = computed<Section[]>(() => {
  const work: Section = {
    label: 'Work',
    links: [
      { label: 'Time', to: '/time', icon: 'i-lucide-clock' },
      { label: 'Tasks', to: '/tasks', icon: 'i-lucide-list-todo' },
      { label: 'Expenses', to: '/expenses', icon: 'i-lucide-receipt' },
      { label: 'Time off', to: '/time-off', icon: 'i-lucide-palmtree' },
    ],
  }
  const accounts: Section = {
    label: 'Accounts',
    links: [
      { label: 'Clients', to: '/clients', icon: 'i-lucide-building-2' },
      { label: 'Projects', to: '/projects', icon: 'i-lucide-folder-kanban' },
    ],
  }
  if (!isAdmin.value) return [work, accounts]
  return [
    work,
    accounts,
    {
      label: 'Manage',
      links: [
        { label: 'Quotes', to: '/quotes', icon: 'i-lucide-file-signature' },
        { label: 'Capacity', to: '/capacity', icon: 'i-lucide-gauge' },
        { label: 'Reports', to: '/reports', icon: 'i-lucide-chart-column' },
        { label: 'Billing', to: '/billing', icon: 'i-lucide-wallet' },
        { label: 'Invoices', to: '/invoices', icon: 'i-lucide-file-text' },
      ],
    },
    {
      label: 'Settings',
      links: [
        { label: 'People', to: '/admin/users', icon: 'i-lucide-users' },
        { label: 'Project settings', to: '/admin/project-settings', icon: 'i-lucide-folder-cog' },
        { label: 'Task statuses', to: '/admin/task-statuses', icon: 'i-lucide-circle-dot' },
        { label: 'Task types', to: '/admin/tasks', icon: 'i-lucide-list-checks' },
        { label: 'Expense categories', to: '/admin/expense-categories', icon: 'i-lucide-tags' },
        { label: 'Invoice settings', to: '/admin/invoice-settings', icon: 'i-lucide-settings' },
        { label: 'Harvest import', to: '/admin/harvest', icon: 'i-lucide-download' },
        { label: 'ClickUp import', to: '/admin/clickup', icon: 'i-lucide-download' },
      ],
    },
  ]
})

const active = (to: string) => route.path === to || route.path.startsWith(`${to}/`)

// Light or dark, remembered per browser. Client-only so the server never
// hydrates the wrong icon.
const colorMode = useColorMode()
const isDark = computed({
  get: () => colorMode.value === 'dark',
  set: (v: boolean) => { colorMode.preference = v ? 'dark' : 'light' },
})

const mobileOpen = ref(false)
watch(() => route.path, () => { mobileOpen.value = false })
</script>

<template>
  <!-- Desktop rail -->
  <aside class="group fixed inset-y-0 left-0 z-40 hidden w-14 flex-col overflow-hidden border-r border-default bg-default transition-[width] duration-150 ease-out hover:w-60 hover:shadow-xl md:flex">
    <NuxtLink to="/" class="flex h-14 shrink-0 items-center gap-3 px-3">
      <span class="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-sm font-bold text-inverted">D</span>
      <span class="hidden truncate font-semibold group-hover:inline">Docket</span>
    </NuxtLink>

    <nav class="flex-1 overflow-y-auto overflow-x-hidden py-1">
      <div v-for="s in sections" :key="s.label" class="mb-1">
        <div class="h-6 px-4 pt-2 text-[10px] font-semibold uppercase tracking-wider text-dimmed">
          <span class="hidden group-hover:inline">{{ s.label }}</span>
        </div>
        <NuxtLink
          v-for="l in s.links" :key="l.to" :to="l.to" :title="l.label"
          class="mx-2 flex h-9 items-center gap-3 rounded-md px-2 text-sm transition-colors"
          :class="active(l.to) ? 'bg-elevated text-highlighted' : 'text-muted hover:bg-elevated hover:text-highlighted'"
        >
          <UIcon :name="l.icon" class="size-5 shrink-0" />
          <span class="hidden truncate group-hover:inline">{{ l.label }}</span>
        </NuxtLink>
      </div>
    </nav>

    <div class="shrink-0 border-t border-default p-2">
      <ClientOnly>
        <button type="button" class="flex h-9 w-full items-center gap-3 rounded-md px-2 text-sm text-muted hover:bg-elevated hover:text-highlighted" :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'" @click="isDark = !isDark;">
          <UIcon :name="isDark ? 'i-lucide-moon' : 'i-lucide-sun'" class="size-5 shrink-0" />
          <span class="hidden truncate group-hover:inline">{{ isDark ? 'Dark mode' : 'Light mode' }}</span>
        </button>
        <template #fallback><div class="h-9" /></template>
      </ClientOnly>
      <div class="flex h-9 items-center gap-3 px-2 text-sm" :title="profile?.full_name ?? ''">
        <span class="grid size-5 shrink-0 place-items-center rounded-full bg-elevated text-[10px] font-medium">{{ (profile?.full_name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2) }}</span>
        <span class="hidden min-w-0 flex-1 truncate group-hover:inline">{{ profile?.full_name }}<span v-if="isAdmin" class="text-muted"> &middot; admin</span></span>
        <button type="button" class="hidden text-xs text-muted hover:text-highlighted group-hover:inline" @click="signOut">Sign out</button>
      </div>
    </div>
  </aside>

  <!-- Phone bar -->
  <header class="flex h-14 items-center gap-3 border-b border-default px-4 md:hidden">
    <UButton icon="i-lucide-menu" variant="ghost" color="neutral" aria-label="Menu" @click="mobileOpen = true;" />
    <NuxtLink to="/" class="font-semibold">Docket</NuxtLink>
    <ClientOnly>
      <UButton :icon="isDark ? 'i-lucide-moon' : 'i-lucide-sun'" variant="ghost" color="neutral" size="sm" class="ml-auto" aria-label="Toggle theme" @click="isDark = !isDark;" />
    </ClientOnly>
  </header>

  <USlideover v-model:open="mobileOpen" side="left" title="Docket">
    <template #body>
      <nav class="space-y-4">
        <div v-for="s in sections" :key="s.label">
          <div class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-dimmed">{{ s.label }}</div>
          <NuxtLink v-for="l in s.links" :key="l.to" :to="l.to" class="flex h-9 items-center gap-3 rounded-md px-2 text-sm" :class="active(l.to) ? 'bg-elevated text-highlighted' : 'text-muted'">
            <UIcon :name="l.icon" class="size-5" />{{ l.label }}
          </NuxtLink>
        </div>
      </nav>
    </template>
    <template #footer>
      <div class="flex w-full items-center gap-3 text-sm">
        <span class="min-w-0 flex-1 truncate">{{ profile?.full_name }}</span>
        <UButton variant="ghost" size="sm" @click="signOut">Sign out</UButton>
      </div>
    </template>
  </USlideover>
</template>
