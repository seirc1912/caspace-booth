import type { TemplateGuideSettings } from '../../../types/selfBooth'

export function CanvasGuides({ settings }: { settings: TemplateGuideSettings }) {
  return <div aria-hidden className="pointer-events-none absolute inset-0 z-[100]">
    {settings.showBleedArea ? <div className="absolute inset-[1.5%] border border-dotted border-sky-500" /> : null}
    {settings.showTrimLine ? <div className="absolute inset-[3%] border border-solid border-stone-900" /> : null}
    {settings.showSafeArea ? <div className="absolute inset-[6%] border border-dashed border-emerald-500" /> : null}
  </div>
}
