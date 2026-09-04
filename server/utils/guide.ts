// The user guide as the assistant's manual. docs/guide.md is what /help
// renders and what every change to a screen or rule updates, so the
// assistant answers "how does X work" from the same words the team reads.
// Sections are split on headings and ranked by how many of the
// question's words appear in them, the title counting double.
type Section = { title: string, path: string, text: string }

const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'what', 'how', 'does', 'is', 'are', 'it', 'to', 'of', 'in', 'on', 'an', 'a', 'do', 'i', 'my', 'we', 'you', 'work', 'works', 'mean', 'means', 'docket'])
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w))
// Only a trailing s comes off, so "invoice" and "invoices" meet without
// "one" losing its e. Both sides are stemmed the same way.
const stem = (w: string) => (w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)

let cache: Section[] | null = null
export async function guideSections(): Promise<Section[]> {
  if (cache) return cache
  const guide = (await useStorage('assets:docs').getItem<string>('guide.md')) ?? ''
  const out: Section[] = []
  let h2 = ''
  let cur: Section | null = null
  for (const line of guide.split('\n')) {
    const m = line.match(/^(##|###) (.*)$/)
    if (m) {
      if (cur) out.push(cur)
      if (m[1] === '##') h2 = m[2]!
      const title = m[1] === '##' ? m[2]! : `${h2}: ${m[2]}`
      cur = { title, path: `/help#${m[2]!.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`, text: '' }
    } else if (cur) {
      cur.text += `${line}\n`
    }
  }
  if (cur) out.push(cur)
  cache = out.map(s => ({ ...s, text: s.text.trim() })).filter(s => s.text)
  return cache
}

export async function searchGuide(question: string, limit = 3): Promise<Section[]> {
  const qs = [...new Set(words(question).map(stem))]
  if (!qs.length) return []
  const scored = (await guideSections()).map((s) => {
    const title = new Set(words(s.title).map(stem))
    const body = words(s.text).map(stem)
    let score = 0
    for (const q of qs) {
      if (title.has(q)) score += 3
      const n = body.filter(w => w === q).length
      score += Math.min(n, 5)
    }
    return { s, score }
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(x => ({ ...x.s, text: x.s.text.slice(0, 2500) }))
}
