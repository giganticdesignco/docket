// The roles table: built-in admin, manager, staff plus whatever
// Gigantic adds on the permissions page. Readable by everyone.
export function useRoles() {
  const supabase = useSupabaseClient()
  return useAsyncData('roles', async () => {
    const { data, error } = await supabase.from('roles').select('*').order('position').order('label')
    if (error) throw error
    return data
  }, fresh)
}
