// Admin-only pages (the permissions matrix). Everything else uses the
// 'can' middleware with a permission key. UI convenience only; RLS enforces.
export default defineNuxtRouteMiddleware(async () => {
  const { load, isAdmin } = useCurrentUser()
  await load()
  if (!isAdmin.value) return navigateTo('/')
})
