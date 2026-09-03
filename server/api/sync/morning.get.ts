import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Every morning, from the Vercel cron in vercel.json: pull open tasks
// from ClickUp and this month's time and expenses from Harvest, so
// Docket stays current until both are cancelled. In the first days of
// a month the previous month comes along too, for entries edited late.
// Vercel sends CRON_SECRET as a bearer token; nothing else may call
// this. Runs with the service role; the imports are the same code the
// admin Imports pages run.
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().cronSecret
  const auth = getHeader(event, 'authorization') ?? ''
  if (!secret || auth !== `Bearer ${secret}`) throw createError({ statusCode: 401, statusMessage: 'Not for you' })
  const admin = serverSupabaseServiceRole<Database>(event)
  const cfg = useRuntimeConfig()
  // ?dry=1 checks the tokens and the wiring without writing anything.
  const dryRun = getQuery(event).dry === '1'

  const now = new Date()
  const chicago = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const month = `${chicago.getFullYear()}-${String(chicago.getMonth() + 1).padStart(2, '0')}`
  const prev = new Date(chicago.getFullYear(), chicago.getMonth() - 1, 1)
  const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  const months = chicago.getDate() <= 3 ? [prevMonth, month] : [month]

  const results: Record<string, unknown> = {}
  const step = async (name: string, run: () => Promise<unknown>) => {
    try { results[name] = await run() } catch (e) { results[name] = { error: (e as { statusMessage?: string }).statusMessage ?? (e as Error).message } }
  }

  if (cfg.clickupToken) {
    // Tasks that ClickUp creates need an owner; the first admin stands in.
    const { data: owner } = await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).order('created_at').limit(1).maybeSingle()
    if (owner) await step('clickup', () => importClickup(admin, owner.id, dryRun, getQuery(event).subtasks === '1'))
    else results.clickup = { error: 'No active admin to own new tasks' }
  } else {
    results.clickup = { skipped: 'NUXT_CLICKUP_TOKEN is not set' }
  }

  if (cfg.harvestAccessToken) {
    for (const m of months) {
      await step(`harvest_live_${m}`, () => runHarvestImport(admin, { mode: 'live', month: m, dryRun }))
      await step(`harvest_expenses_${m}`, () => runHarvestImport(admin, { mode: 'expenses', month: m, dryRun }))
    }
    await step('harvest_projects', () => runHarvestImport(admin, { mode: 'projects', dryRun }))
  } else {
    results.harvest = { skipped: 'NUXT_HARVEST_ACCESS_TOKEN is not set' }
  }

  console.log('[sync/morning]', JSON.stringify(results))
  return { ran_at: now.toISOString(), dryRun, months, results }
})
