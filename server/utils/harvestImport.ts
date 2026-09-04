import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database'

// Import from Harvest.
//   archive:  roll one month up into harvest_archive_monthly (replaces the month)
//   live:     upsert one month's entries into time_entries keyed on harvest_id,
//             creating clients, projects, tasks, and project_tasks as needed.
//             `from`/`to` narrow it to a date range instead of a whole month,
//             which is how the "Catch up yesterday" button works. Every step,
//             the reconcile that removes entries deleted in Harvest included,
//             is scoped to that range.
//   projects: copy budget, rate, billing method, and active flag onto the
//             Docket projects that came from Harvest
//   expenses: upsert one month's expenses into expenses keyed on harvest_id,
//             creating clients, projects, and categories as needed, and file
//             each receipt in the owner's folder of the receipts bucket
//   invoices: copy every Harvest invoice (header plus line items) into
//             harvest_invoices, keyed on harvest_id
// The only secret is the Harvest token. Re-runnable: importing the same
// month again is safe. Run from the Imports page or the morning cron.

type Mode = 'archive' | 'live' | 'projects' | 'expenses' | 'invoices'
export type HarvestBody = { month?: string, mode?: Mode, dryRun?: boolean, from?: string, to?: string }
const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
type Db = SupabaseClient<Database>

// Runs as whichever client is handed in: the signed-in admin from the
// Imports page (RLS applies) or the service role from the morning cron.
export async function runHarvestImport(supabase: Db, body: HarvestBody) {
  const month = body?.month ?? ''
  const modes: Mode[] = ['archive', 'live', 'projects', 'expenses', 'invoices']
  if (!modes.includes(body.mode as Mode)) {
    throw createError({ statusCode: 400, statusMessage: `mode must be one of ${modes.join(', ')}` })
  }
  // A from/to pair stands in for the month on the modes that read a range.
  const ranged = isDate(body.from) && isDate(body.to)
  if (ranged && body.from! > body.to!) {
    throw createError({ statusCode: 400, statusMessage: 'from must not be after to' })
  }
  if (body.mode !== 'projects' && body.mode !== 'invoices' && !ranged && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw createError({ statusCode: 400, statusMessage: 'month must be YYYY-MM, or pass from and to as YYYY-MM-DD' })
  }
  if (ranged && body.mode === 'archive') {
    throw createError({ statusCode: 400, statusMessage: 'archive rolls up whole months, so it takes month, not from and to' })
  }
  const dryRun = !!body.dryRun


  if (body.mode === 'projects') {
    return { month, mode: body.mode, dryRun, fetched: 0, skippedRunning: 0, ...(await importProjects(supabase, dryRun)) }
  }
  if (body.mode === 'invoices') {
    return { month, mode: body.mode, dryRun, skippedRunning: 0, ...(await importInvoices(supabase, dryRun)) }
  }

  const from = ranged ? body.from! : `${month}-01`
  const to = ranged ? body.to! : lastDayOfMonth(month)
  if (body.mode === 'expenses') {
    return { month: ranged ? `${from} to ${to}` : month, mode: body.mode, dryRun, skippedRunning: 0, ...(await importExpenses(supabase, from, to, dryRun)) }
  }

  const all = await harvestTimeEntries(from, to)
  // A timer still running in Harvest has partial hours. Leave it for next time.
  const entries = all.filter(e => !e.is_running)

  const result = body.mode === 'archive'
    ? await importArchive(supabase, from, entries, dryRun)
    : await importLive(supabase, from, to, all, entries, dryRun)

  return { month: ranged ? `${from} to ${to}` : month, mode: body.mode, dryRun, fetched: all.length, skippedRunning: all.length - entries.length, ...result }
}

// ---------- shared lookups ----------

type Refs = Awaited<ReturnType<typeof loadRefs>>

