import { BrandMark } from '../branding/BrandMark'
import { Icon } from '../ui/Icon'
import { stepCounter, type FlowStep } from './flowSteps'

type AppHeaderProps =
  | { variant: 'home' }
  | { variant: 'flow'; step: FlowStep; onBack: () => void; backLabel?: string }
  | { variant: 'sub'; homeHref?: string }
  | { variant: 'center' }

export const roundBackClass = 'cs-btn-chrome cs-press grid size-11 shrink-0 place-items-center rounded-full'

/** home: logo only · flow: back + logo + step counter · sub: "Trang chủ" pill + logo · center: logo only, centred. */
export function AppHeader(props: AppHeaderProps) {
  if (props.variant === 'home') return <header className="flex min-h-11 items-center"><BrandMark /></header>
  if (props.variant === 'center') return <header className="flex min-h-11 items-center justify-center"><BrandMark /></header>
  if (props.variant === 'sub') return <header className="grid min-h-11 grid-cols-[auto_1fr_auto] items-center gap-3">
    <a className="cs-btn-chrome cs-press inline-flex min-h-11 items-center gap-1.5 rounded-full pl-3 pr-4 text-sm font-bold" href={props.homeHref ?? '/'}><Icon className="size-[18px]" name="back" />Trang chủ</a>
    <span className="flex justify-center"><BrandMark compact /></span>
    <span aria-hidden="true" className="w-11" />
  </header>
  return <header className="grid min-h-11 grid-cols-[2.75rem_1fr_2.75rem] items-center gap-3">
    <button aria-label={props.backLabel ?? 'Quay lại'} className={roundBackClass} onClick={props.onBack} type="button"><Icon name="back" /></button>
    <span className="flex justify-center"><BrandMark compact /></span>
    <span className="cs-mono text-right text-xs text-cs-ink-2">{stepCounter(props.step)}</span>
  </header>
}
