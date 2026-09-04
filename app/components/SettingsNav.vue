<script setup lang="ts">
// The settings sidebar: every settings page, grouped, so the gear in
// the rail is one entry and the pages find each other here. The list
// itself is SETTINGS_PAGES; /admin draws its cards from the same one.
const { isAdmin, can } = useCurrentUser()
const allowed = (p: typeof SETTINGS_PAGES[number]) => (p.needs === 'admin' ? isAdmin.value : can(p.needs))
const sections = computed(() => {
  const out: { label: string, links: { label: string, to: string, icon: string, also?: string[] }[] }[] = []
  for (const p of SETTINGS_PAGES) {
    if (!allowed(p)) continue
    const s = out.find(x => x.label === p.section) ?? (out.push({ label: p.section, links: [] }), out[out.length - 1]!)
    s.links.push({ label: p.label, to: p.to, icon: p.icon, also: 'also' in p ? [...p.also] : undefined })
  }
  return out
})
</script>

<template>
  <SubNav v-if="isAdmin || can('manage_settings') || can('manage_people')" title="Settings" home="/admin" :sections="sections" />
</template>
