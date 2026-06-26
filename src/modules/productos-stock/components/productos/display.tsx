'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatARS } from '../../lib/format'
import type { EstadoProducto, TipoLineaFormula, EstadoRecepcion } from '../../types'

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
    <div
      className={cn(
        'rounded-lg border bg-card p-4 border-l-4 shadow-sm',
        accentBorder[accent],
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <Icon className={cn('h-5 w-5', accentIcon[accent])} />
      </div>
    </div>
  )
}

// ─── StockBadge ───────────────────────────────────────────────────────────────

interface StockBadgeProps {
  stock: number
  minimo: number
  showLabel?: boolean
}

export function StockBadge({ stock, minimo, showLabel }: StockBadgeProps) {
  let label: string
  let classes: string

  if (stock <= 0) {
    label = 'Agotado'
    classes = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  } else if (stock < minimo) {
    label = 'Bajo'
    classes = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
  } else {
    label = 'OK'
    classes = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        classes,
      )}
    >
      {showLabel ? `Stock: ${label}` : label}
    </span>
  )
}

// ─── EstadoBadge ──────────────────────────────────────────────────────────────

interface EstadoBadgeProps {
  estado: EstadoProducto
}

export function EstadoBadge({ estado }: EstadoBadgeProps) {
  const isActivo = estado === 'activo'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        isActivo
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
      )}
    >
      {isActivo ? 'Activo' : 'Inactivo'}
    </span>
  )
}

// ─── TipoLineaBadge ──────────────────────────────────────────────────────────

const tipoLineaConfig: Record<TipoLineaFormula, { label: string; classes: string }> = {
  insumo: {
    label: 'Insumo',
    classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  mano_de_obra: {
    label: 'Mano de obra',
    classes: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  costo_operativo: {
    label: 'Costo operativo',
    classes: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  },
}

interface TipoLineaBadgeProps {
  tipo: TipoLineaFormula
}

export function TipoLineaBadge({ tipo }: TipoLineaBadgeProps) {
  const cfg = tipoLineaConfig[tipo]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        cfg.classes,
      )}
    >
      {cfg.label}
    </span>
  )
}

// ─── EstadoRecepcionBadge ─────────────────────────────────────────────────────

const estadoRecepcionConfig: Record<EstadoRecepcion, { label: string; classes: string }> = {
  borrador: {
    label: 'Borrador',
    classes: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  confirmada: {
    label: 'Confirmada',
    classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  cancelada: {
    label: 'Cancelada',
    classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
}

interface EstadoRecepcionBadgeProps {
  estado: EstadoRecepcion
}

export function EstadoRecepcionBadge({ estado }: EstadoRecepcionBadgeProps) {
  const cfg = estadoRecepcionConfig[estado]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        cfg.classes,
      )}
    >
      {cfg.label}
    </span>
  )
}

// ─── Amount ───────────────────────────────────────────────────────────────────

interface AmountProps {
  value: number
  className?: string
}

export function Amount({ value, className }: AmountProps) {
  return (
    <span className={cn('tabular-nums', className)}>
      {formatARS(value)}
    </span>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  children?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 py-12 px-6 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/50 mb-3" />
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

// ─── ComercializableBadge ─────────────────────────────────────────────────────

interface ComercializableBadgeProps {
  esComercializable: boolean
}

export function ComercializableBadge({ esComercializable }: ComercializableBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        esComercializable
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
      )}
    >
      {esComercializable ? 'Comercializable' : 'Solo interno'}
    </span>
  )
}
