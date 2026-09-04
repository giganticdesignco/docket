// The signed-in person's notifications: the list, how many are unread,
// and the two things every screen does with them (open one, mark all
// read). The bell and the Notifications page both sit on this.
export async function useNotifications(key: string, limit: number, opts: { server?: boolean } = {}) {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const router = useRouter()

  const { data: items, refresh } = await useAsyncData(key, async () => {
    if (!user.value) return []
    const { data, error } = await supabase.from('notifications').select('id, kind, title, body, link, read_at, created_at').order('created_at', { ascending: false }).limit(limit)
    if (error) throw error
    return data
  }, { ...fresh, ...opts })
  const unread = computed(() => (items.value ?? []).filter(n => !n.read_at).length)

  async function openItem(n: { id: string, read_at: string | null, link: string | null }) {
    if (!n.read_at) await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
    refresh()
    if (n.link) router.push(n.link)
  }
  async function markAllRead() {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
    refresh()
  }
  return { items, refresh, unread, openItem, markAllRead }
}
