'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatARS } from '../../lib/format'
import type { EstadoServicio, TipoServicio, ModalidadPrecio } from '../../types'
import { modalidadPrecioLabel } from '../../types'

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
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <Icon className={cn('h-5 w-5', accentIcon[accent])} />
      </div>
    </div>
  )
}

// ─── EstadoBadge ──────────────────────────────────────────────────────────────

export function EstadoBadge({ estado }: { estado: EstadoServicio }) {
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

// ─── TipoServicioBadge ────────────────────────────────────────────────────────

export function TipoServicioBadge({ tipo }: { tipo: TipoServicio }) {
  const esVariantes = tipo === 'con_variantes'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        esVariantes
          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      )}
    >
      {esVariantes ? 'Con variantes' : 'Único'}
    </span>
  )
}

// ─── ModalidadPrecioBadge ─────────────────────────────────────────────────────

export function ModalidadPrecioBadge({ modalidad }: { modalidad: ModalidadPrecio }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {modalidadPrecioLabel(modalidad)}
    </span>
  )
}

// ─── PrecioDisplay ────────────────────────────────────────────────────────────
// Muestra "$ X / hora", "$ X / sesión", "$ X" (fijo) o "A convenir".

export function PrecioDisplay({
  modalidad,
  precio,
  className,
}: {
  modalidad: ModalidadPrecio
  precio?: number
  className?: string
}) {
  if (modalidad === 'a_convenir' || precio == null) {
    return <span className={cn('text-muted-foreground italic', className)}>A convenir</span>
  }
  const sufijo = modalidad === 'por_hora' ? ' / hora' : modalidad === 'por_sesion' ? ' / sesión' : ''
  return (
    <span className={cn('tabular-nums', className)}>
      {formatARS(precio)}
      {sufijo}
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
