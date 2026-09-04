import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'
import { sendEmail, appOrigin } from '~~/server/utils/notify'

// Morning brief, weekday mornings from the Vercel cron: for each active
// team member, gather their own facts with the service role, have the
// model write a short note, store it for Home, and email it to anyone
// who turned that on. ?user=<id> limits the run to one person and
// ?dry=1 writes nothing and emails nobody (returns the previews).
export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig()
  requireCron(event)
  const q = getQuery(event)
  const dry = q.dry === '1'
  const admin = serverSupabaseServiceRole<Database>(event)
  const t = today()
  const dayStart = chicagoMidnight(t)
  const dayEnd = chicagoMidnight(addDays(t, 1))
  const monday = weekStart(t)
  const lastMonday = addDays(monday, -7)
  const yesterday = addDays(t, t === monday ? -3 : -1)

  let people = admin.from('profiles').select('id, full_name, email, role, brief_email, department_id').eq('is_active', true).neq('role', 'client')
  if (typeof q.user === 'string') people = people.eq('id', q.user)
  const { data: team } = await people
  const [{ data: statuses }, { data: budgets }, { data: projects }, { data: depts }, { data: approveRoles }, { data: approveOverrides }] = await Promise.all([
    admin.from('work_statuses').select('key, label, is_done, is_paused'),
    admin.rpc('project_budgets'),
    admin.from('projects').select('id, name, lead_id, budget_hours, budget_amount, client_id, clients(name)').eq('is_active', true),
    admin.from('departments').select('id, name, lead_id').eq('is_active', true),
    admin.from('permissions').select('role').eq('key', 'approve_time'),
    admin.from('permission_overrides').select('user_id, allowed').eq('key', 'approve_time'),
  ])
  // Who reviews everyone's time: the approve_time permission, override
  // first, then the role; admins always. Department leads review their own.
  const approveByRole = new Set((approveRoles ?? []).map(r => r.role))
  const approveOverride = new Map((approveOverrides ?? []).map(o => [o.user_id, o.allowed]))
  const done = new Set((statuses ?? []).filter(s => s.is_done || s.is_paused).map(s => s.key))
  const label = (k: string) => statuses?.find(s => s.key === k)?.label ?? k
  const origin = await appOrigin(admin, `${getRequestProtocol(event)}://${getRequestHost(event)}`)
  const out: { user: string, text: string, emailed: boolean }[] = []

  for (const p of team ?? []) {
    const first = p.full_name.split(' ')[0] ?? p.full_name
    const [{ data: mine }, { data: busy }, { data: wk }, { data: yd }, { data: avail }, { data: drafts }, { data: waiting }, { data: quotes }, { data: unowned }] = await Promise.all([
      admin.from('work_items').select('id, title, status, due_on, assignee_id, project_id, projects(name, client_id, clients(name)), work_item_assignees!inner(user_id)').eq('work_item_assignees.user_id', p.id).not('due_on', 'is', null).lte('due_on', addDays(t, 2)).order('due_on'),
      admin.from('calendar_busy').select('starts_at, ends_at, hours').eq('user_id', p.id).gte('starts_at', dayStart.toISOString()).lt('starts_at', dayEnd.toISOString()).order('starts_at'),
      admin.rpc('report_rollup', { p_from: monday, p_to: t, p_person: p.full_name }).single(),
      admin.rpc('report_rollup', { p_from: yesterday, p_to: yesterday, p_person: p.full_name }).single(),
      admin.from('availability').select('hours_per_week').eq('user_id', p.id).is('effective_to', null).maybeSingle(),
      admin.from('time_entries').select('id').eq('user_id', p.id).eq('status', 'draft').gte('spent_on', lastMonday).lt('spent_on', monday).is('deleted_at', null),
      // Weeks waiting on this person: their department's people, or everyone for approve_time holders.
      admin.from('time_entries').select('user_id, profiles!time_entries_user_id_fkey(full_name, department_id)').eq('status', 'submitted').is('deleted_at', null),
      admin.from('quotes').select('id, number, title, valid_until, clients(name)').eq('created_by', p.id).eq('status', 'sent'),
      // Tasks this person is on that nobody is up on, overdue or due within a week.
      admin.from('work_items').select('id, status, work_item_assignees!inner(user_id)').eq('work_item_assignees.user_id', p.id).is('assignee_id', null).is('deleted_at', null).not('due_on', 'is', null).lte('due_on', addDays(t, 7)),
    ])
    // Up now: the lists are what this person is up on; the rest is a count.
    const open = (mine ?? []).filter(w => !done.has(w.status) && w.assignee_id === p.id)
    const nobodyUp = (unowned ?? []).filter(w => !done.has(w.status)).length
    const overdue = open.filter(w => w.due_on! < t)
    const dueToday = open.filter(w => w.due_on === t)
    const dueSoon = open.filter(w => w.due_on! > t)
    const leads = (depts ?? []).filter(d => d.lead_id === p.id).map(d => d.id)
    const canApproveAll = p.role === 'admin' || (approveOverride.get(p.id) ?? approveByRole.has(p.role))
    const toReview = (waiting ?? []).filter(e => e.user_id !== p.id && (canApproveAll || leads.includes(e.profiles?.department_id ?? '')))
    const reviewPeople = [...new Set(toReview.map(e => e.profiles?.full_name).filter(Boolean))]
    const led = (projects ?? []).filter(pr => pr.lead_id === p.id).map(pr => {
      const b = budgets?.find(x => x.project_id === pr.id)
      const pct = pr.budget_hours && b ? b.hours_used / pr.budget_hours * 100 : pr.budget_amount && b ? b.amount_used / pr.budget_amount * 100 : null
      return { name: pr.name, id: pr.id, client: pr.clients?.name, clientId: pr.client_id, pct: pct == null ? null : Math.round(pct) }
    }).filter(x => x.pct != null && x.pct >= 80)
    const target = avail?.hours_per_week ?? 30
    const facts = {
      today: t, name: first,
      overdue: overdue.map(w => ({ title: w.title, id: w.id, due: w.due_on, project: w.projects?.name, projectId: w.project_id, client: w.projects?.clients?.name, clientId: w.projects?.client_id, status: label(w.status) })),
      dueToday: dueToday.map(w => ({ title: w.title, id: w.id, project: w.projects?.name, projectId: w.project_id, client: w.projects?.clients?.name, clientId: w.projects?.client_id })),
      dueSoon: dueSoon.map(w => ({ title: w.title, id: w.id, due: w.due_on, project: w.projects?.name, projectId: w.project_id })),
      meetingsToday: (busy ?? []).map(b => ({ from: clock(b.starts_at), to: clock(b.ends_at) })),
      meetingHours: (busy ?? []).reduce((s, b) => s + Number(b.hours), 0),
      hoursYesterday: Number(yd?.hours ?? 0), yesterday,
      hoursThisWeek: Number(wk?.hours ?? 0), weeklyTarget: target,
      lastWeekUnsubmittedEntries: drafts?.length ?? 0,
      weeksToReview: reviewPeople,
      quotesAwaitingReply: (quotes ?? []).map(qq => ({ number: qq.number, id: qq.id, title: qq.title, client: qq.clients?.name, validUntil: qq.valid_until })),
      projectsLedPast80: led,
      nobodyUp,
    }
    let text = ''
    if (cfg.anthropicApiKey) {
      try {
        const reply = await callModel(MODELS.fast,
            `You write a short morning note to one person at Gigantic Design Co., a design studio, from the facts given. Address them by first name once. Plain text, two or three short paragraphs, no headings, no bullet points, no em dashes, under 140 words. Lead with what needs attention today: overdue tasks (give the due date as a day like April 30, never as digits), tasks due today, weeks waiting for their approval, last week's unsubmitted time entries (a count of entries, not hours), quotes waiting on a client. Then today's meetings and how the week's hours stand against the target, in one line, hours written like 26.5. Skip anything with nothing in it. No pep talk or sign-off. If nothing needs attention, say so in one plain sentence. If nobodyUp is above zero, end with one short clause using those words, like: and 4 tasks you are on have nobody up. Say nobody up, not unassigned. Do not invent facts, names, or numbers. Whenever you name a task, project, client, or quote from the facts, write it as a link using the ids given, in exactly this form and no other: [task title](/tasks/ID), [project name](/projects/ID), [client name](/clients/ID), [Q number](/quotes/ID). Link each one the first time it appears.`,
            [{ role: 'user', content: JSON.stringify(facts) }], undefined, 500)
        text = reply.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
      } catch { text = '' }
    }
    if (!text) text = plainBrief(facts)
    let emailed = false
    if (!dry) {
      await admin.from('morning_briefs').upsert({ user_id: p.id, day: t, text, facts })
      if (p.brief_email) {
        const plain = text.replace(/\[([^\]]+)\]\((\/[^)]+)\)/g, (_m, name: string, path: string) => `${name} (${origin}${path})`)
        const r = await sendEmail(admin, { to: [p.email], subject: `Your morning brief, ${longDay(t)}`, text: `${plain}\n\n${origin}/\n\nTurn this email off on your Account page in Docket.` })
        emailed = r.ok
        if (emailed) await admin.from('morning_briefs').update({ emailed_at: new Date().toISOString() }).eq('user_id', p.id).eq('day', t)
      }
      await admin.from('ai_events').insert({ user_id: p.id, job: 'brief', model: cfg.anthropicApiKey ? MODELS.fast : 'none', response: text })
    }
    out.push({ user: p.full_name, text, emailed })
  }
  return { day: t, briefs: out.length, emailed: out.filter(o => o.emailed).length, ...(dry ? { previews: out } : {}) }
})

