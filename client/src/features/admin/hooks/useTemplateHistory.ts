import { useCallback, useState } from 'react'
import type { TemplateDocument } from '../../../types/selfBooth'

export function useTemplateHistory(initial: TemplateDocument) {
  const [history, setHistory] = useState({ past: [] as TemplateDocument[], present: initial, future: [] as TemplateDocument[] })
  const commit = useCallback((next: TemplateDocument) => setHistory((current) => ({ past: [...current.past.slice(-49), current.present], present: next, future: [] })), [])
  const undo = useCallback(() => setHistory((current) => current.past.length ? { past: current.past.slice(0, -1), present: current.past.at(-1)!, future: [current.present, ...current.future] } : current), [])
  const redo = useCallback(() => setHistory((current) => current.future.length ? { past: [...current.past, current.present], present: current.future[0]!, future: current.future.slice(1) } : current), [])
  return { document: history.present, commit, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0 }
}
