// A site plan's pages as a tree, walked the same way by the plan screen,
// the quote editor's pricing, and the client's quote document. A page
// takes its template's parts (Content, Design, Development, or whatever
// the template lists) and can type over any part's hours; 0 skips it.

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

export type PartHours = Record<string, number | string>
export type PartLike = { id: string, hours: number | string }
export type TemplateLike = { id: string, parts: PartLike[] }
type PageLike = { template_id: string | null, part_hours: unknown }

// The hours a page typed, keyed by part id, whatever the column came back as.
export function typedHours(page: { part_hours: unknown }): PartHours {
  const v = page.part_hours
  return v && typeof v === 'object' && !Array.isArray(v) ? v as PartHours : {}
}

// A part's hours on a page: what the page typed, else the template's. 0 skips it.
export function partHours(page: { part_hours: unknown }, part: PartLike): number {
  const typed = typedHours(page)[part.id]
  return typed !== undefined && typed !== '' ? Number(typed) : Number(part.hours)
}

// A page's parts in the template's order, with this page's hours for each.
export function pageParts<P extends PartLike>(page: PageLike, templateById: Map<string, { parts: P[] }>): { part: P, hours: number }[] {
  const t = page.template_id ? templateById.get(page.template_id) : undefined
  return (t?.parts ?? []).map(part => ({ part, hours: partHours(page, part) }))
}

// A page's hours: its parts added up.
export function pageHours(page: PageLike, templateById: Map<string, TemplateLike>): number {
  return pageParts(page, templateById).reduce((s, x) => s + x.hours, 0)
}

// What a page saves: typed numbers only, for parts its template has.
export function cleanPartHours(page: PageLike, templateById: Map<string, TemplateLike>): Record<string, number> {
  const typed = typedHours(page)
  const out: Record<string, number> = {}
  for (const { part } of pageParts(page, templateById)) {
    const v = typed[part.id]
    if (v === undefined || v === '') continue
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0 && n <= 9999) out[part.id] = n
  }
  return out
}

// Pages grouped by template (templates not in the list count as untyped),
// most hours first. The plan screen's summary and the quote's plan card use it.
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

// One entry per template per part for "Price the plan": the pages on that
// template that do not skip the part, and their hours for it. Templates
// in the order given, parts in each template's order.
export function groupParts<P extends PageLike, T extends TemplateLike>(pages: P[], templates: T[]): { template: T, part: T['parts'][number], pages: P[], hours: number }[] {
  const out: { template: T, part: T['parts'][number], pages: P[], hours: number }[] = []
  for (const template of templates) {
    const on = pages.filter(p => p.template_id === template.id)
    if (!on.length) continue
    for (const part of template.parts) {
      const using = on.filter(p => partHours(p, part) > 0)
      if (using.length) out.push({ template, part, pages: using, hours: using.reduce((s, p) => s + partHours(p, part), 0) })
    }
  }
  return out
}
