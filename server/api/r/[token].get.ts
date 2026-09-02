import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Client review page data. No sign-in; the 64-hex token from the link is
// the only credential, and only that one task comes back.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const doc = await loadReviewDoc(serverSupabaseServiceRole<Database>(event), token)
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'This review link is not valid' })
  return doc
})
