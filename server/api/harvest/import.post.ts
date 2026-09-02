import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Imports page: one Harvest import now. The work is in
// server/utils/harvestImport.ts, shared with the morning cron.
export default defineEventHandler(async (event) => {
  const body = await readBody<HarvestBody>(event)
  const supabase = await serverSupabaseClient<Database>(event)
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin')
  if (adminErr) throw createError({ statusCode: 500, statusMessage: adminErr.message })
  if (!isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  return await runHarvestImport(supabase, body)
})
