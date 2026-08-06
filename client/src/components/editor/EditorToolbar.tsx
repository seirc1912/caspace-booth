import { Icon } from '../ui/Icon'

interface EditorToolbarProps {
  canContinue: boolean
  onAutoFill: () => void
  onClear: () => void
  onNext: () => void
  onShuffle: () => void
}

export function EditorToolbar({ canContinue, onAutoFill, onClear, onNext, onShuffle }: EditorToolbarProps) {
  return (
    <nav aria-label="Editor actions" className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
      <div className="mx-auto grid max-w-xl grid-cols-4 gap-1">
        <button className="grid min-h-14 place-items-center rounded-xl px-1 text-xs font-semibold text-stone-600 hover:bg-stone-100" onClick={onAutoFill} type="button"><Icon name="sparkles" /><span>Auto Fill</span></button>
        <button className="grid min-h-14 place-items-center rounded-xl px-1 text-xs font-semibold text-stone-600 hover:bg-stone-100" onClick={onShuffle} type="button"><Icon name="shuffle" /><span>Shuffle</span></button>
        <button className="grid min-h-14 place-items-center rounded-xl px-1 text-xs font-semibold text-stone-600 hover:bg-stone-100" onClick={onClear} type="button"><Icon name="trash" /><span>Clear All</span></button>
        <button className="min-h-14 rounded-xl bg-[var(--brand-secondary)] px-2 text-sm font-bold text-white disabled:opacity-40" disabled={!canContinue} onClick={onNext} type="button">Preview</button>
      </div>
    </nav>
  )
}
