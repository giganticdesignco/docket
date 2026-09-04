<script setup lang="ts">
// Every notification for the signed-in person, and their choices per
// kind: show it in the bell, and email never, as it happens, or once a
// day. Missing rows mean the defaults, which is why the table is
// upserted rather than edited in place.
useHead({ title: 'Notifications' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()

const KINDS = NOTIFICATION_KINDS
const EMAIL_DEFAULT = (kind: string) => notificationKind(kind)?.emailDefault ?? 'instant'
const EMAIL_OPTIONS = [{ label: 'Never', value: 'off' }, { label: 'As it happens', value: 'instant' }, { label: 'Daily digest', value: 'daily' }]

const __ad1 = useNotifications('notifications-all', 200)
const __ad2 = useAsyncData('notification-prefs', async () => {
  const { data, error } = await supabase.from('notification_prefs').select('kind, in_app, email')
  if (error) throw error
  return data
}, fresh)
const [{ items, refresh, unread, openItem, markAllRead }] = await Promise.all([__ad1, __ad2])
const { data: prefs, refresh: refreshPrefs } = __ad2

const pref = (kind: string) => prefs.value?.find(p => p.kind === kind)
const inApp = (kind: string) => pref(kind)?.in_app ?? true
const emailFor = (kind: string) => pref(kind)?.email ?? EMAIL_DEFAULT(kind)
async function setPref(kind: string, patch: { in_app?: boolean, email?: string }) {
  const row = { user_id: user.value!.sub, kind, in_app: patch.in_app ?? inApp(kind), email: patch.email ?? emailFor(kind) }
  const { error } = await supabase.from('notification_prefs').upsert(row)
  if (error) toast.add({ title: 'Not saved', description: error.message, color: 'error' })
  else await refreshPrefs()
}

async function clearRead() {
  await supabase.from('notifications').delete().not('read_at', 'is', null)
  refresh()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Notifications</h1>
        <p class="text-sm text-muted">{{ unread ? `${unread} unread.` : 'All caught up.' }} Email choices are yours alone; the team's are separate.</p>
      </div>
      <div class="ml-auto flex gap-2">
        <UButton size="sm" variant="outline" color="neutral" :disabled="!unread" @click="markAllRead">Mark all read</UButton>
        <UButton size="sm" variant="ghost" color="neutral" @click="clearRead">Clear read</UButton>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-5">
      <UCard class="lg:col-span-3" :ui="{ body: 'p-0 sm:p-0' }">
        <ul v-if="items?.length" class="divide-y divide-default">
          <li v-for="n in items" :key="n.id">
            <button type="button" class="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-elevated/60" :class="n.read_at ? 'text-muted' : ''" @click="openItem(n)">
              <span class="mt-1.5 size-2 shrink-0 rounded-full" :class="n.read_at ? 'bg-transparent' : 'bg-primary'" />
              <span class="min-w-0 flex-1">
                <span class="block" :class="n.read_at ? '' : 'font-medium'">{{ n.title }}</span>
                <span v-if="n.body" class="block text-xs text-muted">{{ n.body }}</span>
              </span>
              <span class="shrink-0 text-xs text-dimmed tabular-nums">{{ stamp(n.created_at) }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="px-4 py-10 text-center text-sm text-muted">Nothing yet. When someone assigns you, mentions you, or a client responds, it lands here.</p>
      </UCard>

      <UCard class="lg:col-span-2">
        <template #header>
          <h2 class="font-semibold">What reaches you</h2>
          <p class="text-xs text-muted">Bell shows it in Docket. Email goes out as it happens, or once a day at 8am.</p>
        </template>
        <ul class="divide-y divide-default text-sm">
          <li v-for="k in KINDS" :key="k.kind" class="flex items-center gap-3 py-2">
            <span class="min-w-0 flex-1">{{ k.label }}</span>
            <USwitch :model-value="inApp(k.kind)" size="sm" :aria-label="`${k.label}: bell`" @update:model-value="(v: boolean) => setPref(k.kind, { in_app: v })" />
            <USelect :model-value="emailFor(k.kind)" :items="EMAIL_OPTIONS" size="xs" class="w-32" :aria-label="`${k.label}: email`" @update:model-value="(v: string) => setPref(k.kind, { email: v })" />
          </li>
        </ul>
      </UCard>
    </div>
  </div>
</template>
