import type { Tables } from '~~/shared/types/database'
import type { PermissionKey } from '~~/shared/types/app'

// Profile + role for the signed-in user. Shared across the app via useState
// so the header, pages, and guards all read the same row.
// isAdmin here is for showing/hiding UI only. RLS is what actually enforces it.
export function useCurrentUser() {
  const user = useSupabaseUser()
  const supabase = useSupabaseClient()

  const profile = useState<Tables<'profiles'> | null>('current-profile', () => null)
  // The keys this person's role carries; admins carry all of them.
  const permissions = useState<string[]>('current-permissions', () => [])

  async function load() {
    if (!user.value) {
      profile.value = null
      permissions.value = []
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
    const { data: perms } = await supabase.from('permissions').select('key').eq('role', data.role)
    permissions.value = (perms ?? []).map(p => p.key)
  }

  const isAdmin = computed(() => profile.value?.role === 'admin')
  // UI convenience only, same as isAdmin: RLS is what enforces it.
  const can = (key: PermissionKey) => isAdmin.value || permissions.value.includes(key)

  async function signOut() {
    await supabase.auth.signOut()
    profile.value = null
    await navigateTo('/login')
  }

  return { user, profile, isAdmin, can, permissions, load, signOut }
}
