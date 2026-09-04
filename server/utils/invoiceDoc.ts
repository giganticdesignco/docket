import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database'
import type { InvoiceDoc } from '~~/shared/types/invoice'

// Assemble the document for one invoice. The caller decides who the
// client is: the service role for the public page, the signed-in admin
// (through RLS) for email.
export async function loadInvoiceDoc(supabase: SupabaseClient<Database>, where: { id?: string, token?: string }): Promise<InvoiceDoc | null> {
  let q = supabase.from('invoices').select('*, clients(name)')
  q = where.token ? q.eq('public_token', where.token) : q.eq('id', where.id!)
  const { data: inv, error } = await q.maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!inv) return null

  const [lines, payments, settings, time, expenses] = await Promise.all([
    supabase.from('invoice_lines').select('id, kind, description, quantity, unit_price, amount, taxable').eq('invoice_id', inv.id).order('position'),
    supabase.from('invoice_payments').select('id, paid_on, amount, method, reference').eq('invoice_id', inv.id).order('paid_on'),
    supabase.from('invoice_settings').select('company_name, company_address, company_email, company_phone, payment_instructions').eq('id', true).single(),
    inv.batch_id
      ? supabase.from('time_detail').select('spent_on, user_name, project_name, task_name, hours, notes').eq('batch_id', inv.batch_id).order('spent_on').order('user_name')
      : Promise.resolve({ data: [], error: null }),
    inv.batch_id
      ? supabase.from('expenses').select('spent_on, amount, notes, projects(name), expense_categories(name), profiles!expenses_user_id_fkey(full_name)').eq('batch_id', inv.batch_id).order('spent_on')
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const r of [lines, payments, settings, time, expenses]) {
    if (r.error) throw createError({ statusCode: 500, statusMessage: r.error.message })
  }

  return {
    invoice: {
      id: inv.id,
      number: inv.number,
      status: inv.status,
      subject: inv.subject,
      notes: inv.notes,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      tax_rate: inv.tax_rate,
      subtotal: inv.subtotal,
      tax_amount: inv.tax_amount,
      total: inv.total,
      paid_amount: inv.paid_amount,
      due_amount: inv.due_amount,
      public_token: inv.public_token,
    },
    client: { name: inv.clients?.name ?? '' },
    settings: settings.data!,
    lines: (lines.data ?? []).map(l => ({ ...l, amount: l.amount ?? 0 })),
    payments: payments.data ?? [],
    detail: {
      time: (time.data ?? []).map(t => ({
        spent_on: t.spent_on!, user_name: t.user_name ?? '', project_name: t.project_name ?? '', task_name: t.task_name ?? '', hours: t.hours ?? 0, notes: t.notes,
      })),
      expenses: (expenses.data ?? []).map(e => ({
        spent_on: e.spent_on, user_name: e.profiles?.full_name ?? '', project_name: e.projects?.name ?? '', category_name: e.expense_categories?.name ?? '', amount: e.amount, notes: e.notes,
      })),
    },
  }
}
