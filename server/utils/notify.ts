import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database'

// Email through Resend. The key and sender live in Vault, read with the
// service role. Returns instead of throwing so a failed email never breaks
// the action that triggered it.
export async function sendEmail(
  admin: SupabaseClient<Database>,
  opts: { to: string[], subject: string, text: string, html?: string, replyTo?: string },
): Promise<{ ok: boolean, error?: string }> {
  const to = [...new Set(opts.to.filter(Boolean))]
  if (!to.length) return { ok: false, error: 'No recipients' }
  const [{ data: key }, { data: fromSecret }] = await Promise.all([
    admin.rpc('vault_secret', { p_name: 'resend_api_key' }),
    admin.rpc('vault_secret', { p_name: 'resend_from' }),
  ])
  if (!key) return { ok: false, error: 'resend_api_key is not in Vault' }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromSecret ?? 'Docket <onboarding@resend.dev>',
      to,
      subject: opts.subject,
      text: opts.text,
      ...(opts.html ? { html: opts.html } : {}),
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
    }),
  })
  if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` }
  return { ok: true }
}

// Tell the people on a task (assignees plus whoever made it) that a client
// did something on its review link.
export async function notifyTaskTeam(admin: SupabaseClient<Database>, workItemId: string, subject: string, text: string) {
  const [{ data: item }, { data: assignees }] = await Promise.all([
    admin.from('work_items').select('profiles!work_items_created_by_fkey(email, is_active)').eq('id', workItemId).single(),
    admin.from('work_item_assignees').select('profiles(email, is_active)').eq('work_item_id', workItemId),
  ])
  const emails = [
    ...(assignees ?? []).map(a => a.profiles).filter(p => p?.is_active).map(p => p!.email),
    ...(item?.profiles?.is_active ? [item.profiles.email] : []),
  ]
  return sendEmail(admin, { to: emails, subject, text })
}

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
