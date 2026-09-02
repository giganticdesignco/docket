// What is on screen, for the Assistant. A detail page announces the
// client, project, task, or quote it shows; the drawer turns that into
// suggested questions with real names in them and tells the model.
// The announcement clears when the page goes away, unless a newer page
// has already announced (Nuxt sets up the next page before it unmounts
// the old one, so the clear must not wipe the newcomer's line).
export type Screen = { client?: string, project?: string, task?: string, quote?: string, invoice?: string, period?: string }

type Announced = Screen & { by?: number }
let seq = 0

export const useAssistantScreenState = () => useState<Announced>('assistant-screen', () => ({}))

export function useAssistantScreen(read: () => Screen) {
  const screen = useAssistantScreenState()
  const me = ++seq
  watchEffect(() => { screen.value = { ...read(), by: me } })
  onBeforeUnmount(() => { if (screen.value.by === me) screen.value = {} })
}
