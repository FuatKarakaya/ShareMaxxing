import type { FormHTMLAttributes } from 'react'

export function Form({ className = '', ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form {...props} className={`space-y-5 ${className}`} />
}
