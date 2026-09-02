// Admin-only pages. UI convenience only: RLS is what actually stops staff
// from writing reference data. Non-admins land on the home page.
export default defineNuxtRouteMiddleware(async () => {
  const { load, isAdmin } = useCurrentUser()
  await load()
  if (!isAdmin.value) return navigateTo('/')
})
