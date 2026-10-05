import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** One primary button per screen. Primary is gold with BLACK text (docs/DESIGN_SYSTEM.md §1.2). */
export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return <button type={type} className={`btn btn-${variant} ${className}`.trim()} {...rest} />;
}
