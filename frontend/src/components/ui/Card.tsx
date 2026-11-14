import type { HTMLAttributes } from 'react'

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`rounded-2xl border border-line bg-white p-6 sm:p-7 ${className}`} />
}
