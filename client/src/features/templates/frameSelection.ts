export interface FrameSelectionOptions<T> {
  id: string
  loadDetail: (id: string) => Promise<T>
  commit: (detail: T) => void
  onError: (reason: unknown) => void
}

export async function selectFrameAfterLoad<T>({ id, loadDetail, commit, onError }: FrameSelectionOptions<T>) {
  try {
    const detail = await loadDetail(id)
    commit(detail)
    return true
  } catch (reason) {
    onError(reason)
    return false
  }
}

export async function commitTransitionAfterLoad<T>(load: () => Promise<T>, commit: (value: T) => void) {
  const value = await load()
  commit(value)
  return value
}
