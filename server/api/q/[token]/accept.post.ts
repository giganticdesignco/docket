import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// The client accepts from /q/<token>: typed name (and email) go on the
// quote, accept_quote() makes the project, and whoever wrote the quote
// gets an email.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  type Body = { name?: unknown, email?: unknown }
  const body = await readBody<Body>(event).catch((): Body => ({}))
  const name = cleanQuoteName(body.name)
  const email = String(body.email ?? '').trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw createError({ statusCode: 400, statusMessage: 'That email address does not look right' })

  const admin = serverSupabaseServiceRole<Database>(event)
  const doc = await loadQuoteDoc(admin, { token })
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'This quote link is not valid' })
  if (doc.expired) throw createError({ statusCode: 400, statusMessage: 'This quote has expired. Ask us for a fresh one.' })

  const { error } = await admin.rpc('accept_quote', { p_quote_id: doc.quote.id, p_name: name, p_email: email || undefined })
  if (error) throw createError({ statusCode: 400, statusMessage: error.message })

  const { data: q } = await admin.from('quotes').select('profiles!quotes_created_by_fkey(email, is_active)').eq('id', doc.quote.id).single()
  const origin = await appOrigin(admin, getRequestURL(event).origin)
  if (q?.profiles?.is_active) {
    await sendEmail(admin, {
      to: [q.profiles.email],
      subject: `${name} accepted quote ${doc.quote.number}`,
      text: `${name}${email ? ` (${email})` : ''} accepted "${doc.quote.title}" for ${doc.client.name}, ${money(doc.quote.subtotal)}.\n\nA project was created from it: ${origin}/quotes/${doc.quote.id}`,
    })
  }
  return loadQuoteDoc(admin, { token })
})

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
