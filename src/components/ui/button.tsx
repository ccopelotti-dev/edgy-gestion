import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
          variant === 'primary' && 'bg-brand-500 text-white hover:bg-brand-600',
          variant === 'secondary' && 'bg-white text-brand-500 border border-gray-200 hover:bg-gray-50',
          variant === 'ghost' && 'text-brand-500 hover:bg-gray-100',
          className,
        )}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
