interface CropToolbarProps {
  fit: 'contain' | 'cover'
  onCancel: () => void
  onDone: () => void
  onFitChange: (fit: 'contain' | 'cover') => void
  onReset: () => void
}

export function CropToolbar({ fit, onCancel, onDone, onFitChange, onReset }: CropToolbarProps) {
  const chip = (active: boolean) => `min-h-11 rounded-full px-4 text-xs font-bold transition ${active ? 'bg-white text-stone-950 shadow-sm' : 'text-white hover:bg-white/10'}`
  return <div className="fixed inset-x-0 bottom-[calc(13.25rem+env(safe-area-inset-bottom))] z-30 px-3 md:bottom-5"><div className="mx-auto flex max-w-md items-center justify-between gap-2"><div className="flex items-center gap-1 rounded-[28px] bg-stone-950/88 p-1.5 shadow-xl backdrop-blur-xl" role="group" aria-label="Crop fit"><button aria-pressed={fit === 'contain'} className={chip(fit === 'contain')} onClick={() => onFitChange('contain')} type="button">Contain</button><button aria-pressed={fit === 'cover'} className={chip(fit === 'cover')} onClick={() => onFitChange('cover')} type="button">Cover</button><button className={chip(false)} onClick={onReset} type="button">Reset</button></div><div className="flex items-center gap-1 rounded-[28px] bg-white/95 p-1.5 shadow-xl backdrop-blur-xl"><button className="min-h-11 rounded-full px-3 text-xs font-bold text-stone-500" onClick={onCancel} type="button">Cancel</button><button className="min-h-11 rounded-full bg-[var(--brand-secondary)] px-5 text-xs font-black text-white shadow-sm" onClick={onDone} type="button">Done</button></div></div></div>
}
