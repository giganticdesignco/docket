import type { H3Event } from 'h3'
import { createClient } from '@supabase/supabase-js'
import { serverSupabaseServiceRole } from '#supabase/server'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { Database } from '~~/shared/types/database'
import { type Caller, type Tool, docketTools, today } from './ai'

// Docket as an MCP server. Claude (Claude Code, the Claude app,
// claude.ai) signs in through Supabase's OAuth 2.1 server as a team
// member and calls /api/mcp with that access token. Every tool runs
// through a Supabase client carrying the token, so RLS decides what the
// caller sees and may change, the same as in the app. Read tools are
// the assistant's; the write tools here log time, run the timer, make
// and update tasks, and comment. Nothing deletes.

export async function bearerCaller(event: H3Event): Promise<Caller | null> {
  const auth = getHeader(event, 'authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null
  const cfg = useRuntimeConfig().public.supabase as { url: string, key: string }
  const supabase = createClient<Database>(cfg.url, cfg.key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).single()
  if (!profile || profile.role === 'client') return null
  return { userId: user.id, name: profile.full_name, role: profile.role, supabase, admin: serverSupabaseServiceRole<Database>(event) }
}

const str = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : String(v))
const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v))
const round2 = (n: number) => Math.round(n * 100) / 100

export function writeTools(c: Caller, origin: string): Tool[] {
  const sb = c.supabase
  const taskUrl = (id: string) => `${origin}/tasks/${id}`
  return [
    {
      name: 'list_projects',
      description: 'Active projects with their client and id. Optional q filters by project or client name. Use the id with log_time, start_timer, and create_task.',
      input_schema: { type: 'object', properties: { q: { type: 'string' } } },
      run: async (i) => {
        // The match runs in the database: by project name, or by the client's
        // name (PostgREST cannot OR across the embedded table, so two queries).
        const q = str(i.q)?.replace(/[%,()]/g, '')
        const base = () => sb.from('projects').select('id, name, code, is_active, clients(name)').eq('is_active', true).order('name').limit(50)
        let rows = (await (q ? base().ilike('name', `%${q}%`) : base())).data ?? []
        if (q && rows.length < 50) {
          const { data: byClient } = await sb.from('clients').select('id').ilike('name', `%${q}%`).limit(20)
          if (byClient?.length) {
            const seen = new Set(rows.map(r => r.id))
            const { data: more } = await base().in('client_id', byClient.map(c => c.id))
            rows = [...rows, ...(more ?? []).filter(r => !seen.has(r.id))].slice(0, 50)
          }
        }
        return rows.map(p => ({ id: p.id, project: p.name, client: p.clients?.name, code: p.code }))
      },
    },
    {
      name: 'project_task_types',
      description: 'The task types (Design, Development, Meeting, and so on) a project accepts time against, with their ids. A time entry needs one.',
      input_schema: { type: 'object', properties: { project_id: { type: 'string' } }, required: ['project_id'] },
      run: async (i) => (await sb.from('project_tasks').select('task_id, tasks(name)').eq('project_id', String(i.project_id))).data?.map(r => ({ task_id: r.task_id, name: r.tasks?.name })),
    },
    {
      name: 'list_clients',
      description: 'Clients with ids. Optional q filters by name. Use the id with create_project.',
      input_schema: { type: 'object', properties: { q: { type: 'string' } } },
      run: async (i) => {
        const q = str(i.q)
        let query = sb.from('clients').select('id, name, is_active').order('name').limit(50)
        if (q) query = query.ilike('name', `%${q.replace(/[%,()]/g, '')}%`)
        const { data } = await query
        return (data ?? []).map(c => ({ id: c.id, name: c.name, is_active: c.is_active }))
      },
    },
    {
      name: 'create_client',
      description: 'Make a new client. Check list_clients first so an existing one is not made twice. Needs the manage reference data permission.',
      input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      run: async (i) => {
        const name = String(i.name).trim()
        if (!name) throw new Error('A client needs a name')
        const { data, error } = await sb.from('clients').insert({ name }).select('id, name').single()
        if (error) throw new Error(error.code === '42501' ? 'You cannot add clients' : error.message)
        return { ...data, url: `${origin}/clients/${data.id}` }
      },
    },
    {
      name: 'create_project',
      description: 'Make a project for a client (client_id from list_clients). Optional billing_method (hourly, fixed, retainer, non_billable; default hourly), hourly_rate, budget_hours, budget_amount, code. Needs the manage reference data permission.',
      input_schema: { type: 'object', properties: { client_id: { type: 'string' }, name: { type: 'string' }, billing_method: { type: 'string', enum: ['hourly', 'fixed', 'retainer', 'non_billable'] }, hourly_rate: { type: 'number' }, budget_hours: { type: 'number' }, budget_amount: { type: 'number' }, code: { type: 'string' } }, required: ['client_id', 'name'] },
      run: async (i) => {
        const name = String(i.name).trim()
        if (!name) throw new Error('A project needs a name')
        const values: Record<string, unknown> = { client_id: String(i.client_id), name, billing_method: str(i.billing_method) ?? 'hourly', hourly_rate: num(i.hourly_rate) ?? null, budget_hours: num(i.budget_hours) ?? null, budget_amount: num(i.budget_amount) ?? null, code: str(i.code) ?? null }
        const { data, error } = await sb.from('projects').insert(values as never).select('id, name').single()
        if (error) throw new Error(error.code === '42501' ? 'You cannot add projects' : error.message)
        return { ...data, url: `${origin}/projects/${data.id}` }
      },
    },
    {
      name: 'similar_projects',
      description: 'Completed projects whose names share words with the one given (Docket and Harvest years), with hours, amount, and when they ran. A baseline for quoting or budgeting new work: compare a few, then suggest hours.',
      input_schema: { type: 'object', properties: { name: { type: 'string', description: 'The new project or job, e.g. "Website redesign" or "Trade show banners"' } }, required: ['name'] },
      run: async (i) => {
        const words = String(i.name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 1 && !['and', 'the', 'of', 'for', 'new', 'project'].includes(w))
        if (!words.length) return []
        const { data } = await sb.rpc('project_history', { p_words: words })
        return (data ?? []).map(r => ({ ...r, shared: words.filter(w => r.name.toLowerCase().includes(w)).length })).sort((a, b) => b.shared - a.shared || (b.last_on ?? '').localeCompare(a.last_on ?? '')).slice(0, 25)
      },
    },
    {
      name: 'people',
      description: 'Active team members with ids, for assigning tasks.',
      input_schema: { type: 'object', properties: {} },
      run: async () => (await sb.from('profiles').select('id, full_name, role').eq('is_active', true).neq('role', 'client').order('full_name')).data,
    },
    {
      name: 'log_time',
      description: 'Log hours for the caller. Needs project_id and task_id (see list_projects and project_task_types). date defaults to today in America/Chicago.',
      input_schema: { type: 'object', properties: { project_id: { type: 'string' }, task_id: { type: 'string' }, hours: { type: 'number' }, date: { type: 'string', description: 'YYYY-MM-DD' }, notes: { type: 'string' } }, required: ['project_id', 'task_id', 'hours'] },
      run: async (i) => {
        const hours = num(i.hours)
        if (!hours || hours <= 0 || hours > 24) throw new Error('hours must be between 0 and 24')
        const { data, error } = await sb.from('time_entries').insert({ user_id: c.userId, project_id: String(i.project_id), task_id: String(i.task_id), spent_on: str(i.date) ?? today(), hours: round2(hours), notes: str(i.notes) ?? null }).select('id, spent_on, hours, notes').single()
        if (error) throw new Error(error.message)
        return data
      },
    },
    {
      name: 'start_timer',
      description: 'Start the caller\'s timer on a project and task type. Only one timer runs per person; stop the running one first.',
      input_schema: { type: 'object', properties: { project_id: { type: 'string' }, task_id: { type: 'string' }, notes: { type: 'string' } }, required: ['project_id', 'task_id'] },
      run: async (i) => {
        const { data, error } = await sb.from('time_entries').insert({ user_id: c.userId, project_id: String(i.project_id), task_id: String(i.task_id), spent_on: today(), hours: 0, notes: str(i.notes) ?? null, started_at: new Date().toISOString(), ended_at: null }).select('id, started_at').single()
        if (error) throw new Error(error.code === '23505' ? 'A timer is already running. Stop it first.' : error.message)
        return data
      },
    },
    {
      name: 'running_timer',
      description: 'The caller\'s running timer, if any: entry id, project, task type, minutes so far.',
      input_schema: { type: 'object', properties: {} },
      run: async () => {
        const { data } = await sb.from('time_entries').select('id, hours, started_at, notes, projects(name, clients(name)), tasks(name)').eq('user_id', c.userId).not('started_at', 'is', null).is('ended_at', null).maybeSingle()
        if (!data) return null
        const minutes = Math.round(data.hours * 60 + (Date.now() - new Date(data.started_at!).getTime()) / 60000)
        return { id: data.id, project: data.projects?.name, client: data.projects?.clients?.name, task: data.tasks?.name, notes: data.notes, minutes }
      },
    },
    {
      name: 'stop_timer',
      description: 'Stop the caller\'s running timer and fold the elapsed time into its hours.',
      input_schema: { type: 'object', properties: { notes: { type: 'string', description: 'Replace the notes while stopping' } } },
      run: async (i) => {
        const { data: e } = await sb.from('time_entries').select('id, hours, started_at').eq('user_id', c.userId).not('started_at', 'is', null).is('ended_at', null).maybeSingle()
        if (!e) return { stopped: false, reason: 'No timer is running.' }
        const end = new Date()
        const hours = round2(e.hours + (end.getTime() - new Date(e.started_at!).getTime()) / 3_600_000)
        const { data, error } = await sb.from('time_entries').update({ hours, ended_at: end.toISOString(), ...(str(i.notes) ? { notes: String(i.notes) } : {}) }).eq('id', e.id).select('id, hours, notes, spent_on').single()
        if (error) throw new Error(error.message)
        return { stopped: true, ...data }
      },
    },
    {
      name: 'update_time_entry',
      description: 'Change hours, notes, date, project, or task type on one of the caller\'s time entries. Entries claimed by an invoice cannot change.',
      input_schema: { type: 'object', properties: { id: { type: 'string' }, hours: { type: 'number' }, notes: { type: 'string' }, date: { type: 'string' }, project_id: { type: 'string' }, task_id: { type: 'string' } }, required: ['id'] },
      run: async (i) => {
        const patch: Record<string, unknown> = {}
        if (num(i.hours) !== undefined) patch.hours = round2(num(i.hours)!)
        if (i.notes !== undefined) patch.notes = str(i.notes) ?? null
        if (str(i.date)) patch.spent_on = String(i.date)
        if (str(i.project_id)) patch.project_id = String(i.project_id)
        if (str(i.task_id)) patch.task_id = String(i.task_id)
        const { data, error } = await sb.from('time_entries').update(patch as never).eq('id', String(i.id)).select('id, spent_on, hours, notes').maybeSingle()
        if (error) throw new Error(error.message)
        return data ?? { error: 'No entry with that id that you can change.' }
      },
    },
    {
      name: 'my_week',
      description: 'The caller\'s time entries for a week (Monday to Sunday), with project, task type, hours, and notes, plus the total. date picks the week; defaults to this week.',
      input_schema: { type: 'object', properties: { date: { type: 'string', description: 'Any day in the week, YYYY-MM-DD' } } },
      run: async (i) => {
        const d = new Date(`${str(i.date) ?? today()}T12:00:00Z`)
        const day = (d.getUTCDay() + 6) % 7
        const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - day)
        const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)
        const iso = (x: Date) => x.toISOString().slice(0, 10)
        const { data } = await sb.from('time_detail').select('id, spent_on, hours, is_billable, notes, client_name, project_name, task_name').eq('user_id', c.userId).gte('spent_on', iso(mon)).lte('spent_on', iso(sun)).order('spent_on')
        const rows = data ?? []
        return { from: iso(mon), to: iso(sun), total_hours: round2(rows.reduce((s, r) => s + (r.hours ?? 0), 0)), entries: rows }
      },
    },
    {
      name: 'create_task',
      description: 'Make a task on a project. Optional status key, priority (low, normal, high, urgent), dates, estimate, assignee_ids for everyone on it (see people), and assignee_id for the one person up on it now. assign_me puts the caller on it and up on it. Returns the id and link.',
      input_schema: { type: 'object', properties: { project_id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, status: { type: 'string' }, priority: { type: 'string' }, start_on: { type: 'string' }, due_on: { type: 'string' }, estimate_hours: { type: 'number' }, assignee_ids: { type: 'array', items: { type: 'string' } }, assignee_id: { type: 'string' }, assign_me: { type: 'boolean' } }, required: ['project_id', 'title'] },
      run: async (i) => {
        const values: Record<string, unknown> = { project_id: String(i.project_id), title: String(i.title).trim(), created_by: c.userId, description: str(i.description) ?? null, start_on: str(i.start_on) ?? null, due_on: str(i.due_on) ?? null, estimate_hours: num(i.estimate_hours) ?? null }
        if (str(i.status)) values.status = String(i.status)
        if (str(i.priority)) values.priority = String(i.priority)
        if (str(i.assignee_id)) values.assignee_id = String(i.assignee_id)
        if (i.assign_me) values.assignee_id = c.userId
        const { data, error } = await sb.from('work_items').insert(values as never).select('id').single()
        if (error) throw new Error(error.message)
        const ids = new Set<string>(Array.isArray(i.assignee_ids) ? i.assignee_ids.map(String) : [])
        if (i.assign_me) ids.add(c.userId)
        // Upsert: the owner trigger has already put whoever is up on the task.
        if (ids.size) {
          const { error: ae } = await sb.from('work_item_assignees').upsert([...ids].map(user_id => ({ work_item_id: data.id, user_id })), { onConflict: 'work_item_id,user_id', ignoreDuplicates: true })
          if (ae) throw new Error(ae.message)
        }
        return { id: data.id, url: taskUrl(data.id) }
      },
    },
    {
      name: 'update_task',
      description: 'Change a task\'s title, description, status key, priority, dates, or estimate. Add or remove people on it with add_assignee_ids and remove_assignee_ids. assignee_id hands the task to that person (they are put on it if they were not); the string "nobody" leaves nobody up.',
      input_schema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, status: { type: 'string' }, priority: { type: 'string' }, start_on: { type: 'string' }, due_on: { type: 'string' }, estimate_hours: { type: 'number' }, add_assignee_ids: { type: 'array', items: { type: 'string' } }, remove_assignee_ids: { type: 'array', items: { type: 'string' } }, assignee_id: { type: 'string' } }, required: ['id'] },
      run: async (i) => {
        const id = String(i.id)
        const patch: Record<string, unknown> = {}
        for (const k of ['title', 'description', 'status', 'priority', 'start_on', 'due_on'] as const) if (i[k] !== undefined) patch[k] = str(i[k]) ?? null
        if (i.estimate_hours !== undefined) patch.estimate_hours = num(i.estimate_hours) ?? null
        if (Object.keys(patch).length) {
          const { error } = await sb.from('work_items').update(patch as never).eq('id', id)
          if (error) throw new Error(error.message)
        }
        const add = Array.isArray(i.add_assignee_ids) ? i.add_assignee_ids.map(String) : []
        const drop = Array.isArray(i.remove_assignee_ids) ? i.remove_assignee_ids.map(String) : []
        if (drop.length) {
          const { error } = await sb.from('work_item_assignees').delete().eq('work_item_id', id).in('user_id', drop)
          if (error) throw new Error(error.message)
        }
        if (add.length) {
          const { error } = await sb.from('work_item_assignees').upsert(add.map(user_id => ({ work_item_id: id, user_id })), { onConflict: 'work_item_id,user_id', ignoreDuplicates: true })
          if (error) throw new Error(error.message)
        }
        // Who is up goes through hand_off, so the receiver gets the turn bell.
        let handed: string | null | undefined
        if (str(i.assignee_id)) {
          const to = String(i.assignee_id).toLowerCase() === 'nobody' ? null : String(i.assignee_id)
          const { error } = await sb.rpc('hand_off', { p_item: id, p_to: to ?? undefined })
          if (error) throw new Error(error.message)
          handed = to
        }
        return { id, url: taskUrl(id), changed: Object.keys(patch), added: add, removed: drop, ...(handed !== undefined ? { up_now: handed ?? 'nobody' } : {}) }
      },
    },
    {
      name: 'how_docket_works',
      description: 'Look up how Docket itself works in the user guide: what a screen does, what a word means (batch, retainer, Up now, focus list), what a rule is. Use this for any "what is" or "how does" question about the app, before answering from memory. Returns the best matching guide sections with a link to /help.',
      input_schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
      run: async (i) => {
        const hits = await searchGuide(String(i.question ?? ''))
        return hits.length ? hits.map(h => ({ section: h.title, url: `${origin}${h.path}`, text: h.text })) : { none: 'Nothing in the guide matches. Say so, and point at /help.' }
      },
    },
    {
      name: 'list_feedback',
      description: 'Bugs, changes and ideas the team reported from inside Docket (kind bug: it does something wrong; change: it works, make it different; idea: something new), each with the page it came from, the element picked (a CSS path and its text) or the area drawn, and who sent it. Status "approved" by default: the ones Luke said to do, which is the work list. "open" is waiting for his triage, "hold" is parked, "done" is done, "all" is everything.',
      input_schema: { type: 'object', properties: { status: { type: 'string', enum: ['open', 'approved', 'hold', 'done', 'all'] }, limit: { type: 'number' } } },
      run: async (i) => {
        let q = sb.from('feedback').select('id, kind, body, plain, path, page_title, selector, element_text, rect, viewport, status, created_at, done_at, by:profiles!feedback_created_by_fkey(full_name)').order('created_at', { ascending: false }).limit(Math.min(num(i.limit) ?? 100, 500))
        const status = str(i.status) ?? 'approved'
        if (status !== 'all') q = q.eq('status', status)
        const { data, error } = await q
        if (error) throw new Error(error.message)
        return (data ?? []).map(r => ({ ...r, by: r.by?.full_name, url: `${origin}${r.path}` }))
      },
    },
    {
      name: 'resolve_feedback',
      description: 'Set a feedback item\'s status: done once it is fixed or built, approved when Luke says do it, hold to park it (not now), open to bring it back. done: true/false still works. Only people who manage settings can.',
      input_schema: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string', enum: ['open', 'approved', 'hold', 'done'] }, done: { type: 'boolean' } }, required: ['id'] },
      run: async (i) => {
        const status = str(i.status) ?? (i.done === false ? 'open' : 'done')
        const { data, error } = await sb.from('feedback').update({ status }).eq('id', String(i.id)).select('id, status').maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) throw new Error('Not found, or not yours to close')
        return data
      },
    },
    {
      name: 'add_comment',
      description: 'Comment on a task as the caller. visible_to_client shows it on the client portal; default false.',
      input_schema: { type: 'object', properties: { task_id: { type: 'string' }, body: { type: 'string' }, visible_to_client: { type: 'boolean' } }, required: ['task_id', 'body'] },
      run: async (i) => {
        const { data, error } = await sb.from('work_item_comments').insert({ work_item_id: String(i.task_id), author_id: c.userId, body: String(i.body), visible_to_client: !!i.visible_to_client, mentions: [] }).select('id, created_at').single()
        if (error) throw new Error(error.message)
        return { ...data, url: taskUrl(String(i.task_id)) }
      },
    },
  ]
}

