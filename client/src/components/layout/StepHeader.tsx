interface StepHeaderProps {
  eyebrow: string
  title: string
  description?: string
}

export function StepHeader({ eyebrow, title, description }: StepHeaderProps) {
  return (
    <header className="mb-7">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--brand-primary)]">
        {eyebrow}
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600">
          {description}
        </p>
      ) : null}
    </header>
  )
}
