// Thin ClickUp API v2 client. Token and workspace id come from runtime
// config (NUXT_CLICKUP_TOKEN, NUXT_CLICKUP_TEAM_ID); nothing ClickUp
// related runs in the browser.

export type ClickUpTask = {
  id: string
  name: string
  status: { status: string } | null
  date_created: string | null
  start_date: string | null   // epoch ms as a string
  due_date: string | null     // epoch ms as a string
  time_estimate: number | null // ms
  assignees: { id: number, username: string, email: string | null }[]
  list: { id: string, name: string } | null
  folder: { id: string, name: string } | null
  space: { id: string } | null
  url: string
  parent: string | null
}

const BASE = 'https://api.clickup.com/api/v2'

function clickupConfig() {
  const { clickupToken: token, clickupTeamId: team } = useRuntimeConfig()
  if (!token || !team) {
    throw createError({ statusCode: 500, statusMessage: 'NUXT_CLICKUP_TOKEN and NUXT_CLICKUP_TEAM_ID are not set on the server' })
  }
  return { token, team }
}

async function clickupGet<T>(path: string, params: Record<string, string | number | boolean>): Promise<T> {
  const { token } = clickupConfig()
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: token, Accept: 'application/json' } })
    if (res.status === 429 && attempt < 5) {
      // 100 requests a minute on the free plan. Wait what it asks for.
      const wait = Number(res.headers.get('Retry-After') ?? 30)
      await new Promise(r => setTimeout(r, wait * 1000))
      continue
    }
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200)
      throw createError({ statusCode: 502, statusMessage: `ClickUp ${res.status} on ${path}: ${text}` })
    }
    return res.json() as Promise<T>
  }
}

// Every open task in the workspace, subtasks included, 100 a page.
export async function clickupOpenTasks(): Promise<ClickUpTask[]> {
  const { team } = clickupConfig()
  const out: ClickUpTask[] = []
  for (let page = 0; ; page++) {
    const data = await clickupGet<{ tasks: ClickUpTask[], last_page?: boolean }>(`/team/${team}/task`, {
      page, include_closed: false, subtasks: true, order_by: 'due_date', reverse: false,
    })
    out.push(...data.tasks)
    if (data.last_page || data.tasks.length === 0) return out
  }
}

// ClickUp dates are epoch milliseconds in strings. Calendar date in Central
// time, since that is where the due dates were set.
export function clickupDate(ms: string | null): string | null {
  if (!ms) return null
  const d = new Date(Number(ms))
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}
