import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Replace the clickup_assignments mirror with ClickUp's open tasks.
// Called by hand from the capacity page (admin session) or daily by the
// Vercel cron in vercel.json, which sends Authorization: Bearer CRON_SECRET
// (mirrored as NUXT_CRON_SECRET for runtime config) and has no session, so
// writes go through the service role either way.
//
// Mapping:
//   assignee -> profile by email (people outside Gigantic are dropped)
//   list     -> client by name (" - Shared" and punctuation ignored)
//   task     -> project whose name appears in the task name, longest wins
//   estimate -> ClickUp's time_estimate split evenly across Docket assignees

export default defineEventHandler(async (event) => {
  const cronSecret = useRuntimeConfig().cronSecret
  const auth = getHeader(event, 'authorization') ?? ''
  const fromCron = !!cronSecret && auth === `Bearer ${cronSecret}`
  if (!fromCron) {
    const supabase = await serverSupabaseClient<Database>(event)
    const { data: isAdmin, error } = await supabase.rpc('is_admin')
    if (error || !isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  }

  const admin = serverSupabaseServiceRole<Database>(event)
  const [tasks, profiles, clients, projects] = await Promise.all([
    clickupOpenTasks(),
    all(admin.from('profiles').select('id, email')),
    all(admin.from('clients').select('id, name')),
    all(admin.from('projects').select('id, client_id, name')),
  ])

  const profileByEmail = new Map(profiles.map(p => [p.email.toLowerCase(), p.id]))
  const clientKeys = clients.map(c => ({ id: c.id, key: norm(c.name) }))
  const projectKeys = projects.map(p => ({ id: p.id, client_id: p.client_id, key: norm(p.name) })).filter(p => p.key.length >= 8)

  function findClient(listName: string | undefined): string | null {
    if (!listName) return null
    const key = norm(listName.replace(/\s*-\s*shared$/i, ''))
    if (!key) return null
    const exact = clientKeys.find(c => c.key === key)
    if (exact) return exact.id
    // "Wendling" for "Wendling Quarries, Inc.", "Wanderwood Gardens" for "The Wanderwood Gardens".
    const partial = clientKeys.filter(c => c.key.includes(key) || key.includes(c.key)).sort((a, b) => b.key.length - a.key.length)
    return partial[0]?.id ?? null
  }

  function findProject(taskName: string, clientId: string | null): string | null {
    const key = norm(taskName)
    const pool = clientId ? projectKeys.filter(p => p.client_id === clientId) : projectKeys
    const hit = pool.filter(p => key.includes(p.key)).sort((a, b) => b.key.length - a.key.length)[0]
    return hit?.id ?? null
  }

  type Row = Database['public']['Tables']['clickup_assignments']['Insert']
  const now = new Date().toISOString()
  const rows: Row[] = []
  const unmatchedLists = new Set<string>()
  let skipped = 0
  let withoutEstimate = 0
  let withoutDue = 0

  for (const t of tasks) {
    const people = t.assignees
      .map(a => ({ clickupId: String(a.id), userId: a.email ? profileByEmail.get(a.email.toLowerCase()) : undefined }))
      .filter((a): a is { clickupId: string, userId: string } => !!a.userId)
    if (!people.length) {
      skipped++
      continue
    }
    const clientId = findClient(t.list?.name)
    if (t.list?.name && !clientId) unmatchedLists.add(t.list.name)
    const projectId = findProject(t.name, clientId)
    const estimate = t.time_estimate ? Math.round(t.time_estimate / 3600000 / people.length * 100) / 100 : null
    if (!estimate) withoutEstimate++
    const dueOn = clickupDate(t.due_date)
    if (!dueOn) withoutDue++
    for (const p of people) {
      rows.push({
        id: t.id,
        clickup_user_id: p.clickupId,
        user_id: p.userId,
        project_id: projectId,
        clickup_list_id: t.list?.id ?? null,
        list_name: t.list?.name ?? null,
        title: t.name,
        status: t.status?.status ?? null,
        estimate_hours: estimate,
        start_on: clickupDate(t.start_date),
        due_on: dueOn,
        url: t.url,
        synced_at: now,
      })
    }
  }

  // Whole replacement: closed and reassigned tasks simply disappear.
  fail((await admin.from('clickup_assignments').delete().neq('id', '')).error)
  for (let i = 0; i < rows.length; i += 500) {
    fail((await admin.from('clickup_assignments').insert(rows.slice(i, i + 500))).error)
  }

  return {
    fetched: tasks.length,
    stored: rows.length,
    people: new Set(rows.map(r => r.user_id)).size,
    skippedNoDocketAssignee: skipped,
    withoutEstimate,
    withoutDue,
    unmatchedLists: [...unmatchedLists].sort(),
    syncedAt: now,
  }
})

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
}

async function all<T>(query: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null, error: { message: string } | null }> }): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}
