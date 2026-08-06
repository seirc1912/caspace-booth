import { BrandMark } from '../components/branding/BrandMark'
import { PageShell } from '../components/layout/PageShell'
import { StepHeader } from '../components/layout/StepHeader'
import { TemplateCard } from '../components/template/TemplateCard'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import type { CustomerTemplate } from '../services/catalog/RoomCatalogService'

interface TemplateSelectionPageProps {
  templates: CustomerTemplate[]
  roomName: string
  selectedTemplateId: string
  onBack: () => void
  onContinue: () => void
  onSelect: (id: string) => void
}

export function TemplateSelectionPage({ templates, roomName, selectedTemplateId, onBack, onContinue, onSelect }: TemplateSelectionPageProps) {
  return <PageShell><div className="flex items-center justify-between pb-8"><button className="min-h-11 rounded-full bg-white px-4 text-sm font-semibold shadow-sm" onClick={onBack} type="button">← Rooms</button><BrandMark compact /></div><StepHeader description={`Choose a print from the ${roomName} collection.`} eyebrow="Step 3 of 6" title="Choose your template" />{templates.length ? <section aria-label="Print templates" className="grid grid-cols-2 gap-3 pb-28 sm:grid-cols-3 sm:gap-5 lg:grid-cols-5">{templates.map((template) => <TemplateCard key={template.id} onSelect={() => onSelect(template.id)} printSize={template.printSize} selected={selectedTemplateId === template.id} template={template} />)}</section> : <div className="rounded-[1.75rem] border border-dashed border-stone-300 bg-white p-12 text-center"><p className="text-lg font-bold">No templates available.</p><p className="mt-2 text-sm text-stone-500">Please choose another room.</p></div>}{templates.length ? <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl"><PrimaryButton className="mx-auto block w-full max-w-lg" disabled={!selectedTemplateId} onClick={onContinue}>Continue to photos</PrimaryButton></div> : null}</PageShell>
}
