<script setup lang="ts" generic="T extends string">
// The pill strip: one option solid, the rest ghosted, in a gray tray.
// Every view toggle and tab strip in the app is this one component,
// so they all sit and space the same way.
export type SegmentItem<T extends string = string> = {
  value: T
  label?: string
  icon?: string
  title?: string
  count?: number | string
  color?: 'primary' | 'error' | 'warning' | 'info'
}
defineProps<{
  items: SegmentItem<T>[]
  modelValue: T
  // Stretch the options to fill the width, for a strip inside a form.
  fill?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
</script>

<template>
  <div class="flex gap-0.5 rounded-md bg-elevated p-0.5">
    <UButton
      v-for="i in items" :key="i.value" size="xs" :icon="i.icon"
      :variant="modelValue === i.value ? 'solid' : 'ghost'" :color="modelValue === i.value ? (i.color ?? 'primary') : 'neutral'"
      :aria-label="i.label ?? i.title" :title="i.title" :class="fill ? 'flex-1 justify-center' : ''"
      @click="emit('update:modelValue', i.value)"
    >{{ i.label }}<span v-if="i.count != null" class="ml-1 opacity-70">{{ i.count }}</span></UButton>
  </div>
</template>
