// Files attached to tasks live in the private `work-files` bucket at
// <work_item_id>/<uuid>.<ext>. Storage RLS lets the whole team read them;
// the uploader or an admin deletes.
export function useWorkFiles() {
  const supabase = useSupabaseClient()
  const bucket = () => supabase.storage.from('work-files')

  async function upload(workItemId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const path = `${workItemId}/${crypto.randomUUID()}.${ext}`
    const { error } = await bucket().upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (error) throw error
    return path
  }

  async function remove(path: string) {
    const { error } = await bucket().remove([path])
    if (error) throw error
  }

  // Short-lived signed link in a new tab; the tab is opened before the
  // await so popup blockers still see a user gesture.
  async function open(path: string) {
    const tab = window.open('', '_blank')
    const { data, error } = await bucket().createSignedUrl(path, 300)
    if (error || !data) {
      tab?.close()
      throw error ?? new Error('Could not sign the file link')
    }
    if (tab) tab.location.href = data.signedUrl
  }

  return { upload, remove, open }
}
