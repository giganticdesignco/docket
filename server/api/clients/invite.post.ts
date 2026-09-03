import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Invite a client contact. Needs the billing permission. Creates the
// auth user with role and client_id in its metadata (the profile trigger
// reads them) and lets Supabase send its invite email with a magic
// link; an existing contact gets a fresh sign-in link instead.

type Body = { clientId?: string, email?: string, fullName?: string }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const email = (body.email ?? '').trim().toLowerCase()
  const fullName = (body.fullName ?? '').trim()
  if (!body.clientId || !EMAIL.test(email)) throw createError({ statusCode: 400, statusMessage: 'A client and a valid email are required' })

  const supabase = await serverSupabaseClient<Database>(event)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw createError({ statusCode: 403, statusMessage: 'Sign in first' })
  const checks = await Promise.all(['manage_invoices', 'manage_quotes', 'manage_retainers'].map(k => supabase.rpc('has_permission', { p_key: k })))
  const allowed = checks.some(c => c.data)
  if (!allowed) throw createError({ statusCode: 403, statusMessage: 'Billing permission needed' })
  const { data: client } = await supabase.from('clients').select('id, name').eq('id', body.clientId).maybeSingle()
  if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found' })

  const admin = serverSupabaseServiceRole<Database>(event)
  const redirectTo = `${await appOrigin(admin, getRequestURL(event).origin)}/callback`

  // Already a contact for this client: send a sign-in link again.
  const { data: existing } = await admin.from('profiles').select('id, client_id, role').eq('email', email).maybeSingle()
  if (existing) {
    if (existing.role !== 'client' || existing.client_id !== client.id) {
      throw createError({ statusCode: 409, statusMessage: 'That email already belongs to someone else in Docket' })
    }
    const { error } = await admin.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } })
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    return { ok: true, resent: true }
  }

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { role: 'client', client_id: client.id, full_name: fullName || email.split('@')[0] },
  })
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { ok: true, resent: false }
})
