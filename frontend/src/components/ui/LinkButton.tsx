import { Link, type LinkProps } from 'react-router-dom'
import { buttonClasses, type ButtonVariant } from './buttonStyles'

type LinkButtonProps = LinkProps & { variant?: ButtonVariant }

export function LinkButton({ variant, className, ...props }: LinkButtonProps) {
  return <Link {...props} className={buttonClasses(variant, className)} />
}
