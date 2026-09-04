<script setup lang="ts">
// The Assistant lives in the bottom right corner on a wide screen: one
// round button, Cmd+J does the same. Hidden while the drawer is open,
// and below xl, where it sat on top of a page's own buttons; the rail
// has it there.
const open = useState('assistant-open', () => false)
</script>

<template>
  <button
    v-show="!open"
    type="button"
    class="fixed bottom-5 right-5 z-40 hidden size-12 xl:grid place-items-center rounded-full bg-primary text-inverted shadow-lg transition hover:scale-105 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 print:hidden"
    title="Assistant (Cmd+J)"
    aria-label="Open the Assistant"
    @click="open = true"
  >
    <UIcon name="i-lucide-sparkles" class="size-5" />
  </button>
</template>