async function loadRefs(supabase: Db) {
  const [clients, projects, tasks, categories, profiles, projectTasks, users] = await Promise.all([
    selectAll(supabase.from('clients').select('id, name, harvest_id')),
    selectAll(supabase.from('projects').select('id, client_id, name, harvest_id')),
    selectAll(supabase.from('tasks').select('id, name, harvest_id')),
    selectAll(supabase.from('expense_categories').select('id, name, harvest_id')),
    selectAll(supabase.from('profiles').select('id, email, full_name')),
    selectAll(supabase.from('project_tasks').select('project_id, task_id')),
    harvestUsers(),
  ])
  return {
    clients,
    projects,
    tasks,
    categories,
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

// Clients whose Harvest time and expenses never come across. Hills Bank
// is run out of ClickUp and Harvest and is being billed there before the
// move (Luke, 2026-09-03); clickupImport.ts has the matching list for
// ClickUp lists. importProjects() only updates projects that already
// exist, so it needs no check of its own.
const EXCLUDED_CLIENTS = ['hills bank']
const excludedClient = (name: string | undefined) =>
  !!name && EXCLUDED_CLIENTS.some(x => name.toLowerCase().includes(x))

// ---------- reference rows ----------

const newCreated = () => ({ clients: 0, projects: 0, tasks: 0, project_tasks: 0, categories: 0 })
type Created = ReturnType<typeof newCreated>

// Match on harvest_id, then on name (and adopt the id), else create.
function ensurers(supabase: Db, refs: Refs, dryRun: boolean, created: Created) {
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

  async function ensureCategory(ref: HarvestRef) {
    let c = refs.categories.find(x => x.harvest_id === ref.id)
      ?? refs.categories.find(x => x.harvest_id == null && same(x.name, ref.name))
    if (c && c.harvest_id == null) {
      if (!dryRun) fail((await supabase.from('expense_categories').update({ harvest_id: ref.id }).eq('id', c.id)).error)
      c.harvest_id = ref.id
    }
    if (!c) {
      created.categories++
      if (dryRun) {
        c = { id: `dry-category-${ref.id}`, name: ref.name.trim(), harvest_id: ref.id }
      } else {
        const { data, error } = await supabase.from('expense_categories').insert({ name: ref.name.trim(), harvest_id: ref.id }).select('id, name, harvest_id').single()
        fail(error)
        c = data!
      }
      refs.categories.push(c)
    }
    return c
  }

  return { ensureClient, ensureProject, ensureTask, ensureProjectTask, ensureCategory }
}

// ---------- live ----------

async function importLive(supabase: Db, from: string, to: string, all: HarvestTimeEntry[], entries: HarvestTimeEntry[], dryRun: boolean) {
  const refs = await loadRefs(supabase)
  const created = newCreated()
  const skippedUsers = new Map<number, string>()
  const { ensureClient, ensureProject, ensureTask, ensureProjectTask } = ensurers(supabase, refs, dryRun, created)

  type Row = Database['public']['Tables']['time_entries']['Insert']
  const rows: Row[] = []
  let skippedExcluded = 0
  for (const e of entries) {
    if (excludedClient(e.client?.name)) { skippedExcluded++; continue }
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
      // The rate trigger overwrites rate_snapshot on insert, and an upsert's
      // EXCLUDED row carries that overwrite, so a second upsert cannot put
      // Harvest's rate back. Plain updates can, and the trigger lets admins
      // change a frozen rate. Group by rate so it is a few requests per chunk.
      const got = new Map(data!.map(d => [d.harvest_id, d.rate_snapshot]))
      const byRate = new Map<number | null, number[]>()
      for (const r of chunk) {
        const want = r.rate_snapshot ?? null
        if ((got.get(r.harvest_id!) ?? null) === want) continue
        byRate.set(want, [...(byRate.get(want) ?? []), r.harvest_id!])
      }
      for (const [rate, ids] of byRate) {
        fail((await supabase.from('time_entries').update({ rate_snapshot: rate }).in('harvest_id', ids)).error)
        fixedRates += ids.length
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
  // The first pass touches tens of thousands of rows and can trip
  // PostgREST's statement timeout; that must not fail the month, whose
  // rows are already written. It catches up on the next run.
  let relinked: number | null = null
  let relinkError: string | null = null
  if (!dryRun) {
    const { data, error } = await supabase.rpc('relink_harvest_archive')
    if (error) relinkError = error.message
    else relinked = data ?? 0
  }

  return { imported: rows.length, deleted, fixedRates, relinked, relinkError, skippedExcluded, skippedUsers: [...skippedUsers.values()], created }
}

// ---------- projects ----------

// Harvest is the source of truth for project settings until the cutover, so
// budgets, rates, billing method, code, and active flag are copied over each
// run for every Docket project that came from Harvest.
async function importProjects(supabase: Db, dryRun: boolean) {
  const [harvest, existing] = await Promise.all([
    harvestProjects(),
    selectAll(supabase.from('projects').select('id, client_id, name, harvest_id').not('harvest_id', 'is', null)),
  ])
  const byHarvestId = new Map(existing.map(p => [p.harvest_id!, p]))
  type Row = Database['public']['Tables']['projects']['Insert']
  const rows: Row[] = []
  for (const hp of harvest) {
    const p = byHarvestId.get(hp.id)
    if (!p) continue
    rows.push({
      id: p.id,
      client_id: p.client_id,
      name: p.name,
      code: hp.code || null,
      is_active: hp.is_active,
      billing_method: !hp.is_billable ? 'non_billable' : hp.is_fixed_fee ? 'fixed' : 'hourly',
      hourly_rate: hp.bill_by === 'Project' ? hp.hourly_rate : null,
      budget_hours: hp.budget_by === 'project' ? hp.budget : null,
      budget_amount: hp.budget_by === 'project_cost' ? hp.cost_budget : hp.is_fixed_fee ? hp.fee : null,
    })
  }
  if (!dryRun) {
    for (const chunk of chunks(rows, 500)) {
      fail((await supabase.from('projects').upsert(chunk, { onConflict: 'id' })).error)
    }
  }
  return { projectsInHarvest: harvest.length, updatedProjects: rows.length }
}

// ---------- expenses ----------

// Receipts go to receipts/<owner>/harvest-<expense id>.<ext>, so a re-run
// finds them by path and downloads nothing twice. The bucket only takes
// these types; anything else is reported and the expense comes in without.
const RECEIPT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', pdf: 'application/pdf',
}
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024

async function importExpenses(supabase: Db, from: string, to: string, dryRun: boolean) {
  const all = await harvestExpenses(from, to)
  const refs = await loadRefs(supabase)
  const created = newCreated()
  const skippedUsers = new Map<number, string>()
  const { ensureClient, ensureProject, ensureCategory } = ensurers(supabase, refs, dryRun, created)

  // Earlier runs: keep their receipt and reimbursable flag, and find rows
  // that Harvest has since deleted.
  const existing = await selectAll(
    supabase.from('expenses').select('id, harvest_id, batch_id, receipt_path, is_reimbursable').gte('spent_on', from).lte('spent_on', to).not('harvest_id', 'is', null),
  )
  const byHarvestId = new Map(existing.map(x => [x.harvest_id!, x]))

  type Row = Database['public']['Tables']['expenses']['Insert']
  const rows: Row[] = []
  const pending: { row: Row, expense: HarvestExpense, path: string, contentType: string }[] = []
  const receiptErrors: string[] = []
  let receipts = 0

  let skippedExcluded = 0
  for (const e of all) {
    if (excludedClient(e.client?.name)) { skippedExcluded++; continue }
    const profile = findProfile(refs, e.user)
    if (!profile) {
      const email = refs.harvestEmail.get(e.user.id)
      skippedUsers.set(e.user.id, email ? `${e.user.name} (${email})` : e.user.name)
      continue
    }
    const client = await ensureClient(e.client)
    const project = await ensureProject(e.project, client.id)
    const category = await ensureCategory(e.expense_category)
    const prior = byHarvestId.get(e.id)
    const row: Row = {
      harvest_id: e.id,
      user_id: profile.id,
      project_id: project.id,
      category_id: category.id,
      spent_on: e.spent_date,
      amount: round2(e.total_cost),
      notes: e.notes || null,
      is_billable: e.billable,
      // Harvest has no reimbursable flag; whatever was set here stays.
      is_reimbursable: prior?.is_reimbursable ?? false,
      // Invoiced in Harvest: never editable, never picked up by a QuickBooks batch.
      is_locked: e.is_billed,
      receipt_path: prior?.receipt_path ?? null,
    }
    rows.push(row)

    if (e.receipt) {
      const ext = e.receipt.file_name.split('.').pop()?.toLowerCase() ?? ''
      const contentType = RECEIPT_TYPES[ext] ?? (Object.values(RECEIPT_TYPES).includes(e.receipt.content_type) ? e.receipt.content_type : null)
      if (!contentType) {
        receiptErrors.push(`${e.spent_date} ${e.user.name}: ${e.receipt.file_name} is not an image or PDF`)
        continue
      }
      if (e.receipt.file_size > RECEIPT_MAX_BYTES) {
        receiptErrors.push(`${e.spent_date} ${e.user.name}: ${e.receipt.file_name} is over 10 MB`)
        continue
      }
      const path = `${profile.id}/harvest-${e.id}.${ext || 'bin'}`
      if (row.receipt_path === path) continue
      receipts++
      pending.push({ row, expense: e, path, contentType })
    }
  }

  let deleted = 0
  if (!dryRun) {
    for (const { row, expense, path, contentType } of pending) {
      try {
        const file = await harvestReceipt(expense.receipt!.url)
        const { error } = await supabase.storage.from('receipts').upload(path, file.bytes, { contentType, upsert: true })
        if (error) throw error
        row.receipt_path = path
      } catch (err) {
        receipts--
        receiptErrors.push(`${expense.spent_date} ${expense.user.name}: ${(err as Error).message}`)
      }
    }

    for (const chunk of chunks(rows, 500)) {
      fail((await supabase.from('expenses').upsert(chunk, { onConflict: 'harvest_id' })).error)
    }

    // Expenses deleted in Harvest since the last run. Never touch batched rows.
    const stillInHarvest = new Set(all.map(e => e.id))
    const stale = existing.filter(x => x.harvest_id != null && !stillInHarvest.has(x.harvest_id) && x.batch_id == null)
    for (const chunk of chunks(stale, 500)) {
      fail((await supabase.from('expenses').delete().in('id', chunk.map(x => x.id))).error)
      deleted += chunk.length
      const files = chunk.map(x => x.receipt_path).filter((p): p is string => !!p)
      if (files.length) fail((await supabase.storage.from('receipts').remove(files)).error)
    }
  }

  const amount = round2(rows.reduce((sum, r) => sum + r.amount, 0))
  return { fetched: all.length, imported: rows.length, amount, deleted, receipts, receiptErrors, skippedExcluded, skippedUsers: [...skippedUsers.values()], created }
}

// ---------- invoices ----------

// Whole history every run; Harvest is the source of truth until the
// cutover, and a paid invoice changes state without a new row.
async function importInvoices(supabase: Db, dryRun: boolean) {
  let harvest: HarvestInvoice[]
  try {
    harvest = await harvestInvoices()
  } catch (e) {
    if (String((e as Error).message).startsWith('Harvest 403')) {
      throw createError({ statusCode: 502, statusMessage: 'This Harvest token cannot see invoices. Use a personal access token from a Harvest administrator, or have one grant invoice access to this one.' })
    }
    throw e
  }
  const clients = await selectAll(supabase.from('clients').select('id, name, harvest_id'))
  type Row = Database['public']['Tables']['harvest_invoices']['Insert']
  const rows: Row[] = harvest.map(inv => ({
    harvest_id: inv.id,
    number: inv.number,
    client_name: inv.client.name,
    client_id: (clients.find(c => c.harvest_id === inv.client.id) ?? clients.find(c => same(c.name, inv.client.name)))?.id ?? null,
    subject: inv.subject || null,
    state: inv.state,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    period_start: inv.period_start,
    period_end: inv.period_end,
    amount: round2(inv.amount),
    due_amount: round2(inv.due_amount),
    tax_amount: inv.tax_amount,
    discount_amount: inv.discount_amount,
    currency: inv.currency,
    sent_at: inv.sent_at,
    paid_at: inv.paid_at,
    paid_date: inv.paid_date,
    closed_at: inv.closed_at,
    line_items: inv.line_items.map(li => ({
      kind: li.kind,
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unit_price,
      amount: li.amount,
      taxed: li.taxed,
      project: li.project ? { harvest_id: li.project.id, name: li.project.name, code: li.project.code } : null,
    })),
    harvest_updated_at: inv.updated_at,
  }))
  if (!dryRun) {
    for (const chunk of chunks(rows, 200)) {
      fail((await supabase.from('harvest_invoices').upsert(chunk, { onConflict: 'harvest_id' })).error)
    }
  }
  const byState: Record<string, number> = {}
  for (const r of rows) byState[r.state] = (byState[r.state] ?? 0) + 1
  const amount = round2(rows.reduce((sum, r) => sum + r.amount, 0))
  const openAmount = round2(rows.filter(r => r.state === 'open').reduce((sum, r) => sum + r.due_amount, 0))
  return { fetched: harvest.length, imported: rows.length, amount, openAmount, byState, unlinkedClients: [...new Set(rows.filter(r => !r.client_id).map(r => r.client_name))] }
}
