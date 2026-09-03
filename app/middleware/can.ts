// Pages that need a permission: definePageMeta({ middleware: 'can',
// permission: 'manage_invoices' }). UI convenience only; RLS enforces.
export default defineNuxtRouteMiddleware(async (to) => {
  const { load, can, canReview } = useCurrentUser()
  await load()
  const key = to.meta.permission as Parameters<typeof can>[0] | undefined
  // 'review' is not a permission: department leads pass too.
  if (key === 'approve_time' && to.meta.leadOk && canReview.value) return
  if (key && !can(key)) return navigateTo('/')
})
