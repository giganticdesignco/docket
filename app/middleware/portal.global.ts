// Clients live under /portal and nowhere else; staff never land there.
// The public pages (/q, /i, /r) and auth pages are open to both.
const OPEN = ['/q/', '/i/', '/r/', '/login', '/callback']

export default defineNuxtRouteMiddleware(async (to) => {
  if (OPEN.some(p => to.path.startsWith(p))) return
  const user = useSupabaseUser()
  if (!user.value) return
  const { load, profile } = useCurrentUser()
  await load()
  const isClient = profile.value?.role === 'client'
  const inPortal = to.path === '/portal' || to.path.startsWith('/portal/')
  if (isClient && !inPortal) return navigateTo('/portal', { replace: true })
  // Staff only reach the portal to preview it for a client (?as=<id>).
  if (!isClient && inPortal && !to.query.as) return navigateTo('/', { replace: true })
})
