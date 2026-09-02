import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database'
import type { ReviewDoc } from '~~/shared/types/review'

export const REVIEW_TOKEN = /^[0-9a-f]{64}$/

// The client's view of a task: uploaded files (never server links) with
// signed URLs, and only comments a client may see. Service role, because
// the reader is not signed in; the token is the only credential.
export async function loadReviewDoc(admin: SupabaseClient<Database>, token: string): Promise<ReviewDoc | null> {
  if (!REVIEW_TOKEN.test(token)) return null
  const { data: item, error } = await admin
    .from('work_items')
    .select('id, title, description, status, due_on, client_decision, client_decision_by, client_decision_at, updated_at, projects(name, clients(name))')
    .eq('public_token', token)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!item) return null

  const [files, comments, settings] = await Promise.all([
    admin.from('work_item_files').select('id, file_name, size_bytes, content_type, path, created_at').eq('work_item_id', item.id).eq('kind', 'upload').order('created_at'),
    admin.from('work_item_comments').select('id, author_id, author_name, body, created_at, visible_to_client, profiles(full_name)').eq('work_item_id', item.id).order('created_at'),
    admin.from('invoice_settings').select('company_name, company_email').eq('id', true).single(),
  ])
  for (const r of [files, comments, settings]) {
    if (r.error) throw createError({ statusCode: 500, statusMessage: r.error.message })
  }

  const paths = (files.data ?? []).map(f => f.path!).filter(Boolean)
  const signed = paths.length ? await admin.storage.from('work-files').createSignedUrls(paths, 3600) : { data: [], error: null }
  if (signed.error) throw createError({ statusCode: 500, statusMessage: signed.error.message })
  const urlByPath = new Map((signed.data ?? []).map(s => [s.path, s.signedUrl]))

  return {
    task: {
      id: item.id,
      title: item.title,
      description: item.description,
      status: item.status,
      due_on: item.due_on,
      client_decision: item.client_decision as ReviewDoc['task']['client_decision'],
      client_decision_by: item.client_decision_by,
      client_decision_at: item.client_decision_at,
      updated_at: item.updated_at,
    },
    project: { name: item.projects?.name ?? '' },
    client: { name: item.projects?.clients?.name ?? '' },
    company: { name: settings.data?.company_name ?? 'Gigantic Design Co.', email: settings.data?.company_email ?? null },
    files: (files.data ?? [])
      .filter(f => f.path && urlByPath.get(f.path))
      .map(f => ({ id: f.id, file_name: f.file_name, size_bytes: f.size_bytes, content_type: f.content_type, url: urlByPath.get(f.path!)!, created_at: f.created_at })),
    comments: (comments.data ?? [])
      .filter(c => c.author_id == null || c.visible_to_client)
      .map(c => ({ id: c.id, author: c.author_id ? (c.profiles?.full_name ?? 'Gigantic') : (c.author_name ?? 'Client'), is_client: c.author_id == null, body: c.body, created_at: c.created_at })),
  }
}

// Shared by the comment and decision routes: the task behind a token, or 404.
export async function reviewTask(admin: SupabaseClient<Database>, token: string) {
  if (!REVIEW_TOKEN.test(token)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const { data, error } = await admin.from('work_items').select('id, title, status, projects(name, clients(name))').eq('public_token', token).maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return data
}

export function cleanName(name: unknown): string {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ')
  if (n.length < 2 || n.length > 80) throw createError({ statusCode: 400, statusMessage: 'Give your name (2 to 80 characters)' })
  return n
}
export function cleanBody(body: unknown, required: boolean): string {
  const b = String(body ?? '').trim()
  if (required && !b) throw createError({ statusCode: 400, statusMessage: 'Write something first' })
  if (b.length > 4000) throw createError({ statusCode: 400, statusMessage: 'Keep it under 4000 characters' })
  return b
}
