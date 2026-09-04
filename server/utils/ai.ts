import type { SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// The assistant's plumbing. Every call goes through here: the key
// stays on the server, the model only sees data the caller can already
// see (tools run through the caller's own Supabase client, so RLS
// decides), and each call is written to ai_events with a daily cap.

export const MODELS = { smart: 'claude-sonnet-5', fast: 'claude-haiku-4-5-20251001' } as const
const DAILY_CAP = 200

export type Tool = { name: string, description: string, input_schema: Record<string, unknown>, run: (input: Record<string, unknown>) => Promise<unknown> }
type Content = { type: 'text', text: string } | { type: 'tool_use', id: string, name: string, input: Record<string, unknown> } | { type: 'tool_result', tool_use_id: string, content: string }
type Message = { role: 'user' | 'assistant', content: string | Content[] }
type Reply = { id: string, content: Content[], stop_reason: string, usage: { input_tokens: number, output_tokens: number } }

export type Caller = { userId: string, name: string, role: string, supabase: SupabaseClient<Database>, admin: SupabaseClient<Database> }

export async function caller(event: H3Event): Promise<Caller> {
  const supabase = await serverSupabaseClient<Database>(event)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw createError({ statusCode: 403, statusMessage: 'Sign in first' })
  const { data: profile } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).single()
  if (!profile || profile.role === 'client') throw createError({ statusCode: 403, statusMessage: 'The assistant is for the team' })
  const admin = serverSupabaseServiceRole<Database>(event)
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  const { count } = await admin.from('ai_events').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since.toISOString())
  if ((count ?? 0) >= DAILY_CAP) throw createError({ statusCode: 429, statusMessage: `That is ${DAILY_CAP} assistant calls today. It resets at midnight.` })
  return { userId: user.id, name: profile.full_name, role: profile.role, supabase, admin }
}

export async function callModel(model: string, system: string, messages: Message[], tools?: Tool[], maxTokens = 1500): Promise<Reply> {
  const key = useRuntimeConfig().anthropicApiKey
  if (!key) throw createError({ statusCode: 500, statusMessage: 'NUXT_ANTHROPIC_API_KEY is not set on the server' })
  return await $fetch<Reply>('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: {
      model, max_tokens: maxTokens, system, messages,
      ...(tools?.length ? { tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema })) } : {}),
    },
  })
}

// Run a conversation to completion, letting the model call tools up to
// a few times. Returns the final text and the token totals.
export async function converse(c: Caller, job: string, model: string, system: string, messages: Message[], tools: Tool[] = [], maxTokens = 1500) {
  const used: string[] = []  // tool names that ran, so the caller knows if anything changed
  let input = 0
  let output = 0
  const history: Message[] = [...messages]
  let text = ''
  for (let round = 0; round < 6; round++) {
    const reply = await callModel(model, system, history, tools, maxTokens)
    input += reply.usage.input_tokens
    output += reply.usage.output_tokens
    const uses = reply.content.filter((b): b is Extract<Content, { type: 'tool_use' }> => b.type === 'tool_use')
    text = reply.content.filter((b): b is Extract<Content, { type: 'text' }> => b.type === 'text').map(b => b.text).join('\n').trim()
    if (reply.stop_reason !== 'tool_use' || !uses.length) break
    history.push({ role: 'assistant', content: reply.content })
    const results: Content[] = []
    for (const u of uses) {
      const tool = tools.find(t => t.name === u.name)
      used.push(u.name)
      let out: unknown
      try { out = tool ? await tool.run(u.input) : { error: `No tool named ${u.name}` } } catch (e) { out = { error: (e as Error).message } }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out).slice(0, 20000) })
    }
    history.push({ role: 'user', content: results })
  }
  const last = messages[messages.length - 1]
  await c.admin.from('ai_events').insert({
    user_id: c.userId, job, model, input_tokens: input, output_tokens: output,
    prompt: typeof last?.content === 'string' ? last.content.slice(0, 4000) : JSON.stringify(last?.content).slice(0, 4000),
    response: text.slice(0, 8000),
  })
  return { text, input, output, used }
}

