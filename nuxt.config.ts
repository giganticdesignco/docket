export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxtjs/supabase'],
  css: ['~/assets/css/main.css'],
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
