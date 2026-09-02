import type { Json } from '~~/shared/types/database'

// How you left a screen: view mode, grouping, filters. One row per
// person per screen in user_views, so it follows you between the desktop
// app and the browser. All of a person's rows load once per session;
// each change writes back half a second after the last keystroke.
//
//   const view = await useViewState('tasks', { groupBy: 'status', everyone: false })
//   const groupBy = persisted(view, 'groupBy')   // a ref that saves itself
//
// Anything in the page URL should still win: read the query first and
// fall back to view.<key>.

type State = Record<string, unknown>

const loaded = () => useState<Record<string, State> | null>('user-views', () => null)
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export async function useViewState<T extends State>(key: string, defaults: T): Promise<T & { $reset: () => void }> {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const store = loaded()
  if (!store.value) {
    const { data } = await supabase.from('user_views').select('key, state')
    store.value = Object.fromEntries((data ?? []).map(r => [r.key, (r.state ?? {}) as State]))
  }
  const saved = store.value[key] ?? {}
  // Only keys the page still knows about; an old row never leaks a stale field in.
  const initial = { ...defaults }
  for (const k of Object.keys(defaults)) if (k in saved) (initial as State)[k] = saved[k]

  const view = reactive(initial) as unknown as T & { $reset: () => void }
  const write = () => {
    if (!user.value) return
    const state: State = {}
    for (const k of Object.keys(defaults)) state[k] = toRaw((view as State)[k])
    store.value![key] = state
    clearTimeout(timers.get(key))
    timers.set(key, setTimeout(async () => {
      const { error } = await supabase.from('user_views').upsert({ user_id: user.value!.sub, key, state: state as Json, updated_at: new Date().toISOString() })
      if (error) console.warn('Could not save view', key, error.message)
    }, 500))
  }
  watch(() => Object.keys(defaults).map(k => (view as State)[k]), write, { deep: true })
  Object.defineProperty(view, '$reset', { enumerable: false, value: () => { Object.assign(view, defaults) } })
  return view
}

// A ref that reads and writes one field of a view, so a page keeps its
// existing `groupBy.value` code and templates.
export function persisted<T extends State, K extends keyof T>(view: T, key: K) {
  return computed<T[K]>({ get: () => view[key], set: (v) => { view[key] = v } })
}
