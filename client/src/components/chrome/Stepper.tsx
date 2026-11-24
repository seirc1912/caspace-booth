import { flowSteps, stepCounter, type FlowStep } from './flowSteps'

interface StepperProps {
  step: FlowStep
  /** Bars only (editor top row already names the step). */
  compact?: boolean
}

export function Stepper({ step, compact = false }: StepperProps) {
  const next = (flowSteps as readonly string[])[step]
  return <nav aria-label={`Bước ${stepCounter(step)}: ${flowSteps[step - 1]}`} className="w-full">
    <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${flowSteps.length}, minmax(0, 1fr))` }}>
      {flowSteps.map((name, index) => {
        const state = index + 1 < step ? 'done' : index + 1 === step ? 'current' : 'todo'
        return <li aria-current={state === 'current' ? 'step' : undefined} className={`h-1 rounded-full ${state === 'done' ? 'bg-cs-ink' : state === 'current' ? 'cs-led' : 'bg-cs-chrome-400/60'}`} key={name}><span className="sr-only">{name}{state === 'done' ? ' (xong)' : state === 'current' ? ' (đang làm)' : ''}</span></li>
      })}
    </ol>
    {compact ? null : <p aria-hidden="true" className="cs-mono mt-2 flex justify-between gap-3 text-[11px] text-cs-ink-2"><span className="truncate">Bước {stepCounter(step)} · {flowSteps[step - 1]}</span>{next ? <span className="shrink-0">Tiếp: {next}</span> : null}</p>}
  </nav>
}
