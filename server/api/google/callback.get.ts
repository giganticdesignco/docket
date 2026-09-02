import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database'

// Step two: Google sends the code back. Swap it for tokens, keep the
// refresh token, run a first sync, and return to the account page.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const cookie = getCookie(event, 'docket-google-state') ?? ''
  deleteCookie(event, 'docket-google-state', { path: '/' })
  const [state, userId] = cookie.split(':')
  const back = (msg: string) => sendRedirect(event, `/account?calendar=${encodeURIComponent(msg)}`)
  if (q.error) return back(`Google said: ${q.error}`)
  if (!state || !userId || q.state !== state || typeof q.code !== 'string') return back('The connection did not complete. Try again.')

  const admin = serverSupabaseServiceRole<Database>(event)
  try {
    const redirectUri = `${getRequestURL(event).origin}/api/google/callback`
    const tokens = await exchangeCode(q.code, redirectUri)
    if (!tokens.refresh_token) return back('Google did not hand over a refresh token. Remove Docket from your Google account permissions and try again.')
    const email = emailFromIdToken(tokens.id_token) ?? 'Google account'
    const { error } = await admin.from('google_tokens').upsert({ user_id: userId, google_email: email, refresh_token: tokens.refresh_token, connected_at: new Date().toISOString(), last_error: null })
    if (error) throw error
    await syncCalendar(admin, userId)
    return back('connected')
  } catch (e) {
    return back((e as Error).message)
  }
})
