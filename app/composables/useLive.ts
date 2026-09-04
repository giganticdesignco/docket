// Keep a screen current without a reload. Subscribes to the tables it
// names and calls refresh when any row changes, a short beat after the
// last change so a burst (a hand-off touches three tables) refetches
// once. Realtime applies RLS per subscriber, so a person only hears
// about rows they could read anyway. Unsubscribes when the page goes.
let seq = 0
export function useLive(tables: string[], refresh: () => unknown, opts: { delay?: number } = {}) {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  let channel: ReturnType<typeof supabase.channel> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const bump = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; refresh() }, opts.delay ?? 400)
  }
  onMounted(() => {
    if (!user.value) return
    channel = supabase.channel(`live-${++seq}`)
    for (const table of tables) channel.on('postgres_changes', { event: '*', schema: 'public', table }, bump)
    channel.subscribe()
  })
  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
    channel?.unsubscribe()
  })
}
