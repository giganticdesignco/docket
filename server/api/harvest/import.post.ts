import { serverSupabaseClient } from '#supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database'

// Import one calendar month of Harvest time.
//   archive: roll the month up into harvest_archive_monthly (replaces the month)
//   live:    upsert the month's entries into time_entries keyed on harvest_id,
//            creating clients, projects, tasks, and project_tasks as needed
// Runs as the signed-in admin through RLS. The only secret is the Harvest
// token. Re-runnable: importing the same month again is safe.

type Mode = 'archive' | 'live'
type Body = { month?: string, mode?: Mode, dryRun?: boolean }
type Db = SupabaseClient<Database>

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const month = body?.month ?? ''
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw createError({ statusCode: 400, statusMessage: 'month must be YYYY-MM' })
  if (body.mode !== 'archive' && body.mode !== 'live') throw createError({ statusCode: 400, statusMessage: 'mode must be archive or live' })
  const dryRun = !!body.dryRun

  const supabase = await serverSupabaseClient<Database>(event)
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin')
  if (adminErr) throw createError({ statusCode: 500, statusMessage: adminErr.message })
  if (!isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const from = `${month}-01`
  const to = lastDayOfMonth(month)
  const all = await harvestTimeEntries(from, to)
  // A timer still running in Harvest has partial hours. Leave it for next time.
  const entries = all.filter(e => !e.is_running)

  const result = body.mode === 'archive'
    ? await importArchive(supabase, from, entries, dryRun)
    : await importLive(supabase, from, to, all, entries, dryRun)

  return { month, mode: body.mode, dryRun, fetched: all.length, skippedRunning: all.length - entries.length, ...result }
})

// ---------- shared lookups ----------

type Refs = Awaited<ReturnType<typeof loadRefs>>

async function loadRefs(supabase: Db) {
  const [clients, projects, tasks, profiles, projectTasks, users] = await Promise.all([
    selectAll(supabase.from('clients').select('id, name, harvest_id')),
    selectAll(supabase.from('projects').select('id, client_id, name, harvest_id')),
    selectAll(supabase.from('tasks').select('id, name, harvest_id')),
    selectAll(supabase.from('profiles').select('id, email, full_name')),
    selectAll(supabase.from('project_tasks').select('project_id, task_id')),
    harvestUsers(),
  ])
  return {
    clients,
    projects,
    tasks,
    profiles,
    projectTaskKeys: new Set(projectTasks.map(pt => `${pt.project_id}:${pt.task_id}`)),
    harvestEmail: new Map(users.map(u => [u.id, u.email])),
  }
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// By email when Harvest let us list users, otherwise by full name.
function findProfile(refs: Refs, user: HarvestRef) {
  const email = refs.harvestEmail.get(user.id)
  if (email) return refs.profiles.find(p => same(p.email, email))
  return refs.profiles.find(p => same(p.full_name, user.name))
}

// PostgREST caps a response at 1000 rows. Page through anything that could exceed it.
async function selectAll<T>(query: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null, error: { message: string } | null }> }): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
}

// ---------- archive ----------

async function importArchive(supabase: Db, periodMonth: string, entries: HarvestTimeEntry[], dryRun: boolean) {
  const refs = await loadRefs(supabase)
  type Row = Database['public']['Tables']['harvest_archive_monthly']['Insert']
  const rows = new Map<string, Row>()

  for (const e of entries) {
    const taskName = e.task?.name ?? null
    const key = JSON.stringify([e.client.name, e.project.name, e.user.name, taskName])
    let row = rows.get(key)
    if (!row) {
      const client = refs.clients.find(c => c.harvest_id === e.client.id) ?? refs.clients.find(c => same(c.name, e.client.name))
      const project = refs.projects.find(p => p.harvest_id === e.project.id)
        ?? refs.projects.find(p => p.client_id === client?.id && same(p.name, e.project.name))
      row = {
        period_month: periodMonth,
        client_name: e.client.name,
        project_name: e.project.name,
        project_code: e.project.code || null,
        user_name: e.user.name,
        task_name: taskName,
        hours: 0,
        billable_hours: 0,
        amount: 0,
        client_id: client?.id ?? null,
        project_id: project?.id ?? null,
        user_id: findProfile(refs, e.user)?.id ?? null,
      }
      rows.set(key, row)
    }
    row.hours! += e.hours
    if (e.billable) {
      row.billable_hours! += e.hours
      row.amount! += e.hours * (e.billable_rate ?? 0)
    }
  }

  const list = [...rows.values()].map(r => ({
    ...r,
    hours: round2(r.hours!),
    billable_hours: round2(r.billable_hours!),
    amount: round2(r.amount!),
  }))
  const hours = round2(list.reduce((sum, r) => sum + r.hours, 0))
  const amount = round2(list.reduce((sum, r) => sum + r.amount, 0))

  if (!dryRun) {
    fail((await supabase.from('harvest_archive_monthly').delete().eq('period_month', periodMonth)).error)
    for (const chunk of chunks(list, 500)) {
      fail((await supabase.from('harvest_archive_monthly').insert(chunk)).error)
    }
  }
  return { rows: list.length, hours, amount }
}

// ---------- live ----------

