import type { Tables } from '~~/shared/types/database'
import type { StatusColor } from '~~/shared/types/app'

// Task statuses from the work_statuses table, loaded once per app load and
// shared through useState. Pages `await useWorkStatuses()` in setup.
export async function useWorkStatuses() {
  const supabase = useSupabaseClient()
  const statuses = useState<Tables<'work_statuses'>[]>('work-statuses', () => [])

  async function reload() {
    const { data, error } = await supabase.from('work_statuses').select('*').order('position').order('label')
    if (error) throw error
    statuses.value = data
    return data
  }
  if (!statuses.value.length) {
    await useAsyncData('work-statuses', reload)
  }

  const byKey = computed(() => new Map(statuses.value.map(s => [s.key, s])))
  const active = computed(() => statuses.value.filter(s => s.is_active))
  // Every picker shows the status with its color dot (a chip on the item).
  const items = computed(() => active.value.map(s => ({ label: s.label, value: s.key, chip: { color: (s.color as StatusColor | null) ?? 'neutral' } })))
  const label = (key: string) => byKey.value.get(key)?.label ?? key
  const color = (key: string): StatusColor => (byKey.value.get(key)?.color as StatusColor | undefined) ?? 'neutral'
  // The dot beside a status, anywhere it is shown as text or picked.
  const DOT: Record<string, string> = { primary: 'bg-primary', secondary: 'bg-secondary', success: 'bg-success', info: 'bg-info', warning: 'bg-warning', error: 'bg-error', neutral: 'bg-accented' }
  const dot = (key: string) => DOT[color(key)] ?? 'bg-accented'
  // The same dot for a color that is not a status, like a group's.
  const dotFor = (c?: string | null) => DOT[c ?? ''] ?? 'bg-accented'
  const isDone = (key: string) => !!byKey.value.get(key)?.is_done
  const isPaused = (key: string) => !!byKey.value.get(key)?.is_paused
  const clientReviewKey = computed(() => active.value.find(s => s.is_client_review)?.key ?? null)

  return { statuses, active, items, byKey, label, color, dot, dotFor, isDone, isPaused, clientReviewKey, reload }
}
