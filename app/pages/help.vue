<script setup lang="ts">
import { marked } from 'marked'
import guide from '~~/docs/guide.md?raw'

// The user guide, rendered from docs/guide.md so the same words live in
// the repo and in the app. Headings get ids for the contents list.
useHead({ title: 'Guide' })

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const headings: { level: number, text: string, id: string }[] = []
const renderer = new marked.Renderer()
renderer.heading = ({ text, depth }) => {
  const id = slug(text)
  if (depth === 2) headings.push({ level: depth, text, id })
  return `<h${depth} id="${id}">${text}</h${depth}>`
}
const html = marked.parse(guide.replace(/^# .*\n/, ''), { renderer }) as string
const title = guide.match(/^# (.*)$/m)?.[1] ?? 'Guide'
</script>

<template>
  <div class="grid gap-8 lg:grid-cols-[14rem_1fr]">
    <nav class="hidden lg:block" aria-label="Contents">
      <div class="sticky top-6 space-y-1 text-sm">
        <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Contents</div>
        <a v-for="h in headings" :key="h.id" :href="`#${h.id}`" class="block truncate text-muted hover:text-highlighted">{{ h.text }}</a>
      </div>
    </nav>
    <article class="guide min-w-0 max-w-3xl">
      <h1 class="text-2xl font-semibold">{{ title }}</h1>
      <div v-html="html" />
    </article>
  </div>
</template>

<style scoped>
.guide :deep(h2) { margin-top: 2.25rem; margin-bottom: 0.5rem; font-size: 1.25rem; font-weight: 600; scroll-margin-top: 1.5rem; }
.guide :deep(h3) { margin-top: 1.5rem; margin-bottom: 0.25rem; font-size: 1rem; font-weight: 600; scroll-margin-top: 1.5rem; }
.guide :deep(p) { margin: 0.5rem 0; line-height: 1.6; }
.guide :deep(ul) { margin: 0.5rem 0 0.5rem 1.25rem; list-style: disc; }
.guide :deep(li) { margin: 0.3rem 0; line-height: 1.55; }
.guide :deep(code) { font-size: 0.85em; padding: 0.05rem 0.3rem; border-radius: 0.25rem; background: var(--ui-bg-elevated); }
.guide :deep(strong) { font-weight: 600; }
.guide :deep(ol) { margin: 0.5rem 0 0.5rem 1.25rem; list-style: decimal; }
.guide :deep(.flow) { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; margin: 1rem 0 1.25rem; }
.guide :deep(.flow span) { padding: 0.25rem 0.65rem; border-radius: 9999px; border: 1px solid color-mix(in oklab, var(--ui-primary) 45%, transparent); background: color-mix(in oklab, var(--ui-primary) 10%, transparent); font-size: 0.8rem; font-weight: 500; }
.guide :deep(.flow i) { width: 0.9rem; height: 1px; background: var(--ui-border); }
.guide :deep(a) { text-decoration: underline; text-decoration-color: color-mix(in oklab, var(--ui-primary) 40%, transparent); }
</style>
