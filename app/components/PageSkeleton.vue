<script setup lang="ts">
// What a page looks like while its data is still on the way, drawn in
// the shape of the page that is coming: a list, a task, the timesheet,
// the Planner, a report, a document, and so on. Picked from the
// router's route, which has already changed by the time this shows
// (Nuxt's useRoute() waits for the page and would still name the old
// one).
const route = useRouter().currentRoute
type Variant = 'home' | 'list' | 'tasks' | 'task' | 'time' | 'detail' | 'planner' | 'schedule' | 'report' | 'document' | 'estimator' | 'settings'
const variant = computed<Variant>(() => {
  const p = route.value.path
  if (p === '/') return 'home'
  if (p === '/tasks' || p === '/tasks/triage') return 'tasks'
  if (p.startsWith('/tasks/')) return 'task'
  if (p === '/time') return 'time'
  if (p === '/planner') return 'planner'
  if (p === '/schedule') return 'schedule'
  if (p.startsWith('/reports')) return 'report'
  if (p === '/estimator') return 'estimator'
  if (/^\/(quotes|invoices|billing)\/[^/]+$/.test(p) && !p.endsWith('/new')) return 'document'
  if (/^\/(projects|clients|retainers)\/[^/]+/.test(p)) return 'detail'
  if (p.startsWith('/admin')) return 'settings'
  return 'list'
})
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const widths = ['w-72', 'w-56', 'w-64', 'w-48', 'w-60', 'w-52', 'w-64', 'w-44']
</script>

