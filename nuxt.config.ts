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
  },
  routeRules: {
    // The timesheet picks "today" and ticks a timer from the browser clock.
    // Rendering it on the server (UTC on Vercel) would show the wrong day
    // in the evening and mismatch on hydration.
    '/time': { ssr: false },
  },
  supabase: {
    // Public quote (/q/[token]) and invoice (/i/[token]) links must never
    // bounce to the login screen.
    redirectOptions: {
      login: '/login',
      callback: '/callback',
      exclude: ['/q/**', '/i/**', '/login', '/callback'],
    },
    types: '~~/shared/types/database.ts',
  },
})
