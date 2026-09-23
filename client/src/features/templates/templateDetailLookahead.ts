export interface TemplateSummaryLike {
  id: string
}

export interface TemplateDetailLookaheadResult<T> {
  next?: T
  previous?: T
}

export async function prefetchAdjacentTemplateDetails<T>(
  summaries: readonly TemplateSummaryLike[],
  currentId: string,
  loadDetail: (id: string) => Promise<T>,
  onNextDetail?: (detail: T) => Promise<void>,
): Promise<TemplateDetailLookaheadResult<T>> {
  const currentIndex = summaries.findIndex((summary) => summary.id === currentId)
  if (currentIndex < 0) return {}

  const next = summaries[currentIndex + 1]
  const previous = summaries[currentIndex - 1]
  const result: TemplateDetailLookaheadResult<T> = {}

  await Promise.all([
    next
      ? loadDetail(next.id).then(async (detail) => {
        result.next = detail
        await onNextDetail?.(detail)
      }).catch(() => undefined)
      : Promise.resolve(),
    previous
      ? loadDetail(previous.id).then((detail) => { result.previous = detail }).catch(() => undefined)
      : Promise.resolve(),
  ])

  return result
}
