// Imports page: one Harvest import now. The work is in
// server/utils/harvestImport.ts, shared with the morning cron. Needs the
// Settings permission, the same as the page.
export default defineEventHandler(async (event) => {
  const body = await readBody<HarvestBody>(event)
  const { supabase } = await requireStaff(event, 'manage_settings')
  return await runHarvestImport(supabase, body)
})
