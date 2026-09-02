<script setup lang="ts">
// Seven day buttons for one week with hours per day and the week total.
// Monday first, matching the Harvest account setting.
const props = defineProps<{
  days: string[]
  selected: string
  totals: Record<string, number>
}>()
const emit = defineEmits<{ select: [date: string] }>()

const today = todayString()
const weekTotal = computed(() => props.days.reduce((sum, d) => sum + (props.totals[d] ?? 0), 0))
</script>

<template>
  <div class="grid grid-cols-8 overflow-hidden rounded-lg border border-default text-sm">
    <button
      v-for="d in days"
      :key="d"
      type="button"
      class="border-r border-default px-2 py-3 text-center transition-colors hover:bg-elevated"
      :class="d === selected ? 'bg-elevated' : ''"
      @click="emit('select', d)"
    >
      <div class="text-xs font-medium uppercase" :class="d === today ? 'text-primary' : 'text-muted'">{{ dayName(d) }}</div>
      <div class="text-xs text-muted">{{ shortDate(d) }}</div>
      <div class="mt-1 tabular-nums" :class="d === selected ? 'font-semibold' : ''">{{ formatHours(totals[d] ?? 0) }}</div>
    </button>
    <div class="px-2 py-3 text-center">
      <div class="text-xs font-medium uppercase text-muted">Week</div>
      <div class="text-xs text-muted">&nbsp;</div>
      <div class="mt-1 font-semibold tabular-nums">{{ formatHours(weekTotal) }}</div>
    </div>
  </div>
</template>
