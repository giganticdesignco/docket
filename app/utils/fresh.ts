import type { NuxtApp } from '#app'

// Pass as the third argument to useAsyncData. Nuxt's default reuses the
// last result on client-side navigation, so a list page would not show a
// row you just created on another page. This refetches on every visit and
// only reuses the server payload during hydration.
export const fresh = {
  getCachedData: (key: string, nuxtApp: NuxtApp) =>
    nuxtApp.isHydrating ? nuxtApp.payload.data[key] : undefined,
}
