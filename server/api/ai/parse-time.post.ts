// "2h CINC website copy this morning" becomes a time entry proposal:
// project, task type, hours, notes, date, matched to the projects and
// task types the person can log against. The fast model is enough.
type Body = { text?: string, date?: string }

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event).catch((): Body => ({}))
  const text = (body.text ?? '').trim()
  if (!text) throw createError({ statusCode: 400, statusMessage: 'Describe the time first' })
  const c = await caller(event)
  const [{ data: projects }, { data: pairs }] = await Promise.all([
    c.supabase.from('projects').select('id, name, clients(name)').eq('is_active', true).order('name'),
    c.supabase.from('project_tasks').select('project_id, tasks(id, name, is_billable_default, is_active)'),
  ])
  const list = (projects ?? []).map(p => ({ id: p.id, project: p.name, client: p.clients?.name, tasks: (pairs ?? []).filter(x => x.project_id === p.id && x.tasks?.is_active).map(x => ({ id: x.tasks!.id, name: x.tasks!.name })) }))
  const system = `${baseSystem(c)}
Turn the person's sentence into ONE time entry. Reply with only a JSON object: {"project_id": string|null, "task_id": string|null, "hours": number|null, "date": "YYYY-MM-DD", "notes": string, "confidence": "high"|"medium"|"low", "question": string|null}.
Pick project_id from the list below by matching client or project words (fuzzy is fine); pick task_id from that project's tasks; if several fit, choose the most likely and set confidence medium. Hours: "2h" = 2, "45m" = 0.75, "1:30" = 1.5. Date defaults to ${body.date ?? today()}; "yesterday" and weekday names count back from today. Notes: a short phrase for the invoice, not the whole sentence. If nothing matches, set the id null, confidence low, and ask one short question.
Projects: ${JSON.stringify(list).slice(0, 60000)}`
  const { text: reply } = await converse(c, 'parse_time', MODELS.fast, system, [{ role: 'user', content: text }], [], 400)
  const parsed = jsonFrom(reply)
  if (!parsed) throw createError({ statusCode: 502, statusMessage: 'Could not read the answer. Try rewording.' })
  const p = list.find(x => x.id === parsed.project_id)
  const t = p?.tasks.find(x => x.id === parsed.task_id)
  return { ...parsed, project_name: p ? `${p.client} / ${p.project}` : null, task_name: t?.name ?? null }
})