export function mcpTools(c: Caller, origin: string): Tool[] {
  return [...docketTools(c), ...writeTools(c, origin)]
}

// One server per request: Vercel functions keep no state between calls,
// so the transport runs stateless with JSON responses.
export async function handleMcp(event: H3Event, c: Caller): Promise<Response> {
  const tools = mcpTools(c, requestOrigin(event))
  const server = new Server({ name: 'docket', version: '1.0.0' }, { capabilities: { tools: {} }, instructions: `Docket is Gigantic Design Co.'s time, task, quote, and invoice app. You are acting as ${c.name}. Today is ${today()} in America/Chicago. Use list_projects and project_task_types before logging time. Money is US dollars.` })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.input_schema as { type: 'object', properties?: Record<string, unknown>, required?: string[] } })),
  }))
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find(t => t.name === req.params.name)
    if (!tool) return { content: [{ type: 'text', text: `No tool named ${req.params.name}` }], isError: true }
    try {
      const out = await tool.run((req.params.arguments ?? {}) as Record<string, unknown>)
      return { content: [{ type: 'text', text: JSON.stringify(out ?? null).slice(0, 60000) }] }
    } catch (e) {
      return { content: [{ type: 'text', text: (e as Error).message }], isError: true }
    }
  })
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  const res = await transport.handleRequest(toWebRequest(event))
  event.waitUntil?.(transport.close())
  return res
}
