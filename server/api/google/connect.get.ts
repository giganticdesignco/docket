import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Step one of connecting a calendar: remember who is connecting in a
// short-lived cookie and send them to Google's consent screen.
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw createError({ statusCode: 403, statusMessage: 'Sign in first' })
  if (!useRuntimeConfig().googleClientId) throw createError({ statusCode: 500, statusMessage: 'Google client id is not set on the server' })
  const state = crypto.randomUUID()
  setCookie(event, 'docket-google-state', `${state}:${user.id}`, { httpOnly: true, sameSite: 'lax', secure: true, maxAge: 600, path: '/' })
  const redirectUri = `${getRequestURL(event).origin}/api/google/callback`
  return sendRedirect(event, googleAuthUrl(redirectUri, state))
})
