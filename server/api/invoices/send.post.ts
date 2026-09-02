import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Email an invoice (or an overdue reminder for it) through Resend. Runs as
// the signed-in admin for everything except reading the Resend key, which
// lives in Vault and is fetched with the service role. A first send moves
// a draft to sent; a reminder stamps last_reminded_at.

type Body = { invoiceId?: string, to?: string[], message?: string, kind?: 'invoice' | 'reminder' }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const kind = body.kind === 'reminder' ? 'reminder' : 'invoice'
  const to = [...new Set((body.to ?? []).map(s => s.trim()).filter(Boolean))]
  if (!body.invoiceId) throw createError({ statusCode: 400, statusMessage: 'invoiceId is required' })
  if (!to.length || to.length > 10 || to.some(e => !EMAIL.test(e))) {
    throw createError({ statusCode: 400, statusMessage: 'Give one to ten valid email addresses' })
  }

  const supabase = await serverSupabaseClient<Database>(event)
  // Signed out, is_admin() is not even callable (revoked from anon), so
  // an error here means the same thing as false.
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin')
  if (adminErr || !isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const doc = await loadInvoiceDoc(supabase, { id: body.invoiceId })
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })
  if (doc.invoice.status === 'void') throw createError({ statusCode: 400, statusMessage: 'This invoice is void' })
  if (kind === 'reminder' && doc.invoice.status !== 'sent') throw createError({ statusCode: 400, statusMessage: 'Reminders go out for sent, unpaid invoices' })
  if (!doc.lines.length) throw createError({ statusCode: 400, statusMessage: 'Add at least one line before sending' })

  const admin = serverSupabaseServiceRole<Database>(event)
  const [{ data: key }, { data: fromSecret }] = await Promise.all([
    admin.rpc('vault_secret', { p_name: 'resend_api_key' }),
    admin.rpc('vault_secret', { p_name: 'resend_from' }),
  ])
  if (!key) throw createError({ statusCode: 500, statusMessage: 'resend_api_key is not in Vault' })
  const from = fromSecret ?? 'Docket <onboarding@resend.dev>'

  const link = `${getRequestURL(event).origin}/i/${doc.invoice.public_token}`
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const longDate = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const company = doc.settings.company_name
  const subject = kind === 'reminder'
    ? `Reminder: invoice ${doc.invoice.number} from ${company} is past due`
    : `Invoice ${doc.invoice.number} from ${company}`
  const intro = (body.message ?? '').trim() || (kind === 'reminder'
    ? `Invoice ${doc.invoice.number} was due on ${longDate(doc.invoice.due_date)} and ${money(doc.invoice.due_amount)} is still outstanding.`
    : `Here is invoice ${doc.invoice.number}${doc.invoice.subject ? ` for ${doc.invoice.subject}` : ''}.`)
  const summary = [
    `Invoice ${doc.invoice.number}`,
    `Amount due: ${money(doc.invoice.due_amount)}`,
    `Due ${longDate(doc.invoice.due_date)}`,
  ].join('\n')
  const text = [intro, summary, `View or download it here: ${link}`, doc.settings.payment_instructions ?? '', `Thank you,\n${company}`]
    .filter(Boolean).join('\n\n')
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const para = (s: string) => `<p style="margin:0 0 16px">${esc(s).replace(/\n/g, '<br>')}</p>`
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px">
${para(intro)}
<table style="border-collapse:collapse;margin:0 0 16px;font-size:15px">
<tr><td style="padding:2px 16px 2px 0;color:#555">Invoice</td><td style="padding:2px 0"><strong>${esc(doc.invoice.number)}</strong></td></tr>
<tr><td style="padding:2px 16px 2px 0;color:#555">Amount due</td><td style="padding:2px 0"><strong>${money(doc.invoice.due_amount)}</strong></td></tr>
<tr><td style="padding:2px 16px 2px 0;color:#555">Due</td><td style="padding:2px 0">${longDate(doc.invoice.due_date)}</td></tr>
</table>
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">View invoice</a></p>
${doc.settings.payment_instructions ? para(doc.settings.payment_instructions) : ''}
${para(`Thank you,\n${company}`)}
</div>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to, subject, text, html,
      ...(doc.settings.company_email ? { reply_to: doc.settings.company_email } : {}),
    }),
  })
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300)
    throw createError({ statusCode: 502, statusMessage: `Resend ${res.status}: ${detail}` })
  }
  const { id } = await res.json() as { id: string }

  const now = new Date().toISOString()
  const { data: current } = await supabase.from('invoices').select('status, sent_at, sent_to').eq('id', doc.invoice.id).single()
  const sentTo = [...new Set([...(current?.sent_to ?? []), ...to])]
  const patch = kind === 'reminder'
    ? { last_reminded_at: now, sent_to: sentTo, updated_at: now }
    : { status: current?.status === 'draft' ? 'sent' as const : current?.status, sent_at: current?.sent_at ?? now, sent_to: sentTo, updated_at: now }
  const { error: updErr } = await supabase.from('invoices').update(patch).eq('id', doc.invoice.id)
  if (updErr) throw createError({ statusCode: 500, statusMessage: `Sent, but could not update the invoice: ${updErr.message}` })

  return { id, to, subject }
})
