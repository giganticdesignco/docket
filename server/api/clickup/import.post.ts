// Imports page: pull ClickUp's open tasks now. The work is in
// server/utils/clickupImport.ts, shared with the morning cron. Needs the
// Settings permission, the same as the page.
type Body = { dryRun?: boolean, subtasks?: boolean }

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event).catch(() => ({} as Body))
  const { supabase, user } = await requireStaff(event, 'manage_settings')
  return await importClickup(supabase, user.id, !!body?.dryRun, !!body?.subtasks)
})
