import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Imports page: pull ClickUp's open tasks now. The work is in
// server/utils/clickupImport.ts, shared with the morning cron.
type Body = { dryRun?: boolean }

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event).catch(() => ({} as Body))
  const supabase = await serverSupabaseClient<Database>(event)
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin')
  if (adminErr || !isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  return await importClickup(supabase, user.id, !!body?.dryRun)
})
