import type { Tables } from '~~/shared/types/database'

// Profile + role for the signed-in user. Shared across the app via useState
// so the header, pages, and guards all read the same row.
// isAdmin here is for showing/hiding UI only. RLS is what actually enforces it.
export function useCurrentUser() {
  const user = useSupabaseUser()
  const supabase = useSupabaseClient()

  const profile = useState<Tables<'profiles'> | null>('current-profile', () => null)

  async function load() {
    if (!user.value) {
      profile.value = null
      return
    }
    if (profile.value?.id === user.value.sub) return
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.value.sub)
      .single()
    if (error) throw error
    profile.value = data
  }

  const isAdmin = computed(() => profile.value?.role === 'admin')

  async function signOut() {
    await supabase.auth.signOut()
    profile.value = null
    await navigateTo('/login')
  }

  return { user, profile, isAdmin, load, signOut }
}
