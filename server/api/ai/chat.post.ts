// The Assistant drawer: a short conversation with tools over the
// caller's own data. Context tells the model which page is open.
type Body = { messages?: { role: 'user' | 'assistant', content: string }[], context?: { path?: string, taskId?: string, quoteId?: string, client?: string, project?: string } }

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
  ].filter(Boolean).join(' ')
  const system = `${baseSystem(c)}\n${where}\nWhen the person asks for numbers, prefer report_rollup or report_time and link to the report page like /reports?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD&client=Name. Link tasks as /tasks/<id>, projects as /projects/<id>, clients as /clients/<id>. Answer in plain prose or short bullet lists, under 150 words unless asked for detail.`
  const { text } = await converse(c, 'chat', MODELS.smart, system, messages, docketTools(c))
  return { text }
})
