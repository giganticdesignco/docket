// Print, cut, and signage pricing, ported from estimator.giganticdesign.com
// (estimator-20220805.js). A job is a size in inches, a quantity, and a
// stack of materials. Each material is a roll or sheet with a cost, so
// its cost per square inch is cost / (width x length). Each layer then
// gets its own markup rule, exactly as the old tool did:
//
//   primary, printable   (media + ink) per sq in x job sq in x material markup
//   primary, cut vinyl   media per sq in x 3.5 x job sq in
//   overlaminate         media x material markup x job sq in
//   transfer tape        media x default markup (9.25) x job sq in
//   substrate            media x 2.5 x job sq in
//   banner tape          perimeter in x media x default markup
//   mounting tape        height x tape width x columns x media x 1.25
//
// One deliberate difference: banner and mounting tape are multiplied by
// the quantity here. The old tool priced them for one unit only.
// "No markup" prices everything at cost for an internal view.

export type MaterialType = 'Print Vinyl' | 'Cut Vinyl' | 'Overlaminate' | 'Transfer Tape' | 'Banner Tape' | 'Substrate' | 'Mounting Tape'
export type Material = {
  id: string
  name: string
  types: string[]
  width_in: number
  length_in: number
  cost: number
  markup_pct: number   // 925 means 9.25x
  printable: boolean
}
export type EstimatorSettings = {
  ink_sq_in_cost: number
  default_markup: number
  cut_vinyl_markup: number
  substrate_markup: number
  mounting_tape_markup: number
}
export const DEFAULT_SETTINGS: EstimatorSettings = { ink_sq_in_cost: 0.0016099, default_markup: 9.25, cut_vinyl_markup: 3.5, substrate_markup: 2.5, mounting_tape_markup: 1.25 }

export type Layer = 'primary' | 'overlam' | 'transfertape' | 'bannertape' | 'substrate' | 'mountingtape'
export const LAYERS: { key: Layer, label: string, types: MaterialType[] }[] = [
  { key: 'primary', label: 'Primary material', types: ['Print Vinyl', 'Cut Vinyl'] },
  { key: 'overlam', label: 'Overlaminate', types: ['Overlaminate'] },
  { key: 'transfertape', label: 'Transfer tape', types: ['Transfer Tape'] },
  { key: 'bannertape', label: 'Banner tape', types: ['Banner Tape'] },
  { key: 'substrate', label: 'Substrate', types: ['Substrate'] },
  { key: 'mountingtape', label: 'Mounting tape', types: ['Mounting Tape'] },
]

export type JobInput = {
  width: number
  height: number
  quantity: number
  mountingColumns: number
  materials: Partial<Record<Layer, Material | null>>
  noMarkup?: boolean
}
export type LayerPrice = { layer: Layer, material: Material, mediaCost: number, price: number, perUnit: number }
export type JobPrice = {
  sqInPerUnit: number
  sqFtPerUnit: number
  sqInTotal: number
  layers: LayerPrice[]
  ink: number
  mediaCost: number     // what the materials cost us, all layers
  total: number         // what the client pays
  perUnit: number
  perSqFt: number
}

const perSqIn = (m: Material) => (m.width_in * m.length_in > 0 ? m.cost / (m.width_in * m.length_in) : 0)

export function priceJob(job: JobInput, s: EstimatorSettings = DEFAULT_SETTINGS): JobPrice {
  const w = Math.max(0, Number(job.width) || 0)
  const h = Math.max(0, Number(job.height) || 0)
  const qty = Math.max(1, Math.floor(Number(job.quantity) || 1))
  const cols = Math.max(0, Number(job.mountingColumns) || 0)
  const markup = job.noMarkup ? 1 : s.default_markup
  const sqInPerUnit = w * h
  const sqInTotal = sqInPerUnit * qty
  const perimeter = (w * 2 + h * 2) * qty
  const layers: LayerPrice[] = []
  let ink = 0
  let mediaCost = 0

  const add = (layer: Layer, m: Material, media: number, price: number) => {
    layers.push({ layer, material: m, mediaCost: round2(media), price: round2(price), perUnit: round2(price / qty) })
    mediaCost += media
  }
  const p = job.materials.primary
  if (p) {
    const media = sqInTotal * perSqIn(p)
    if (p.printable) {
      ink = sqInTotal * s.ink_sq_in_cost
      const mk = job.noMarkup ? 1 : p.markup_pct / 100
      add('primary', p, media, sqInTotal * (perSqIn(p) + s.ink_sq_in_cost) * mk)
    } else {
      add('primary', p, media, media * (job.noMarkup ? 1 : s.cut_vinyl_markup))
    }
  }
  const o = job.materials.overlam
  if (o) add('overlam', o, sqInTotal * perSqIn(o), sqInTotal * perSqIn(o) * (job.noMarkup ? 1 : o.markup_pct / 100))
  const t = job.materials.transfertape
  if (t) add('transfertape', t, sqInTotal * perSqIn(t), sqInTotal * perSqIn(t) * markup)
  const sub = job.materials.substrate
  if (sub) add('substrate', sub, sqInTotal * perSqIn(sub), sqInTotal * perSqIn(sub) * (job.noMarkup ? 1 : s.substrate_markup))
  const b = job.materials.bannertape
  if (b) add('bannertape', b, perimeter * perSqIn(b), perimeter * perSqIn(b) * markup)
  const mt = job.materials.mountingtape
  if (mt && cols > 0) {
    const inches = h * mt.width_in * cols * qty
    add('mountingtape', mt, inches * perSqIn(mt), inches * perSqIn(mt) * (job.noMarkup ? 1 : s.mounting_tape_markup))
  }
  const total = layers.reduce((sum, l) => sum + l.price, 0)
  return {
    sqInPerUnit, sqFtPerUnit: sqInPerUnit / 144, sqInTotal, layers, ink: round2(ink), mediaCost: round2(mediaCost + ink),
    total: round2(total), perUnit: round2(total / qty), perSqFt: sqInPerUnit > 0 ? round2(total / qty / (sqInPerUnit / 144)) : 0,
  }
}

export const round2 = (n: number) => Math.round(n * 100) / 100

// One line of a quote or invoice for a priced job.
export function describeJob(job: JobInput, price: JobPrice): string {
  const parts = [`${job.quantity} x ${trim(job.width)}in x ${trim(job.height)}in`]
  const p = job.materials.primary
  if (p) parts.push(shortName(p.name))
  const extras = LAYERS.filter(l => l.key !== 'primary' && job.materials[l.key]).map(l => l.label.toLowerCase())
  if (extras.length) parts.push(`with ${extras.join(', ')}`)
  return `${parts.join(', ')} (${money(price.perUnit)} each)`
}
const trim = (n: number) => String(Math.round(n * 100) / 100)
const shortName = (name: string) => name.split(' / ').slice(0, 3).join(' / ').trim()
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
