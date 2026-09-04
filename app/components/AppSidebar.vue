<script setup lang="ts">
// Left rail, Supabase style: icons only until you hover, then it widens
// over the page with labels and section headings. Pages and Settings
// only; the tools (Assistant, feedback, the bell, help, the theme) sit
// in the right rail. On phones it becomes a top bar with a menu that
// slides in from the left and carries both.
const { profile, isAdmin, can, signOut, canReview } = useCurrentUser()
const route = useRoute()

type Link = { label: string, to: string, icon: string }
type Section = { label: string, links: Link[] }

// Two groups: what people open every day, then everything else under
// More. Settings is the gear at the bottom. Staff never see admin pages,
// so their rail is short by default.
const sections = computed<Section[]>(() => {
  const daily: Section = {
    label: '',
    links: [
      { label: 'Home', to: '/', icon: 'i-lucide-house' },
      ...(can('screen:time') ? [{ label: 'Time', to: '/time', icon: 'i-lucide-clock' }] : []),
      ...(can('screen:tasks') ? [{ label: 'Tasks', to: '/tasks', icon: 'i-lucide-list-todo' }] : []),
      ...(can('screen:projects') ? [{ label: 'Projects', to: '/projects', icon: 'i-lucide-folder-kanban' }] : []),
      ...(can('screen:clients') ? [{ label: 'Clients', to: '/clients', icon: 'i-lucide-building-2' }] : []),
      ...(can('screen:reports') ? [{ label: 'Reports', to: '/reports', icon: 'i-lucide-chart-column' }] : []),
    ],
  }
  // Which screens a role opens is set on Settings, Permissions.
  const more: Section = {
    label: 'More',
    links: [
      ...(can('screen:schedule') ? [{ label: 'Schedule', to: '/schedule', icon: 'i-lucide-gantt-chart' }] : []),
      ...(can('screen:estimator') ? [{ label: 'Estimator', to: '/estimator', icon: 'i-lucide-calculator' }] : []),
      ...(can('screen:expenses') ? [{ label: 'Expenses', to: '/expenses', icon: 'i-lucide-receipt' }] : []),
      ...(can('screen:time_off') ? [{ label: 'Time off', to: '/time-off', icon: 'i-lucide-palmtree' }] : []),
      ...(can('screen:quotes') ? [{ label: 'Quotes', to: '/quotes', icon: 'i-lucide-file-signature' }] : []),
      ...(can('screen:planner') ? [{ label: 'Planner', to: '/planner', icon: 'i-lucide-move' }] : []),
      ...(can('screen:approvals') || canReview.value ? [{ label: 'Approvals', to: '/approvals', icon: 'i-lucide-badge-check' }] : []),
      ...(can('screen:billing') ? [{ label: 'Billing', to: '/billing', icon: 'i-lucide-wallet' }] : []),
      ...(can('screen:invoices') ? [{ label: 'Invoices', to: '/invoices', icon: 'i-lucide-file-text' }] : []),
    ],
  }
  return [daily, more].filter(s => s.links.length)
})
const settings: Link = { label: 'Settings', to: '/admin', icon: 'i-lucide-settings' }
const showSettings = computed(() => can('screen:settings') && (can('manage_settings') || can('manage_people')))
const searchOpen = useState('search-open', () => false)
const { assistantOpen, feedbackPick, isDark } = useRailTools()

const active = (to: string) => route.path === to || route.path.startsWith(`${to}/`)


const mobileOpen = ref(false)
watch(() => route.path, () => { mobileOpen.value = false })

// Seven quick clicks on the logo open the credits.
const { credits } = useEasterEggs()
let logoClicks = 0
let logoLast = 0
function logoClick(e: MouseEvent) {
  const now = Date.now()
  logoClicks = now - logoLast < 4000 ? logoClicks + 1 : 1
  logoLast = now
  if (logoClicks >= 7) { logoClicks = 0; e.preventDefault(); credits() }
}
</script>

