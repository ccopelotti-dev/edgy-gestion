'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EstadoUnidad } from '../types'

// ─── KpiCard ──────────────────────────────────────────────────────────────────

const accentBorder: Record<string, string> = {
  primary: 'border-l-blue-500',
  income: 'border-l-green-500',
  expense: 'border-l-red-500',
  warning: 'border-l-yellow-500',
}

const accentIcon: Record<string, string> = {
  primary: 'text-blue-500',
  income: 'text-green-500',
  expense: 'text-red-500',
  warning: 'text-yellow-500',
}

interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
  accent: 'primary' | 'income' | 'expense' | 'warning'
  icon: LucideIcon
}

export function KpiCard({ title, value, subtitle, accent, icon: Icon }: KpiCardProps) {
  return (
    <div className={cn('rounded-lg border bg-card p-4 border-l-4 shadow-sm', accentBorder[accent])}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <Icon className={cn('h-5 w-5', accentIcon[accent])} />
      </div>
    </div>
  )
}

// ─── EstadoUnidadBadge ──────────────────────────────────────────────────────

const ESTADO_UNIDAD_STYLE: Record<EstadoUnidad, string> = {
  disponible: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  ocupada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  mantenimiento: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
}

const ESTADO_UNIDAD_LABEL: Record<EstadoUnidad, string> = {
  disponible: 'Disponible',
  ocupada: 'Ocupada',
  mantenimiento: 'En mantenimiento',
}

export function EstadoUnidadBadge({ estado }: { estado: EstadoUnidad }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', ESTADO_UNIDAD_STYLE[estado])}>
      {ESTADO_UNIDAD_LABEL[estado]}
    </span>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 py-12 px-6 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/50 mb-3" />
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
