import type { LucideIcon } from 'lucide-react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  label: string
  value: string
  icon: LucideIcon
  hint?: string
  trend?: { value: string; positive: boolean }
  accent?: 'primary' | 'income' | 'expense' | 'warning'
}

const ACCENT: Record<
  NonNullable<KpiCardProps['accent']>,
  { ring: string; iconBg: string; iconText: string }
> = {
  primary: {
    ring: 'before:bg-primary',
    iconBg: 'bg-primary/10',
    iconText: 'text-primary',
  },
  income: {
    ring: 'before:bg-income',
    iconBg: 'bg-income-soft',
    iconText: 'text-income',
  },
  expense: {
    ring: 'before:bg-expense',
    iconBg: 'bg-expense-soft',
    iconText: 'text-expense',
  },
  warning: {
    ring: 'before:bg-warning',
    iconBg: 'bg-warning/15',
    iconText: 'text-warning-foreground dark:text-warning',
  },
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
  trend,
  accent = 'primary',
}: KpiCardProps) {
  const a = ACCENT[accent]
  return (
    <Card
      className={cn(
        'relative gap-0 overflow-hidden p-5',
        'before:absolute before:inset-y-0 before:left-0 before:w-1',
        a.ring,
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-muted-foreground text-sm font-medium">{label}</p>
        <span
          className={cn(
            'flex size-9 items-center justify-center rounded-lg',
            a.iconBg,
            a.iconText,
          )}
        >
          <Icon className="size-5" />
        </span>
      </div>
      <p className="text-foreground mt-3 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium',
              trend.positive ? 'text-income' : 'text-expense',
            )}
          >
            {trend.positive ? (
              <TrendingUp className="size-3.5" />
            ) : (
              <TrendingDown className="size-3.5" />
            )}
            {trend.value}
          </span>
        )}
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
    </Card>
  )
}
