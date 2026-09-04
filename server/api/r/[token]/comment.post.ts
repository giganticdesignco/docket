import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// A client comments from the review link. A signed-in contact is stored
// with their profile id and name; anyone on the bare link with the name
// they typed. Visible to the client by definition; the task's people get
// an email.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  type Body = { name?: unknown, body?: unknown }
  const body = await readBody<Body>(event).catch((): Body => ({}))
  const { name, authorId } = await reviewer(event, body.name)
  const text = cleanBody(body.body, true)

  const admin = serverSupabaseServiceRole<Database>(event)
  const task = await reviewTask(admin, token)
  const { error } = await admin.from('work_item_comments').insert({ work_item_id: task.id, author_id: authorId, author_name: name, body: text, visible_to_client: true })
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  // The comment trigger bells everyone on the task (kind client_comment or
  // client_decision), and the email follows each person's Notifications
  // setting; nothing is mailed straight from here.

  return loadReviewDoc(admin, token)
})
