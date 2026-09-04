import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Nightly, from the Vercel cron in vercel.json. Vercel sends the
// CRON_SECRET as a bearer token; nothing else may call this.
export default defineEventHandler(async (event) => {
  requireCron(event)
  const admin = serverSupabaseServiceRole<Database>(event)
  const { data: people } = await admin.from('google_tokens').select('user_id')
  const results: Record<string, number | string> = {}
  for (const p of people ?? []) {
    try { results[p.user_id] = await syncCalendar(admin, p.user_id) } catch (e) { results[p.user_id] = (e as Error).message }
  }
  return { synced: Object.keys(results).length, results }
})
