// Tells the Mac app when a newer build exists. The site publishes
// /desktop/latest.json (version, download url, notes); the shell reads
// its own version from Tauri and compares. Checked on launch and once a
// day. Nothing happens in a browser.
export type DesktopRelease = { version: string, url: string, notes?: string, published_on?: string }

const DISMISSED_KEY = 'docket-update-dismissed'
const CHECK_EVERY = 24 * 60 * 60 * 1000

export function useDesktopUpdate() {
  const { isDesktop } = useDesktop()
  const current = useState<string | null>('desktop-version', () => null)
  const available = useState<DesktopRelease | null>('desktop-update', () => null)

  async function check(version?: string) {
    const t = tauri() as (ReturnType<typeof tauri> & { app?: { getVersion: () => Promise<string> } }) | undefined
    try {
      current.value = version ?? (await t?.app?.getVersion()) ?? null
      if (!current.value) return
      const latest = await $fetch<DesktopRelease>('/desktop/latest.json', { query: { t: Date.now() } })
      if (!latest?.version || !latest.url) return
      let dismissed = ''
      try { dismissed = localStorage.getItem(DISMISSED_KEY) ?? '' } catch { /* private mode */ }
      available.value = newer(latest.version, current.value) && dismissed !== latest.version ? latest : null
    } catch (e) {
      console.warn('Update check failed', (e as Error).message)
    }
  }

  function dismiss() {
    if (!available.value) return
    try { localStorage.setItem(DISMISSED_KEY, available.value.version) } catch { /* private mode */ }
    available.value = null
  }

  async function download() {
    if (!available.value) return
    const { open } = useDesktop()
    if (!(await open(available.value.url))) window.open(available.value.url, '_blank')
  }

  function start() {
    // In development, window.__docketUpdate('0.0.1') shows the banner in a browser.
    if (import.meta.dev && import.meta.client) (window as Window & { __docketUpdate?: typeof check }).__docketUpdate = check
    if (!isDesktop) return
    check()
    const timer = setInterval(() => check(), CHECK_EVERY)
    onBeforeUnmount(() => clearInterval(timer))
  }

  return { isDesktop, current, available, check, dismiss, download, start }
}

// 0.2.0 is newer than 0.1.9; a fourth part or a suffix is ignored.
export function newer(a: string, b: string) {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false
  }
  return false
}
