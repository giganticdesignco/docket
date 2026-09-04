import type { Tables } from '~~/shared/types/database'
import type { PermissionKey } from '~~/shared/types/app'

// Profile + role for the signed-in user. Shared across the app via useState
// so the header, pages, and guards all read the same row.
// isAdmin here is for showing/hiding UI only. RLS is what actually enforces it.
//
// can(key) answers for three kinds of key: screens (screen:tasks), actions
// (manage_invoices) and money fields (field:rates). A field also needs
// see_money, which is what the database gates money on. Per-person
// overrides sit on top of the role, the same way has_permission() reads
// them in SQL.
//
// View as: an admin can look at the app as another role or person. can()
// and isAdmin then answer for them, so the rail, guards and fields show
// what they would see. Data is still the admin's own: RLS does not know.
type ViewAs = { role: string, userId?: string, name: string }

export function useCurrentUser() {
  const user = useSupabaseUser()
  const supabase = useSupabaseClient()

  const profile = useState<Tables<'profiles'> | null>('current-profile', () => null)
  // The keys this person's role carries; admins carry all of them.
  const permissions = useState<string[]>('current-permissions', () => [])
  // Their own overrides: key -> allowed.
  const overrides = useState<Record<string, boolean>>('current-overrides', () => ({}))
  // Departments this person leads; a lead reviews their people's time.
  const leads = useState<{ id: string, name: string }[]>('current-leads', () => [])
  // View as, admins only. Kept for the tab so a reload does not drop it.
  const viewAs = useState<ViewAs | null>('view-as', () => null)
  const viewAsPermissions = useState<string[]>('view-as-permissions', () => [])
  const viewAsOverrides = useState<Record<string, boolean>>('view-as-overrides', () => ({}))

  async function load() {
    if (!user.value) {
      profile.value = null
      permissions.value = []
      overrides.value = {}
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
    const [{ data: perms }, { data: ov }, { data: led }] = await Promise.all([
      supabase.from('permissions').select('key').eq('role', data.role),
      supabase.from('permission_overrides').select('key, allowed').eq('user_id', data.id),
      supabase.from('departments').select('id, name').eq('lead_id', data.id).eq('is_active', true),
    ])
    permissions.value = (perms ?? []).map(p => p.key)
    overrides.value = Object.fromEntries((ov ?? []).map(o => [o.key, o.allowed]))
    leads.value = led ?? []
    if (data.role === 'admin' && import.meta.client) {
      try {
        const saved = sessionStorage.getItem('docket-view-as')
        if (saved && !viewAs.value) await startViewAs(JSON.parse(saved))
      } catch { /* a stale value; ignore */ }
    }
  }

  const realIsAdmin = computed(() => profile.value?.role === 'admin')
  const viewing = computed(() => realIsAdmin.value && !!viewAs.value)
  const isAdmin = computed(() => (viewing.value ? viewAs.value!.role === 'admin' : realIsAdmin.value))
  const hasKey = (key: string) => {
    if (viewing.value) return viewAs.value!.role === 'admin' || (viewAsOverrides.value[key] ?? viewAsPermissions.value.includes(key))
    return realIsAdmin.value || (overrides.value[key] ?? permissions.value.includes(key))
  }
  // UI convenience only, same as isAdmin: RLS is what enforces it.
  const can = (key: PermissionKey) => (key.startsWith('field:') ? hasKey('see_money') && hasKey(key) : hasKey(key))
  const isLead = computed(() => !viewing.value && leads.value.length > 0)
  // Approvals is open to leads as well as approve_time holders.
  const canReview = computed(() => can('approve_time') || isLead.value)

  async function startViewAs(v: ViewAs) {
    if (!realIsAdmin.value) return
    const [{ data: perms }, { data: ov }] = await Promise.all([
      supabase.from('permissions').select('key').eq('role', v.role),
      v.userId ? supabase.from('permission_overrides').select('key, allowed').eq('user_id', v.userId) : Promise.resolve({ data: [] as { key: string, allowed: boolean }[] }),
    ])
    viewAsPermissions.value = (perms ?? []).map(p => p.key)
    viewAsOverrides.value = Object.fromEntries((ov ?? []).map(o => [o.key, o.allowed]))
    viewAs.value = v
    if (import.meta.client) sessionStorage.setItem('docket-view-as', JSON.stringify(v))
  }
  function stopViewAs() {
    viewAs.value = null
    viewAsPermissions.value = []
    viewAsOverrides.value = {}
    if (import.meta.client) sessionStorage.removeItem('docket-view-as')
  }

  async function signOut() {
    stopViewAs()
    await supabase.auth.signOut()
    profile.value = null
    await navigateTo('/login')
  }

  return { user, profile, isAdmin, realIsAdmin, can, permissions, overrides, leads, isLead, canReview, viewAs, viewing, startViewAs, stopViewAs, load, signOut }
}
