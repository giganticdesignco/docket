// Build a CSV from the rows a report shows and hand it to the browser as a
// download. Numbers go out plain (no $ or thousands separators) so
// spreadsheets sum them; dates stay YYYY-MM-DD.

export type CsvColumn = { key: string, label: string, kind?: 'hours' | 'money' | 'text' | 'date' }

export function useCsv() {
  function cell(v: unknown): string {
    if (v == null) return ''
    const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  function toCsv(columns: CsvColumn[], rows: Record<string, unknown>[], totals?: Record<string, number>): string {
    const lines = [columns.map(c => cell(c.label)).join(',')]
    for (const r of rows) lines.push(columns.map(c => cell(r[c.key])).join(','))
    if (totals) {
      lines.push(columns.map((c, i) => (i === 0 ? 'Total' : cell(totals[c.key]))).join(','))
    }
    return lines.join('\r\n') + '\r\n'
  }

  function download(filename: string, text: string) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return { toCsv, download }
}
