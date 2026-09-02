export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxtjs/supabase'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    // Server only. Set NUXT_HARVEST_ACCESS_TOKEN and NUXT_HARVEST_ACCOUNT_ID.
    harvestAccessToken: '',
    harvestAccountId: '',
    // Server only. NUXT_CLICKUP_TOKEN (personal API token) and
    // NUXT_CLICKUP_TEAM_ID (the workspace id).
    clickupToken: '',
    clickupTeamId: '',
    // NUXT_CRON_SECRET, same value as CRON_SECRET, which Vercel sends with
    // cron requests.
    cronSecret: '',
    // Google Calendar (read only). NUXT_GOOGLE_CLIENT_ID and
    // NUXT_GOOGLE_CLIENT_SECRET from an OAuth client on the Workspace
    // project, with <site>/api/google/callback as a redirect URI.
    googleClientId: '',
    googleClientSecret: '',
  },
  routeRules: {
    // The signed-in app renders in the browser. Every page needs the
    // person's session and several Supabase queries; rendering that on
    // the server meant a Vercel function cold start (about two seconds)
    // plus the queries before any HTML arrived. As a static shell the
    // app loads from the CDN and talks to Supabase directly, and the
    // timesheet's "today" and timers use the browser clock. The public
    // quote, invoice, and review pages keep server rendering: they take
    // a token, not a session, and should read well in an email preview.
    '/**': { ssr: false },
    '/q/**': { ssr: true },
    '/i/**': { ssr: true },
    '/r/**': { ssr: true },
    '/login': { ssr: true },
  },
  supabase: {
    // Public quote (/q/[token]), invoice (/i/[token]), and task review
    // (/r/[token]) links must never bounce to the login screen.
    redirectOptions: {
      login: '/login',
      callback: '/callback',
      exclude: ['/q/**', '/i/**', '/r/**', '/login', '/callback'],
    },
    types: '~~/shared/types/database.ts',
  },
})
