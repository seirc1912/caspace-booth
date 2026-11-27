import { readFileSync } from 'node:fs'

/** Photos uploaded at the same time. 1.1.3 raised it from 2: the shop line has room to spare. */
export const MAX_CONCURRENCY = 4

export interface AgentConfig { apiBaseUrl: string; boothId: string; boothKey: string; watchRoot: string; concurrency: number; statusPort: number }

export function loadConfig(file: string): AgentConfig {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<AgentConfig>
  const config: AgentConfig = {
    apiBaseUrl: String(raw.apiBaseUrl ?? '').replace(/\/$/, ''),
    boothId: String(raw.boothId ?? ''),
    boothKey: String(raw.boothKey ?? ''),
    watchRoot: String(raw.watchRoot ?? ''),
    concurrency: Math.min(MAX_CONCURRENCY, Math.max(1, Number(raw.concurrency ?? MAX_CONCURRENCY) || MAX_CONCURRENCY)),
    statusPort: Number(raw.statusPort ?? 47821) || 47821,
  }
  if (!/^https?:\/\//.test(config.apiBaseUrl)) throw new Error('config.json: apiBaseUrl phải bắt đầu bằng http(s)://')
  if (!config.boothId || config.boothKey.length < 8 || !config.watchRoot) throw new Error('config.json: cần boothId, boothKey (≥ 8 ký tự) và watchRoot')
  return config
}
