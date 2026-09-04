<script setup lang="ts">
// The bell in the rail: unread count, the latest few in a popover, and
// a link to the full list. Subscribes to the person's rows so a new
// row shows up without a reload.
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const open = ref(false)

const { items, refresh, unread, openItem: openNotification, markAllRead } = await useNotifications('notifications-recent', 12, { server: false })

let channel: ReturnType<typeof supabase.channel> | null = null
onMounted(() => {
  if (!user.value) return
  channel = supabase.channel('notifications-bell')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.value.sub}` }, () => refresh())
    .subscribe()
})
onBeforeUnmount(() => { channel?.unsubscribe() })

async function openItem(n: NonNullable<typeof items.value>[number]) {
  open.value = false
  await openNotification(n)
}
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`
}
const ICON: Record<string, string> = Object.fromEntries(NOTIFICATION_KINDS.map(k => [k.kind, k.icon]))
</script>

<template>
  <UPopover v-model:open="open" :content="{ side: 'right', align: 'end', sideOffset: 8 }">
    <button type="button" class="relative flex h-9 w-full items-center gap-3 rounded-md px-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-highlighted" :title="unread ? `${unread} unread` : 'Notifications'" data-tour="bell">
      <span class="relative shrink-0">
        <UIcon name="i-lucide-bell" class="size-5" />
        <span v-if="unread" class="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-inverted">{{ unread > 9 ? '9+' : unread }}</span>
      </span>
      <span class="hidden min-w-0 flex-1 truncate text-left group-hover:inline">Notifications</span>
    </button>
    <template #content>
      <div class="w-80">
        <div class="flex items-center gap-2 border-b border-default px-3 py-2">
          <span class="text-sm font-semibold">Notifications</span>
          <UButton v-if="unread" size="xs" variant="ghost" color="neutral" class="ml-auto" @click="markAllRead">Mark all read</UButton>
        </div>
        <ul v-if="items?.length" class="max-h-96 divide-y divide-default overflow-y-auto">
          <li v-for="n in items" :key="n.id">
            <button type="button" class="flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-elevated" :class="n.read_at ? 'text-muted' : ''" @click="openItem(n)">
              <UIcon :name="ICON[n.kind] ?? 'i-lucide-bell'" class="mt-0.5 size-4 shrink-0" :class="n.read_at ? '' : 'text-primary'" />
              <span class="min-w-0 flex-1">
                <span class="block" :class="n.read_at ? '' : 'font-medium'">{{ n.title }}</span>
                <span v-if="n.body" class="block truncate text-xs text-muted">{{ n.body }}</span>
              </span>
              <span class="shrink-0 text-xs text-dimmed">{{ ago(n.created_at) }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="px-3 py-6 text-center text-sm text-muted">Nothing yet.</p>
        <div class="border-t border-default px-3 py-2 text-xs">
          <NuxtLink to="/notifications" class="text-muted hover:underline" @click="open = false">All notifications and settings</NuxtLink>
        </div>
      </div>
    </template>
  </UPopover>
</template>
