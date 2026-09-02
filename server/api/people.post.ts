import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Create an account for a teammate. Admin only. Uses Supabase's Admin API
// with the server secret key (the one place that key is allowed), creates
// the auth user with the email already confirmed so Google sign-in links
// to it, and lets the profile trigger build the profile row.

type Body = { email?: string, full_name?: string, role?: 'admin' | 'staff' }

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const email = (body?.email ?? '').trim().toLowerCase()
  const fullName = (body?.full_name ?? '').trim()
  const role = body?.role === 'admin' ? 'admin' : 'staff'
  if (!/^[^\s@]+@giganticdesign\.com$/.test(email)) throw createError({ statusCode: 400, statusMessage: 'Email must be a giganticdesign.com address' })
  if (!fullName) throw createError({ statusCode: 400, statusMessage: 'Full name is required' })

  const supabase = await serverSupabaseClient<Database>(event)
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin')
  if (adminErr) throw createError({ statusCode: 500, statusMessage: adminErr.message })
  if (!isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  let admin: ReturnType<typeof serverSupabaseServiceRole<Database>>
  try {
    admin = serverSupabaseServiceRole<Database>(event)
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'SUPABASE_SECRET_KEY is not set on the server, so accounts cannot be created here yet' })
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error) throw createError({ statusCode: error.status === 422 ? 409 : 502, statusMessage: error.message })

  if (role === 'admin') {
    const { error: roleErr } = await admin.from('profiles').update({ role }).eq('id', data.user.id)
    if (roleErr) throw createError({ statusCode: 500, statusMessage: roleErr.message })
  }
  return { id: data.user.id, email, full_name: fullName, role }
})
