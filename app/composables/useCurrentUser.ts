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
  // Departments this person leads; a lead reviews their people's time.
  const leads = useState<{ id: string, name: string }[]>('current-leads', () => [])

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
    const { data: led } = await supabase.from('departments').select('id, name').eq('lead_id', data.id).eq('is_active', true)
    leads.value = led ?? []
  }

  const isAdmin = computed(() => profile.value?.role === 'admin')
  // UI convenience only, same as isAdmin: RLS is what enforces it.
  const can = (key: PermissionKey) => isAdmin.value || permissions.value.includes(key)
  const isLead = computed(() => leads.value.length > 0)
  // Approvals is open to leads as well as approve_time holders.
  const canReview = computed(() => can('approve_time') || isLead.value)

  async function signOut() {
    await supabase.auth.signOut()
    profile.value = null
    await navigateTo('/login')
  }

  return { user, profile, isAdmin, can, permissions, leads, isLead, canReview, load, signOut }
}
