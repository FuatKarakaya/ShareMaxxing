import type { ReactNode } from 'react'

type AlertProps = {
  variant: 'error' | 'success' | 'info'
  title: string
  children?: ReactNode
  id?: string
}

const variants = {
  error: 'border-red-200 bg-red-50 text-red-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  info: 'border-sky-200 bg-sky-50 text-sky-950',
}

export function Alert({ variant, title, children, id }: AlertProps) {
  return (
    <div id={id} role={variant === 'error' ? 'alert' : 'status'} aria-atomic="true" className={`rounded-xl border p-4 text-sm ${variants[variant]}`}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 leading-relaxed">{children}</div>}
    </div>
  )
}
