// The Mac app is a Tauri shell around the live site. When the page runs
// inside it, window.__TAURI__ is present and the shell can do what a
// browser cannot: hand over real paths for dropped files, map a mounted
// volume back to its smb:// share, and open a share in Finder.
type DragDropEvent = { payload: { type: string, paths?: string[], position?: { x: number, y: number } } }
type Tauri = {
  core: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
  event: { listen: (name: string, cb: (e: DragDropEvent) => void) => Promise<() => void> }
  opener: { openUrl: (url: string) => Promise<void>, openPath: (path: string) => Promise<void> }
}

export function tauri(): Tauri | undefined {
  return import.meta.client ? (window as Window & { __TAURI__?: Tauri }).__TAURI__ : undefined
}

export function useDesktop() {
  const t = tauri()
  const isDesktop = !!t

  // /Volumes/CLIENTS/Hills Bank/x becomes smb://oven/CLIENTS/Hills Bank/x
  // when that volume is a mounted share; other paths come back unchanged.
  async function shareUrl(path: string): Promise<string> {
    if (!t) return path
    try { return String(await t.core.invoke('share_url', { path })) } catch { return path }
  }

  // Opens an smb:// or afp:// share, or a local path, in Finder.
  async function open(target: string): Promise<boolean> {
    if (!t) return false
    try {
      if (/^[a-z]+:\/\//i.test(target)) await t.opener.openUrl(target)
      else await t.opener.openPath(target)
      return true
    } catch { return false }
  }

  return { isDesktop, shareUrl, open }
}
