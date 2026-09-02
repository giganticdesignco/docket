import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// One-time import of ClickUp's open tasks into work_items, for the
// cutover. Re-runnable: keyed on clickup_id. Runs as the signed-in admin
// through RLS.
//
// Mapping:
//   list      -> client by name (" - Shared" and punctuation ignored)
//   task name -> the client's project whose name appears in it (longest
//                wins), else a "ClickUp import" project made for the client
//   assignees -> profiles by email (client guests are dropped)
//   status    -> the same names Docket uses; anything else becomes new

type Body = { dryRun?: boolean }
type Status = Database['public']['Enums']['work_status']

const STATUS: Record<string, Status> = {
  'new': 'new', 'to do': 'new', 'open': 'new',
  'ready to start': 'ready_to_start', 'ready': 'ready_to_start',
  'in progress': 'in_progress', 'in development': 'in_progress',
  'internal review': 'internal_review', 'review': 'internal_review',
  'client review': 'client_review',
  'back in our court': 'back_in_our_court',
  'sent to print': 'sent_to_print',
  'on hold': 'on_hold', 'blocked': 'on_hold',
  'completed': 'completed', 'complete': 'completed', 'closed': 'completed', 'done': 'completed',
}
const PRIORITY: Record<string, Database['public']['Enums']['work_priority']> = { low: 'low', normal: 'normal', high: 'high', urgent: 'urgent' }

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event).catch(() => ({} as Body))
  const dryRun = !!body?.dryRun

  const supabase = await serverSupabaseClient<Database>(event)
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin')
  if (adminErr || !isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const [tasks, profiles, clients, projects, existing] = await Promise.all([
    clickupOpenTasks(),
    all(supabase.from('profiles').select('id, email')),
    all(supabase.from('clients').select('id, name')),
    all(supabase.from('projects').select('id, client_id, name')),
    all(supabase.from('work_items').select('id, clickup_id').not('clickup_id', 'is', null)),
  ])

  const profileByEmail = new Map(profiles.map(p => [p.email.toLowerCase(), p.id]))
  const clientKeys = clients.map(c => ({ id: c.id, key: norm(c.name) }))
  const projectKeys = projects.map(p => ({ id: p.id, client_id: p.client_id, key: norm(p.name), name: p.name }))
  const existingByClickup = new Map(existing.map(w => [w.clickup_id!, w.id]))

  function findClient(listName: string | undefined): string | null {
    if (!listName) return null
    const key = norm(listName.replace(/\s*-\s*shared$/i, ''))
    if (!key) return null
    const exact = clientKeys.find(c => c.key === key)
    if (exact) return exact.id
    const partial = clientKeys.filter(c => c.key.includes(key) || key.includes(c.key)).sort((a, b) => b.key.length - a.key.length)
    return partial[0]?.id ?? null
  }
  function findProject(taskName: string, clientId: string): string | null {
    const key = norm(taskName)
    const hit = projectKeys.filter(p => p.client_id === clientId && p.key.length >= 8 && key.includes(p.key)).sort((a, b) => b.key.length - a.key.length)[0]
    return hit?.id ?? null
  }
  const catchAll = new Map<string, string>()
  let createdProjects = 0
  async function catchAllProject(clientId: string): Promise<string> {
    const known = catchAll.get(clientId) ?? projectKeys.find(p => p.client_id === clientId && p.name === 'ClickUp import')?.id
    if (known) return known
    createdProjects++
    let id = `dry-${clientId}`
    if (!dryRun) {
      const { data, error } = await supabase.from('projects').insert({ client_id: clientId, name: 'ClickUp import', billing_method: 'hourly' }).select('id').single()
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      id = data.id
    }
    catchAll.set(clientId, id)
    return id
  }

  const unmatchedLists = new Set<string>()
  let skippedNoClient = 0
  let inCatchAll = 0
  let created = 0
  let updated = 0
  let assignments = 0
  let droppedAssignees = 0

  for (const t of tasks) {
    if (t.parent) continue // subtasks come along as their parent's checklist in spirit; keep the list flat
    const clientId = findClient(t.list?.name)
    if (!clientId) {
      if (t.list?.name) unmatchedLists.add(t.list.name)
      skippedNoClient++
      continue
    }
    let projectId = findProject(t.name, clientId)
    if (!projectId) {
      projectId = await catchAllProject(clientId)
      inCatchAll++
    }
    const people = [...new Set(t.assignees.map(a => (a.email ? profileByEmail.get(a.email.toLowerCase()) : undefined)).filter((x): x is string => !!x))]
    droppedAssignees += t.assignees.length - people.length

    const row = {
      project_id: projectId,
      title: t.name,
      description: t.text_content?.trim() || t.description?.trim() || null,
      status: STATUS[(t.status?.status ?? '').toLowerCase()] ?? 'new',
      priority: PRIORITY[(t.priority?.priority ?? 'normal').toLowerCase()] ?? 'normal',
      start_on: clickupDate(t.start_date),
      due_on: clickupDate(t.due_date),
      estimate_hours: t.time_estimate ? Math.round(t.time_estimate / 36000) / 100 : null,
      clickup_id: t.id,
    }
    const existingId = existingByClickup.get(t.id)
    if (existingId) updated++
    else created++
    assignments += people.length
    if (dryRun) continue

    let itemId = existingId
    if (itemId) {
      const { error } = await supabase.from('work_items').update(row).eq('id', itemId)
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    } else {
      const { data, error } = await supabase.from('work_items').insert({ ...row, created_by: user.id }).select('id').single()
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      itemId = data.id
    }
    const del = await supabase.from('work_item_assignees').delete().eq('work_item_id', itemId)
    if (del.error) throw createError({ statusCode: 500, statusMessage: del.error.message })
    if (people.length) {
      const ins = await supabase.from('work_item_assignees').insert(people.map(user_id => ({ work_item_id: itemId!, user_id })))
      if (ins.error) throw createError({ statusCode: 500, statusMessage: ins.error.message })
    }
  }

  return { dryRun, fetched: tasks.length, created, updated, assignments, droppedAssignees, skippedNoClient, inCatchAll, createdProjects, unmatchedLists: [...unmatchedLists].sort() }
})

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

async function all<T>(query: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null, error: { message: string } | null }> }): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}
