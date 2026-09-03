<script setup lang="ts" generic="Row">
import type { Columns } from '~/composables/useColumns'

// The thead for a table using useColumns: click a header to sort, drag
// one onto another to reorder, and the gear pinned at the right end
// shows or hides columns. Pass a trailing slot for a header cell the
// page adds itself (an actions column).
const props = defineProps<{ cols: Columns<Row>, only?: Columns<Row>['visible'] }>()
const shown = computed(() => props.only ?? props.cols.visible)
const menu = computed(() => [
  props.cols.all.map(c => ({ label: c.label, type: 'checkbox' as const, checked: !props.cols.isHidden(c.key), disabled: !!c.always, onUpdateChecked: () => { props.cols.toggle(c.key) } })),
  [{ label: 'Reset columns', icon: 'i-lucide-rotate-ccw', onSelect: () => { props.cols.reset() } }],
])
const dragging = ref<string | null>(null)
const over = ref<string | null>(null)
function onDrop(to: string) {
  if (dragging.value) props.cols.move(dragging.value, to)
  dragging.value = null
  over.value = null
}
</script>

<template>
  <thead class="text-left text-muted">
    <tr class="border-b border-default">
      <th
        v-for="c in shown" :key="c.key"
        class="px-4 py-2 font-medium select-none" :class="[c.align === 'right' ? 'text-right' : '', c.class ?? '', over === c.key && dragging !== c.key ? 'border-l-2 border-primary' : '', dragging === c.key ? 'opacity-40' : '']"
        draggable="true" @dragstart="dragging = c.key" @dragend="dragging = null; over = null" @dragover.prevent="over = c.key" @dragleave="over === c.key && (over = null)" @drop.prevent="onDrop(c.key)"
      >
        <button v-if="c.sort" type="button" class="inline-flex items-center gap-1 hover:text-highlighted" :class="cols.sort?.key === c.key ? 'text-highlighted' : ''" :title="`Sort by ${c.label.toLowerCase()}`" @click="cols.toggleSort(c.key)">
          {{ c.label }}
          <UIcon v-if="cols.sort?.key === c.key" :name="cols.sort.dir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" class="size-3.5" />
        </button>
        <span v-else>{{ c.label }}</span>
      </th>
      <!-- Pinned to the right edge, so the gear stays on screen when the table scrolls sideways. -->
      <th class="sticky right-0 z-10 w-px whitespace-nowrap bg-default px-2 py-1 text-right">
        <slot name="trailing" />
        <UDropdownMenu :items="menu" :content="{ align: 'end' }">
          <UButton icon="i-lucide-settings-2" variant="ghost" color="neutral" size="xs" class="text-default" aria-label="Choose columns" title="Show or hide columns. Drag a header to move it; click one to sort." />
        </UDropdownMenu>
      </th>
    </tr>
  </thead>
</template>
