// The Assistant drawer: a conversation with tools over the caller's
// own data, the same read and write tools the MCP connector has, so it
// can log time, run the timer, make tasks, and comment as the caller
// (RLS applies). Context tells the model which page is open. `acted`
// tells the drawer to refresh the page when something was written.
const PATHS: Record<string, string> = { task: '/tasks', project: '/projects', client: '/clients', quote: '/quotes', invoice: '/invoices' }
const WRITES = new Set(['log_time', 'start_timer', 'stop_timer', 'update_time_entry', 'create_task', 'update_task', 'add_comment', 'create_client', 'create_project'])
type Body = { messages?: { role: 'user' | 'assistant', content: string }[], context?: { path?: string, taskId?: string, quoteId?: string, client?: string, project?: string, task?: string, quote?: string, invoice?: string, retainer?: string, period?: string, mentions?: { kind: string, id: string, title: string }[] } }

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event).catch((): Body => ({}))
  const messages = (body.messages ?? []).filter(m => m.content?.trim()).slice(-12)
  if (!messages.length) throw createError({ statusCode: 400, statusMessage: 'Say something first' })
  const c = await caller(event)
  const ctx = body.context ?? {}
  const where = [
    ctx.path ? `The person is on ${ctx.path}.` : '',
    ctx.taskId ? `They are looking at task ${ctx.taskId}; use get_task for it when relevant.` : '',
    ctx.quoteId ? `They are looking at quote ${ctx.quoteId}; use the quote tool for it when relevant.` : '',
    ctx.client ? `Client on screen: ${ctx.client}.` : '',
    ctx.project ? `Project on screen: ${ctx.project}.` : '',
    ctx.task ? `Task on screen: "${ctx.task}".` : '',
    ctx.quote ? `On screen: ${ctx.quote}.` : '',
    ctx.retainer ? `Retainer on screen: ${ctx.retainer}.` : '',
    ctx.invoice ? `On screen: ${ctx.invoice}.` : '',
    ctx.period ? `The report on screen covers ${ctx.period}.` : '',
    ...(ctx.mentions ?? []).slice(0, 8).map(m => `The person picked ${m.kind} "${m.title}" (id ${m.id}, ${PATHS[m.kind] ?? m.kind}/${m.id}); use that exact record.`),
  ].filter(Boolean).join(' ')
  const system = `${baseSystem(c)}\n${where}\nWhen the person asks for numbers, prefer report_rollup or report_time and link to the report page like /reports?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD&client=Name. Link tasks as /tasks/<id>, projects as /projects/<id>, clients as /clients/<id>. Answer in plain prose or short bullet lists, under 150 words unless asked for detail.
When someone is scoping or quoting new work, or setting a project budget, use similar_projects for what comparable finished jobs took. Scope varies a lot for the same kind of job (a website can be a refresh or a rebuild), so before settling on a figure ask the two or three questions that move it most (pages or templates, platform or CMS, new design or refresh, who writes the content, integrations, print run or size) unless the person already said; then name the jobs you compared and give low, typical, and high hours with what drives the difference.
You can also act: log time, start or stop the timer, change a time entry, create or update a task, put people on or take them off a task (people gives their ids), hand a task to someone or to nobody with update_task's assignee_id, add a comment, add a client, add a project (check list_clients and list_projects first so nothing is made twice). Do it when the person clearly asks for it. If something needed is missing or ambiguous (which project, which task type, how many hours, which task), ask one short question instead of guessing; use list_projects and project_task_types to resolve names first. Never delete anything. After an action, say exactly what changed, with a link.`
  const tools = mcpTools(c, requestOrigin(event))
  const { text, used } = await converse(c, 'chat', MODELS.smart, system, messages, tools)
  const acted = used.some(n => WRITES.has(n))
  return { text, acted }
})
