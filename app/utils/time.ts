// Calendar dates are 'YYYY-MM-DD' strings in the browser's local zone, the
// same shape as the `date` columns. Weeks start on Monday and hours display
// as h:mm, both matching the Harvest account settings.

export function toDateString(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function todayString(): string {
  return toDateString(new Date())
}

export function parseDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

export function addDays(s: string, n: number): string {
  const d = parseDateString(s)
  d.setDate(d.getDate() + n)
  return toDateString(d)
}

// First and last day of the month containing `s`.
export function startOfMonth(s: string): string {
  return s.slice(0, 8) + '01'
}
export function endOfMonth(s: string): string {
  const d = parseDateString(s)
  return toDateString(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

// Monday through Sunday of the week containing `s`.
export function weekDays(s: string): string[] {
  const offset = (parseDateString(s).getDay() + 6) % 7
  const monday = addDays(s, -offset)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

const fmt = (s: string, opts: Intl.DateTimeFormatOptions) => parseDateString(s).toLocaleDateString('en-US', opts)
export const dayName = (s: string) => fmt(s, { weekday: 'short' })
export const shortDate = (s: string) => fmt(s, { month: 'short', day: 'numeric' })
export const longDate = (s: string) => fmt(s, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// 1.5 -> '1:30'
export function formatHours(h: number): string {
  const minutes = Math.round(h * 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}

// '1:30' or '1.5' -> 1.5. Null when the text is not a time.
export function parseHours(input: string): number | null {
  const s = input.trim()
  const hm = s.match(/^(\d{1,3}):([0-5]?\d)$/)
  if (hm) return round2(Number(hm[1]) + Number(hm[2]) / 60)
  if (/^(\d{1,3}(\.\d{1,4})?|\.\d{1,4})$/.test(s)) return round2(Number(s))
  return null
}

// Elapsed hours from an ISO timestamp to `now` (ms). Never negative.
export function hoursSince(iso: string, now: number): number {
  return Math.max(0, now - new Date(iso).getTime()) / 3_600_000
}
