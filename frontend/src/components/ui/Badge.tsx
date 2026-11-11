import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type BadgeTone = 'brand' | 'neutral' | 'success' | 'warning' | 'danger'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone
}

const toneClasses: Record<BadgeTone, string> = {
  brand: 'bg-secondary-light text-secondary',
  neutral: 'bg-canvas text-muted',
  success: 'bg-green-50 text-success',
  warning: 'bg-amber-50 text-warning',
  danger: 'bg-red-50 text-danger'
}

export function Badge({ className, tone = 'brand', ...props }: BadgeProps) {
  return <span className={cn('ui-badge', toneClasses[tone], className)} {...props} />
}
