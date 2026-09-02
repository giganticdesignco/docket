import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Forget the token and drop the synced busy time. Revoking at Google is
// left to the person (Google account, third-party access).
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw createError({ statusCode: 403, statusMessage: 'Sign in first' })
  const admin = serverSupabaseServiceRole<Database>(event)
  await admin.from('google_tokens').delete().eq('user_id', user.id)
  await admin.from('calendar_busy').delete().eq('user_id', user.id).eq('source', 'google')
  return { ok: true }
})
