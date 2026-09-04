// The totals strip: the same stats and the same "vs last year" reading
// on the Reports page and in ReportRollup on a client, project, or
// person page.
export type RollupRow = { hours: number | string, billable_hours: number | string, billable_amount: number | string, uninvoiced_amount: number | string, expenses: number | string }
export type RollupStat = { label: string, value: string, now: number, then: number | null }

// h:mm like the rest of the app, with a thousands separator since a
// year of everyone's time runs to five figures.
export const hoursText = (h: number) => formatHours(h).replace(/^(\d+)/, m => Number(m).toLocaleString())

export function rollupStats(now: RollupRow | null | undefined, then: RollupRow | null | undefined, opts: { kind?: 'time' | 'expenses', money?: boolean } = {}): RollupStat[] {
  if (!now) return []
  const s = (label: string, k: keyof RollupRow, fmt: (n: number) => string): RollupStat => ({ label, value: fmt(Number(now[k])), now: Number(now[k]), then: then ? Number(then[k]) : null })
  if (opts.kind === 'expenses') return [s('Expenses', 'expenses', money0), s('Billable expenses', 'billable_amount', money0), s('Uninvoiced expenses', 'uninvoiced_amount', money0)]
  const base = [s('Hours', 'hours', hoursText), s('Billable hours', 'billable_hours', hoursText)]
  if (opts.money === false) return base
  return [...base, s('Billable amount', 'billable_amount', money0), s('Uninvoiced', 'uninvoiced_amount', money0), s('Expenses', 'expenses', money0)]
}

// A period still in progress compares against the same days last year.
export function rollupDelta(st: RollupStat, to: string): { text: string, color: string } | null {
  if (st.then == null) return null
  if (!st.then) return { text: 'nothing last year', color: 'text-muted' }
  const pct = Math.round((st.now - st.then) / st.then * 100)
  const toDate = to > todayString() ? ' to date' : ''
  return { text: `${pct >= 0 ? '+' : ''}${pct}% vs last year${toDate}`, color: pct >= 0 ? 'text-success' : 'text-error' }
}
