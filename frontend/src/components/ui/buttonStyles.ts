export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark',
  secondary: 'border border-line bg-white text-ink hover:bg-surface',
  ghost: 'text-ink hover:bg-surface',
  danger: 'bg-red-700 text-white hover:bg-red-800',
}

export function buttonClasses(variant: ButtonVariant = 'primary', className = '') {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`
}
