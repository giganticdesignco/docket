<script setup lang="ts">
// Where the gear lands. One card per settings page, from the same
// list the settings sidebar uses, gated the same way.
definePageMeta({ middleware: 'can', permission: 'manage_settings' })
const { isAdmin, can } = useCurrentUser()
useHead({ title: 'Settings' })
const cards = computed(() => SETTINGS_PAGES.filter(p => (p.needs === 'admin' ? isAdmin.value : can(p.needs))))

</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Settings</h1>
      <p class="text-sm text-muted">Reference data and how Docket behaves. Admins only.</p>
    </div>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink v-for="c in cards" :key="c.to" :to="c.to" class="block">
        <UCard class="h-full transition-colors hover:bg-elevated/50">
          <div class="flex items-start gap-3">
            <UIcon :name="c.icon" class="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <div class="font-medium">{{ c.label }}</div>
              <p class="mt-1 text-sm text-muted">{{ c.text }}</p>
            </div>
          </div>
        </UCard>
      </NuxtLink>
    </div>
  </div>
</template>
