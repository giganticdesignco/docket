// Thin Harvest API v2 client. The token and account id come from runtime
// config (NUXT_HARVEST_ACCESS_TOKEN, NUXT_HARVEST_ACCOUNT_ID); nothing
// Harvest related runs in the browser.

export type HarvestRef = { id: number, name: string }

export type HarvestTimeEntry = {
  id: number
  spent_date: string
  hours: number
  notes: string | null
  billable: boolean
  billable_rate: number | null
  is_billed: boolean
  is_locked: boolean
  is_running: boolean
  user: HarvestRef
  client: HarvestRef
  project: HarvestRef & { code: string | null }
  task: HarvestRef
}

export type HarvestProject = {
  id: number
  name: string
  code: string | null
  is_active: boolean
  is_billable: boolean
  is_fixed_fee: boolean
  bill_by: 'Project' | 'Tasks' | 'People' | 'none'
  hourly_rate: number | null
  budget: number | null
  budget_by: 'project' | 'project_cost' | 'task' | 'task_fees' | 'person' | 'none'
  cost_budget: number | null
  fee: number | null
  client: HarvestRef
}

export type HarvestExpense = {
  id: number
  spent_date: string
  notes: string | null
  units: number | null
  total_cost: number
  billable: boolean
  is_billed: boolean
  is_locked: boolean
  receipt: { url: string, file_name: string, file_size: number, content_type: string } | null
  user: HarvestRef
  client: HarvestRef
  project: HarvestRef & { code: string | null }
  expense_category: HarvestRef & { unit_price: number | null, unit_name: string | null }
}

export type HarvestInvoiceLine = {
  id: number
  kind: string
  description: string | null
  quantity: number
  unit_price: number
  amount: number
  taxed: boolean
  taxed2: boolean
  project: (HarvestRef & { code: string | null }) | null
}

export type HarvestInvoice = {
  id: number
  number: string
  subject: string | null
  state: 'draft' | 'open' | 'paid' | 'closed'
  issue_date: string
  due_date: string | null
  period_start: string | null
  period_end: string | null
  amount: number
  due_amount: number
  tax_amount: number | null
  discount_amount: number | null
  currency: string | null
  sent_at: string | null
  paid_at: string | null
  paid_date: string | null
  closed_at: string | null
  updated_at: string
  client: HarvestRef
  line_items: HarvestInvoiceLine[]
}

export type HarvestUser = {
  id: number
  email: string
  first_name: string
  last_name: string
  is_active: boolean
}

type Page<K extends string, T> = { [key in K]: T[] } & { next_page: number | null }

const BASE = 'https://api.harvestapp.com/v2'

function harvestHeaders() {
  const { harvestAccessToken: token, harvestAccountId: account } = useRuntimeConfig()
  if (!token || !account) {
    throw createError({ statusCode: 500, statusMessage: 'NUXT_HARVEST_ACCESS_TOKEN and NUXT_HARVEST_ACCOUNT_ID are not set on the server' })
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Harvest-Account-Id': account,
    'User-Agent': 'Docket (https://github.com/giganticdesignco/docket)',
    'Accept': 'application/json',
  }
}

async function harvestGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: harvestHeaders() })
    if (res.status === 429 && attempt < 5) {
      // Harvest allows 100 requests per 15 seconds. Wait what it asks for.
      const wait = Number(res.headers.get('Retry-After') ?? 15)
      await new Promise(r => setTimeout(r, wait * 1000))
      continue
    }
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200)
      throw createError({ statusCode: 502, statusMessage: `Harvest ${res.status} on ${path}: ${text}` })
    }
    return res.json() as Promise<T>
  }
}

async function harvestAll<K extends string, T>(path: string, key: K, params: Record<string, string | number>): Promise<T[]> {
  const out: T[] = []
  let page = 1
  while (true) {
    const data = await harvestGet<Page<K, T>>(path, { ...params, per_page: 100, page })
    out.push(...data[key])
    if (!data.next_page) return out
    page = data.next_page
  }
}

export const harvestTimeEntries = (from: string, to: string) =>
  harvestAll<'time_entries', HarvestTimeEntry>('/time_entries', 'time_entries', { from, to })

export const harvestExpenses = (from: string, to: string) =>
  harvestAll<'expenses', HarvestExpense>('/expenses', 'expenses', { from, to })

// Invoices need a token from a Harvest administrator (or invoice access
// on a manager token); otherwise Harvest answers 403.
export const harvestInvoices = () =>
  harvestAll<'invoices', HarvestInvoice>('/invoices', 'invoices', {})

export const harvestProjects = () =>
  harvestAll<'projects', HarvestProject>('/projects', 'projects', {})

// Listing users needs Harvest admin rights; a manager token gets 403. In that
// case return nothing and let the caller match people by name instead.
export async function harvestUsers(): Promise<HarvestUser[]> {
  try {
    return await harvestAll<'users', HarvestUser>('/users', 'users', {})
  } catch (e) {
    if (String((e as Error).message).startsWith('Harvest 403')) return []
    throw e
  }
}

// Receipt files sit behind the same token as the API. Harvest redirects to
// a signed file link; fetch follows that on its own.
export async function harvestReceipt(url: string): Promise<{ bytes: ArrayBuffer, contentType: string }> {
  const res = await fetch(url, { headers: harvestHeaders() })
  if (!res.ok) throw new Error(`Harvest ${res.status} fetching receipt`)
  return { bytes: await res.arrayBuffer(), contentType: res.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream' }
}

export const round2 = (n: number) => Math.round(n * 100) / 100

export function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

// 'YYYY-MM' -> last day of that month as 'YYYY-MM-DD'.
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10)
}
