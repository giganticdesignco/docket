import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Public quote page data. The 64-hex token from the link is the only
// credential; only that one quote comes back.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const doc = await loadQuoteDoc(serverSupabaseServiceRole<Database>(event), { token })
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'This quote link is not valid' })
  return doc
})
