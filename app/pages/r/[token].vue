<script setup lang="ts">
import type { ReviewDoc } from '~~/shared/types/review'

// The client's side of a task: read, open the shared files, comment under
// their name, approve or request changes. No sign-in; the link is the key.
definePageMeta({ layout: false })

const route = useRoute()
const token = route.params.token as string
const { data: doc, error, refresh } = await useFetch<ReviewDoc>(`/api/r/${token}`)
if (error.value || !doc.value) {
  throw createError({ statusCode: 404, statusMessage: 'This review link is not valid', fatal: true })
}
useHead({ title: () => `Review: ${doc.value?.task.title ?? ''}` })

const toast = useToast()
const name = ref('')
const body = ref('')
// A signed-in client contact is known already: no name box, and their
// comments carry their login.
const supabase = useSupabaseClient()
const sessionUser = useSupabaseUser()
const { data: me } = await useAsyncData('review-me', async () => {
  if (!sessionUser.value) return null
  const { data } = await supabase.from('profiles').select('full_name, role').eq('id', sessionUser.value.sub).maybeSingle()
  return data?.role === 'client' ? data : null
}, fresh)
watch(me, (m) => { if (m) name.value = m.full_name }, { immediate: true })
const busy = ref<'comment' | 'approved' | 'changes_requested' | null>(null)

onMounted(() => {
  try {
    if (!me.value) name.value = localStorage.getItem('docket-review-name') ?? ''
  } catch {}
})
const remember = () => {
  try {
    localStorage.setItem('docket-review-name', name.value.trim())
  } catch {}
}

const date = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const stampYear = (iso: string) => stamp(iso, { year: true })
const size = (n: number | null) => (n == null ? '' : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`)
const statusText = (s: string) => (s === 'client_review' ? 'Waiting for your review' : s === 'completed' ? 'Completed' : `With ${doc.value?.company.name}`)

async function send(kind: 'comment' | 'approved' | 'changes_requested') {
  if (name.value.trim().length < 2) {
    toast.add({ title: 'Add your name first', color: 'error' })
    return
  }
  if ((kind === 'comment' || kind === 'changes_requested') && !body.value.trim()) {
    toast.add({ title: kind === 'comment' ? 'Write a comment first' : 'Say what should change', color: 'error' })
    return
  }
  busy.value = kind
  try {
    remember()
    const url = kind === 'comment' ? `/api/r/${token}/comment` : `/api/r/${token}/decision`
    const payload = kind === 'comment' ? { name: name.value, body: body.value } : { name: name.value, decision: kind, body: body.value }
    doc.value = await $fetch<ReviewDoc>(url, { method: 'POST', body: payload })
    body.value = ''
    toast.add({ title: kind === 'comment' ? 'Comment posted' : kind === 'approved' ? 'Approved. Thank you!' : 'Changes requested', description: `${doc.value.company.name} has been notified.`, color: 'success' })
  } catch (e) {
    toast.add({ title: 'That did not go through', description: apiError(e), color: 'error' })
    await refresh()
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div v-if="doc" class="-my-6 min-h-screen bg-gray-100 py-8 text-gray-900" style="color-scheme: light">
    <div class="mx-auto max-w-3xl space-y-6 px-4">
      <div class="text-sm text-gray-500">{{ doc.company.name }} &middot; for {{ doc.client.name }}</div>

      <div class="rounded-lg bg-white p-6 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wider text-gray-400">For review</div>
            <h1 class="mt-1 text-2xl font-semibold">{{ doc.task.title }}</h1>
            <div class="mt-1 text-sm text-gray-500">{{ doc.project.name }}<span v-if="doc.task.due_on"> &middot; due {{ date(doc.task.due_on) }}</span></div>
          </div>
          <span class="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600">{{ statusText(doc.task.status) }}</span>
        </div>

        <div v-if="doc.task.client_decision" class="mt-4 rounded-md px-4 py-3 text-sm" :class="doc.task.client_decision === 'approved' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'">
          {{ doc.task.client_decision === 'approved' ? 'Approved' : 'Changes requested' }} by {{ doc.task.client_decision_by }}<span v-if="doc.task.client_decision_at">, {{ stampYear(doc.task.client_decision_at) }}</span>
        </div>

        <p v-if="doc.task.description" class="mt-5 whitespace-pre-line text-[15px] leading-relaxed">{{ doc.task.description }}</p>
      </div>

      <div v-if="doc.files.length" class="rounded-lg bg-white p-6 shadow-sm">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-gray-400">Files</h2>
        <ul class="mt-3 divide-y divide-gray-100">
          <li v-for="f in doc.files" :key="f.id" class="flex items-center gap-3 py-2 text-sm">
            <a :href="f.url" target="_blank" rel="noopener" class="font-medium text-gray-900 hover:underline">{{ f.file_name }}</a>
            <span class="text-gray-400">{{ size(f.size_bytes) }}</span>
            <a :href="f.url" target="_blank" rel="noopener" class="ml-auto text-xs text-gray-500 hover:text-gray-900">Open</a>
          </li>
        </ul>
      </div>

      <div class="rounded-lg bg-white p-6 shadow-sm">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-gray-400">Comments</h2>
        <ul v-if="doc.comments.length" class="mt-3 space-y-4">
          <li v-for="c in doc.comments" :key="c.id" class="text-sm">
            <div class="text-xs text-gray-500">
              <span class="font-medium text-gray-900">{{ c.author }}</span>
              <span v-if="!c.is_client"> &middot; {{ doc.company.name }}</span>
              &middot; {{ stampYear(c.created_at) }}
            </div>
            <p class="mt-0.5 whitespace-pre-line">{{ c.body }}</p>
          </li>
        </ul>
        <p v-else class="mt-3 text-sm text-gray-500">No comments yet.</p>

        <div class="mt-6 space-y-3 border-t border-gray-100 pt-5">
          <div class="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <span v-if="me" class="px-1 py-2 text-sm text-gray-700">Commenting as <strong>{{ me.full_name }}</strong></span>
            <input v-else v-model="name" type="text" placeholder="Your name" class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none" @blur="remember">
            <textarea v-model="body" rows="3" placeholder="Leave a comment, or say what should change" class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none" />
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <button type="button" class="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50" :disabled="!!busy" @click="send('comment')">{{ busy === 'comment' ? 'Posting' : 'Post comment' }}</button>
            <button type="button" class="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50" :disabled="!!busy" @click="send('changes_requested')">{{ busy === 'changes_requested' ? 'Sending' : 'Request changes' }}</button>
            <button type="button" class="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50" :disabled="!!busy" @click="send('approved')">{{ busy === 'approved' ? 'Sending' : 'Approve' }}</button>
          </div>
          <p class="text-xs text-gray-400">Your name and note go to the {{ doc.company.name }} team.<span v-if="doc.company.email"> Questions: {{ doc.company.email }}</span></p>
        </div>
      </div>
    </div>
  </div>
</template>
