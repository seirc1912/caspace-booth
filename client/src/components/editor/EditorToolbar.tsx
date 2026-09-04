import { Icon } from '../ui/Icon'

interface EditorToolbarProps {
  canContinue: boolean
  canOrder?: boolean
  onAutoFill: () => void
  onDownload?: () => void
  onNext: () => void
  onSkip: () => void
  onSave: () => void
  onShuffle: () => void
  nextLabel?: string
  downloading?: boolean
  onPrevious?: () => void
  previousDisabled?: boolean
  skipDisabled?: boolean
  saved?: boolean
  progressLabel?: string | null
}

const utilityActionClass = 'grid min-h-12 min-w-0 place-items-center rounded-xl px-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-35 md:min-h-14 md:text-xs'
const primaryActionClass = 'grid min-h-12 min-w-0 place-items-center rounded-xl px-2 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40 md:min-h-14 md:text-sm md:shadow-none'

export function EditorToolbar({ canContinue, canOrder, onAutoFill, onDownload, onNext, onSkip, onSave, onShuffle, nextLabel = 'Order', downloading = false, onPrevious, previousDisabled = false, skipDisabled = false, saved = false, progressLabel = null }: EditorToolbarProps) {
  return <nav aria-label="Editor actions" className="border-t border-stone-200 bg-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:fixed md:inset-x-0 md:bottom-0 md:z-20 md:bg-white/95 md:px-3 md:pb-[max(0.75rem,env(safe-area-inset-bottom))] md:backdrop-blur-xl">
    <div className="mx-auto max-w-3xl md:flex md:items-stretch md:gap-2">
      <div className="grid grid-cols-4 gap-1 md:flex-1">
        {onPrevious ? <button aria-label="Previous" className={utilityActionClass} disabled={previousDisabled || downloading} onClick={onPrevious} type="button"><Icon name="back" /><span className="hidden sm:inline">Previous</span></button> : <span />}
        <button aria-label="Auto Fill" className={utilityActionClass} disabled={downloading} onClick={onAutoFill} type="button"><Icon name="sparkles" /><span className="hidden sm:inline">Auto Fill</span></button>
        <button aria-label="Shuffle" className={utilityActionClass} disabled={downloading} onClick={onShuffle} type="button"><Icon name="shuffle" /><span className="hidden sm:inline">Shuffle</span></button>
        <button aria-label="Skip to next frame" className={utilityActionClass} disabled={skipDisabled || downloading} onClick={onSkip} type="button"><Icon className="size-5 rotate-180" name="back" /><span>Skip</span></button>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1 md:mt-0 md:w-[22rem]">
        <button aria-label="Save" className={`${primaryActionClass} bg-sky-600`} disabled={!canContinue || downloading} onClick={onSave} type="button">{saved ? 'Saved' : 'Save'}</button>
        {onDownload ? <button aria-label="Download" className={`${primaryActionClass} bg-stone-950`} disabled={!canContinue || downloading} onClick={onDownload} type="button">{downloading ? 'Exporting' : 'Download'}</button> : <span />}
        <button aria-busy={downloading} aria-label={nextLabel} className={`${primaryActionClass} bg-[var(--brand-secondary)]`} disabled={!(canOrder ?? canContinue) || downloading} onClick={onNext} type="button">{downloading ? progressLabel ?? 'Ordering…' : nextLabel}</button>
      </div>
    </div>
  </nav>
}
