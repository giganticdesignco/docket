// Inside the Mac app the webview swallows HTML5 drops and reports them
// with real paths instead. This turns each drop back into a DOM event,
// "desktop-drop", on the element under the cursor, with the paths in
// event.detail, so fields can listen with @desktop-drop. It also routes
// smb:// and afp:// links to Finder, which the webview would ignore.
export default defineNuxtPlugin(() => {
  const t = tauri()
  if (!t) return

  t.event.listen('tauri://drag-drop', (e) => {
    const { paths, position } = e.payload
    if (!paths?.length || !position) return
    const scale = window.devicePixelRatio || 1
    const target = document.elementFromPoint(position.x / scale, position.y / scale) ?? document.body
    target.dispatchEvent(new CustomEvent<{ paths: string[] }>('desktop-drop', { bubbles: true, detail: { paths } }))
  })

  const { open } = useDesktop()
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest('a[href]')
    const href = a?.getAttribute('href') ?? ''
    if (/^(smb|afp|file):\/\//i.test(href)) {
      e.preventDefault()
      open(href)
    }
  })
})
