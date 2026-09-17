export type OrderStage = 'preflight' | 'render' | 'upload' | 'submit'

export interface OrderFrameDescriptor {
  index: number
  template: { id: string; name: string; canvas: { width: number; height: number } }
  slots: Array<unknown | null>
}

export interface OrderPipelineEvent {
  attemptId: string
  stage: OrderStage
  completedCount: number
  totalCount: number
  frame?: OrderFrameDescriptor
  elapsedMs: number
}

export class OrderPipelineError extends Error {
  readonly diagnostics: OrderPipelineEvent & { errorClass: string }
  constructor(event: OrderPipelineEvent, reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason)
    super(message, { cause: reason })
    this.name = 'OrderPipelineError'
    this.diagnostics = { ...event, errorClass: reason instanceof Error ? reason.name : 'UnknownError' }
  }
}

interface PipelineDependencies<Frame extends OrderFrameDescriptor, Rendered, Uploaded, Submitted> {
  attemptId?: string
  frames: Frame[]
  initialCompletedCount?: number
  totalCount?: number
  preflight: () => Promise<void>
  render: (frame: Frame) => Promise<Rendered>
  upload: (frame: Frame, rendered: Rendered) => Promise<Uploaded>
  releaseFrame: (frame: Frame, rendered?: Rendered) => void
  submit: () => Promise<Submitted>
  onEvent?: (event: OrderPipelineEvent) => void
}

/** Strict bounded Order pipeline: one decoded/rendered/encoded frame at a time. */
export async function runOrderPipeline<Frame extends OrderFrameDescriptor, Rendered, Uploaded, Submitted>(dependencies: PipelineDependencies<Frame, Rendered, Uploaded, Submitted>) {
  const attemptId = dependencies.attemptId ?? crypto.randomUUID()
  const startedAt = performance.now()
  let completedCount = dependencies.initialCompletedCount ?? 0
  const totalCount = dependencies.totalCount ?? dependencies.frames.length
  const event = (stage: OrderStage, frame?: Frame): OrderPipelineEvent => ({
    attemptId, stage, frame, completedCount, totalCount, elapsedMs: performance.now() - startedAt,
  })
  try {
    dependencies.onEvent?.(event('preflight'))
    await dependencies.preflight()
  } catch (reason) { throw new OrderPipelineError(event('preflight'), reason) }

  for (const frame of dependencies.frames) {
    let rendered: Rendered | undefined
    try {
      dependencies.onEvent?.(event('render', frame))
      rendered = await dependencies.render(frame)
      dependencies.onEvent?.(event('upload', frame))
      await dependencies.upload(frame, rendered)
      completedCount += 1
    } catch (reason) {
      const stage = rendered === undefined ? 'render' : 'upload'
      throw new OrderPipelineError(event(stage, frame), reason)
    } finally { dependencies.releaseFrame(frame, rendered) }
  }

  try {
    dependencies.onEvent?.(event('submit'))
    return await dependencies.submit()
  } catch (reason) { throw new OrderPipelineError(event('submit'), reason) }
}
