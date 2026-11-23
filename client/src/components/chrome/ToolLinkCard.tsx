import { Icon, type IconName } from '../ui/Icon'

interface ToolLinkCardProps { href: string; icon: IconName; title: string; description: string }

export function ToolLinkCard({ href, icon, title, description }: ToolLinkCardProps) {
  return <a className="cs-panel cs-press flex min-h-16 min-w-0 items-center gap-2.5 rounded-[20px] px-2.5 py-3" href={href}>
    <span className="cs-btn-primary grid size-9 shrink-0 place-items-center rounded-[11px]"><Icon className="size-[17px]" name={icon} /></span>
    <span className="min-w-0"><strong className="block text-[14px] font-extrabold leading-tight tracking-[-0.01em]">{title}</strong><span className="mt-0.5 block text-[12px] leading-snug text-cs-ink-3">{description}</span></span>
  </a>
}
