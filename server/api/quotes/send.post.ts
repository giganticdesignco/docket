import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Email a quote's link to the client. Admin only; the quote is read
// through RLS, the Resend key through the service role. A first send
// moves a draft to sent.

type Body = { quoteId?: string, to?: string[], message?: string }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const to = [...new Set((body.to ?? []).map(s => s.trim()).filter(Boolean))]
  if (!body.quoteId) throw createError({ statusCode: 400, statusMessage: 'quoteId is required' })
  if (!to.length || to.length > 10 || to.some(e => !EMAIL.test(e))) {
    throw createError({ statusCode: 400, statusMessage: 'Give one to ten valid email addresses' })
  }

  const supabase = await serverSupabaseClient<Database>(event)
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin')
  if (adminErr || !isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  const { data: { user } } = await supabase.auth.getUser()
  const doc = await loadQuoteDoc(supabase, { id: body.quoteId })
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'Quote not found' })
  if (doc.quote.status !== 'draft' && doc.quote.status !== 'sent') throw createError({ statusCode: 400, statusMessage: `This quote is ${doc.quote.status}` })
  if (!doc.lines.length) throw createError({ statusCode: 400, statusMessage: 'Add at least one line before sending' })

  const admin = serverSupabaseServiceRole<Database>(event)
  const { data: me } = await supabase.from('profiles').select('full_name, email').eq('id', user!.id).single()
  const link = `${await appOrigin(admin, getRequestURL(event).origin)}/q/${await tokenFor(supabase, doc.quote.id)}`
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const longDate = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const intro = (body.message ?? '').trim() || `Here is our quote for ${doc.quote.title}.`
  const subject = `Quote ${doc.quote.number}: ${doc.quote.title}`
  const summary = [`Quote ${doc.quote.number}`, `Total: ${money(doc.quote.subtotal)}`, doc.quote.valid_until ? `Valid until ${longDate(doc.quote.valid_until)}` : ''].filter(Boolean).join('\n')
  const text = [intro, summary, `Read it and accept online here:\n${link}`, `Thanks,\n${me?.full_name ?? doc.company.name}\n${doc.company.name}`].join('\n\n')
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px">
<p style="margin:0 0 16px">${escapeHtml(intro).replace(/\n/g, '<br>')}</p>
<table style="border-collapse:collapse;margin:0 0 16px;font-size:15px">
<tr><td style="padding:2px 16px 2px 0;color:#555">Quote</td><td style="padding:2px 0"><strong>${escapeHtml(doc.quote.number)}</strong></td></tr>
<tr><td style="padding:2px 16px 2px 0;color:#555">Total</td><td style="padding:2px 0"><strong>${money(doc.quote.subtotal)}</strong></td></tr>
${doc.quote.valid_until ? `<tr><td style="padding:2px 16px 2px 0;color:#555">Valid until</td><td style="padding:2px 0">${longDate(doc.quote.valid_until)}</td></tr>` : ''}
</table>
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Read and accept the quote</a></p>
<p style="margin:0">Thanks,<br>${escapeHtml(me?.full_name ?? doc.company.name)}<br>${escapeHtml(doc.company.name)}</p>
</div>`

  const sent = await sendEmail(admin, { to, subject, text, html, replyTo: me?.email ?? doc.company.email ?? undefined })
  if (!sent.ok) throw createError({ statusCode: 502, statusMessage: sent.error })

  const { error: updErr } = await supabase.from('quotes').update({
    status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', doc.quote.id)
  if (updErr) throw createError({ statusCode: 500, statusMessage: `Sent, but could not update the quote: ${updErr.message}` })
  return { to, link }
})

async function tokenFor(supabase: Awaited<ReturnType<typeof serverSupabaseClient<Database>>>, id: string) {
  const { data } = await supabase.from('quotes').select('public_token').eq('id', id).single()
  return data?.public_token ?? ''
}
