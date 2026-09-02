import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Public invoice page data. The token is the only credential: 64 hex
// characters from two UUIDs, unguessable, and it never appears anywhere
// but the link the client was sent. Service role because the reader is
// not signed in; nothing but this one invoice is returned.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  if (!/^[0-9a-f]{64}$/.test(token)) throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })
  const supabase = serverSupabaseServiceRole<Database>(event)
  const doc = await loadInvoiceDoc(supabase, { token })
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })
  return doc
})
