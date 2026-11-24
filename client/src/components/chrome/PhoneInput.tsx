import type { Ref } from 'react'
import { Icon } from '../ui/Icon'
import { formatPhoneDisplay } from '../../features/orders/phoneDisplay'

export type PhoneInputState = 'empty' | 'typing' | 'valid' | 'error'

interface PhoneInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  state: PhoneInputState
  size?: 'lg' | 'md'
  placeholder?: string
  describedBy?: string
  disabled?: boolean
  inputRef?: Ref<HTMLInputElement>
  onEnter?: () => void
}

export function PhoneInput({ id, value, onChange, state, size = 'lg', placeholder, describedBy, disabled = false, inputRef, onEnter }: PhoneInputProps) {
  return <div className={`cs-lcd relative flex items-center rounded-[16px] ${state === 'error' ? 'ring-2 ring-cs-led' : 'focus-within:ring-2 focus-within:ring-cs-chrome-400'} ${disabled ? 'opacity-70' : ''}`}>
    <input
      aria-describedby={describedBy}
      aria-invalid={state === 'error'}
      autoComplete="tel"
      className={`w-full min-w-0 bg-transparent px-5 font-bold tracking-[0.01em] text-[#F5F6F7] outline-none placeholder:text-[#9EA2A8] disabled:cursor-not-allowed ${size === 'lg' ? 'h-16 text-[22px]' : 'h-14 text-lg'} ${state === 'valid' ? 'pr-14' : ''}`}
      disabled={disabled}
      id={id}
      inputMode="numeric"
      onChange={(event) => onChange(formatPhoneDisplay(event.target.value))}
      onKeyDown={(event) => { if (event.key === 'Enter') onEnter?.() }}
      placeholder={placeholder}
      ref={inputRef}
      type="tel"
      value={value}
    />
    {state === 'valid' ? <span aria-hidden="true" className="absolute right-5 grid size-6 place-items-center rounded-full bg-cs-led-green text-cs-ink shadow-[0_0_10px_rgba(52,211,153,.7)]"><Icon className="size-3.5" name="check" /></span> : null}
  </div>
}
