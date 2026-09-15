// A site plan's pages as a tree, walked the same way by the plan screen,
// the quote editor's pricing, and the client's quote document.

// Parents before children, siblings in the order given (load pages ordered
// by sort_order, then created_at). Pages whose parent is missing are left
// out, as the canvas does.
export function flattenPages<T extends { id: string, parent_id: string | null }>(pages: T[]): { page: T, depth: number }[] {
  const byParent = new Map<string | null, T[]>()
  for (const p of pages) byParent.set(p.parent_id, [...(byParent.get(p.parent_id) ?? []), p])
  const walk = (parent: string | null, depth: number): { page: T, depth: number }[] =>
    (byParent.get(parent) ?? []).flatMap(p => [{ page: p, depth }, ...walk(p.id, depth + 1)])
  return walk(null, 0)
}

type Hours = number | string | null
type PageLike = { template_id: string | null, hours: Hours }
type TemplateLike = { id: string, hours: number }

// A page's hours: its own, else its template's, else 0.
export function pageHours(page: PageLike, templateById: Map<string, TemplateLike>): number {
  if (page.hours !== null && page.hours !== '') return Number(page.hours)
  return page.template_id ? templateById.get(page.template_id)?.hours ?? 0 : 0
}

// Pages grouped by template (templates not in the list count as untyped),
// most hours first. The plan screen's summary and "Price the plan" use it.
export function groupPages<P extends PageLike, T extends TemplateLike>(pages: P[], templates: T[]): { template: T | null, pages: P[], hours: number }[] {
  const byId = new Map(templates.map(t => [t.id, t]))
  const g = new Map<string | null, { template: T | null, pages: P[], hours: number }>()
  for (const p of pages) {
    const t = p.template_id ? byId.get(p.template_id) ?? null : null
    const e = g.get(t?.id ?? null) ?? { template: t, pages: [], hours: 0 }
    e.pages.push(p)
    e.hours += pageHours(p, byId)
    g.set(t?.id ?? null, e)
  }
  return [...g.values()].sort((a, b) => b.hours - a.hours)
}
