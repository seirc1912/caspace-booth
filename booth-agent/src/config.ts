import { readFileSync } from 'node:fs'

export interface AgentConfig { apiBaseUrl: string; boothId: string; boothKey: string; watchRoot: string; concurrency: number; statusPort: number }

export function loadConfig(file: string): AgentConfig {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<AgentConfig>
  const config: AgentConfig = {
    apiBaseUrl: String(raw.apiBaseUrl ?? '').replace(/\/$/, ''),
    boothId: String(raw.boothId ?? ''),
    boothKey: String(raw.boothKey ?? ''),
    watchRoot: String(raw.watchRoot ?? ''),
    concurrency: Math.min(2, Math.max(1, Number(raw.concurrency ?? 2) || 2)),
    statusPort: Number(raw.statusPort ?? 47821) || 47821,
  }
  if (!/^https?:\/\//.test(config.apiBaseUrl)) throw new Error('config.json: apiBaseUrl phải bắt đầu bằng http(s)://')
  if (!config.boothId || config.boothKey.length < 8 || !config.watchRoot) throw new Error('config.json: cần boothId, boothKey (≥ 8 ký tự) và watchRoot')
  return config
}
