import { PageShell } from '../components/layout/PageShell'
import { StepHeader } from '../components/layout/StepHeader'
import { PrimaryButton } from '../components/ui/PrimaryButton'

export function TemplatePreviewPage() {
  return (
    <PageShell>
      <StepHeader eyebrow="Step 2" title="Preview template" />
      <div className="mx-auto aspect-[4/6] w-full max-w-sm rounded-2xl bg-white shadow-sm ring-1 ring-stone-200" />
      <PrimaryButton className="mt-auto w-full sm:mx-auto sm:max-w-sm">Use this template</PrimaryButton>
    </PageShell>
  )
}
