import { useState } from 'react'
import type { ChangeEvent } from 'react'
import type { TemplateElementType } from '../../../types/selfBooth'
import { useAssetLibrary } from '../store/AssetLibraryContext'
import type { AdminAsset, AdminAssetType } from '../store/AssetLibraryContext'

type ToolTab = 'templates' | 'uploads' | 'assets' | 'elements' | 'text' | 'shapes'

interface StudioToolPanelProps {
  onAddElement: (type: TemplateElementType) => void
  onAddPhotoSlot: () => void
  onUseAsset: (asset: AdminAsset) => void
}

const tabs: Array<{ id: ToolTab; label: string }> = [
  { id: 'templates', label: 'Templates' }, { id: 'uploads', label: 'Uploads' }, { id: 'assets', label: 'Assets' },
  { id: 'elements', label: 'Elements' }, { id: 'text', label: 'Text' }, { id: 'shapes', label: 'Shapes' },
]

export function StudioToolPanel({ onAddElement, onAddPhotoSlot, onUseAsset }: StudioToolPanelProps) {
  const [active, setActive] = useState<ToolTab>('elements')
  const [assetType, setAssetType] = useState<AdminAssetType>('background')
  const library = useAssetLibrary()
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) await library.add(event.target.files, assetType)
    event.target.value = ''
  }
  return <aside className="panel min-w-0">
    <div className="grid grid-cols-3 gap-1" role="tablist">{tabs.map((tab) => <button aria-selected={active === tab.id} className={`min-h-10 rounded-lg px-1 text-[11px] font-semibold ${active === tab.id ? 'bg-violet-100 text-violet-700' : 'bg-stone-50 text-stone-600'}`} key={tab.id} onClick={() => setActive(tab.id)} role="tab" type="button">{tab.label}</button>)}</div>
    <div className="mt-4">
      {active === 'templates' ? <p className="text-xs leading-5 text-stone-500">Choose presets below or return to the template library to duplicate an existing design.</p> : null}
      {active === 'uploads' ? <div className="grid gap-3"><label className="field">Asset type<select className="mt-1 min-h-10 w-full rounded-lg border border-stone-200 px-2" onChange={(event) => setAssetType(event.target.value as AdminAssetType)} value={assetType}>{(['background', 'cover', 'thumbnail', 'logo', 'sticker', 'overlay'] as const).map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label className="grid min-h-24 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-stone-200 px-3 text-center text-xs font-semibold text-stone-500">Upload PNG or SVG<input accept="image/png,image/svg+xml,image/jpeg,image/webp" className="sr-only" multiple onChange={upload} type="file" /></label><p className="text-[11px] text-stone-400">Up to 5 MB per asset. Stored locally in this frontend-only build.</p></div> : null}
      {active === 'assets' || active === 'uploads' ? <div className="mt-3 grid grid-cols-2 gap-2">{library.assets.map((asset) => <div className="group relative overflow-hidden rounded-lg border border-stone-100" key={asset.id}><button className="w-full" onClick={() => onUseAsset(asset)} title={`Use ${asset.name}`} type="button"><img alt="" className="aspect-square w-full object-cover" src={asset.dataUrl} /><span className="block truncate px-1 py-1 text-[10px]">{asset.name}</span></button><button aria-label={`Delete ${asset.name}`} className="absolute right-1 top-1 hidden size-7 rounded-full bg-white/90 text-xs text-rose-600 group-hover:block focus:block" onClick={() => library.remove(asset.id)} type="button">×</button></div>)}</div> : null}
      {active === 'elements' ? <div className="grid grid-cols-2 gap-2"><ToolButton label="Frame" onClick={onAddPhotoSlot} /><ToolButton label="Image" onClick={() => onAddElement('image')} /><ToolButton label="Sticker" onClick={() => onAddElement('sticker')} /><ToolButton label="Logo" onClick={() => onAddElement('logo')} /><ToolButton label="Overlay" onClick={() => onAddElement('overlay')} /><ToolButton label="QR code" onClick={() => onAddElement('qrCode')} /><ToolButton label="Variable" onClick={() => onAddElement('dynamicVariable')} /></div> : null}
      {active === 'text' ? <ToolButton label="Add text" onClick={() => onAddElement('text')} /> : null}
      {active === 'shapes' ? <div className="grid grid-cols-2 gap-2"><ToolButton label="Rectangle" onClick={() => onAddElement('shape')} /><ToolButton label="Circle" onClick={() => onAddElement('shape')} /><ToolButton label="Line" onClick={() => onAddElement('shape')} /><ToolButton label="Custom SVG" onClick={() => onAddElement('shape')} /></div> : null}
    </div>
  </aside>
}

function ToolButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="min-h-12 rounded-xl border border-stone-200 bg-stone-50 px-2 text-xs font-semibold hover:border-violet-300 hover:bg-violet-50" onClick={onClick} type="button">{label}</button>
}
