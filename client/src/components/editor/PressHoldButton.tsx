import { useEffect, useRef } from 'react'
import type { PointerEvent } from 'react'

export const pressHoldDelayMs = 350
export const pressHoldRepeatMs = 60

interface PressHoldButtonProps {
  ariaLabel: string
  children: string
  disabled: boolean
  onStep: () => boolean
}

export function PressHoldButton({ ariaLabel, children, disabled, onStep }: PressHoldButtonProps) {
  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const onStepRef = useRef(onStep)
  useEffect(() => { onStepRef.current = onStep }, [onStep])

  const clearTimers = () => {
    if (delayTimer.current !== null) clearTimeout(delayTimer.current)
    if (repeatTimer.current !== null) clearInterval(repeatTimer.current)
    delayTimer.current = null
    repeatTimer.current = null
  }

  const stop = (event?: PointerEvent<HTMLButtonElement>) => {
    clearTimers()
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || event.button !== 0 || !event.isPrimary) return
    event.preventDefault()
    clearTimers()
    event.currentTarget.setPointerCapture(event.pointerId)
    if (!onStepRef.current()) return stop(event)
    delayTimer.current = setTimeout(() => {
      delayTimer.current = null
      repeatTimer.current = setInterval(() => {
        if (!onStepRef.current()) clearTimers()
      }, pressHoldRepeatMs)
    }, pressHoldDelayMs)
  }

  useEffect(() => clearTimers, [])
  useEffect(() => { if (disabled) clearTimers() }, [disabled])

  return <button
    aria-label={ariaLabel}
    className="grid size-11 shrink-0 touch-none select-none place-items-center rounded-xl bg-white/10 text-xl font-black text-white transition [-webkit-touch-callout:none] [-webkit-user-select:none] active:scale-95 active:bg-white/20 disabled:opacity-30"
    disabled={disabled}
    onClick={(event) => { if (event.detail === 0 && !disabled) onStepRef.current() }}
    onContextMenu={(event) => event.preventDefault()}
    onLostPointerCapture={() => clearTimers()}
    onPointerCancel={stop}
    onPointerDown={start}
    onPointerUp={stop}
    type="button"
  >{children}</button>
}
