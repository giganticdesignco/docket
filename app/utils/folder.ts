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

// Settings hold one root per line, e.g. one for the CLIENTS volume and
// one for WEB. The label is the last literal segment before the
// placeholders: "smb://oven/CLIENTS/{client}" reads "CLIENTS".
export function folderRoots(template: string | null | undefined): { label: string, value: string }[] {
  return (template ?? '').split('\n').map(l => l.trim()).filter(Boolean).map((value) => {
    const literal = value.replace(/\{(client|code|name)\}/g, '').replace(/\/+$/, '')
    return { label: literal.split('/').filter(Boolean).pop() ?? value, value }
  })
}

// Where a picked or dropped project folder goes. A template that names
// the project folder ({code} or {name}) contributes its directory; one
// that stops at the client ("smb://nas/Jobs/{client}") is used whole.
export function folderBase(template: string | null | undefined, client: string | undefined, typed: string): string {
  if (template) {
    const named = /\{(code|name)\}/.test(template)
    // Stand-ins keep the project segment present so it can be stripped.
    const filled = fillFolderTemplate(template, { client, code: named ? 'x' : '', name: named ? 'x' : '' }).replace(/\/+$/, '')
    return named ? filled.replace(/\/[^/]*$/, '') : filled
  }
  const t = typed.trim().replace(/\/+$/, '')
  return t.includes('/') ? t.replace(/\/[^/]*$/, '') : ''
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
