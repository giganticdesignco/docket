<script setup lang="ts">
// A drawer from the right for forms, so the list or page you came from
// stays in view while you fill it in. Same title, description, and open
// API as UModal, same #body and #footer slots, so a modal becomes a
// drawer by changing the tag. Modals stay for short confirms.
// `wide` for forms with tables or previews. `dirty` asks before an
// accidental close (Escape, or a click outside).
const props = withDefaults(defineProps<{ open?: boolean, title?: string, description?: string, wide?: boolean, dirty?: boolean }>(), {
  open: false, title: '', description: undefined, wide: false, dirty: false,
})
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
function setOpen(v: boolean) {
  if (!v && props.dirty && !window.confirm('You have unsaved changes. Close anyway?')) return
  emit('update:open', v)
}
</script>

<template>
  <USlideover :open="open" :title="title" :description="description" :ui="{ content: wide ? 'sm:max-w-2xl' : 'sm:max-w-md', footer: 'justify-end' }" @update:open="setOpen">
    <template #body><slot name="body" /></template>
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </USlideover>
</template>
