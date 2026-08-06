import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { TemplateCanvas } from '../../../components/editor/TemplateCanvas'
import { printSizes } from '../../../data/printSizes'
import { samplePhotos } from '../../../data/samplePhotos'
import { usePathname } from '../../../hooks/usePathname'
import type { PrintTemplate, TemplateDocument, TemplateElement, TemplateGuideSettings, TemplateSlot } from '../../../types/selfBooth'
import { createTemplateBuilderState, createTemplateDocument, templateBuilderReducer } from '../../template-builder/model/templateBuilder'
import { GuideControls } from '../components/GuideControls'
import { LayersPanel } from '../components/LayersPanel'
import { PresetLayoutPicker } from '../components/PresetLayoutPicker'
import { StudioCanvas } from '../components/StudioCanvas'
import { StudioToolPanel } from '../components/StudioToolPanel'
import { useTemplateHistory } from '../hooks/useTemplateHistory'
import { normalizeElementChange } from '../model/canvasEngine'
import { reorderLayer } from '../model/layerManager'
import { layoutPresets } from '../model/layoutPresets'
import type { LayoutPresetId } from '../model/layoutPresets'
import { useAdminTemplates } from '../store/AdminTemplateContext'
import type { AdminAsset } from '../store/AssetLibraryContext'
import type { AdminTemplateInfo, AdminTemplateRecord } from '../types'
import { downloadTemplatePackage } from '../utils/templateDownloads'

const uid = () => globalThis.crypto.randomUUID()
const inputClass = 'mt-1 min-h-10 w-full rounded-lg border border-stone-200 px-3 text-sm font-normal'
const defaultGuides: TemplateGuideSettings = { snapToGrid: true, gridSize: 20, showSafeArea: false, showTrimLine: false, showBleedArea: false }

function asPrintTemplate(document: TemplateDocument, source?: PrintTemplate): PrintTemplate {
  const layers = [
    { id: 'background', type: 'background' as const, zIndex: 0 },
    ...document.slots.map((slot) => ({ id: slot.id, type: 'photoSlot' as const, zIndex: slot.zIndex })),
    ...document.elements.map((element) => ({ id: element.id, type: element.type, zIndex: element.zIndex })),
    ...document.variables.map((variable) => ({ id: variable.id, type: 'dynamicVariable' as const, zIndex: variable.zIndex })),
  ]
  return { ...document, layers, slotCount: document.slots.length, backgroundUrl: source?.backgroundUrl ?? null, thumbnailUrl: source?.thumbnailUrl ?? null }
}

function blankRecord(): AdminTemplateRecord {
  const id = uid()
  return { id, status: 'draft', info: { category: 'Custom', description: '', printSize: '4 × 6 in', dpi: 300, orientation: 'portrait' }, template: asPrintTemplate(createTemplateDocument(id, 'Untitled Template')), coverUrl: null, updatedAt: new Date().toISOString() }
}

function createElement(type: TemplateElement['type']): TemplateElement {
  const label = type === 'dynamicVariable' ? 'Dynamic Variable' : type === 'qrCode' ? 'QR Code' : `${type[0]!.toUpperCase()}${type.slice(1)}`
  return { id: uid(), type, name: label, x: 100, y: 100, width: 400, height: 140, rotation: 0, opacity: 1, zIndex: 5, visible: true, locked: false, content: type === 'text' ? 'Your text' : '', shape: type === 'shape' ? 'rectangle' : undefined, fill: '#e7e5e4', stroke: '#292524', fontFamily: 'Inter', fontSize: 48, fontWeight: 600, textAlign: 'center', color: '#292524', letterSpacing: 0, shadowColor: '#000000', shadowBlur: 0, shadowX: 0, shadowY: 0, variableType: type === 'dynamicVariable' ? 'brandName' : undefined, editableRules: { canEdit: type === 'text', canMove: true, canResize: true, canRotate: true } }
}

