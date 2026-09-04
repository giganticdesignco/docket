<script setup lang="ts">
// While an admin looks at Docket as someone else, a strip across the top
// says so and gives the way back. Only the rail, guards and fields
// change; the data on screen is still the admin's own.
const { viewing, viewAs, stopViewAs } = useCurrentUser()
function stop() { stopViewAs(); navigateTo('/admin/permissions') }
</script>

<template>
  <div v-if="viewing && viewAs" class="flex flex-wrap items-center gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm">
    <UIcon name="i-lucide-eye" class="size-4 text-warning" />
    <span>Viewing Docket as <strong>{{ viewAs.name }}</strong>. Screens, menus and money fields are theirs; the data is still yours.</span>
    <UButton size="xs" variant="outline" color="neutral" class="ml-auto" @click="stop">Back to admin</UButton>
  </div>
</template>