// Without a model key, the facts still make a usable note.
function plainBrief(f: { name: string, overdue: { title: string, id: string }[], dueToday: { title: string, id: string }[], weeksToReview: string[], lastWeekUnsubmittedEntries: number, quotesAwaitingReply: { number: string }[], meetingsToday: { from: string, to: string }[], hoursThisWeek: number, weeklyTarget: number, nobodyUp: number }) {
  const parts: string[] = []
  const link = (w: { title: string, id: string }) => `[${w.title}](/tasks/${w.id})`
  if (f.overdue.length) parts.push(`${f.overdue.length} overdue: ${f.overdue.map(link).slice(0, 4).join(', ')}.`)
  if (f.dueToday.length) parts.push(`Due today: ${f.dueToday.map(link).join(', ')}.`)
  if (f.weeksToReview.length) parts.push(`Weeks waiting for your approval from ${f.weeksToReview.join(', ')}.`)
  if (f.lastWeekUnsubmittedEntries) parts.push(`Last week has ${f.lastWeekUnsubmittedEntries} unsubmitted ${f.lastWeekUnsubmittedEntries === 1 ? 'entry' : 'entries'}.`)
  if (f.quotesAwaitingReply.length) parts.push(`${f.quotesAwaitingReply.length} ${f.quotesAwaitingReply.length === 1 ? 'quote is' : 'quotes are'} out with clients.`)
  const head = parts.length ? parts.join(' ') : `Nothing overdue and nothing waiting on you, ${f.name}.`
  const meetings = f.meetingsToday.length ? `${f.meetingsToday.length} ${f.meetingsToday.length === 1 ? 'meeting' : 'meetings'} today (${f.meetingsToday.map(m => m.from).join(', ')}). ` : ''
  const unowned = f.nobodyUp ? ` ${f.nobodyUp} ${f.nobodyUp === 1 ? 'task' : 'tasks'} you are on ${f.nobodyUp === 1 ? 'has' : 'have'} nobody up.` : ''
  return `${head}\n\n${meetings}This week: ${hm(f.hoursThisWeek)} of ${hm(f.weeklyTarget)}.${unowned}`
}
const hm = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })
const longDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
function addDays(d: string, n: number) { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
// Midnight in Chicago on a given day, as an instant, whatever the offset is that day.
function chicagoMidnight(d: string): Date {
  const guess = new Date(`${d}T06:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(guess)
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0) % 24
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return new Date(guess.getTime() - (hour * 60 + minute) * 60_000)
}
function weekStart(d: string) { const x = new Date(`${d}T12:00:00Z`); const dow = (x.getUTCDay() + 6) % 7; return addDays(d, -dow) }
