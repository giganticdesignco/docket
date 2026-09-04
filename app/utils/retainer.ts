// Helpers for a retainer_status() row, shared by the Retainer page and
// the client page.
export type RetainerPeriod = {
  client_id: string
  project_id: string | null
  name: string
  basis: string
  used: number
  available: number
  period_start: string
  period_end: string
}

// Periods that chain (same client, project, and name) are one contract.
// This is the same key retainer_status() groups by.
export const retainerChainKey = (r: Pick<RetainerPeriod, 'client_id' | 'project_id' | 'name'>) => `${r.client_id}|${r.project_id ?? ''}|${r.name.toLowerCase()}`
export const retainerQty = (r: Pick<RetainerPeriod, 'basis'>, n: number) => (r.basis === 'hours' ? formatHours(n) : money(n))
export const retainerPct = (r: Pick<RetainerPeriod, 'used' | 'available'>) => (r.available > 0 ? Math.round(r.used / r.available * 100) : 0)
export const burnColor = (p: number) => (p >= 100 ? 'error' : p >= 80 ? 'warning' : 'primary')
export const periodStatus = (r: Pick<RetainerPeriod, 'period_start' | 'period_end'>, today: string) => (r.period_end < today ? 'ended' : r.period_start > today ? 'upcoming' : 'current')
