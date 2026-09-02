import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Sync now, for yourself. Admins may pass userId to sync someone else.
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw createError({ statusCode: 403, statusMessage: 'Sign in first' })
  const body = await readBody<{ userId?: string }>(event).catch(() => ({} as { userId?: string }))
  let target = user.id
  if (body.userId && body.userId !== user.id) {
    const { data: allowed } = await supabase.rpc('has_permission', { p_key: 'manage_people' })
    if (!allowed) throw createError({ statusCode: 403, statusMessage: 'People permission needed' })
    target = body.userId
  }
  const admin = serverSupabaseServiceRole<Database>(event)
  try {
    const blocks = await syncCalendar(admin, target)
    return { ok: true, blocks }
  } catch (e) {
    throw createError({ statusCode: 502, statusMessage: (e as Error).message })
  }
})
