export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxtjs/supabase'],
  css: ['~/assets/css/main.css'],
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
