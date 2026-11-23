import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Remembers which exports were uploaded (path + size + mtime) so restarts never re-send. */
export class StateStore {
  private uploaded: Record<string, string> = {}

  constructor(private readonly file: string) {
    try { this.uploaded = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string> } catch { this.uploaded = {} }
  }

  static key(path: string, size: number, mtimeMs: number) { return `${path}|${size}|${Math.round(mtimeMs)}` }

  has(key: string) { return key in this.uploaded }

  mark(key: string, objectPath: string) {
    this.uploaded[key] = objectPath
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.uploaded))
    renameSync(`${this.file}.tmp`, this.file)
  }

  /** `folderPath` must end with a path separator so `0947860616` does not also match `0947860616-1`. */
  forgetFolder(folderPath: string) {
    for (const key of Object.keys(this.uploaded)) if (key.startsWith(folderPath)) delete this.uploaded[key]
  }

  get size() { return Object.keys(this.uploaded).length }
}
