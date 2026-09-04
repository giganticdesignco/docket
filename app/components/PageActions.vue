<script setup lang="ts">
// The action row at the top of a document page, the same on every
// page: one labeled button for the main thing, icon buttons with a
// tooltip for the rest, and a More menu for the rare or destructive
// ones. `show: false` drops an action for the current state.
export type PageAction = {
  label: string
  icon: string
  onSelect?: () => void
  to?: string
  target?: string
  disabled?: boolean
  loading?: boolean
  color?: 'primary' | 'neutral' | 'error' | 'success'
  // A toggle that is on (the focus star), drawn solid.
  active?: boolean
  show?: boolean
}
const props = withDefaults(defineProps<{ primary?: PageAction, items?: PageAction[], more?: PageAction[], size?: 'xs' | 'sm' | 'md' }>(), { size: 'md' })
const shown = (list?: PageAction[]) => (list ?? []).filter(a => a.show !== false)
const icons = computed(() => shown(props.items))
const menu = computed(() => shown(props.more).map(a => ({ label: a.label, icon: a.icon, disabled: a.disabled, color: a.color === 'error' ? 'error' as const : undefined, onSelect: a.onSelect })))
</script>

<template>
  <div class="flex flex-wrap items-center gap-1">
    <UButton v-if="primary && primary.show !== false" :size="size" :icon="primary.icon" :loading="primary.loading" :disabled="primary.disabled" :to="primary.to" :target="primary.target" :color="primary.color ?? 'primary'" class="mr-1" @click="primary.onSelect?.()">{{ primary.label }}</UButton>
    <slot />
    <UButton
      v-for="a in icons" :key="a.label" :size="size" :icon="a.icon"
      :variant="a.active ? 'solid' : 'outline'" :color="a.active ? 'primary' : (a.color ?? 'neutral')"
      :loading="a.loading" :disabled="a.disabled" :to="a.to" :target="a.target"
      :aria-label="a.label" :title="a.label" @click="a.onSelect?.()"
    />
    <UDropdownMenu v-if="menu.length" :items="menu">
      <UButton :size="size" variant="outline" color="neutral" icon="i-lucide-ellipsis" aria-label="More actions" title="More" />
    </UDropdownMenu>
  </div>
</template>
