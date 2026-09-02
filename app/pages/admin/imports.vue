<script setup lang="ts">
// The two one-time imports, one entry in the settings strip.
definePageMeta({ middleware: 'can', permission: 'manage_settings' })
useHead({ title: 'Imports' })
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Imports</h1>
      <p class="text-sm text-muted">Bring history in from the tools Docket replaces. Each runs once, and again only if something was missed.</p>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <NuxtLink to="/admin/harvest" class="block">
        <UCard class="h-full transition-colors hover:bg-elevated/50">
          <div class="font-medium">Harvest</div>
          <p class="mt-1 text-sm text-muted">Clients, projects, task types, the archive rollup, this year's entries, expenses, and invoice history.</p>
        </UCard>
      </NuxtLink>
      <NuxtLink to="/admin/clickup" class="block">
        <UCard class="h-full transition-colors hover:bg-elevated/50">
          <div class="font-medium">ClickUp</div>
          <p class="mt-1 text-sm text-muted">Tasks, comments, and assignees into Docket tasks. Already run on 2 September 2026.</p>
        </UCard>
      </NuxtLink>
    </div>
  </div>
</template>
