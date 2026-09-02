import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Email a task's review link to the client. Any signed-in team member;
// the task is read through RLS, the Resend key through the service role.

type Body = { taskId?: string, to?: string[], message?: string, markClientReview?: boolean }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const to = [...new Set((body.to ?? []).map(s => s.trim()).filter(Boolean))]
  if (!body.taskId) throw createError({ statusCode: 400, statusMessage: 'taskId is required' })
  if (!to.length || to.length > 10 || to.some(e => !EMAIL.test(e))) {
    throw createError({ statusCode: 400, statusMessage: 'Give one to ten valid email addresses' })
  }

  const supabase = await serverSupabaseClient<Database>(event)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw createError({ statusCode: 403, statusMessage: 'Sign in first' })
  const { data: task, error } = await supabase
    .from('work_items')
    .select('id, title, public_token, status, shared_at, projects(name, clients(name))')
    .eq('id', body.taskId)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Task not found' })

  const admin = serverSupabaseServiceRole<Database>(event)
  const { data: settings } = await admin.from('invoice_settings').select('company_name, company_email').eq('id', true).single()
  const company = settings?.company_name ?? 'Gigantic Design Co.'
  const { data: me } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).single()

  const link = `${getRequestURL(event).origin}/r/${task.public_token}`
  const intro = (body.message ?? '').trim() || `${task.title} is ready for your review.`
  const subject = `For review: ${task.title}`
  const text = [intro, `Have a look, leave comments, and approve or request changes here:\n${link}`, `Thanks,\n${me?.full_name ?? company}\n${company}`].join('\n\n')
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px">
<p style="margin:0 0 16px">${escapeHtml(intro).replace(/\n/g, '<br>')}</p>
<p style="margin:0 0 8px">Have a look, leave comments, and approve or request changes:</p>
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Open ${escapeHtml(task.title)}</a></p>
<p style="margin:0">Thanks,<br>${escapeHtml(me?.full_name ?? company)}<br>${escapeHtml(company)}</p>
</div>`

  const sent = await sendEmail(admin, { to, subject, text, html, replyTo: me?.email ?? settings?.company_email ?? undefined })
  if (!sent.ok) throw createError({ statusCode: 502, statusMessage: sent.error })

  const { data: reviewStatus } = await supabase.from('work_statuses').select('key').eq('is_client_review', true).eq('is_active', true).order('position').limit(1).maybeSingle()
  const { error: updErr } = await supabase.from('work_items').update({
    shared_at: task.shared_at ?? new Date().toISOString(),
    ...(body.markClientReview && reviewStatus && task.status !== reviewStatus.key ? { status: reviewStatus.key } : {}),
  }).eq('id', task.id)
  if (updErr) throw createError({ statusCode: 500, statusMessage: `Sent, but could not update the task: ${updErr.message}` })

  return { to, link }
})
