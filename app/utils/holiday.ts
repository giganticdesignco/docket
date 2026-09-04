// The day, when it is one worth a nod. Local time, since the team is
// in one place.
export function holiday(d = new Date()): 'halloween' | 'newyear' | null {
  const m = d.getMonth() + 1
  const day = d.getDate()
  if (m === 10 && day === 31) return 'halloween'
  if (m === 1 && day === 1) return 'newyear'
  return null
}
