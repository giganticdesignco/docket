// Project folders on the office server. The template in settings uses
// {client}, {code}, and {name}; a missing value drops out along with
// the space before it, so "{code} {name}" with no code reads "{name}".
export function fillFolderTemplate(template: string, v: { client?: string | null, code?: string | null, name?: string | null }): string {
  return template
    .replace(/ ?\{client\}/g, v.client ? ` ${v.client}` : '')
    .replace(/ ?\{code\}/g, v.code ? ` ${v.code}` : '')
    .replace(/ ?\{name\}/g, v.name ? ` ${v.name}` : '')
    .replace(/\/ /g, '/')
    .replace(/(?<!:)\/{2,}/g, '/')
    .replace(/^ /, '')
    .trim()
}

// smb:// and afp:// open Finder on a Mac; file:// covers a mounted drive.
// Plain paths and UNC paths get Copy only.
export function folderHref(path: string | null | undefined): string | null {
  return path && /^(smb|afp|file):\/\//i.test(path) ? path : null
}

// Browsers never reveal where a chosen folder or file lives, only its
// name. So the pickers take the name and put it under a known base:
// the template's directory for projects, the project folder for files.
type PickerWindow = Window & {
  showDirectoryPicker?: () => Promise<{ name: string }>
  showOpenFilePicker?: () => Promise<{ name: string }[]>
}
export async function pickFolderName(): Promise<string | null> {
  const w = window as PickerWindow
  if (w.showDirectoryPicker) {
    try { return (await w.showDirectoryPicker()).name } catch { return null }
  }
  return pickWithInput(true)
}
export async function pickFileName(): Promise<string | null> {
  const w = window as PickerWindow
  if (w.showOpenFilePicker) {
    try { return (await w.showOpenFilePicker())[0]?.name ?? null } catch { return null }
  }
  return pickWithInput(false)
}
// Safari fallback: a hidden file input. With webkitdirectory the first
// file's relative path starts with the folder name.
function pickWithInput(directory: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (directory) input.setAttribute('webkitdirectory', '')
    input.onchange = () => {
      const f = input.files?.[0]
      resolve(!f ? null : directory ? (f.webkitRelativePath.split('/')[0] ?? null) : f.name)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

// A folder or file dropped from Finder. Same rule: name only.
export function droppedName(e: DragEvent): string | null {
  const item = e.dataTransfer?.items?.[0]
  const entry = item && 'webkitGetAsEntry' in item ? item.webkitGetAsEntry() : null
  return entry?.name ?? e.dataTransfer?.files?.[0]?.name ?? null
}
