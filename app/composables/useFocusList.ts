// Your focus list: the few tasks you mean to work on next, in the order
// you mean to do them. Rows in work_item_focus under an own-row policy,
// so the list follows you between the browser and the Mac app and nobody
// else can see it. The ids live in useState, so the star on the task
// list, the button on a task, and the band on Home all agree without
// each of them querying again.
//
// Named useFocusList, not useFocus, because the task list already uses
// `focused` for its keyboard row cursor and the two must not read as the
// same thing.
export function useFocusList() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const ids = useState<string[]>('focus-ids', () => [])
  const ready = useState<boolean>('focus-ready', () => false)

  async function load(force = false) {
    if (ready.value && !force) return ids.value
    if (!user.value) { ids.value = []; return ids.value }
    const { data, error } = await supabase.from('work_item_focus')
      .select('work_item_id, position, created_at')
      .eq('user_id', user.value.sub)
      .order('position').order('created_at').order('work_item_id')
    if (error) throw error
    ids.value = (data ?? []).map(r => r.work_item_id)
    ready.value = true
    return ids.value
  }
  const has = (id: string) => ids.value.includes(id)

  // New rows go on the end, never the top: the top slot is what you are
  // doing now. One row lets the trigger number it; several are numbered
  // here so they land in the order they were picked.
  async function add(taskIds: string[]) {
    if (!user.value) return 0
    const missing = taskIds.filter(id => !has(id))
    if (!missing.length) return 0
    let rows = missing.map(work_item_id => ({ user_id: user.value!.sub, work_item_id, position: 0 }))
    if (missing.length > 1) {
      const { data } = await supabase.from('work_item_focus').select('position')
        .eq('user_id', user.value.sub).order('position', { ascending: false }).limit(1).maybeSingle()
      const base = data?.position ?? 0
      rows = missing.map((work_item_id, n) => ({ user_id: user.value!.sub, work_item_id, position: base + n + 1 }))
    }
    const { error } = await supabase.from('work_item_focus').insert(rows)
    if (error) throw error
    ids.value = [...ids.value, ...missing]
    return missing.length
  }

  async function remove(taskIds: string[]) {
    if (!user.value || !taskIds.length) return
    const { error } = await supabase.from('work_item_focus').delete()
      .eq('user_id', user.value.sub).in('work_item_id', taskIds)
    if (error) throw error
    ids.value = ids.value.filter(id => !taskIds.includes(id))
  }

  // Undo for a bulk remove: back at the numbers the rows had.
  async function put(rows: { work_item_id: string, position: number }[]) {
    if (!user.value || !rows.length) return
    const { error } = await supabase.from('work_item_focus')
      .upsert(rows.map(r => ({ ...r, user_id: user.value!.sub })), { onConflict: 'user_id,work_item_id' })
    if (error) throw error
    await load(true)
  }

  // Renumber the whole list 1..n in one upsert. `ordered` must hold every
  // id on the list, the ones whose task is no longer visible included, so
  // nothing is left holding a number that collides with the new run.
  async function reorder(ordered: string[]) {
    if (!user.value || !ordered.length) return
    const was = ids.value
    ids.value = ordered
    const { error } = await supabase.from('work_item_focus')
      .upsert(ordered.map((work_item_id, n) => ({ user_id: user.value!.sub, work_item_id, position: n + 1 })), { onConflict: 'user_id,work_item_id' })
    if (error) { ids.value = was; throw error }
  }

  return { ids, count: computed(() => ids.value.length), has, load, add, remove, put, reorder }
}
