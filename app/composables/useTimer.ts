import type { Tables, TablesInsert } from '~~/shared/types/database'

type Entry = Tables<'time_entries'>
type Result = { data: Entry | null, error: { code?: string, message: string } | null }

// One shared clock so every live counter on the page ticks together.
let ticker: ReturnType<typeof setInterval> | undefined

// The signed-in user's running timer.
//
// Timers are Harvest-style durations: `hours` is what has been logged so far
// and started_at is set only while the clock runs. Stopping folds the elapsed
// time into `hours`. One running timer per user is enforced by the partial
// unique index one_running_timer_per_user; a second start raises 23505, which
// is resolved by stopping whatever is running and retrying once.
export function useTimer() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const running = useState<Entry | null>('running-timer', () => null)
  const now = useState<number>('timer-now', () => Date.now())

  if (import.meta.client && !ticker) {
    ticker = setInterval(() => { now.value = Date.now() }, 1000)
  }

  async function load() {
    if (!user.value) {
      running.value = null
      return
    }
    const { data, error } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', user.value.sub)
      .not('started_at', 'is', null)
      .is('ended_at', null)
      .maybeSingle()
    if (error) throw error
    running.value = data
  }

  const isRunning = (e: Pick<Entry, 'started_at' | 'ended_at'>) => !!e.started_at && !e.ended_at

  // Logged hours plus elapsed time while the timer runs.
  function liveHours(e: Pick<Entry, 'hours' | 'started_at' | 'ended_at'>): number {
    return isRunning(e) ? e.hours + hoursSince(e.started_at!, now.value) : e.hours
  }

  async function stop(entry: Entry | null = running.value): Promise<Entry | null> {
    if (!entry || !isRunning(entry)) return null
    const endedAt = new Date()
    const hours = round2(entry.hours + hoursSince(entry.started_at!, endedAt.getTime()))
    const { data, error } = await supabase
      .from('time_entries')
      .update({ hours, ended_at: endedAt.toISOString() })
      .eq('id', entry.id)
      .select()
      .single()
    if (error) throw error
    if (running.value?.id === entry.id) running.value = null
    return data
  }

  async function claimSlot(write: () => PromiseLike<Result>): Promise<Entry> {
    // Starting a timer stops the one already running, as in Harvest.
    if (running.value) await stop(running.value)
    let result = await write()
    if (result.error?.code === '23505') {
      // A timer this tab did not know about (another tab or device). Stop it and retry once.
      await load()
      if (running.value) await stop(running.value)
      result = await write()
    }
    if (result.error) throw result.error
    running.value = result.data
    return result.data!
  }

  // Create an entry with the timer already running.
  function startNew(values: Omit<TablesInsert<'time_entries'>, 'started_at' | 'ended_at'>) {
    return claimSlot(() => supabase
      .from('time_entries')
      .insert({ ...values, started_at: new Date().toISOString(), ended_at: null })
      .select()
      .single())
  }

  // Restart the timer on an existing entry.
  function resume(entryId: string) {
    return claimSlot(() => supabase
      .from('time_entries')
      .update({ started_at: new Date().toISOString(), ended_at: null })
      .eq('id', entryId)
      .select()
      .single())
  }

  return { running, now, load, isRunning, liveHours, stop, startNew, resume }
}
