// A way back from the mistakes that hurt. Deletes on tasks, time
// entries, expenses, and comments are soft (a trigger sets deleted_at
// and RLS hides the row), so the toast after one can offer Undo for
// thirty seconds: restore_deleted() clears the mark. Bulk changes use
// the same toast with a hand-written undo that writes the old values
// back. Rows are purged for good after thirty days.
type Table = 'time_entries' | 'expenses' | 'work_items' | 'work_item_comments'

export function useUndo() {
  const toast = useToast()
  const supabase = useSupabaseClient()

  async function restore(table: Table, ids: string | string[]) {
    for (const id of Array.isArray(ids) ? ids : [ids]) {
      const { error } = await supabase.rpc('restore_deleted', { p_table: table, p_id: id })
      if (error) throw error
    }
  }

  // Shows "title" with an Undo button. `undo` puts things back; `after`
  // refreshes the page's data once it has.
  function offer(title: string, undo: () => Promise<void>, after?: () => unknown) {
    let done = false
    toast.add({
      title,
      duration: 30_000,
      actions: [{
        label: 'Undo',
        variant: 'outline',
        color: 'neutral',
        onClick: async () => {
          if (done) return
          done = true
          try {
            await undo()
            await after?.()
            toast.add({ title: 'Put back', color: 'success', duration: 3000 })
          } catch (e) {
            toast.add({ title: 'Could not undo', description: (e as Error).message, color: 'error' })
          }
        },
      }],
    })
  }

  // The common case: something was deleted, Undo restores it.
  function offerRestore(title: string, table: Table, ids: string | string[], after?: () => unknown) {
    offer(title, () => restore(table, ids), after)
  }

  return { offer, offerRestore, restore }
}
