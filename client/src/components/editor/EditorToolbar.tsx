import { Icon } from '../ui/Icon'

interface EditorToolbarProps {
  canContinue: boolean
  onAutoFill: () => void
  onClear: () => void
  onNext: () => void
  onShuffle: () => void
  onDownload?: () => void
  nextLabel?: string
  downloading?: boolean
  onPrevious?: () => void
  previousDisabled?: boolean
}

const actionClass = 'grid min-h-12 min-w-0 place-items-center rounded-xl px-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-35 md:min-h-14 md:text-xs'

export function EditorToolbar({ canContinue, onAutoFill, onClear, onNext, onShuffle, onDownload, nextLabel = 'Order', downloading = false, onPrevious, previousDisabled = false }: EditorToolbarProps) {
  return <nav aria-label="Editor actions" className="fixed inset-x-0 bottom-0 z-20 overflow-x-clip border-t border-stone-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:px-3 md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
    <div className={`mx-auto grid max-w-3xl grid-cols-6 gap-1 ${onPrevious ? 'md:grid-cols-6' : onDownload ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
      {onPrevious ? <button aria-label="Previous" className={actionClass} disabled={previousDisabled || downloading} onClick={onPrevious} type="button"><Icon name="back" /><span className="hidden sm:inline">Previous</span></button> : null}
      <button aria-label="Auto Fill" className={actionClass} onClick={onAutoFill} type="button"><Icon name="sparkles" /><span className="hidden sm:inline">Auto Fill</span></button>
      <button aria-label="Shuffle" className={actionClass} onClick={onShuffle} type="button"><Icon name="shuffle" /><span className="hidden sm:inline">Shuffle</span></button>
      <button aria-label="Clear All" className={actionClass} onClick={onClear} type="button"><Icon name="trash" /><span className="hidden sm:inline">Clear All</span></button>
      {onDownload ? <button aria-label="Download" className={actionClass} disabled={!canContinue || downloading} onClick={onDownload} type="button"><Icon name="download" /><span className="hidden sm:inline">{downloading ? 'Exporting' : 'Download'}</span></button> : null}
      <button aria-busy={downloading} aria-label={nextLabel} className="min-h-12 min-w-0 rounded-xl bg-[var(--brand-secondary)] px-1 text-xs font-bold text-white shadow-sm disabled:opacity-40 md:min-h-14 md:px-2 md:text-sm md:shadow-none" disabled={!canContinue || downloading} onClick={onNext} type="button">{downloading ? 'Ordering…' : nextLabel}</button>
    </div>
  </nav>
}
