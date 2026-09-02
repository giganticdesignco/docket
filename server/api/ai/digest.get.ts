import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Monday morning digest for admins, from the Vercel cron: the facts are
// gathered with the service role, the model turns them into a short
// note, Resend sends it. Nothing the model says is stored as fact.
export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig()
  const auth = getHeader(event, 'authorization') ?? ''
  if (!cfg.cronSecret || auth !== `Bearer ${cfg.cronSecret}`) throw createError({ statusCode: 401, statusMessage: 'Not for you' })
  if (!cfg.anthropicApiKey) return { sent: 0, reason: 'no key' }
  const admin = serverSupabaseServiceRole<Database>(event)
  const t = today()
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
  const [{ data: admins }, { data: rollup }, { data: unbilled }, { data: overdueInvoices }, { data: expiring }, { data: unassigned }, { data: budgets }, { data: projects }, { data: timers }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email').eq('role', 'admin').eq('is_active', true),
    admin.rpc('report_rollup', { p_from: weekAgo, p_to: t }).single(),
    admin.rpc('unbilled_summary'),
    admin.from('invoices').select('number, due_amount, due_date, clients(name)').eq('status', 'sent').lt('due_date', t),
    admin.from('quotes').select('number, title, valid_until, clients(name)').eq('status', 'sent').lte('valid_until', new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)),
    admin.from('work_items').select('title, due_on, projects(name)').not('due_on', 'is', null).lte('due_on', new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)).gte('due_on', t),
    admin.rpc('project_budgets'),
    admin.from('projects').select('id, name, budget_hours, budget_amount').eq('is_active', true),
    admin.from('time_entries').select('user_id, started_at, profiles(full_name)').is('ended_at', null).not('started_at', 'is', null),
  ])
  const over = (projects ?? []).map(p => ({ ...p, ...(budgets?.find(b => b.project_id === p.id) ?? {}) })).filter(p => (p.budget_hours && (p as { hours_used?: number }).hours_used! >= 0.8 * p.budget_hours) || (p.budget_amount && (p as { amount_used?: number }).amount_used! >= 0.8 * p.budget_amount))
  const facts = { week: { from: weekAgo, to: t, ...rollup }, unbilled, overdueInvoices, quotesExpiring: expiring, tasksDueThisWeek: unassigned, projectsPast80Percent: over, timersRunning: timers }
  const key = cfg.anthropicApiKey
  const reply = await $fetch<{ content: { type: string, text?: string }[] }>('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: {
      model: MODELS.smart, max_tokens: 900,
      system: `You write a Monday morning note for the owners of Gigantic Design Co. from the facts given. Plain text, short paragraphs, no headings, no em dashes, under 250 words. Lead with what needs a decision or action (overdue invoices, quotes about to expire, projects past 80 percent of budget), then last week's hours in one line, then unbilled work worth mentioning, then anything odd like timers left running. Name clients and amounts. Skip sections with nothing in them. Do not add facts.`,
      messages: [{ role: 'user', content: JSON.stringify(facts).slice(0, 30000) }],
    },
  })
  const text = reply.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
  const { data: fromRow } = await admin.rpc('vault_secret', { p_name: 'resend_from' })
  const { data: resendKey } = await admin.rpc('vault_secret', { p_name: 'resend_api_key' })
  let sent = 0
  if (resendKey && text) {
    for (const a of admins ?? []) {
      await $fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}` }, body: { from: fromRow ?? 'Docket <onboarding@resend.dev>', to: [a.email], subject: `Docket this week, ${t}`, text: `Hi ${a.full_name.split(' ')[0]},\n\n${text}\n\nDocket` } }).catch(() => null)
      sent += 1
      await admin.from('ai_events').insert({ user_id: a.id, job: 'digest', model: MODELS.smart, response: text })
    }
  }
  return { sent, preview: text }
})