async function importLive(supabase: Db, from: string, to: string, all: HarvestTimeEntry[], entries: HarvestTimeEntry[], dryRun: boolean) {
  const refs = await loadRefs(supabase)
  const created = { clients: 0, projects: 0, tasks: 0, project_tasks: 0 }
  const skippedUsers = new Map<number, string>()

  // Reference rows: match on harvest_id, then on name (and adopt the id), else create.
  async function ensureClient(ref: HarvestRef) {
    let c = refs.clients.find(x => x.harvest_id === ref.id)
      ?? refs.clients.find(x => x.harvest_id == null && same(x.name, ref.name))
    if (c && c.harvest_id == null) {
      if (!dryRun) fail((await supabase.from('clients').update({ harvest_id: ref.id }).eq('id', c.id)).error)
      c.harvest_id = ref.id
    }
    if (!c) {
      created.clients++
      if (dryRun) {
        c = { id: `dry-client-${ref.id}`, name: ref.name, harvest_id: ref.id }
      } else {
        const { data, error } = await supabase.from('clients').insert({ name: ref.name, harvest_id: ref.id }).select('id, name, harvest_id').single()
        fail(error)
        c = data!
      }
      refs.clients.push(c)
    }
    return c
  }

  async function ensureProject(ref: HarvestTimeEntry['project'], clientId: string) {
    let p = refs.projects.find(x => x.harvest_id === ref.id)
      ?? refs.projects.find(x => x.harvest_id == null && x.client_id === clientId && same(x.name, ref.name))
    if (p && p.harvest_id == null) {
      if (!dryRun) fail((await supabase.from('projects').update({ harvest_id: ref.id }).eq('id', p.id)).error)
      p.harvest_id = ref.id
    }
    if (!p) {
      created.projects++
      const values = { client_id: clientId, name: ref.name, code: ref.code || null, harvest_id: ref.id }
      if (dryRun) {
        p = { id: `dry-project-${ref.id}`, ...values }
      } else {
        const { data, error } = await supabase.from('projects').insert(values).select('id, client_id, name, harvest_id').single()
        fail(error)
        p = data!
      }
      refs.projects.push(p)
    }
    return p
  }

  async function ensureTask(ref: HarvestRef) {
    let t = refs.tasks.find(x => x.harvest_id === ref.id)
      ?? refs.tasks.find(x => x.harvest_id == null && same(x.name, ref.name))
    if (t && t.harvest_id == null) {
      if (!dryRun) fail((await supabase.from('tasks').update({ harvest_id: ref.id }).eq('id', t.id)).error)
      t.harvest_id = ref.id
    }
    if (!t) {
      created.tasks++
      if (dryRun) {
        t = { id: `dry-task-${ref.id}`, name: ref.name, harvest_id: ref.id }
      } else {
        const { data, error } = await supabase.from('tasks').insert({ name: ref.name, harvest_id: ref.id }).select('id, name, harvest_id').single()
        fail(error)
        t = data!
      }
      refs.tasks.push(t)
    }
    return t
  }

  async function ensureProjectTask(projectId: string, taskId: string) {
    const key = `${projectId}:${taskId}`
    if (refs.projectTaskKeys.has(key)) return
    created.project_tasks++
    if (!dryRun) fail((await supabase.from('project_tasks').insert({ project_id: projectId, task_id: taskId })).error)
    refs.projectTaskKeys.add(key)
  }

  type Row = Database['public']['Tables']['time_entries']['Insert']
  const rows: Row[] = []
  for (const e of entries) {
    const profile = findProfile(refs, e.user)
    if (!profile) {
      const email = refs.harvestEmail.get(e.user.id)
      skippedUsers.set(e.user.id, email ? `${e.user.name} (${email})` : e.user.name)
      continue
    }
    const client = await ensureClient(e.client)
    const project = await ensureProject(e.project, client.id)
    const task = await ensureTask(e.task)
    await ensureProjectTask(project.id, task.id)
    rows.push({
      harvest_id: e.id,
      user_id: profile.id,
      project_id: project.id,
      task_id: task.id,
      spent_on: e.spent_date,
      hours: e.hours,
      notes: e.notes || null,
      is_billable: e.billable,
      // Invoiced in Harvest: never editable, never picked up by a QuickBooks batch.
      is_locked: e.is_billed,
      // Harvest's rate is the historical truth, not whatever resolve_rate() says today.
      rate_snapshot: e.billable_rate,
      started_at: null,
      ended_at: null,
    })
  }

  let fixedRates = 0
  let deleted = 0
  if (!dryRun) {
    for (const chunk of chunks(rows, 500)) {
      const { data, error } = await supabase.from('time_entries').upsert(chunk, { onConflict: 'harvest_id' }).select('harvest_id, rate_snapshot')
      fail(error)
      // The rate trigger overwrites rate_snapshot on insert. A second upsert is an
      // update with the same project/task/user, which the trigger leaves alone.
      const got = new Map(data!.map(d => [d.harvest_id, d.rate_snapshot]))
      const redo = chunk.filter(r => (got.get(r.harvest_id!) ?? null) !== (r.rate_snapshot ?? null))
      if (redo.length) {
        fail((await supabase.from('time_entries').upsert(redo, { onConflict: 'harvest_id' })).error)
        fixedRates += redo.length
      }
    }

    // Entries deleted in Harvest since the last run. Never touch batched rows.
    const existing = await selectAll(
      supabase.from('time_entries').select('id, harvest_id, batch_id').gte('spent_on', from).lte('spent_on', to).not('harvest_id', 'is', null),
    )
    const stillInHarvest = new Set(all.map(e => e.id))
    const stale = existing.filter(x => x.harvest_id != null && !stillInHarvest.has(x.harvest_id) && x.batch_id == null)
    for (const chunk of chunks(stale, 500)) {
      fail((await supabase.from('time_entries').delete().in('id', chunk.map(x => x.id))).error)
      deleted += chunk.length
    }
  }

  // Archive rows were loaded before these clients and projects existed.
  let relinked = 0
  if (!dryRun) {
    const { data, error } = await supabase.rpc('relink_harvest_archive')
    fail(error)
    relinked = data ?? 0
  }

  return { imported: rows.length, deleted, fixedRates, relinked, skippedUsers: [...skippedUsers.values()], created }
}
