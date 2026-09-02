import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Approve or request changes from the review link. Both are recorded on the
// task and as a client comment; requesting changes also moves the task to
// "back in our court" so it shows up for the team. A note is required for
// changes and optional for approval.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  type Body = { name?: unknown, decision?: unknown, body?: unknown }
  const body = await readBody<Body>(event).catch((): Body => ({}))
  const name = cleanName(body.name)
  const decision = body.decision === 'approved' ? 'approved' : body.decision === 'changes_requested' ? 'changes_requested' : null
  if (!decision) throw createError({ statusCode: 400, statusMessage: 'decision must be approved or changes_requested' })
  const note = cleanBody(body.body, decision === 'changes_requested')

  const admin = serverSupabaseServiceRole<Database>(event)
  const task = await reviewTask(admin, token)
  const now = new Date().toISOString()
  // "Changes requested" moves the task to whichever status is flagged is_return.
  const { data: returnStatus } = await admin.from('work_statuses').select('key').eq('is_return', true).eq('is_active', true).order('position').limit(1).maybeSingle()
  const { error: updErr } = await admin.from('work_items').update({
    client_decision: decision,
    client_decision_by: name,
    client_decision_at: now,
    ...(decision === 'changes_requested' && returnStatus ? { status: returnStatus.key } : {}),
  }).eq('id', task.id)
  if (updErr) throw createError({ statusCode: 500, statusMessage: updErr.message })

  const headline = decision === 'approved' ? 'Approved' : 'Requested changes'
  const { error: cErr } = await admin.from('work_item_comments').insert({
    work_item_id: task.id, author_id: null, author_name: name, visible_to_client: true,
    body: note ? `${headline}: ${note}` : headline,
  })
  if (cErr) throw createError({ statusCode: 500, statusMessage: cErr.message })

  const origin = await appOrigin(admin, getRequestURL(event).origin)
  await notifyTaskTeam(admin, task.id,
    `${name} ${decision === 'approved' ? 'approved' : 'requested changes on'} "${task.title}"`,
    `${name} (${task.projects?.clients?.name ?? 'client'}) ${decision === 'approved' ? 'approved' : 'requested changes on'} ${task.title}.${note ? `\n\n${note}` : ''}\n\nOpen the task: ${origin}/tasks/${task.id}`)

  return loadReviewDoc(admin, token)
})
