<script setup lang="ts">
// The way back from a page, as a line of ancestors above the heading:
// "Clients > Acme" over a retainer, "Tasks" over the unsorted list.
// Ancestors only; the heading below is the current page. The heading
// never moves, which a back arrow in front of it made it do.
defineProps<{ items: { label: string, to?: string }[] }>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 text-sm">
    <template v-for="(c, i) in items" :key="i">
      <UIcon v-if="i" name="i-lucide-chevron-right" class="size-4 text-dimmed" />
      <NuxtLink v-if="c.to" :to="c.to" class="text-muted hover:text-highlighted">{{ c.label }}</NuxtLink>
      <span v-else class="text-muted">{{ c.label }}</span>
    </template>
  </div>
</template>
