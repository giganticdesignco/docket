// Pages that need a permission: definePageMeta({ middleware: 'can',
// permission: 'manage_billing' }). UI convenience only; RLS enforces.
export default defineNuxtRouteMiddleware(async (to) => {
  const { load, can } = useCurrentUser()
  await load()
  const key = to.meta.permission as Parameters<typeof can>[0] | undefined
  if (key && !can(key)) return navigateTo('/')
})
