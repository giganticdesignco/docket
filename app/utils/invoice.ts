// One reading of invoice and quote status for every screen. Docket
// invoices are draft, sent, paid, void, or written_off; Harvest's are
// open, paid, or closed, which fold to sent, paid, and written_off.
export type BadgeColor = 'neutral' | 'warning' | 'success' | 'error' | 'info'
export type Badge = { label: string, color: BadgeColor }
type InvoiceLike = { status?: string | null, state?: string | null, due_date: string | null }
type QuoteLike = { status: string, valid_until: string | null }

export const invoiceStatus = (i: Pick<InvoiceLike, 'status' | 'state'>) => {
  const s = i.status ?? i.state ?? ''
  return s === 'open' ? 'sent' : s === 'closed' ? 'written_off' : s
}
export const invoiceOverdue = (i: InvoiceLike, today = todayString()) => invoiceStatus(i) === 'sent' && !!i.due_date && i.due_date < today

// Staff wording is the status word; the portal speaks to the client.
export function invoiceBadge(i: InvoiceLike, today = todayString(), voice: 'staff' | 'client' = 'staff'): Badge {
  const st = invoiceStatus(i)
  if (invoiceOverdue(i, today)) return { label: voice === 'client' ? 'Overdue' : 'overdue', color: 'error' }
  if (st === 'sent') return { label: voice === 'client' ? 'Due' : 'sent', color: 'warning' }
  if (st === 'paid') return { label: voice === 'client' ? 'Paid' : 'paid', color: 'success' }
  if (st === 'written_off') return { label: voice === 'client' ? 'Closed' : 'written off', color: 'neutral' }
  return { label: st, color: 'neutral' }
}

export function quoteBadge(q: QuoteLike, today = todayString(), voice: 'staff' | 'client' = 'staff'): Badge {
  const expired = q.status === 'expired' || (q.status === 'sent' && !!q.valid_until && q.valid_until < today)
  if (voice === 'client') {
    return expired ? { label: 'Expired', color: 'neutral' }
      : q.status === 'sent' ? { label: 'Awaiting your decision', color: 'warning' }
      : q.status === 'accepted' ? { label: 'Accepted', color: 'success' }
      : q.status === 'declined' ? { label: 'Declined', color: 'neutral' }
      : { label: q.status, color: 'neutral' }
  }
  return expired ? { label: 'expired', color: 'error' }
    : q.status === 'sent' ? { label: 'sent', color: 'info' }
    : q.status === 'accepted' ? { label: 'accepted', color: 'success' }
    : { label: q.status, color: 'neutral' }
}

// One row shape for a Docket invoice and a Harvest one, so a list can
// hold both. Harvest's due date can be missing; the issue date stands in.
export type InvoiceRow = { id: string, source: 'docket' | 'harvest', number: string, status: string, subject: string | null, issue_date: string, due_date: string, total: number, due_amount: number, client_id: string | null, client_name: string }
export const invoiceRow = (i: { id: string, number: string, status: string, subject: string | null, issue_date: string, due_date: string, total: number, due_amount: number, client_id?: string | null, clients?: { name: string } | null }): InvoiceRow =>
  ({ id: i.id, source: 'docket', number: i.number, status: i.status, subject: i.subject, issue_date: i.issue_date, due_date: i.due_date, total: i.total, due_amount: i.due_amount, client_id: i.client_id ?? null, client_name: i.clients?.name ?? '' })
export const harvestInvoiceRow = (i: { id: string, number: string, state: string, subject: string | null, issue_date: string, due_date: string | null, amount: number, due_amount: number, client_id?: string | null, client_name?: string | null }): InvoiceRow =>
  ({ id: i.id, source: 'harvest', number: i.number, status: invoiceStatus({ state: i.state }), subject: i.subject, issue_date: i.issue_date, due_date: i.due_date ?? i.issue_date, total: i.amount, due_amount: i.due_amount, client_id: i.client_id ?? null, client_name: i.client_name ?? '' })
