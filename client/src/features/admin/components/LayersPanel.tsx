import { useState } from 'react'
import type { PrintTemplate } from '../../../types/selfBooth'

interface LayersPanelProps {
  template: PrintTemplate
  selectedIds: string[]
  onSelect: (id: string, additive: boolean) => void
  onSlotChange: (id: string, changes: Record<string, unknown>) => void
  onElementChange: (id: string, changes: Record<string, unknown>) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onReorder: (sourceId: string, targetId: string) => void
}

export function LayersPanel({ template, selectedIds, onSelect, onSlotChange, onElementChange, onDuplicate, onDelete, onReorder }: LayersPanelProps) {
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const rows = [
    ...template.elements.map((item) => ({ id: item.id, name: item.name, type: item.type, visible: item.visible, locked: item.locked, zIndex: item.zIndex, kind: 'element' as const })),
    ...template.variables.map((item) => ({ id: item.id, name: item.type, type: 'dynamic', visible: true, locked: false, zIndex: item.zIndex, kind: 'variable' as const })),
    ...template.slots.map((item) => ({ id: item.id, name: item.name ?? item.id, type: 'photo', visible: item.visible !== false, locked: item.locked ?? false, zIndex: item.zIndex, kind: 'slot' as const })),
  ].sort((left, right) => right.zIndex - left.zIndex)

  const change = (row: typeof rows[number], changes: Record<string, unknown>) => row.kind === 'slot' ? onSlotChange(row.id, changes) : row.kind === 'element' ? onElementChange(row.id, changes) : undefined
  const finishRename = (row: typeof rows[number]) => {
    const name = renaming?.value.trim()
    if (name && renaming?.id === row.id) change(row, { name })
    setRenaming(null)
  }

  return <aside className="rounded-2xl bg-white p-3 shadow-sm"><h2 className="px-2 py-2 text-sm font-bold">Layers <span className="ml-1 font-normal text-stone-400">drag to reorder</span></h2><div className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm"><span className="text-xs text-stone-400">BG</span><span className="flex-1">Background</span><span className="text-xs text-stone-400">Base</span></div><div className="mt-1 grid gap-0.5 sm:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <div className={`group flex min-h-10 items-center rounded-lg border border-transparent transition-colors ${selectedIds.includes(row.id) ? 'border-sky-200 bg-sky-50 text-sky-700' : 'hover:bg-stone-50'}`} draggable={!renaming} key={row.id} onDragOver={(event) => event.preventDefault()} onDragStart={(event) => event.dataTransfer.setData('text/plain', row.id)} onDrop={(event) => { event.preventDefault(); onReorder(event.dataTransfer.getData('text/plain'), row.id) }}>{renaming?.id === row.id ? <div className="flex min-w-0 flex-1 items-center gap-1 px-2"><span className="w-5 text-[10px] uppercase text-stone-400">{row.type.slice(0, 2)}</span><input aria-label={`Rename ${row.name}`} autoFocus className="min-w-0 flex-1 rounded border border-sky-300 bg-white px-2 py-1 text-xs outline-none ring-sky-100 focus:ring-2" onBlur={() => finishRename(row)} onChange={(event) => setRenaming({ id: row.id, value: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') finishRename(row); if (event.key === 'Escape') setRenaming(null) }} value={renaming.value} /></div> : <button className="flex min-w-0 flex-1 items-center gap-2 self-stretch px-2 text-left text-xs" onClick={(event) => onSelect(row.id, event.shiftKey)} onDoubleClick={() => { if (row.kind !== 'variable') setRenaming({ id: row.id, value: row.name }) }} type="button"><span className="w-5 cursor-grab uppercase text-stone-400">{row.type.slice(0, 2)}</span><span className="min-w-0 flex-1 truncate font-medium">{row.name}</span></button>}{row.kind !== 'variable' ? <><button aria-label={`Rename ${row.name}`} className="size-8 text-[10px] opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => setRenaming({ id: row.id, value: row.name })} type="button">Rn</button><button aria-label={`${row.visible ? 'Hide' : 'Show'} ${row.name}`} className="size-8 text-[10px]" onClick={() => change(row, { visible: !row.visible })} type="button">{row.visible ? 'On' : 'Off'}</button><button aria-label={`${row.locked ? 'Unlock' : 'Lock'} ${row.name}`} className="size-8 text-[10px]" onClick={() => change(row, { locked: !row.locked })} type="button">{row.locked ? 'L' : 'U'}</button><button aria-label={`Duplicate ${row.name}`} className="size-7 text-[10px] opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => onDuplicate(row.id)} type="button">Cp</button><button aria-label={`Delete ${row.name}`} className="size-7 text-[10px] text-rose-600 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => onDelete(row.id)} type="button">X</button></> : null}</div>)}</div></aside>
}
