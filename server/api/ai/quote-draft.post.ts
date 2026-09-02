// From a short brief, propose scope lines for a quote with hours
// grounded in similar past projects (hours by task type on projects of
// the same client). Returns lines; the quote page inserts them.
type Body = { quoteId?: string, brief?: string }

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event).catch((): Body => ({}))
  if (!body.quoteId || !(body.brief ?? '').trim()) throw createError({ statusCode: 400, statusMessage: 'A quote and a brief are needed' })
  const c = await caller(event)
  const { data: quote } = await c.supabase.from('quotes').select('id, title, client_id, clients(name)').eq('id', body.quoteId).maybeSingle()
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'Quote not found' })
  const from = new Date(); from.setFullYear(from.getFullYear() - 3)
  const [{ data: byTask }, { data: taskTypes }, { data: rates }] = await Promise.all([
    c.supabase.rpc('report_time', { p_from: from.toISOString().slice(0, 10), p_to: today(), p_group: 'task', p_client: quote.clients?.name ?? undefined }),
    c.supabase.from('tasks').select('id, name').eq('is_active', true).order('name'),
    c.supabase.rpc('report_time', { p_from: from.toISOString().slice(0, 10), p_to: today(), p_group: 'project', p_client: quote.clients?.name ?? undefined }),
  ])
  const system = `${baseSystem(c)}
Propose the scope lines for quote "${quote.title}" for ${quote.clients?.name}. Reply with only JSON: {"lines": [{"description": string, "task_id": string|null, "hours": number, "rate": number}], "notes": string}.
Use 4 to 10 lines, each a deliverable in plain words a client understands. task_id must come from the task types list. Hours should be realistic for a small agency and informed by this client's history below (hours by task type over three years, and by project). Rate: use 150 unless the history shows a clear different rate (billable_amount / billable_hours). "notes" is one paragraph for the team explaining the assumptions.
Task types: ${JSON.stringify(taskTypes)}
History by task type: ${JSON.stringify(byTask).slice(0, 8000)}
History by project: ${JSON.stringify(rates).slice(0, 8000)}`
  const { text } = await converse(c, 'quote_draft', MODELS.smart, system, [{ role: 'user', content: body.brief! }], [], 1500)
  const parsed = jsonFrom(text) as { lines?: { description: string, task_id?: string | null, hours: number, rate: number }[], notes?: string } | null
  if (!parsed?.lines?.length) throw createError({ statusCode: 502, statusMessage: 'Could not read the proposal. Try a fuller brief.' })
  const valid = new Set((taskTypes ?? []).map(t => t.id))
  return { lines: parsed.lines.map(l => ({ description: String(l.description), task_id: l.task_id && valid.has(l.task_id) ? l.task_id : null, hours: Number(l.hours) || 0, rate: Number(l.rate) || 150 })), notes: parsed.notes ?? '' }
})
