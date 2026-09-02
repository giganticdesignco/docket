<script setup lang="ts">
// A strip above the page inside the Mac app when a newer build exists.
// The site itself is always current; this is only about the shell.
const { available, current, dismiss, download, start } = useDesktopUpdate()
start()
</script>

<template>
  <div v-if="available" class="flex items-center gap-3 border-b border-primary/30 bg-primary/10 px-4 py-2 text-sm">
    <UIcon name="i-lucide-arrow-down-to-line" class="size-4 shrink-0 text-primary" />
    <div class="min-w-0 flex-1">
      <span class="font-medium">Docket {{ available.version }} for Mac is available.</span>
      <span class="text-muted"> You have {{ current }}.</span>
      <span v-if="available.notes" class="text-muted"> {{ available.notes }}</span>
    </div>
    <UButton size="xs" @click="download">Download</UButton>
    <UButton size="xs" variant="ghost" color="neutral" @click="dismiss">Not now</UButton>
  </div>
</template>
