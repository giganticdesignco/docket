// Receipt files live in the private `receipts` bucket, one folder per person
// (<user_id>/<uuid>.<ext>). Storage RLS lets owners and admins read them.
export function useReceipts() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const bucket = () => supabase.storage.from('receipts')

  async function upload(file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const path = `${user.value!.sub}/${crypto.randomUUID()}.${ext}`
    const { error } = await bucket().upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (error) throw error
    return path
  }

  async function remove(path: string) {
    const { error } = await bucket().remove([path])
    if (error) throw error
  }

  // Open a short-lived signed link in a new tab. The tab is opened before the
  // await so popup blockers still see a user gesture.
  async function open(path: string) {
    const tab = window.open('', '_blank')
    const { data, error } = await bucket().createSignedUrl(path, 300)
    if (error || !data) {
      tab?.close()
      throw error ?? new Error('Could not sign the receipt link')
    }
    if (tab) tab.location.href = data.signedUrl
  }

  return { upload, remove, open }
}
