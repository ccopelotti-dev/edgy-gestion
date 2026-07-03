'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EstadoImportacion } from '../../types'

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

// ─── EstadoImportacionBadge ───────────────────────────────────────────────────

export function EstadoImportacionBadge({ estado }: { estado: EstadoImportacion }) {
  const completada = estado === 'completada'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        completada
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      )}
    >
      {completada ? 'Completada' : 'Con errores'}
    </span>
  )
}

// ─── ErrorBanner ──────────────────────────────────────────────────────────────

export function ErrorBanner({ mensaje }: { mensaje: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
      {mensaje}
    </div>
  )
}
