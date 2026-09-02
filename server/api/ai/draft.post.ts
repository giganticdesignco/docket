// Writing help: draft or tidy a task description, a client-facing
// reply, a quote introduction, or an invoice subject. The person edits
// and saves; nothing is written here.
type Body = { kind?: 'task_description' | 'client_reply' | 'quote_intro' | 'invoice_subject' | 'tidy', instruction?: string, current?: string, taskId?: string, quoteId?: string }

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event).catch((): Body => ({}))
  const c = await caller(event)
  const kind = body.kind ?? 'tidy'
  const guides: Record<string, string> = {
    task_description: 'Write a task description for the team: what is being made, for whom, what done looks like, anything to watch. Short paragraphs or a short list. No headings.',
    client_reply: 'Write a reply to the client that will be visible on their review page. Warm, plain, specific, no jargon, one to three short paragraphs. Do not promise dates the person did not give.',
    quote_intro: 'Write the introduction paragraph for a quote: what the project is, why the approach fits, what the client gets. Confident and plain, three to five sentences.',
    invoice_subject: 'Write a one-line invoice subject, under 70 characters, naming the work and the period.',
    tidy: 'Tidy the text: fix spelling and grammar, keep the meaning and voice, no new claims.',
  }
  const context = body.taskId ? await docketTools(c).find(t => t.name === 'get_task')!.run({ id: body.taskId }) : body.quoteId ? await docketTools(c).find(t => t.name === 'quote')!.run({ id: body.quoteId }) : null
  const system = `${baseSystem(c)}\nYou write in Gigantic's voice: friendly, direct, no filler, no em dashes, American spelling. ${guides[kind] ?? guides.tidy}\nReply with the text only, no preamble, no quotes around it.`
  const user = [
    body.instruction ? `Instruction: ${body.instruction}` : '',
    body.current ? `Current text:\n${body.current}` : '',
    context ? `Context from Docket:\n${JSON.stringify(context).slice(0, 12000)}` : '',
  ].filter(Boolean).join('\n\n') || 'Write it.'
  const { text } = await converse(c, `draft_${kind}`, MODELS.smart, system, [{ role: 'user', content: user }], [], 800)
  return { text }
})
