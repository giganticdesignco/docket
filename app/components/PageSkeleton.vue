<script setup lang="ts">
// What a page looks like while its data is still on the way: a
// heading, a line under it, a row of tiles, then a table. Shown after
// a short beat, so a fast page never flashes it.
</script>

<template>
  <div class="space-y-6" aria-busy="true" aria-label="Loading">
    <div class="space-y-2">
      <USkeleton class="h-7 w-64" />
      <USkeleton class="h-4 w-96 max-w-full" />
    </div>
    <div class="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <USkeleton v-for="i in 4" :key="i" class="h-20" />
    </div>
    <div class="rounded-lg border border-default">
      <div class="flex gap-4 border-b border-default px-4 py-3">
        <USkeleton class="h-4 w-40" />
        <USkeleton class="h-4 w-24" />
        <USkeleton class="ml-auto h-4 w-16" />
      </div>
      <div v-for="i in 8" :key="i" class="flex items-center gap-4 border-b border-default px-4 py-3 last:border-0">
        <USkeleton class="size-6 rounded-full" />
        <USkeleton class="h-4" :class="i % 3 === 0 ? 'w-72' : i % 3 === 1 ? 'w-56' : 'w-64'" />
        <USkeleton class="h-4 w-20" />
        <USkeleton class="ml-auto h-4 w-12" />
      </div>
    </div>
  </div>
</template>
