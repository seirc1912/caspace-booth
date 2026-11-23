import { Icon, type IconName } from '../ui/Icon'

interface EditorToolbarProps {
  /** A filled slot is selected. */
  hasPhoto: boolean
  /** Label/action of the 5th button: replace the selected photo, or add photos to empty slots. */
  replaceMode: 'replace' | 'add'
  replaceDisabled: boolean
  autoFillDisabled: boolean
  autoFillBusy: boolean
  cropActive: boolean
  bwActive: boolean
  bwDisabled: boolean
  disabled?: boolean
  onAutoFill: () => void
  onCrop: () => void
  onZoom: () => void
  onToggleBw: () => void
  onReplace: () => void
  onRemove: () => void
}

interface ToolProps { icon: IconName; label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; danger?: boolean; busy?: boolean }

function Tool({ icon, label, onClick, disabled = false, pressed, danger = false, busy = false }: ToolProps) {
  return <button aria-busy={busy || undefined} aria-pressed={pressed} className={`cs-press flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-[14px] px-0 text-[11px] font-bold leading-tight tracking-[-0.015em] min-[380px]:whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40 ${pressed ? 'cs-btn-primary' : 'hover:bg-white/70'} ${danger && !pressed ? 'text-cs-red-text' : pressed ? '' : 'text-cs-ink'}`} disabled={disabled} onClick={onClick} type="button">
    {busy ? <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <Icon className="size-5" name={icon} />}
    <span className="max-w-full text-center">{label}</span>
  </button>
}

/** Six slot tools: Tự xếp · Cắt · Phóng to · Đen trắng · Thay ảnh · Xoá. */
export function EditorToolbar({ hasPhoto, replaceMode, replaceDisabled, autoFillDisabled, autoFillBusy, cropActive, bwActive, bwDisabled, disabled = false, onAutoFill, onCrop, onZoom, onToggleBw, onReplace, onRemove }: EditorToolbarProps) {
  return <div aria-label="Công cụ chỉnh ảnh" className="cs-panel grid grid-cols-6 gap-px rounded-[20px] p-1" role="toolbar">
    <Tool busy={autoFillBusy} disabled={disabled || autoFillDisabled} icon="sparkles" label="Tự xếp" onClick={onAutoFill} />
    <Tool disabled={disabled || !hasPhoto} icon="crop" label="Cắt" onClick={onCrop} pressed={cropActive} />
    <Tool disabled={disabled || !hasPhoto} icon="zoomIn" label="Phóng to" onClick={onZoom} />
    <Tool disabled={disabled || bwDisabled} icon="contrast" label="Đen trắng" onClick={onToggleBw} pressed={bwActive} />
    <Tool disabled={disabled || replaceDisabled} icon={replaceMode === 'add' ? 'add' : 'swap'} label={replaceMode === 'add' ? 'Thêm ảnh' : 'Thay ảnh'} onClick={onReplace} />
    <Tool danger disabled={disabled || !hasPhoto} icon="trash" label="Xoá" onClick={onRemove} />
  </div>
}
