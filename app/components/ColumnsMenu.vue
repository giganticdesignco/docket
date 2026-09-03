<script setup lang="ts" generic="Row">
import type { Columns } from '~/composables/useColumns'

// The Columns button for a table on useColumns: tick columns on or off,
// or reset. Lives in the page toolbar so it is never clipped off the
// right of a wide table.
const props = defineProps<{ cols: Columns<Row> }>()
const menu = computed(() => [
  props.cols.all.map(c => ({ label: c.label, type: 'checkbox' as const, checked: !props.cols.isHidden(c.key), disabled: !!c.always, onUpdateChecked: () => { props.cols.toggle(c.key) } })),
  [{ label: 'Reset columns', icon: 'i-lucide-rotate-ccw', onSelect: () => { props.cols.reset() } }],
])
</script>

<template>
  <UDropdownMenu :items="menu" :content="{ align: 'end' }">
    <UButton icon="i-lucide-settings-2" variant="outline" color="neutral" size="sm" aria-label="Choose columns" title="Show or hide columns. Drag a header to move it; click one to sort." />
  </UDropdownMenu>
</template>
