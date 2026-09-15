import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database'
import type { QuoteDoc } from '~~/shared/types/quote'
import { flattenPages } from '~~/shared/sitePlan'

export const QUOTE_TOKEN = /^[0-9a-f]{64}$/

// The quote as the client sees it. The caller picks the client: the service
// role for /q/<token> (the editor preview fetches the same route), the
// signed-in staff member through RLS for send. The page list is chosen here,
// by status, since the service role skips RLS.
export async function loadQuoteDoc(supabase: SupabaseClient<Database>, where: { id?: string, token?: string }): Promise<QuoteDoc | null> {
  if (where.token && !QUOTE_TOKEN.test(where.token)) return null
  let q = supabase.from('quotes').select('*, clients(name), site_plans(client_id)')
  q = where.token ? q.eq('public_token', where.token) : q.eq('id', where.id!)
  const { data: quote, error } = await q.maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!quote) return null

  // Accepted quotes read the copy frozen at acceptance. Others read the
  // linked plan live, but only a plan of the quote's own client.
  type Page = { title: string, path: string | null, template: string | null, template_id: string | null, depth: number }
  const loadPages = async (): Promise<Page[]> => {
    if (quote.status === 'accepted') {
      const { data, error } = await supabase.from('quote_pages').select('title, path, template, template_id, depth').eq('quote_id', quote.id).order('sort_order')
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      return data ?? []
    }
    if (!quote.site_plan_id || quote.site_plans?.client_id !== quote.client_id) return []
    const { data, error } = await supabase.from('site_plan_pages').select('id, parent_id, title, path, template, template_id').eq('plan_id', quote.site_plan_id).order('sort_order').order('created_at')
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    return flattenPages(data ?? []).map(({ page: p, depth }) => ({ title: p.title, path: p.path, template: p.template, template_id: p.template_id, depth }))
  }

  const [lines, pages, settings] = await Promise.all([
    supabase.from('quote_line_items').select('id, description, hours, rate, amount, template_id, tasks(name)').eq('quote_id', quote.id).order('sort_order').order('created_at'),
    loadPages(),
    supabase.from('invoice_settings').select('company_name, company_address, company_email, company_phone').eq('id', true).single(),
  ])
  for (const r of [lines, settings]) {
    if (r.error) throw createError({ statusCode: 500, statusMessage: r.error.message })
  }

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
      tax_rate: quote.tax_rate,
      tax_amount: quote.tax_amount,
      total: quote.total,
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
    lines: (lines.data ?? []).map(l => ({ id: l.id, description: l.description, hours: l.hours, rate: l.rate, amount: l.amount, task: l.tasks?.name ?? null, pages: l.template_id ? pages.filter(p => p.template_id === l.template_id).length : 0 })),
    pages: pages.map(({ title, path, template, depth }) => ({ title, path, template, depth })),
    expired: quote.status === 'sent' && !!quote.valid_until && quote.valid_until < today,
  }
}

export function cleanQuoteName(name: unknown): string {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ')
  if (n.length < 2 || n.length > 120) throw createError({ statusCode: 400, statusMessage: 'Type your full name (2 to 120 characters)' })
  return n
}
