import type { ReactNode } from 'react'

type PageLayoutProps = {
  eyebrow?: string
  title: string
  description?: string
  children: ReactNode
}

export function PageLayout({ eyebrow, title, description, children }: PageLayoutProps) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="mb-8 max-w-3xl">
        {eyebrow && <p className="mb-3 text-xs font-bold tracking-[0.16em] text-brand">{eyebrow}</p>}
        <h1 className="text-3xl leading-tight font-bold tracking-tight text-ink sm:text-5xl">{title}</h1>
        {description && <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{description}</p>}
      </div>
      {children}
    </div>
  )
}
