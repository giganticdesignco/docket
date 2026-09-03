<script setup lang="ts">
// A second sidebar beside the rail, the way Supabase lays out its
// settings: a title, then grouped links down the left, the page to the
// right. On phones it folds into a strip across the top of the page.
export type SubNavLink = { label: string, to: string, also?: string[] }
export type SubNavSection = { label?: string, links: SubNavLink[] }
const props = defineProps<{ title: string, home?: string, sections: SubNavSection[] }>()
const route = useRoute()
const active = (l: SubNavLink) => [l.to, ...(l.also ?? [])].some(p => route.path === p || route.path.startsWith(`${p}/`))
const sections = computed(() => props.sections.filter(s => s.links.length))
</script>

<template>
  <!-- Wide screens: a fixed column right of the rail -->
  <aside class="fixed inset-y-0 left-14 z-30 hidden w-56 flex-col overflow-y-auto border-r border-default bg-default md:flex" :aria-label="title">
    <NuxtLink :to="home ?? sections[0]?.links[0]?.to ?? '/'" class="flex h-14 shrink-0 items-center px-4 text-sm font-semibold" :class="home && route.path === home ? 'text-highlighted' : 'hover:text-highlighted'">{{ title }}</NuxtLink>
    <nav class="flex-1 px-2 pb-4">
      <div v-for="(s, i) in sections" :key="s.label ?? i" class="mb-3">
        <div v-if="s.label" class="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-dimmed">{{ s.label }}</div>
        <NuxtLink
          v-for="l in s.links" :key="l.to" :to="l.to"
          class="flex h-8 items-center rounded-md px-2 text-sm transition-colors"
          :class="active(l) ? 'bg-elevated text-highlighted' : 'text-muted hover:bg-elevated hover:text-highlighted'"
        >{{ l.label }}</NuxtLink>
      </div>
    </nav>
  </aside>
  <!-- Phones: a strip across the top -->
  <nav class="mb-4 flex flex-wrap items-center gap-1 border-b border-default pb-2 text-sm md:hidden" :aria-label="title">
    <NuxtLink v-if="home" :to="home" class="mr-2 font-semibold" :class="route.path === home ? 'text-highlighted' : 'text-muted'">{{ title }}</NuxtLink>
    <template v-for="(s, i) in sections" :key="s.label ?? i">
      <NuxtLink v-for="l in s.links" :key="l.to" :to="l.to" class="rounded-md px-2 py-1" :class="active(l) ? 'bg-elevated text-highlighted' : 'text-muted'">{{ l.label }}</NuxtLink>
    </template>
  </nav>
</template>
