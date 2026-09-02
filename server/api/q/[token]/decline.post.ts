import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// The client declines from /q/<token>, with an optional reason. The
// quote's author gets an email.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  type Body = { name?: unknown, reason?: unknown }
  const body = await readBody<Body>(event).catch((): Body => ({}))
  const name = cleanQuoteName(body.name)
  const reason = String(body.reason ?? '').trim().slice(0, 2000)

  const admin = serverSupabaseServiceRole<Database>(event)
  const doc = await loadQuoteDoc(admin, { token })
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'This quote link is not valid' })

  const { error } = await admin.rpc('decline_quote', { p_quote_id: doc.quote.id, p_name: name, p_reason: reason || undefined })
  if (error) throw createError({ statusCode: 400, statusMessage: error.message })

  const { data: q } = await admin.from('quotes').select('profiles!quotes_created_by_fkey(email, is_active)').eq('id', doc.quote.id).single()
  const origin = await appOrigin(admin, getRequestURL(event).origin)
  if (q?.profiles?.is_active) {
    await sendEmail(admin, {
      to: [q.profiles.email],
      subject: `${name} declined quote ${doc.quote.number}`,
      text: `${name} declined "${doc.quote.title}" for ${doc.client.name}.${reason ? `\n\nReason: ${reason}` : ''}\n\n${origin}/quotes/${doc.quote.id}`,
    })
  }
  return loadQuoteDoc(admin, { token })
})
