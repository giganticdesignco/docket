import type { H3Event } from 'h3'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/shared/types/database'
import type { PermissionKey } from '~~/shared/types/app'

// The checks every server route used to write for itself, once each.
// UI convenience the same as everywhere else: RLS is what enforces.

// Vercel crons send CRON_SECRET as a bearer token; nothing else may call
// a cron route.
export function requireCron(event: H3Event) {
  const secret = useRuntimeConfig().cronSecret
  const auth = getHeader(event, 'authorization') ?? ''
  if (!secret || auth !== `Bearer ${secret}`) throw createError({ statusCode: 401, statusMessage: 'Not for you' })
}

// A signed-in team member (never a client contact), with the permission
// when one is named. Returns the caller's Supabase client and profile.
export async function requireStaff(event: H3Event, permission?: PermissionKey) {
  const supabase = await serverSupabaseClient<Database>(event)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw createError({ statusCode: 403, statusMessage: 'Sign in first' })
  const { data: me } = await supabase.from('profiles').select('id, full_name, email, role').eq('id', user.id).single()
  if (!me || me.role === 'client') throw createError({ statusCode: 403, statusMessage: 'Not for client logins' })
  if (permission) {
    const { data: ok } = await supabase.rpc('has_permission', { p_key: permission })
    if (!ok) throw createError({ statusCode: 403, statusMessage: `Needs the ${permission.replace(/_/g, ' ')} permission` })
  }
  return { supabase, user, me }
}

// One to ten valid, distinct email addresses.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function cleanRecipients(to: unknown): string[] {
  const list = [...new Set((Array.isArray(to) ? to : []).map(s => String(s ?? '').trim()).filter(Boolean))]
  if (!list.length || list.length > 10 || list.some(e => !EMAIL.test(e))) {
    throw createError({ statusCode: 400, statusMessage: 'Give one to ten valid email addresses' })
  }
  return list
}

// Every row of a PostgREST query, a thousand at a time.
export async function pageAll<T>(query: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null, error: { message: string } | null }> }): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}