export function AdminTemplateEditorPage({ templateId }: { templateId: string | null }) {
  const store = useAdminTemplates()
  const { navigate } = usePathname()
  const initial = useMemo(() => templateId ? store.templates.find((item) => item.id === templateId) ?? blankRecord() : blankRecord(), [store.templates, templateId])
  const history = useTemplateHistory(structuredClone(initial.template))
  const [info, setInfo] = useState<AdminTemplateInfo>(initial.info)
  const [coverUrl, setCoverUrl] = useState(initial.coverUrl)
  const [backgroundUrl, setBackgroundUrl] = useState(initial.template.backgroundUrl)
  const [thumbnailUrl, setThumbnailUrl] = useState(initial.template.thumbnailUrl)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [zoom, setZoom] = useState(0.75)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [previewPhotos, setPreviewPhotos] = useState(false)
  const guides = history.document.settings ?? defaultGuides
  const template = { ...asPrintTemplate(history.document, initial.template), backgroundUrl, thumbnailUrl }
  const selectedSlot = template.slots.find((slot) => selectedIds.includes(slot.id))
  const selectedElement = template.elements.find((element) => selectedIds.includes(element.id))
  const previewSlots = template.slots.map((_, index) => ({ photo: samplePhotos[index % samplePhotos.length]!, transform: { zoom: 1, rotation: 0, x: 0, y: 0 } }))

  const commitBuilder = (action: Parameters<typeof templateBuilderReducer>[1]) => {
    const state = createTemplateBuilderState(history.document)
    state.selectedSlotId = selectedIds[0] ?? null
    state.snapToGrid = guides.snapToGrid
    state.gridSize = guides.gridSize
    const next = templateBuilderReducer(state, action)
    history.commit(next.document)
    if (next.selectedSlotId) setSelectedIds([next.selectedSlotId])
  }
  const changeSlot = (id: string, changes: Partial<Omit<TemplateSlot, 'id'>>) => commitBuilder({ type: 'update-slot', slotId: id, changes })
  const changeElementById = (id: string, changes: Partial<Omit<TemplateElement, 'id'>>) => {
    const element = history.document.elements.find((item) => item.id === id)
    if (element) commitBuilder({ type: 'update-element', elementId: id, changes: normalizeElementChange(element, changes, history.document.canvas, guides) })
  }
  const changeElement = (changes: Partial<Omit<TemplateElement, 'id'>>) => { if (selectedElement) changeElementById(selectedElement.id, changes) }
  const select = (id: string, additive: boolean) => setSelectedIds((current) => additive ? current.includes(id) ? current.filter((item) => item !== id) : [...current, id] : [id])

  const addElement = (type: TemplateElement['type']) => {
    const element = createElement(type)
    commitBuilder({ type: 'add-element', element })
    setSelectedIds([element.id])
  }
  const deleteLayer = (id: string) => {
    history.commit({ ...history.document, slots: history.document.slots.filter((slot) => slot.id !== id), elements: history.document.elements.filter((element) => element.id !== id), variables: history.document.variables.filter((variable) => variable.id !== id) })
    setSelectedIds((current) => current.filter((item) => item !== id))
  }
  const removeSelected = () => selectedIds.forEach(deleteLayer)
  const duplicateLayer = (id: string) => {
    const slot = history.document.slots.find((item) => item.id === id)
    if (slot) {
      const state = createTemplateBuilderState(history.document)
      state.gridSize = guides.gridSize
      const next = templateBuilderReducer(state, { type: 'duplicate-slot', slotId: id })
      history.commit(next.document)
      setSelectedIds(next.selectedSlotId ? [next.selectedSlotId] : [])
      return
    }
    const source = history.document.elements.find((item) => item.id === id)
    if (!source) return
    const copy = { ...source, id: uid(), name: `${source.name} Copy`, x: source.x + guides.gridSize, y: source.y + guides.gridSize, zIndex: source.zIndex + 1 }
    history.commit({ ...history.document, elements: [...history.document.elements, copy] })
    setSelectedIds([copy.id])
  }
  const duplicateSelected = () => selectedIds.forEach(duplicateLayer)
  const reorder = (sourceId: string, targetId: string) => history.commit(reorderLayer(history.document, sourceId, targetId))
  const useLibraryAsset = (asset: AdminAsset) => {
    if (asset.type === 'background') setBackgroundUrl(asset.dataUrl)
    else if (asset.type === 'cover') setCoverUrl(asset.dataUrl)
    else if (asset.type === 'thumbnail') setThumbnailUrl(asset.dataUrl)
    else {
      const element = { ...createElement(asset.type), assetUrl: asset.dataUrl, name: asset.name }
      commitBuilder({ type: 'add-element', element })
      setSelectedIds([element.id])
    }
  }

  const uploadTemplateAsset = (target: 'cover' | 'thumbnail' | 'background') => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file?.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    if (target === 'cover') setCoverUrl(url)
    else if (target === 'thumbnail') setThumbnailUrl(url)
    else setBackgroundUrl(url)
  }
  const uploadLayerAsset = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file?.type.startsWith('image/')) changeElement({ assetUrl: URL.createObjectURL(file) })
  }
  const applyPreset = (presetId: LayoutPresetId) => {
    const preset = layoutPresets.find((item) => item.id === presetId)
    if (!preset || (template.slots.length > 0 && !window.confirm('Replace the current photo slots with this preset?'))) return
    history.commit({ ...history.document, slots: preset.createSlots(template.canvas.width, template.canvas.height) })
    setSelectedIds([])
  }
  const save = (status = initial.status) => {
    store.save({ ...initial, status, info, coverUrl, updatedAt: new Date().toISOString(), template: { ...template, settings: guides, backgroundUrl, thumbnailUrl } })
    navigate('/admin/templates')
  }

  return <div className="min-w-0">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><button className="text-sm font-semibold text-stone-500" onClick={() => navigate('/admin/templates')} type="button">Back to templates</button><h1 className="mt-1 text-2xl font-bold">{template.name}</h1></div><div className="flex flex-wrap gap-2"><button className="min-h-11 rounded-xl border border-stone-200 bg-white px-4 text-sm font-semibold" onClick={() => downloadTemplatePackage({ ...initial, info, coverUrl, template })} type="button">Generate package</button><button className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white" onClick={() => save('published')} type="button">Publish</button><button className="min-h-11 rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white" onClick={() => save('draft')} type="button">Save draft</button></div></header>
    <nav aria-label="Template editor tools" className="mb-3 flex flex-wrap gap-1 rounded-xl bg-white p-2 shadow-sm"><button className="tool-button" disabled={!history.canUndo} onClick={history.undo} type="button">Undo</button><button className="tool-button" disabled={!history.canRedo} onClick={history.redo} type="button">Redo</button><span className="mx-1 w-px bg-stone-200" /><button className="tool-button font-semibold" onClick={() => commitBuilder({ type: 'add-slot' })} type="button">+ Photo slot</button>{(['text', 'image', 'shape', 'sticker', 'logo', 'overlay', 'qrCode', 'dynamicVariable'] as const).map((type) => <button className="tool-button capitalize" key={type} onClick={() => addElement(type)} type="button">{type === 'qrCode' ? 'QR' : type === 'dynamicVariable' ? 'Variable' : type}</button>)}<span className="mx-1 w-px bg-stone-200" /><button className="tool-button" disabled={!selectedIds.length} onClick={duplicateSelected} type="button">Duplicate</button><button className="tool-button text-rose-600" disabled={!selectedIds.length} onClick={removeSelected} type="button">Delete</button><span className="mx-1 w-px bg-stone-200" /><button className="tool-button" onClick={() => setZoom((value) => Math.max(0.25, value - 0.1))} type="button">Zoom out</button><span className="grid min-h-10 place-items-center px-2 text-xs font-bold">{Math.round(zoom * 100)}%</span><button className="tool-button" onClick={() => setZoom((value) => Math.min(2, value + 0.1))} type="button">Zoom in</button><button className={`tool-button ${previewPhotos ? 'bg-violet-100 text-violet-700' : ''}`} onClick={() => setPreviewPhotos((value) => !value)} type="button">Live preview</button></nav>
    <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_19rem]">
      <div className="grid content-start gap-4"><StudioToolPanel onAddElement={addElement} onAddPhotoSlot={() => commitBuilder({ type: 'add-slot' })} onUseAsset={useLibraryAsset} /><PresetLayoutPicker onApply={applyPreset} /></div>
      <div>{previewPhotos ? <div className="grid h-[65dvh] min-h-[32rem] place-items-center overflow-auto rounded-2xl bg-stone-200 p-12"><div className="w-full max-w-xl" style={{ transform: `scale(${zoom})` }}><TemplateCanvas activeSlot={null} onActiveSlotChange={() => undefined} onAdd={() => undefined} onRemove={() => undefined} onReplace={() => undefined} onTransform={() => undefined} readonly slots={previewSlots} template={template} /></div></div> : <StudioCanvas guides={guides} onClearSelection={() => setSelectedIds([])} onElementChange={changeElementById} onMove={(id, x, y) => changeSlot(id, { x, y })} onResize={(id, width, height) => changeSlot(id, { width, height })} onSelect={select} pan={pan} selectedSlotIds={selectedIds} template={template} zoom={zoom} />}<div className="mt-2 flex justify-center gap-2"><button className="rounded-lg bg-white px-3 py-2 text-xs" onClick={() => setPan((value) => ({ ...value, x: value.x - 30 }))} type="button">Pan left</button><button className="rounded-lg bg-white px-3 py-2 text-xs" onClick={() => setPan({ x: 0, y: 0 })} type="button">Center</button><button className="rounded-lg bg-white px-3 py-2 text-xs" onClick={() => setPan((value) => ({ ...value, x: value.x + 30 }))} type="button">Pan right</button></div></div>
      <aside className="grid content-start gap-4">
        <section className="panel"><h2 className="text-sm font-bold">Template</h2><div className="mt-3 grid gap-3"><label className="field">Name<input className={inputClass} onChange={(event) => history.commit({ ...history.document, name: event.target.value })} value={template.name} /></label><label className="field">Category<input className={inputClass} onChange={(event) => setInfo((value) => ({ ...value, category: event.target.value }))} value={info.category} /></label><label className="field">Print size<select className={inputClass} onChange={(event) => setInfo((value) => ({ ...value, printSize: event.target.value }))} value={info.printSize}>{printSizes.map((size) => <option key={size.id}>{size.label}</option>)}</select></label><label className="field">Orientation<select className={inputClass} onChange={(event) => setInfo((value) => ({ ...value, orientation: event.target.value as AdminTemplateInfo['orientation'] }))} value={info.orientation}><option value="portrait">Portrait</option><option value="landscape">Landscape</option><option value="square">Square</option></select></label><div className="grid grid-cols-2 gap-2"><NumberField label="Width" value={template.canvas.width} onChange={(width) => history.commit({ ...history.document, canvas: { ...history.document.canvas, width } })} /><NumberField label="Height" value={template.canvas.height} onChange={(height) => history.commit({ ...history.document, canvas: { ...history.document.canvas, height } })} /></div><NumberField label="DPI" value={info.dpi} onChange={(dpi) => setInfo((value) => ({ ...value, dpi }))} /></div></section>
        <section className="panel"><h2 className="text-sm font-bold">Template assets</h2>{(['cover', 'thumbnail', 'background'] as const).map((assetName) => <label className="mt-2 flex min-h-10 cursor-pointer items-center justify-between rounded-lg bg-stone-100 px-3 text-xs font-semibold capitalize" key={assetName}>{assetName}<input accept="image/*" className="sr-only" onChange={uploadTemplateAsset(assetName)} type="file" /></label>)}</section>
        <GuideControls onChange={(settings) => history.commit({ ...history.document, settings })} settings={guides} />
        {selectedSlot ? <SlotInspector onChange={(changes) => changeSlot(selectedSlot.id, changes)} slot={selectedSlot} /> : null}
        {selectedElement ? <ElementInspector element={selectedElement} onAsset={uploadLayerAsset} onChange={changeElement} /> : null}
      </aside>
      <div className="xl:col-span-3"><LayersPanel onDelete={deleteLayer} onDuplicate={duplicateLayer} onElementChange={changeElementById} onReorder={reorder} onSelect={select} onSlotChange={changeSlot} selectedIds={selectedIds} template={template} /></div>
    </div>
  </div>
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="field">{label}<input className={inputClass} onChange={(event) => onChange(Number(event.target.value))} type="number" value={value} /></label>
}