// Pull one JSON object out of a reply that may have prose around it.
export function jsonFrom(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

// The read-only tools. Each runs through the caller's client.
export function docketTools(c: Caller): Tool[] {
  const sb = c.supabase
  return [
    {
      name: 'search',
      description: 'Find tasks, projects, clients, quotes, and invoices by name or words. Returns kind, id, title, subtitle.',
      input_schema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
      run: async (i) => (await sb.rpc('search', { p_q: String(i.q), p_limit: 12 })).data,
    },
    {
      name: 'report_rollup',
      description: 'Totals for a date range: hours, billable hours, billable amount, uninvoiced amount, expenses. Optional filters by client name, project name, person name, task type.',
      input_schema: { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string' }, client: { type: 'string' }, project: { type: 'string' }, person: { type: 'string' }, task: { type: 'string' } }, required: ['from', 'to'] },
      run: async (i) => (await sb.rpc('report_rollup', { p_from: String(i.from), p_to: String(i.to), p_client: i.client ? String(i.client) : undefined, p_project: i.project ? String(i.project) : undefined, p_person: i.person ? String(i.person) : undefined, p_task: i.task ? String(i.task) : undefined }).single()).data,
    },
    {
      name: 'report_time',
      description: 'Time for a date range grouped by client, project, task, person, day, week, or month: hours, billable hours, billable amount, uninvoiced amount per group. Same optional filters as report_rollup.',
      input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, group: { type: 'string', enum: ['client', 'project', 'task', 'person', 'day', 'week', 'month'] }, client: { type: 'string' }, project: { type: 'string' }, person: { type: 'string' } }, required: ['from', 'to', 'group'] },
      run: async (i) => ((await sb.rpc('report_time', { p_from: String(i.from), p_to: String(i.to), p_group: String(i.group), p_client: i.client ? String(i.client) : undefined, p_project: i.project ? String(i.project) : undefined, p_person: i.person ? String(i.person) : undefined })).data ?? []).slice(0, 60),
    },
    {
      name: 'project_budgets',
      description: 'Every project with hours used, billable hours, amount used, and the project budget hours and amount. Use to answer which projects are over budget.',
      input_schema: { type: 'object', properties: {} },
      run: async () => {
        const [{ data: burn }, { data: projects }] = await Promise.all([sb.rpc('project_budgets'), sb.from('projects').select('id, name, budget_hours, budget_amount, is_active, clients(name)').eq('is_active', true)])
        return (projects ?? []).map(p => ({ project: p.name, client: p.clients?.name, budget_hours: p.budget_hours, budget_amount: p.budget_amount, ...(burn?.find(b => b.project_id === p.id) ?? {}) })).filter(p => p.budget_hours || p.budget_amount || (p as { hours_used?: number }).hours_used)
      },
    },
    {
      name: 'unbilled',
      description: 'Unbilled time and expenses per client: hours, amount, oldest and newest dates.',
      input_schema: { type: 'object', properties: {} },
      run: async () => (await sb.rpc('unbilled_summary')).data,
    },
    {
      name: 'get_task',
      description: 'A task with its description, status, dates, who is up on it now, everyone on it, and comments.',
      input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      run: async (i) => {
        const [{ data: t }, { data: comments }] = await Promise.all([
          sb.from('work_items').select('id, title, description, status, priority, start_on, due_on, estimate_hours, client_decision, assignee_id, up_now:profiles!work_items_assignee_id_fkey(full_name), projects(name, clients(name)), work_item_assignees(profiles(full_name))').eq('id', String(i.id)).maybeSingle(),
          sb.from('work_item_comments').select('body, author_name, visible_to_client, created_at, profiles!work_item_comments_author_id_fkey(full_name)').eq('work_item_id', String(i.id)).order('created_at').limit(40),
        ])
        return { task: t, comments }
      },
    },
    {
      name: 'my_tasks',
      description: 'Open tasks the person asking is up on right now, with due dates and projects. nobody_up counts the tasks they are on that nobody is up on.',
      input_schema: { type: 'object', properties: {} },
      run: async () => {
        const [{ data: statuses }, { data: mine }, { data: unowned }] = await Promise.all([
          sb.from('work_statuses').select('key, is_done, is_paused'),
          sb.from('work_items').select('id, title, status, due_on, priority, projects(name, clients(name))').eq('assignee_id', c.userId).order('due_on', { ascending: true, nullsFirst: false }).limit(80),
          sb.from('work_items').select('id, status, work_item_assignees!inner(user_id)').eq('work_item_assignees.user_id', c.userId).is('assignee_id', null),
        ])
        const closed = new Set((statuses ?? []).filter(s => s.is_done || s.is_paused).map(s => s.key))
        return { tasks: (mine ?? []).filter(w => !closed.has(w.status)).slice(0, 50), nobody_up: (unowned ?? []).filter(w => !closed.has(w.status)).length }
      },
    },
    {
      name: 'quote',
      description: 'A quote with its lines and sitemap.',
      input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      run: async (i) => {
        const [{ data: q }, { data: lines }] = await Promise.all([
          sb.from('quotes').select('id, number, title, status, intro, terms, subtotal, valid_until, clients(name)').eq('id', String(i.id)).maybeSingle(),
          sb.from('quote_line_items').select('description, hours, rate, amount, sort_order').eq('quote_id', String(i.id)).order('sort_order'),
        ])
        return { quote: q, lines }
      },
    },
  ]
}

export function baseSystem(c: Caller) {
  return `You are Docket's assistant for Gigantic Design Co., a small design and web agency in Iowa. Docket is their internal app for time, tasks, quotes, and invoices. You are talking to ${c.name} (${c.role}). Today is ${today()} in America/Chicago.
Be brief and concrete. Use the tools to look things up rather than guessing; if a tool returns nothing, say so. For how Docket itself works (what a batch or a retainer or Up now is, what a screen does, what a rule is), call how_docket_works and answer from the guide it returns, linking the section; never guess at how the app behaves. Money is US dollars; hours may be shown as h:mm. Never invent clients, projects, or numbers. When you answer with numbers, say which range and filter they cover. Do not use em dashes.
Write in light markdown: short paragraphs, bullets, bold for names. When you mention a task, project, client, quote, or invoice that has an id, link it as [its name](/tasks/<id>) (or /projects, /clients, /quotes, /invoices). Never show a bare path or a raw id.`
}
