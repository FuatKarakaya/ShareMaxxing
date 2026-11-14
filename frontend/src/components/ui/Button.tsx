import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { buttonClasses, type ButtonVariant } from './buttonStyles'

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant, loading = false, disabled, className, children, type = 'button', ...props }, ref) {
  return (
    <button ref={ref} {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClasses(variant, className)}>
      {loading && <span aria-hidden="true">…</span>}
      {children}
    </button>
  )
})
