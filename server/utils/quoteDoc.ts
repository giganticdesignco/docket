import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database'
import type { QuoteDoc, SitemapNode } from '~~/shared/types/quote'

export const QUOTE_TOKEN = /^[0-9a-f]{64}$/

// The quote as the client sees it. The caller picks the client: service
// role for /q/<token>, the signed-in admin (through RLS) for previews.
export async function loadQuoteDoc(supabase: SupabaseClient<Database>, where: { id?: string, token?: string }): Promise<QuoteDoc | null> {
  if (where.token && !QUOTE_TOKEN.test(where.token)) return null
  let q = supabase.from('quotes').select('*, clients(name)')
  q = where.token ? q.eq('public_token', where.token) : q.eq('id', where.id!)
  const { data: quote, error } = await q.maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!quote) return null

  const [lines, nodes, settings] = await Promise.all([
    supabase.from('quote_line_items').select('id, description, hours, rate, amount, tasks(name)').eq('quote_id', quote.id).order('sort_order').order('created_at'),
    supabase.from('quote_sitemap_nodes').select('id, parent_id, line_item_id, sort_order, title, path, template, notes').eq('quote_id', quote.id).order('sort_order').order('created_at'),
    supabase.from('invoice_settings').select('company_name, company_address, company_email, company_phone').eq('id', true).single(),
  ])
  for (const r of [lines, nodes, settings]) {
    if (r.error) throw createError({ statusCode: 500, statusMessage: r.error.message })
  }

  const pagesByLine = new Map<string, number>()
  for (const n of nodes.data ?? []) {
    if (n.line_item_id) pagesByLine.set(n.line_item_id, (pagesByLine.get(n.line_item_id) ?? 0) + 1)
  }
  const byParent = new Map<string | null, typeof nodes.data>()
  for (const n of nodes.data ?? []) {
    const list = byParent.get(n.parent_id) ?? []
    list.push(n)
    byParent.set(n.parent_id, list)
  }
  const build = (parent: string | null): SitemapNode[] => (byParent.get(parent) ?? []).map(n => ({
    id: n.id, title: n.title, path: n.path, template: n.template, notes: n.notes, line_item_id: n.line_item_id, children: build(n.id),
  }))

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  return {
    quote: {
      id: quote.id,
      number: quote.number,
      title: quote.title,
      status: quote.status,
      intro: quote.intro,
      terms: quote.terms,
      valid_until: quote.valid_until,
      subtotal: quote.subtotal,
      accepted_at: quote.accepted_at,
      accepted_by: quote.accepted_by,
      declined_at: quote.declined_at,
      declined_by: quote.declined_by,
      decline_reason: quote.decline_reason,
      created_at: quote.created_at,
    },
    client: { name: quote.clients?.name ?? '' },
    company: {
      name: settings.data?.company_name ?? 'Gigantic Design Co.',
      address: settings.data?.company_address ?? null,
      email: settings.data?.company_email ?? null,
      phone: settings.data?.company_phone ?? null,
    },
    lines: (lines.data ?? []).map(l => ({ id: l.id, description: l.description, hours: l.hours, rate: l.rate, amount: l.amount, task: l.tasks?.name ?? null, pages: pagesByLine.get(l.id) ?? 0 })),
    sitemap: build(null),
    expired: quote.status === 'sent' && !!quote.valid_until && quote.valid_until < today,
  }
}

export function cleanQuoteName(name: unknown): string {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ')
  if (n.length < 2 || n.length > 120) throw createError({ statusCode: 400, statusMessage: 'Type your full name (2 to 120 characters)' })
  return n
}