<template>
  <div class="space-y-6" aria-busy="true" aria-label="Loading">
    <!-- Home: greeting, three tiles, a list and an agenda side by side -->
    <template v-if="variant === 'home'">
      <div class="flex items-end gap-3"><div class="space-y-2"><USkeleton class="h-7 w-72" /><USkeleton class="h-4 w-40" /></div><USkeleton class="ml-auto h-8 w-24" /><USkeleton class="h-8 w-20" /></div>
      <div class="grid gap-4 lg:grid-cols-3">
        <div class="space-y-4 lg:col-span-2">
          <USkeleton class="h-40" />
          <div class="rounded-lg border border-default">
            <div class="border-b border-default px-4 py-3"><USkeleton class="h-4 w-32" /></div>
            <div v-for="i in 6" :key="i" class="flex items-center gap-3 border-b border-default px-4 py-3 last:border-0"><USkeleton class="size-2.5 rounded-full" /><div class="space-y-1.5"><USkeleton class="h-4" :class="widths[i % 8]" /><USkeleton class="h-3 w-32" /></div><USkeleton class="ml-auto h-4 w-12" /></div>
          </div>
        </div>
        <div class="space-y-4">
          <USkeleton v-for="i in 3" :key="i" class="h-20" />
          <div class="rounded-lg border border-default p-4"><USkeleton class="mb-3 h-4 w-24" /><USkeleton v-for="i in 3" :key="i" class="mb-2 h-4 w-full" /></div>
        </div>
      </div>
    </template>

    <!-- Tasks: heading, the strip of controls, grouped rows with a dot, a title and a cluster of faces -->
    <template v-else-if="variant === 'tasks'">
      <div class="flex items-center gap-3"><USkeleton class="h-7 w-32" /><USkeleton class="ml-auto h-8 w-24" /></div>
      <div class="flex gap-2"><USkeleton class="h-7 w-28" /><USkeleton class="h-7 w-32" /><USkeleton class="h-7 w-40" /><USkeleton class="h-7 w-24" /></div>
      <div class="rounded-lg border border-default">
        <template v-for="g in 3" :key="g">
          <div class="border-b border-default bg-elevated/40 px-4 py-2"><USkeleton class="h-3 w-24" /></div>
          <div v-for="i in 4" :key="i" class="flex items-center gap-3 border-b border-default px-4 py-2.5"><USkeleton class="size-2.5 rounded-full" /><USkeleton class="h-4" :class="widths[(g * 4 + i) % 8]" /><USkeleton class="h-3 w-24" /><div class="ml-auto flex -space-x-1"><USkeleton v-for="a in 3" :key="a" class="size-6 rounded-full ring-2 ring-default" /></div><USkeleton class="h-4 w-14" /></div>
        </template>
      </div>
    </template>

    <!-- A task: the crumb line, the title, text blocks with the activity panel beside -->
    <template v-else-if="variant === 'task'">
      <div class="flex items-center gap-2 border-b border-default pb-3"><USkeleton class="h-4 w-12" /><USkeleton class="h-4 w-24" /><USkeleton class="h-4 w-32" /><div class="ml-auto flex gap-2"><USkeleton v-for="i in 4" :key="i" class="size-8" /></div></div>
      <div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div class="space-y-5">
          <USkeleton class="h-8 w-3/4" />
          <div class="flex gap-2"><USkeleton class="h-6 w-20" /><USkeleton class="h-6 w-28" /><USkeleton class="h-6 w-24" /></div>
          <div class="space-y-2"><USkeleton class="h-4 w-full" /><USkeleton class="h-4 w-11/12" /><USkeleton class="h-4 w-2/3" /></div>
          <div class="grid grid-cols-3 gap-4"><USkeleton v-for="i in 6" :key="i" class="h-12" /></div>
          <USkeleton class="h-32" />
        </div>
        <div class="space-y-3 rounded-lg border border-default p-4">
          <USkeleton class="h-4 w-24" />
          <div v-for="i in 5" :key="i" class="flex gap-3"><USkeleton class="size-7 shrink-0 rounded-full" /><div class="flex-1 space-y-1.5"><USkeleton class="h-3 w-32" /><USkeleton class="h-4 w-full" /></div></div>
          <USkeleton class="h-20" />
        </div>
      </div>
    </template>

    <!-- Time: the week across the top, then the day's entries -->
    <template v-else-if="variant === 'time'">
      <div class="flex items-center gap-3"><USkeleton class="h-7 w-24" /><USkeleton class="ml-auto h-8 w-28" /><USkeleton class="h-8 w-8" /><USkeleton class="h-8 w-8" /></div>
      <div class="grid grid-cols-7 gap-2">
        <div v-for="d in days" :key="d" class="rounded-lg border border-default p-3 text-center"><USkeleton class="mx-auto h-3 w-8" /><USkeleton class="mx-auto mt-2 h-5 w-10" /></div>
      </div>
      <div class="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div class="rounded-lg border border-default">
          <div v-for="i in 5" :key="i" class="flex items-center gap-4 border-b border-default px-4 py-3 last:border-0"><div class="space-y-1.5"><USkeleton class="h-4" :class="widths[i % 8]" /><USkeleton class="h-3 w-40" /></div><USkeleton class="ml-auto h-5 w-12" /><USkeleton class="size-8" /></div>
        </div>
        <div class="space-y-3"><USkeleton class="h-24" /><USkeleton class="h-24" /></div>
      </div>
    </template>

    <!-- A client, project, or retainer: crumbs, a heading, facts, tiles, then cards -->
    <template v-else-if="variant === 'detail'">
      <USkeleton class="h-4 w-32" />
      <div class="flex items-center gap-3"><div class="space-y-2"><USkeleton class="h-7 w-64" /><USkeleton class="h-4 w-32" /></div><USkeleton class="h-6 w-16 rounded-full" /><div class="ml-auto flex gap-1"><USkeleton class="size-8" /><USkeleton class="size-8" /></div></div>
      <div class="grid grid-cols-2 gap-x-8 gap-y-3 rounded-lg border border-default p-4 sm:grid-cols-3"><div v-for="i in 6" :key="i" class="space-y-1.5"><USkeleton class="h-3 w-16" /><USkeleton class="h-4 w-28" /></div></div>
      <div class="grid gap-3 grid-cols-2 lg:grid-cols-4"><USkeleton v-for="i in 4" :key="i" class="h-20" /></div>
      <div class="grid gap-4 lg:grid-cols-2"><USkeleton class="h-48" /><USkeleton class="h-48" /></div>
    </template>

    <!-- Planner: people down the side, weekdays across, blocks in the grid -->
    <template v-else-if="variant === 'planner'">
      <div class="flex items-center gap-3"><USkeleton class="h-7 w-28" /><USkeleton class="h-7 w-32" /><USkeleton class="ml-auto h-8 w-40" /><USkeleton class="h-8 w-8" /><USkeleton class="h-8 w-8" /></div>
      <div class="rounded-lg border border-default">
        <div class="grid grid-cols-[10rem_repeat(5,1fr)] border-b border-default"><div class="p-3" /><div v-for="d in days.slice(0, 5)" :key="d" class="p-3"><USkeleton class="h-3 w-12" /></div></div>
        <div v-for="i in 6" :key="i" class="grid grid-cols-[10rem_repeat(5,1fr)] border-b border-default last:border-0">
          <div class="flex items-center gap-2 p-3"><USkeleton class="size-6 rounded-full" /><USkeleton class="h-4 w-20" /></div>
          <div v-for="d in 5" :key="d" class="space-y-1 p-2"><USkeleton v-if="(i + d) % 3 !== 0" class="h-7" /><USkeleton v-if="(i + d) % 4 === 0" class="h-7" /></div>
        </div>
      </div>
    </template>

    <!-- Schedule: rows with bars of different lengths -->
    <template v-else-if="variant === 'schedule'">
      <div class="flex items-center gap-3"><USkeleton class="h-7 w-28" /><USkeleton class="h-7 w-32" /><USkeleton class="h-7 w-40" /><USkeleton class="ml-auto h-8 w-8" /><USkeleton class="h-8 w-8" /></div>
      <div class="rounded-lg border border-default">
        <div class="flex border-b border-default"><div class="w-56 p-3" /><div v-for="i in 8" :key="i" class="flex-1 p-3"><USkeleton class="h-3 w-10" /></div></div>
        <div v-for="i in 8" :key="i" class="flex items-center border-b border-default last:border-0"><div class="w-56 p-3"><USkeleton class="h-4" :class="widths[i % 8]" /></div><div class="flex-1 px-3 py-2"><USkeleton class="h-5 rounded-md" :class="['w-1/3', 'w-1/2', 'w-1/4', 'w-2/3'][i % 4]" :style="{ marginLeft: `${(i * 13) % 50}%` }" /></div></div>
      </div>
    </template>

    <!-- Reports: the filter card, five stat cards, a chart, then the table -->
    <template v-else-if="variant === 'report'">
      <div class="flex items-center gap-3"><USkeleton class="h-7 w-28" /><USkeleton class="h-7 w-32" /><USkeleton class="ml-auto h-8 w-32" /></div>
      <div class="rounded-lg border border-default p-4"><div class="flex flex-wrap gap-2"><USkeleton v-for="i in 7" :key="i" class="h-8 w-28" /></div></div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><USkeleton v-for="i in 5" :key="i" class="h-20" /></div>
      <div class="rounded-lg border border-default p-4"><div class="flex h-40 items-end gap-2"><USkeleton v-for="i in 12" :key="i" class="flex-1" :style="{ height: `${30 + ((i * 37) % 70)}%` }" /></div></div>
      <div class="rounded-lg border border-default"><div v-for="i in 6" :key="i" class="flex items-center gap-4 border-b border-default px-4 py-3 last:border-0"><USkeleton class="h-4" :class="widths[i % 8]" /><USkeleton class="ml-auto h-4 w-14" /><USkeleton class="h-4 w-14" /><USkeleton class="h-4 w-20" /></div></div>
    </template>

    <!-- A quote, invoice, or batch: crumbs, the heading with its actions, a form card, the lines -->
    <template v-else-if="variant === 'document'">
      <USkeleton class="h-4 w-24" />
      <div class="flex items-center gap-3"><USkeleton class="h-7 w-80" /><USkeleton class="h-6 w-14 rounded-full" /><div class="ml-auto flex gap-1"><USkeleton class="h-8 w-20" /><USkeleton v-for="i in 3" :key="i" class="size-8" /></div></div>
      <USkeleton class="h-4 w-64" />
      <div class="rounded-lg border border-default p-4"><div class="grid gap-4 md:grid-cols-4"><USkeleton class="h-10 md:col-span-3" /><USkeleton class="h-10" /><USkeleton class="h-24 md:col-span-4" /></div></div>
      <div class="rounded-lg border border-default">
        <div class="flex gap-4 border-b border-default px-4 py-3"><USkeleton class="h-4 w-40" /><USkeleton class="ml-auto h-4 w-12" /><USkeleton class="h-4 w-16" /><USkeleton class="h-4 w-20" /></div>
        <div v-for="i in 5" :key="i" class="flex items-center gap-4 border-b border-default px-4 py-3 last:border-0"><USkeleton class="h-4" :class="widths[i % 8]" /><USkeleton class="ml-auto h-4 w-12" /><USkeleton class="h-4 w-16" /><USkeleton class="h-4 w-20" /></div>
        <div class="flex justify-end gap-8 px-4 py-3"><USkeleton class="h-5 w-24" /><USkeleton class="h-5 w-24" /></div>
      </div>
    </template>

    <!-- Estimator: the form on the left, the jobs on the right -->
    <template v-else-if="variant === 'estimator'">
      <div class="flex items-center gap-3"><USkeleton class="h-7 w-32" /><USkeleton class="h-4 w-64" /></div>
      <div class="grid gap-4 lg:grid-cols-[24rem_1fr]">
        <div class="space-y-3 rounded-lg border border-default p-4"><USkeleton v-for="i in 7" :key="i" class="h-10" /><USkeleton class="h-9 w-32" /></div>
        <div class="rounded-lg border border-default"><div class="flex gap-3 border-b border-default px-4 py-3"><USkeleton class="h-5 w-20" /><USkeleton class="h-5 w-24" /><USkeleton class="ml-auto h-8 w-24" /></div><div v-for="i in 4" :key="i" class="flex items-center gap-4 border-b border-default px-4 py-3 last:border-0"><USkeleton class="h-4" :class="widths[i % 8]" /><USkeleton class="ml-auto h-4 w-16" /></div></div>
      </div>
    </template>

    <!-- Settings: heading, a short line, a table -->
    <template v-else-if="variant === 'settings'">
      <div class="flex items-center gap-3"><div class="space-y-2"><USkeleton class="h-7 w-40" /><USkeleton class="h-4 w-96 max-w-full" /></div><USkeleton class="ml-auto h-8 w-28" /></div>
      <div class="rounded-lg border border-default">
        <div class="flex gap-4 border-b border-default px-4 py-3"><USkeleton class="h-4 w-32" /><USkeleton class="h-4 w-24" /><USkeleton class="h-4 w-20" /><USkeleton class="ml-auto h-4 w-16" /></div>
        <div v-for="i in 7" :key="i" class="flex items-center gap-4 border-b border-default px-4 py-3 last:border-0"><USkeleton class="h-4" :class="widths[i % 8]" /><USkeleton class="h-4 w-24" /><USkeleton class="h-4 w-20" /><USkeleton class="ml-auto h-4 w-16" /></div>
      </div>
    </template>

    <!-- Everything else that is a list: heading, filters, tiles when it has them, a table -->
    <template v-else>
      <div class="flex items-center gap-3"><div class="space-y-2"><USkeleton class="h-7 w-40" /><USkeleton class="h-4 w-80 max-w-full" /></div><USkeleton class="ml-auto h-8 w-28" /></div>
      <div class="flex gap-2"><USkeleton class="h-8 w-64" /><USkeleton class="h-8 w-32" /><USkeleton class="h-8 w-24" /></div>
      <div class="rounded-lg border border-default">
        <div class="flex gap-4 border-b border-default px-4 py-3"><USkeleton class="h-4 w-40" /><USkeleton class="h-4 w-24" /><USkeleton class="ml-auto h-4 w-16" /></div>
        <div v-for="i in 8" :key="i" class="flex items-center gap-4 border-b border-default px-4 py-3 last:border-0"><USkeleton class="size-6 rounded-full" /><USkeleton class="h-4" :class="widths[i % 8]" /><USkeleton class="h-4 w-20" /><USkeleton class="ml-auto h-4 w-12" /></div>
      </div>
    </template>
  </div>
</template>
