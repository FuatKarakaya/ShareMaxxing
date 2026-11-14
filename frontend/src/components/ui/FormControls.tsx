import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react'

type FieldProps = {
  label: string
  hint?: string
  error?: string
}

type FieldShellProps = FieldProps & {
  id: string
  required?: boolean
  children: ReactNode
}

function FieldShell({ id, label, hint, error, required, children }: FieldShellProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}{required && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  )
}

function descriptionIds(id: string, hint?: string, error?: string, describedBy?: string) {
  return [describedBy, hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
}

function controlClasses(error?: string, className = '') {
  return `block min-h-11 w-full min-w-0 rounded-xl border bg-white px-3 py-2.5 text-base text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-60 ${error ? 'border-red-600' : 'border-slate-400'} ${className}`
}

type InputProps = FieldProps & Omit<ComponentPropsWithoutRef<'input'>, 'children'>

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ id, label, hint, error, className, 'aria-describedby': describedBy, 'aria-invalid': invalid, ...props }, ref) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={props.required}>
      <input ref={ref} {...props} id={fieldId} aria-invalid={error ? true : invalid} aria-describedby={descriptionIds(fieldId, hint, error, describedBy)} className={controlClasses(error, className)} />
    </FieldShell>
  )
})

type SelectProps = FieldProps & ComponentPropsWithoutRef<'select'>

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ id, label, hint, error, className, children, 'aria-describedby': describedBy, 'aria-invalid': invalid, ...props }, ref) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={props.required}>
      <select ref={ref} {...props} id={fieldId} aria-invalid={error ? true : invalid} aria-describedby={descriptionIds(fieldId, hint, error, describedBy)} className={controlClasses(error, className)}>{children}</select>
    </FieldShell>
  )
})

type TextareaProps = FieldProps & ComponentPropsWithoutRef<'textarea'>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ id, label, hint, error, className, 'aria-describedby': describedBy, 'aria-invalid': invalid, rows = 4, ...props }, ref) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={props.required}>
      <textarea ref={ref} {...props} id={fieldId} rows={rows} aria-invalid={error ? true : invalid} aria-describedby={descriptionIds(fieldId, hint, error, describedBy)} className={controlClasses(error, `resize-y ${className ?? ''}`)} />
    </FieldShell>
  )
})
