import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database'

// Google Calendar, read only. Each person grants access once; the
// refresh token is kept in google_tokens (service role only) and turned
// into a short-lived access token per sync. Busy time for the next
// eight weeks replaces that person's rows in calendar_busy.

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const WEEKS = 8

export function googleAuthUrl(redirectUri: string, state: string): string {
  const { googleClientId } = useRuntimeConfig()
  const p = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: `${SCOPE} email`,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

type TokenResponse = { access_token: string, refresh_token?: string, expires_in: number, id_token?: string, error?: string, error_description?: string }
export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { googleClientId, googleClientSecret } = useRuntimeConfig()
  const res = await $fetch<TokenResponse>('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ code, client_id: googleClientId, client_secret: googleClientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  })
  if (res.error) throw new Error(res.error_description ?? res.error)
  return res
}
async function accessToken(refreshToken: string): Promise<string> {
  const { googleClientId, googleClientSecret } = useRuntimeConfig()
  const res = await $fetch<TokenResponse>('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: googleClientId, client_secret: googleClientSecret, grant_type: 'refresh_token' }),
  })
  if (res.error) throw new Error(res.error_description ?? res.error)
  return res.access_token
}
// The Google account's email, from the id token's payload.
export function emailFromIdToken(idToken?: string): string | null {
  try {
    const b64 = idToken!.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(decodeURIComponent(escape(atob(b64))))
    return typeof payload.email === 'string' ? payload.email : null
  } catch { return null }
}

type Busy = { start: string, end: string }
// Free/busy for the primary calendar: opaque events only, all-day
// events included, declined ones already left out by Google.
async function fetchBusy(token: string, from: Date, to: Date): Promise<Busy[]> {
  const res = await $fetch<{ calendars: Record<string, { busy: Busy[], errors?: { reason: string }[] }> }>('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: { timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: 'primary' }] },
  })
  const cal = res.calendars.primary
  if (cal?.errors?.length) throw new Error(cal.errors.map(e => e.reason).join(', '))
  return cal?.busy ?? []
}

// Sync one person. Returns how many busy blocks were stored.
export async function syncCalendar(admin: SupabaseClient<Database>, userId: string): Promise<number> {
  const { data: row } = await admin.from('google_tokens').select('refresh_token').eq('user_id', userId).maybeSingle()
  if (!row) throw new Error('Calendar is not connected')
  try {
    const token = await accessToken(row.refresh_token)
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    const to = new Date(from.getTime() + WEEKS * 7 * 86_400_000)
    const busy = await fetchBusy(token, from, to)
    const rows = busy.map(b => ({
      user_id: userId,
      starts_at: b.start,
      ends_at: b.end,
      hours: Math.round((new Date(b.end).getTime() - new Date(b.start).getTime()) / 36_000) / 100,
      source: 'google',
    })).filter(r => r.hours > 0 && r.hours <= 24)
    const del = await admin.from('calendar_busy').delete().eq('user_id', userId).eq('source', 'google').gte('starts_at', from.toISOString())
    if (del.error) throw del.error
    if (rows.length) {
      const ins = await admin.from('calendar_busy').insert(rows)
      if (ins.error) throw ins.error
    }
    await admin.from('google_tokens').update({ last_synced_at: new Date().toISOString(), last_error: null }).eq('user_id', userId)
    return rows.length
  } catch (e) {
    // Google's own explanation beats "403 Forbidden".
    const err = e as Error & { data?: { error?: { message?: string } } }
    const message = err.data?.error?.message ?? err.message
    await admin.from('google_tokens').update({ last_error: message }).eq('user_id', userId)
    throw new Error(message)
  }
}
