import { Icon } from '../ui/Icon'
import type { PhotoFilter } from '../../features/photos/photoFilter'

interface EditorToolbarProps {
  canContinue: boolean
  canOrder?: boolean
  filter: PhotoFilter
  filterDisabled?: boolean
  allBwEnabled?: boolean
  onDownload?: () => void
  onFilterChange: (filter: PhotoFilter) => void
  onToggleAllBw?: () => void
  onNext: () => void
  onSkip: () => void
  onSave: () => void
  nextLabel?: string
  downloading?: boolean
  onPrevious?: () => void
  previousDisabled?: boolean
  skipDisabled?: boolean
  saved?: boolean
  progressLabel?: string | null
}

const utilityActionClass = 'flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-35 md:min-h-14 md:text-xs'
const primaryActionClass = 'grid min-h-11 min-w-0 place-items-center rounded-xl px-1.5 text-[11px] font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40 md:min-h-14 md:px-2 md:text-sm md:shadow-none'
const filterActionClass = (active: boolean) => `${utilityActionClass} ${active ? 'bg-stone-950 text-white hover:bg-stone-950' : ''}`

export function EditorToolbar({ canContinue, canOrder, filter, filterDisabled = false, allBwEnabled = false, onDownload, onFilterChange, onToggleAllBw, onNext, onSkip, onSave, nextLabel = 'Order', downloading = false, onPrevious, previousDisabled = false, skipDisabled = false, saved = false, progressLabel = null }: EditorToolbarProps) {
  return <nav aria-label="Editor actions" className="border-t border-stone-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl md:fixed md:inset-x-0 md:bottom-0 md:z-20 md:px-3 md:pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pt-2">
    <div className="mx-auto max-w-3xl md:flex md:items-stretch md:gap-2">
      <div className="grid grid-cols-[minmax(0,0.65fr)_minmax(0,1.9fr)_minmax(0,0.65fr)] gap-1 md:flex-1">
        {onPrevious ? <button aria-label="Back to previous frame" className={utilityActionClass} disabled={previousDisabled || downloading} onClick={onPrevious} type="button"><Icon name="back" /><span>Back</span></button> : <span />}
        <div className="grid grid-cols-3 rounded-xl bg-stone-100 p-0.5"><button aria-label="Original photo" aria-pressed={!allBwEnabled && filter === 'none'} className={filterActionClass(!allBwEnabled && filter === 'none')} disabled={allBwEnabled || filterDisabled || downloading} onClick={() => onFilterChange('none')} type="button">Original</button><button aria-label="Black and white photo" aria-pressed={!allBwEnabled && filter === 'grayscale'} className={filterActionClass(!allBwEnabled && filter === 'grayscale')} disabled={allBwEnabled || filterDisabled || downloading} onClick={() => onFilterChange('grayscale')} type="button">B&amp;W</button><button aria-label="Black and white all photos" aria-pressed={allBwEnabled} className={filterActionClass(allBwEnabled)} disabled={!onToggleAllBw || downloading} onClick={onToggleAllBw} type="button">All B&amp;W</button></div>
        <button aria-label="Skip to next frame" className={utilityActionClass} disabled={skipDisabled || downloading} onClick={onSkip} type="button"><Icon className="size-5 rotate-180" name="back" /><span>Skip</span></button>
      </div>
      <div className="mt-0.5 grid grid-cols-3 gap-1 md:mt-0 md:w-[22rem]">
        <button aria-label="Save" className={`${primaryActionClass} bg-sky-600`} disabled={!canContinue || downloading} onClick={onSave} type="button">{saved ? 'Saved' : 'Save'}</button>
        {onDownload ? <button aria-label="Save Photo" className={`${primaryActionClass} bg-stone-950`} disabled={!canContinue || downloading} onClick={onDownload} type="button">{downloading ? 'Preparing' : 'Save Photo'}</button> : <span />}
        <button aria-busy={downloading} aria-label={nextLabel} className={`${primaryActionClass} bg-[var(--brand-secondary)]`} disabled={!(canOrder ?? canContinue) || downloading} onClick={onNext} type="button">{downloading ? progressLabel ?? 'Ordering…' : nextLabel}</button>
      </div>
    </div>
  </nav>
}
