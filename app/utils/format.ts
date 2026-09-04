// Formatters shared by every screen. Nuxt auto-imports these, in
// scripts and templates alike.

// Dollars, two places, thousands separators, the minus before the sign.
// Null and undefined print as nothing, so a missing rate shows blank.
export function money(n: number | null | undefined): string {
  if (n == null) return ''
  const v = Number(n)
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Whole dollars, for summaries and rollups.
export function money0(n: number | null | undefined): string {
  if (n == null) return ''
  const v = Math.round(Number(n))
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US')}`
}

// Two letters for an avatar chip.
export function initials(name: string | null | undefined): string {
  return (name ?? '?').split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
}

// The message from a failed $fetch: the server's statusMessage when
// there is one, the error's own message otherwise.
export function apiError(e: unknown): string {
  const err = e as { data?: { statusMessage?: string }, message?: string } | null
  return err?.data?.statusMessage ?? err?.message ?? 'Unknown error'
}
