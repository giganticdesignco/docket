import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// A client comments from the review link: stored with their typed name and
// no author id, visible to the client by definition, and the task's people
// get an email.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  type Body = { name?: unknown, body?: unknown }
  const body = await readBody<Body>(event).catch((): Body => ({}))
  const name = cleanName(body.name)
  const text = cleanBody(body.body, true)

  const admin = serverSupabaseServiceRole<Database>(event)
  const task = await reviewTask(admin, token)
  const { error } = await admin.from('work_item_comments').insert({ work_item_id: task.id, author_id: null, author_name: name, body: text, visible_to_client: true })
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const origin = getRequestURL(event).origin
  await notifyTaskTeam(admin, task.id,
    `${name} commented on "${task.title}"`,
    `${name} (${task.projects?.clients?.name ?? 'client'}) commented on ${task.title}:\n\n${text}\n\nOpen the task: ${origin}/tasks/${task.id}`)

  return loadReviewDoc(admin, token)
})
