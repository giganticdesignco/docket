// PostgREST caps a response at 1000 rows; page through until a short
// page comes back. `max` stops a runaway query from hanging the page.
export async function selectAll<T>(
  query: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null, error: { message: string } | null }> },
  max = 100_000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await query.range(from, from + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}
