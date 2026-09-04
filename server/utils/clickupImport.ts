import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database'

// Import of ClickUp's open tasks into work_items. Re-runnable: keyed on
// clickup_id. Run from the Imports page or the morning cron (sync/morning).
//
// Mapping:
//   list      -> client by name (" - Shared" and punctuation ignored)
//   task name -> the client's project whose name appears in it (longest
//                wins), else a "General" project made for the client
//   assignees -> profiles by email (client guests are dropped)
//   status    -> the same names Docket uses; anything else becomes new
//   subtasks  -> children of their parent (parent_id), imported after the
//                parents; a subtask whose parent is not in Docket comes
//                in on its own
//   lists in EXCLUDED_LISTS are skipped entirely

type Db = SupabaseClient<Database>
type Status = string

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
// ClickUp lists that never come across (Luke, 2026-09-03: Hills Bank is
// run out of ClickUp and its thousands of subtasks would swamp Docket).
const EXCLUDED_LISTS = ['hills bank']
const excluded = (listName: string | undefined) => !!listName && EXCLUDED_LISTS.some(x => listName.toLowerCase().includes(x))

// Runs as whichever client is handed in: the signed-in admin from the
// Imports page (RLS applies) or the service role from the morning cron.
// userId owns any task the import creates.
// includeSubtasks: bring ClickUp subtasks in as children. Off until Luke
// says go (the first run adds thousands of tasks); the morning cron
// passes ?subtasks=1 once it is on.
export async function importClickup(supabase: Db, userId: string, dryRun: boolean, includeSubtasks = false) {

  const [tasks, profiles, clients, projects, existing] = await Promise.all([
    clickupOpenTasks(),
    all(supabase.from('profiles').select('id, email')),
    all(supabase.from('clients').select('id, name')),
    all(supabase.from('projects').select('id, client_id, name')),
    all(supabase.from('work_items').select('id, clickup_id, project_id').not('clickup_id', 'is', null)),
  ])

  const profileByEmail = new Map(profiles.map(p => [p.email.toLowerCase(), p.id]))
  const clientKeys = clients.map(c => ({ id: c.id, key: norm(c.name) }))
  const projectKeys = projects.map(p => ({ id: p.id, client_id: p.client_id, key: norm(p.name), name: p.name }))
  const existingByClickup = new Map(existing.map(w => [w.clickup_id!, w.id]))
  const projectByItem = new Map(existing.map(w => [w.id, w.project_id]))
  // Who is already on each task. Without this the loop below deleted every
  // assignee row and put it straight back, which fired notify_on_assignee
  // for the lot every morning (1,107 emails before this was caught) and
  // cascaded away any work_item_plans row, since Planner's hours hang off
  // the assignment by a composite FK.
  const assigneeByItem = new Map<string, Set<string>>()
  {
    const ids = [...existingByClickup.values()]
    for (let i = 0; i < ids.length; i += 500) {
      const rows = await all<{ work_item_id: string, user_id: string }>(
        supabase.from('work_item_assignees').select('work_item_id, user_id').in('work_item_id', ids.slice(i, i + 500)),
      )
      for (const r of rows) {
        const set = assigneeByItem.get(r.work_item_id) ?? new Set<string>()
        set.add(r.user_id)
        assigneeByItem.set(r.work_item_id, set)
      }
    }
  }

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
    const known = catchAll.get(clientId) ?? projectKeys.find(p => p.client_id === clientId && p.name === 'General')?.id
    if (known) return known
    createdProjects++
    let id = `dry-${clientId}`
    if (!dryRun) {
      const { data, error } = await supabase.from('projects').insert({ client_id: clientId, name: 'General', billing_method: 'hourly' }).select('id').single()
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
  let subtasks = 0
  let orphanSubtasks = 0
  let skippedExcluded = 0

  // Parents first, then children by depth, so a child can point at its
  // parent's Docket id. ClickUp nests deeper than one level; Docket keeps
  // one, so anything deeper hangs off its top-most open ancestor.
  const byClickup = new Map(tasks.map(t => [t.id, t]))
  const depth = (t: (typeof tasks)[number]): number => { let d = 0; let cur = t; const seen = new Set<string>(); while (cur.parent && byClickup.has(cur.parent) && !seen.has(cur.id)) { seen.add(cur.id); cur = byClickup.get(cur.parent)!; d++ } return d }
  const rootOf = (t: (typeof tasks)[number]) => { let cur = t; const seen = new Set<string>(); while (cur.parent && byClickup.has(cur.parent) && !seen.has(cur.id)) { seen.add(cur.id); cur = byClickup.get(cur.parent)! } return cur }
  let flattened = 0
  // Where the subtasks would land, by ClickUp list, for deciding what to bring in.
  const subtasksByList: Record<string, number> = {}
  const ordered = [...tasks].filter(t => includeSubtasks || !t.parent).sort((a, b) => depth(a) - depth(b))
  for (const t of ordered) {
    if (excluded(t.list?.name)) { skippedExcluded++; continue }
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

    // A child sits in its parent's project whatever its own name says.
    let parentId: string | null = null
    if (t.parent) {
      const root = rootOf(t)
      if (root.id !== t.id) {
        if (root.id !== t.parent) flattened++
        parentId = existingByClickup.get(root.id) ?? null
      }
      if (parentId) { subtasks++; const pp = projectByItem.get(parentId); if (pp) projectId = pp } else orphanSubtasks++
      const ln = t.list?.name ?? '(no list)'
      subtasksByList[ln] = (subtasksByList[ln] ?? 0) + 1
    }
    const row = {
      project_id: projectId,
      parent_id: parentId,
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
    if (dryRun) { if (!existingId) { existingByClickup.set(t.id, `dry-${t.id}`); projectByItem.set(`dry-${t.id}`, projectId) } continue }

    let itemId = existingId
    if (itemId) {
      const { error } = await supabase.from('work_items').update(row).eq('id', itemId)
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    } else {
      const { data, error } = await supabase.from('work_items').insert({ ...row, created_by: userId }).select('id').single()
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      itemId = data.id
      existingByClickup.set(t.id, itemId)
    }
    projectByItem.set(itemId, projectId)
    // Only the difference, so an unchanged task writes nothing.
    const have = assigneeByItem.get(itemId) ?? new Set<string>()
    const want = new Set(people)
    const gone = [...have].filter(u => !want.has(u))
    const added = [...want].filter(u => !have.has(u))
    if (gone.length) {
      const del = await supabase.from('work_item_assignees').delete().eq('work_item_id', itemId).in('user_id', gone)
      if (del.error) throw createError({ statusCode: 500, statusMessage: del.error.message })
    }
    if (added.length) {
      const ins = await supabase.from('work_item_assignees').insert(added.map(user_id => ({ work_item_id: itemId!, user_id })))
      if (ins.error) throw createError({ statusCode: 500, statusMessage: ins.error.message })
    }
    assigneeByItem.set(itemId, want)
  }

  return { dryRun, fetched: tasks.length, created, updated, subtasks, orphanSubtasks, flattened, subtasksByList, skippedExcluded, excludedLists: EXCLUDED_LISTS, assignments, droppedAssignees, skippedNoClient, inCatchAll, createdProjects, unmatchedLists: [...unmatchedLists].sort() }
}

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