function SlotInspector({ slot, onChange }: { slot: TemplateSlot; onChange: (changes: Partial<TemplateSlot>) => void }) {
  const rules = slot.editableRules ?? { canReplace: true, canMove: true, canZoom: true, canRotate: true }
  return <section className="panel"><h2 className="text-sm font-bold">Photo slot</h2><label className="field mt-3 block">Layer name<input className={inputClass} onChange={(event) => onChange({ name: event.target.value })} value={slot.name ?? slot.id} /></label><div className="mt-3 grid grid-cols-2 gap-2">{(['x', 'y', 'width', 'height', 'rotation', 'borderRadius', 'opacity', 'zIndex'] as const).map((key) => <NumberField key={key} label={key} value={slot[key] ?? (key === 'opacity' ? 1 : 0)} onChange={(value) => onChange({ [key]: value })} />)}</div><div className="mt-3 grid grid-cols-2 gap-2"><label className="field">Mask<select className={inputClass} onChange={(event) => onChange({ mask: event.target.value as TemplateSlot['mask'] })} value={slot.mask ?? 'rectangle'}><option value="rectangle">Rectangle</option><option value="rounded">Rounded</option><option value="circle">Circle</option></select></label><label className="field">Crop mode<select className={inputClass} onChange={(event) => onChange({ cropMode: event.target.value as TemplateSlot['cropMode'] })} value={slot.cropMode ?? 'cover'}><option value="cover">Cover</option><option value="contain">Contain</option></select></label></div><label className="mt-3 flex items-center gap-2 text-xs font-semibold"><input checked={slot.lockAspectRatio} onChange={(event) => onChange({ lockAspectRatio: event.target.checked })} type="checkbox" />Lock aspect ratio</label><h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-stone-400">Customer permissions</h3><div className="mt-2 grid grid-cols-2 gap-2">{(['canReplace', 'canMove', 'canZoom', 'canRotate'] as const).map((rule) => <label className="flex items-center gap-2 text-xs font-semibold" key={rule}><input checked={rules[rule]} onChange={(event) => onChange({ editableRules: { ...rules, [rule]: event.target.checked } })} type="checkbox" />{rule.slice(3)}</label>)}</div></section>
}

