import type { PrintTemplate } from '../types/selfBooth'
import { PageShell } from '../components/layout/PageShell'
import { StepHeader } from '../components/layout/StepHeader'
import { TemplateCard } from '../components/template/TemplateCard'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { BrandMark } from '../components/branding/BrandMark'

interface TemplateSelectionPageProps {
  templates: PrintTemplate[]
  selectedTemplateId: string
  onContinue: () => void
  onSelect: (id: string) => void
}

export function TemplateSelectionPage({ templates, selectedTemplateId, onContinue, onSelect }: TemplateSelectionPageProps) {
  return (
    <PageShell>
      <div className="flex items-center justify-between pb-8">
        <BrandMark compact />
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-500 shadow-sm">Studio session</span>
      </div>
      <StepHeader description="Pick a frame style for your photo strip. You can add your photos next." eyebrow="Step 1 of 3" title="Choose your print frame" />
      <section aria-label="Print templates" className="grid grid-cols-2 gap-3 pb-28 sm:grid-cols-3 sm:gap-5 lg:grid-cols-6">
        {templates.map((template) => (
          <TemplateCard key={template.id} onSelect={() => onSelect(template.id)} selected={selectedTemplateId === template.id} template={template} />
        ))}
      </section>
      <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <PrimaryButton className="mx-auto block w-full max-w-lg" onClick={onContinue}>Continue</PrimaryButton>
      </div>
    </PageShell>
  )
}
