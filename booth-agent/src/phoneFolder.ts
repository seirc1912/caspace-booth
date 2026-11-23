import path from 'node:path'

const phonePattern = /^0(?:3|5|7|8|9)\d{8}$/

/** First 10-digit Vietnamese mobile number in a Capture One session folder name. */
export function phoneFromFolderName(name: string): string | null {
  if (name.startsWith('.')) return null
  for (const run of name.match(/\d+/g) ?? []) if (phonePattern.test(run)) return run
  return null
}

export type ExportClassification =
  | { kind: 'photo'; phone: string; sessionFolder: string }
  | { kind: 'unrecognized'; sessionFolder: string }

/**
 * Only `<root>/<session>/Output/<file>.jpg|jpeg` counts. RAW (`Capture/`), `Selects/`,
 * `Trash/`, cache, Drive temp folders and nested Output folders are ignored.
 * `pathApi` lets tests use Windows paths on macOS.
 */
export function classifyExport(filePath: string, root: string, pathApi: path.PlatformPath = path): ExportClassification | null {
  const parts = pathApi.relative(root, filePath).split(/[\\/]/)
  if (parts.length !== 3) return null
  const [sessionFolder, outputFolder, file] = parts as [string, string, string]
  if (sessionFolder.startsWith('.') || sessionFolder === '..' || outputFolder.toLowerCase() !== 'output') return null
  if (file.startsWith('.') || !/\.jpe?g$/i.test(file)) return null
  const phone = phoneFromFolderName(sessionFolder)
  return phone ? { kind: 'photo', phone, sessionFolder } : { kind: 'unrecognized', sessionFolder }
}
