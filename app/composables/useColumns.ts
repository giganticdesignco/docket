// Columns a table lets each person arrange: sort by any column, drag
// headers into a new order, hide the ones they do not need. Saved per
// person per table through useViewState, so it follows them around.
//
//   const cols = await useColumns('projects', [
//     { key: 'name', label: 'Project', sort: r => r.name },
//     { key: 'budget', label: 'Budget', align: 'right', sort: r => r.budget_amount, hidden: true },
//   ])
//   <TableHead :cols="cols" />           renders the thead
//   <td v-for="c in cols.visible" ...>   the page renders each cell by c.key
//   cols.sorted(rows)                    the rows in the chosen order

export type ColumnDef<Row> = {
  key: string
  label: string
  /** Value to sort by; omit for an unsortable column. */
  sort?: (row: Row) => string | number | null | undefined
  align?: 'left' | 'right'
  /** Hidden until someone turns it on. */
  hidden?: boolean
  /** Cannot be hidden (the row's name, usually). */
  always?: boolean
  /** Extra classes for the th. */
  class?: string
}
export type SortState = { key: string, dir: 'asc' | 'desc' } | null

export async function useColumns<Row>(key: string, defs: ColumnDef<Row>[]) {
  const view = await useViewState(`columns:${key}`, {
    order: defs.map(d => d.key),
    hidden: defs.filter(d => d.hidden).map(d => d.key),
    sort: null as SortState,
  })
  const byKey = new Map(defs.map(d => [d.key, d]))
  // Columns the page has since added or removed do not break a saved order.
  const order = computed(() => [...view.order.filter(k => byKey.has(k)), ...defs.map(d => d.key).filter(k => !view.order.includes(k))])
  const all = computed(() => order.value.map(k => byKey.get(k)!))
  const visible = computed(() => all.value.filter(d => d.always || !view.hidden.includes(d.key)))
  const isHidden = (k: string) => view.hidden.includes(k)
  const toggle = (k: string) => { view.hidden = isHidden(k) ? view.hidden.filter(x => x !== k) : [...view.hidden, k] }
  const move = (from: string, to: string) => {
    if (from === to) return
    const o = order.value.filter(k => k !== from)
    o.splice(o.indexOf(to), 0, from)
    view.order = o
  }
  // Click a header: sort ascending, again for descending, again to clear.
  const toggleSort = (k: string) => {
    if (!byKey.get(k)?.sort) return
    const s = view.sort
    view.sort = !s || s.key !== k ? { key: k, dir: 'asc' } : s.dir === 'asc' ? { key: k, dir: 'desc' } : null
  }
  const sorted = (rows: Row[]) => {
    const s = view.sort
    const d = s && byKey.get(s.key)
    if (!s || !d?.sort) return rows
    const sign = s.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = d.sort!(a), y = d.sort!(b)
      // Blanks last either way.
      if (x == null || x === '') return y == null || y === '' ? 0 : 1
      if (y == null || y === '') return -1
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' })) * sign
    })
  }
  const reset = () => view.$reset()
  return reactive({ defs, all, visible, sort: computed(() => view.sort), isHidden, toggle, move, toggleSort, sorted, reset })
}
export type Columns<Row = unknown> = Awaited<ReturnType<typeof useColumns<Row>>>