function ElementInspector({ element, onChange, onAsset }: { element: TemplateElement; onChange: (changes: Partial<TemplateElement>) => void; onAsset: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const rules = element.editableRules ?? { canEdit: element.type === 'text', canMove: true, canResize: true, canRotate: true }
  return <section className="panel"><h2 className="text-sm font-bold capitalize">{element.type} layer</h2><label className="field mt-3 block">Layer name<input className={inputClass} onChange={(event) => onChange({ name: event.target.value })} value={element.name} /></label><div className="mt-3 grid grid-cols-2 gap-2">{(['x', 'y', 'width', 'height', 'rotation', 'opacity', 'zIndex'] as const).map((key) => <NumberField key={key} label={key} value={element[key]} onChange={(value) => onChange({ [key]: value })} />)}</div>{element.type === 'text' ? <div className="mt-3 grid gap-2"><label className="field">Content<input className={inputClass} onChange={(event) => onChange({ content: event.target.value })} value={element.content ?? ''} /></label><label className="field">Font<select className={inputClass} onChange={(event) => onChange({ fontFamily: event.target.value })} value={element.fontFamily}><option>Inter</option><option>Arial</option><option>Georgia</option><option>Courier New</option></select></label><div className="grid grid-cols-2 gap-2"><NumberField label="Size" value={element.fontSize ?? 48} onChange={(fontSize) => onChange({ fontSize })} /><NumberField label="Weight" value={element.fontWeight ?? 400} onChange={(fontWeight) => onChange({ fontWeight })} /><NumberField label="Letter spacing" value={element.letterSpacing ?? 0} onChange={(letterSpacing) => onChange({ letterSpacing })} /><NumberField label="Shadow blur" value={element.shadowBlur ?? 0} onChange={(shadowBlur) => onChange({ shadowBlur })} /></div><label className="field">Alignment<select className={inputClass} onChange={(event) => onChange({ textAlign: event.target.value as TemplateElement['textAlign'] })} value={element.textAlign}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><div className="grid grid-cols-2 gap-2"><label className="field">Color<input className="mt-1 h-10 w-full" onChange={(event) => onChange({ color: event.target.value })} type="color" value={element.color} /></label><label className="field">Shadow<input className="mt-1 h-10 w-full" onChange={(event) => onChange({ shadowColor: event.target.value })} type="color" value={element.shadowColor} /></label></div></div> : null}{element.type === 'shape' ? <div className="mt-3 grid gap-2"><label className="field">Shape<select className={inputClass} onChange={(event) => onChange({ shape: event.target.value as TemplateElement['shape'] })} value={element.shape}><option value="rectangle">Rectangle</option><option value="circle">Circle</option><option value="line">Line</option><option value="svg">SVG</option></select></label>{element.shape === 'svg' ? <label className="field">SVG markup<textarea className={`${inputClass} py-2`} onChange={(event) => onChange({ customSvg: event.target.value })} value={element.customSvg ?? ''} /></label> : null}</div> : null}{element.type === 'dynamicVariable' ? <label className="field mt-3 block">Variable<select className={inputClass} onChange={(event) => onChange({ variableType: event.target.value as TemplateElement['variableType'] })} value={element.variableType}><option value="brandLogo">Brand Logo</option><option value="brandName">Brand Name</option><option value="website">Website</option><option value="date">Date</option><option value="time">Time</option><option value="sessionId">Session ID</option><option value="qrCode">QR Code</option><option value="customText">Custom Text</option></select></label> : null}{element.type === 'image' || element.type === 'logo' || element.type === 'sticker' || element.type === 'overlay' ? <label className="mt-3 flex min-h-10 cursor-pointer items-center justify-between rounded-lg bg-stone-100 px-3 text-xs font-semibold">Upload image<input accept="image/*" className="sr-only" onChange={onAsset} type="file" /></label> : null}<h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-stone-400">Customer permissions</h3><div className="mt-2 grid grid-cols-2 gap-2">{(['canEdit', 'canMove', 'canResize', 'canRotate'] as const).map((rule) => <label className="flex items-center gap-2 text-xs font-semibold" key={rule}><input checked={rules[rule]} onChange={(event) => onChange({ editableRules: { ...rules, [rule]: event.target.checked } })} type="checkbox" />{rule.slice(3)}</label>)}</div></section>
}
