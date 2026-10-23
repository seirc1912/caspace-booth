import { useEffect, useRef } from 'react'
import { frameSelectorScrollTarget } from '../../features/photos/frameNavigation'

interface FrameSelectorProps {
  completedFrameIds: string[]
  frameIds: string[]
  frameIndex: number
  onSelectFrame: (index: number) => void
}

export function FrameSelector({ completedFrameIds, frameIds, frameIndex, onSelectFrame }: FrameSelectorProps) {
  const container = useRef<HTMLDivElement>(null)
  const frameButtons = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => {
      const scroller = container.current
      const selected = frameButtons.current[frameIndex]
      if (!scroller || !selected) return
      const containerRect = scroller.getBoundingClientRect()
      const itemRect = selected.getBoundingClientRect()
      const left = frameSelectorScrollTarget(containerRect.left, containerRect.right, itemRect.left, itemRect.right, scroller.scrollLeft)
      if (left !== scroller.scrollLeft) scroller.scrollTo({ behavior: 'smooth', left })
    })
    return () => cancelAnimationFrame(animationFrame)
  }, [frameIds, frameIndex])

  return <div aria-label="Room frames" className="mt-2 flex w-full min-w-0 touch-pan-x gap-2 overflow-x-auto overflow-y-hidden pb-1 [overscroll-behavior-x:contain] [-webkit-overflow-scrolling:touch] md:mt-3" ref={container}>
    {frameIds.map((id, index) => {
      const complete = completedFrameIds.includes(id)
      const current = index === frameIndex
      const status = current ? 'current' : complete ? 'completed' : 'incomplete'
      return <button
        aria-current={current ? 'step' : undefined}
        aria-label={`Frame ${index + 1}, ${status}`}
        className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-bold transition ${current ? 'border-sky-500 bg-sky-50 text-sky-700' : complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-stone-200 bg-white text-stone-500'}`}
        key={id}
        onClick={() => onSelectFrame(index)}
        ref={(element) => { frameButtons.current[index] = element }}
        type="button"
      >{complete ? '✓' : current ? '●' : '○'} Frame {index + 1}</button>
    })}
  </div>
}
