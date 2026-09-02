export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxtjs/supabase'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    // Server only. Set NUXT_HARVEST_ACCESS_TOKEN and NUXT_HARVEST_ACCOUNT_ID.
    harvestAccessToken: '',
    harvestAccountId: '',
  },
  routeRules: {
    // The timesheet picks "today" and ticks a timer from the browser clock.
    // Rendering it on the server (UTC on Vercel) would show the wrong day
    // in the evening and mismatch on hydration.
    '/time': { ssr: false },
  },
  supabase: {
    // Public quote links (/q/[token]) must never bounce to the login screen.
    redirectOptions: {
      login: '/login',
      callback: '/callback',
      exclude: ['/q/**', '/login', '/callback'],
    },
    types: '~~/shared/types/database.ts',
  },
})
