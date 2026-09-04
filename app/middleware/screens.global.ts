import { SCREENS } from '~~/shared/types/app'

// Every staff screen checks its screen key. Home, a task page, Account,
// Notifications, Help, the portal and the public pages are always open.
// UI convenience only; RLS enforces what the data says.
export default defineNuxtRouteMiddleware(async (to) => {
  const path = to.path
  if (path === '/' || path.startsWith('/login') || path.startsWith('/callback') || path.startsWith('/q/') || path.startsWith('/i/') || path.startsWith('/r/') || path.startsWith('/portal') || path.startsWith('/oauth')) return
  const screen = SCREENS.find(s => path === s.path || path.startsWith(`${s.path}/`))
  if (!screen) return
  // A task page opens from anywhere it is linked; only the list is a screen.
  if (screen.key === 'screen:tasks' && path !== '/tasks' && path !== '/tasks/triage') return
  const { load, can, canReview, profile } = useCurrentUser()
  await load()
  if (!profile.value || profile.value.role === 'client') return
  if (screen.key === 'screen:approvals' && canReview.value) return
  if (!can(screen.key)) return navigateTo('/')
})
