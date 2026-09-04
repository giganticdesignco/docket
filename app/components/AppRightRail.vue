<script setup lang="ts">
// The right rail: the tools that are not pages, tucked at the bottom of
// the far edge so they never sit on a page's own buttons. Icons only
// until you hover, then it widens over the page with labels, the
// mirror of the left rail. Phones get these in the menu instead.
const { profile, isAdmin, signOut } = useCurrentUser()
const { assistantOpen, feedbackPick, helpItems, isDark } = useRailTools()
</script>

<template>
  <aside data-tour="right-rail" class="group fixed inset-y-0 right-0 z-40 hidden w-14 flex-col justify-end overflow-hidden border-l border-default bg-default transition-[width] duration-150 ease-out hover:w-60 hover:shadow-xl md:flex print:hidden" aria-label="Tools">
    <div class="p-2">
      <button type="button" class="flex h-9 w-full items-center gap-3 rounded-md px-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-highlighted" title="Assistant (Cmd+J)" @click="assistantOpen = true;">
        <UIcon name="i-lucide-sparkles" class="size-5 shrink-0" />
        <span class="hidden truncate group-hover:inline">Assistant</span>
        <UKbd class="ml-auto hidden group-hover:inline-flex" value="meta" /><UKbd class="hidden group-hover:inline-flex" value="j" />
      </button>
      <button type="button" data-tour="feedback" class="flex h-9 w-full items-center gap-3 rounded-md px-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-highlighted" title="Send feedback: a bug, a change, or an idea (Cmd+Shift+F)" @click="feedbackPick = true;">
        <UIcon name="i-lucide-message-square-warning" class="size-5 shrink-0" />
        <span class="hidden truncate group-hover:inline">Send feedback</span>
      </button>
      <NotificationBell side="left" />
      <UDropdownMenu :items="helpItems" :content="{ side: 'left', align: 'end' }">
        <button type="button" data-tour="help" class="flex h-9 w-full items-center gap-3 rounded-md px-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-highlighted" title="Help">
          <UIcon name="i-lucide-circle-help" class="size-5 shrink-0" />
          <span class="hidden truncate group-hover:inline">Help</span>
        </button>
      </UDropdownMenu>
      <ClientOnly>
        <button type="button" data-tour="theme" class="flex h-9 w-full items-center gap-3 rounded-md px-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-highlighted" :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'" @click="isDark = !isDark;">
          <UIcon :name="isDark ? 'i-lucide-moon' : 'i-lucide-sun'" class="size-5 shrink-0" />
          <span class="hidden truncate group-hover:inline">{{ isDark ? 'Dark mode' : 'Light mode' }}</span>
        </button>
        <template #fallback><div class="h-9" /></template>
      </ClientOnly>
      <div class="flex h-9 items-center gap-3 px-2 text-sm" :title="profile?.full_name ?? ''">
        <span class="grid size-5 shrink-0 place-items-center rounded-full bg-elevated text-[10px] font-medium">{{ initials(profile?.full_name) }}</span>
        <NuxtLink to="/account" class="hidden min-w-0 flex-1 truncate hover:underline group-hover:inline" title="Account">{{ profile?.full_name }}<span v-if="isAdmin" class="text-muted"> &middot; admin</span></NuxtLink>
        <button type="button" class="hidden text-xs text-muted hover:text-highlighted group-hover:inline" @click="signOut">Sign out</button>
      </div>
    </div>
  </aside>
</template>
