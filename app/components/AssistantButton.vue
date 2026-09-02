<script setup lang="ts">
// The Assistant lives in the bottom right corner: one round button,
// Cmd+J does the same. Hidden while the drawer is open.
const open = useState('assistant-open', () => false)
</script>

<template>
  <button
    v-show="!open"
    type="button"
    class="fixed bottom-5 right-5 z-40 grid size-12 place-items-center rounded-full bg-primary text-inverted shadow-lg transition hover:scale-105 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 print:hidden"
    title="Assistant (Cmd+J)"
    aria-label="Open the Assistant"
    @click="open = true"
  >
    <UIcon name="i-lucide-sparkles" class="size-5" />
  </button>
</template>