<template>
  <!-- Desktop rail -->
  <aside data-tour="rail" class="group fixed inset-y-0 left-0 z-40 hidden w-14 flex-col overflow-hidden border-r border-default bg-default transition-[width] duration-150 ease-out hover:w-60 hover:shadow-xl md:flex">
    <NuxtLink to="/" class="flex h-14 shrink-0 items-center gap-3 px-3" @click="logoClick">
      <img src="/logo.svg" alt="" class="size-8 shrink-0">
      <span class="hidden truncate font-semibold group-hover:inline">Docket</span>
    </NuxtLink>

    <nav class="flex-1 overflow-y-auto overflow-x-hidden py-1">
      <button type="button" data-tour="search" class="mx-2 mb-1 flex h-9 w-[calc(100%-1rem)] items-center gap-3 rounded-md px-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-highlighted" title="Search (Cmd+K)" @click="searchOpen = true;">
        <UIcon name="i-lucide-search" class="size-5 shrink-0" />
        <span class="hidden min-w-0 flex-1 truncate text-left group-hover:inline">Search</span>
        <UKbd class="hidden group-hover:inline-flex" value="meta" /><UKbd class="hidden group-hover:inline-flex" value="k" />
      </button>
      <div v-for="s in sections" :key="s.label" class="mb-1">
        <div v-if="s.label" class="mx-3 mt-2 mb-1 border-t border-default pt-2 text-[10px] font-semibold uppercase tracking-wider text-dimmed">
          <span class="hidden group-hover:inline">{{ s.label }}</span>
        </div>
        <template v-for="l in s.links" :key="l.to">
          <TimeClockPopover v-if="l.to === '/time'" :active="active(l.to)" />
          <NuxtLink
            v-else :to="l.to" :title="l.label"
            class="mx-2 flex h-9 items-center gap-3 rounded-md px-2 text-sm transition-colors"
            :class="active(l.to) ? 'bg-elevated text-highlighted' : 'text-muted hover:bg-elevated hover:text-highlighted'"
          >
            <UIcon :name="l.icon" class="size-5 shrink-0" />
            <span class="hidden truncate group-hover:inline">{{ l.label }}</span>
          </NuxtLink>
        </template>
      </div>
    </nav>

    <div class="shrink-0 border-t border-default p-2">
      <NuxtLink
        v-if="showSettings" :to="settings.to" :title="settings.label"
        class="flex h-9 items-center gap-3 rounded-md px-2 text-sm transition-colors"
        :class="active(settings.to) ? 'bg-elevated text-highlighted' : 'text-muted hover:bg-elevated hover:text-highlighted'"
      >
        <UIcon :name="settings.icon" class="size-5 shrink-0" />
        <span class="hidden truncate group-hover:inline">{{ settings.label }}</span>
      </NuxtLink>
    </div>
  </aside>

  <!-- Phone bar -->
  <header class="flex h-14 items-center gap-3 border-b border-default px-4 md:hidden">
    <UButton icon="i-lucide-menu" variant="ghost" color="neutral" aria-label="Menu" @click="mobileOpen = true;" />
    <NuxtLink to="/" class="font-semibold">Docket</NuxtLink>
    <UButton icon="i-lucide-search" variant="ghost" color="neutral" size="sm" class="ml-auto" aria-label="Search" @click="searchOpen = true;" />
    <ClientOnly>
      <UButton :icon="isDark ? 'i-lucide-moon' : 'i-lucide-sun'" variant="ghost" color="neutral" size="sm" aria-label="Toggle theme" @click="isDark = !isDark;" />
    </ClientOnly>
  </header>

  <USlideover v-model:open="mobileOpen" side="left" title="Docket">
    <template #body>
      <nav class="space-y-4">
        <div v-for="s in sections" :key="s.label">
          <div v-if="s.label" class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-dimmed">{{ s.label }}</div>
          <NuxtLink v-for="l in s.links" :key="l.to" :to="l.to" class="flex h-9 items-center gap-3 rounded-md px-2 text-sm" :class="active(l.to) ? 'bg-elevated text-highlighted' : 'text-muted'">
            <UIcon :name="l.icon" class="size-5" />{{ l.label }}
          </NuxtLink>
        </div>
        <NuxtLink to="/notifications" class="flex h-9 items-center gap-3 rounded-md px-2 text-sm" :class="active('/notifications') ? 'bg-elevated text-highlighted' : 'text-muted'">
          <UIcon name="i-lucide-bell" class="size-5" />Notifications
        </NuxtLink>
        <button type="button" class="flex h-9 w-full items-center gap-3 rounded-md px-2 text-left text-sm text-muted" @click="assistantOpen = true; mobileOpen = false;">
          <UIcon name="i-lucide-sparkles" class="size-5" />Assistant
        </button>
        <button type="button" class="flex h-9 w-full items-center gap-3 rounded-md px-2 text-left text-sm text-muted" @click="feedbackPick = true;">
          <UIcon name="i-lucide-message-square-warning" class="size-5" />Send feedback
        </button>
        <NuxtLink v-if="showSettings" :to="settings.to" class="flex h-9 items-center gap-3 rounded-md px-2 text-sm" :class="active(settings.to) ? 'bg-elevated text-highlighted' : 'text-muted'">
          <UIcon :name="settings.icon" class="size-5" />{{ settings.label }}
        </NuxtLink>
      </nav>
    </template>
    <template #footer>
      <div class="flex w-full items-center gap-3 text-sm">
        <NuxtLink to="/account" class="min-w-0 flex-1 truncate hover:underline">{{ profile?.full_name }}</NuxtLink>
        <UButton variant="ghost" size="sm" @click="signOut">Sign out</UButton>
      </div>
    </template>
  </USlideover>
</template>
