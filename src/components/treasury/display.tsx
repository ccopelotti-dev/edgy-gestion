import type { ReactNode } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Landmark,
  ScrollText,
  Smartphone,
  type LucideIcon,
} from 'lucide-react'
import type { ChequeEstado, ChequeKind, PaymentMethod } from '@/types'
import { chequeEstadoLabel } from '@/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatARS } from '@/lib/format'

export const PAYMENT_META: Record<
  PaymentMethod,
  { label: string; icon: LucideIcon }
> = {
  efectivo: { label: 'Efectivo', icon: Banknote },
  transferencia: { label: 'Transferencia', icon: Landmark },
  cheque: { label: 'Cheque', icon: ScrollText },
  tarjeta: { label: 'Tarjeta', icon: CreditCard },
  mercadopago: { label: 'MercadoPago', icon: Smartphone },
}

export function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  const meta = PAYMENT_META[method]
  const Icon = meta.icon
  return (
    <Badge variant="secondary" className="font-normal">
      <Icon className="size-3" />
      {meta.label}
    </Badge>
  )
}

type EstadoVariant = 'income' | 'expense' | 'warning' | 'secondary'

const ESTADO_VARIANT: Record<ChequeKind, Record<ChequeEstado, EstadoVariant>> = {
  recibido: {
    en_cartera: 'warning',
    depositado: 'secondary',
    cobrado: 'income',
    rechazado: 'expense',
  },
  emitido: {
    en_cartera: 'warning', // "A pagar" (pasivo flotante)
    depositado: 'secondary',
    cobrado: 'secondary', // "Pagado" (obligación saldada)
    rechazado: 'expense', // "Anulado"
  },
}

export function ChequeEstadoBadge({
  estado,
  tipo = 'recibido',
}: {
  estado: ChequeEstado
  tipo?: ChequeKind
}) {
  return (
    <Badge variant={ESTADO_VARIANT[tipo][estado]}>
      {chequeEstadoLabel(estado, tipo)}
    </Badge>
  )
}

/** Monto coloreado por signo: verde ingreso, rojo egreso. */
export function Amount({
  value,
  tipo,
  className,
  showSign = true,
}: {
  value: number
  tipo?: 'ingreso' | 'egreso'
  className?: string
  showSign?: boolean
}) {
  const isIncome = tipo ? tipo === 'ingreso' : value >= 0
  const sign = !showSign ? '' : isIncome ? '+ ' : '- '
  return (
    <span
      className={cn(
        'tabular-nums font-medium',
        isIncome ? 'text-income' : 'text-expense',
        className,
      )}
    >
      {sign}
      {formatARS(Math.abs(value))}
    </span>
  )
}

export function TipoIcon({ tipo }: { tipo: 'ingreso' | 'egreso' }) {
  return tipo === 'ingreso' ? (
    <span className="bg-income-soft text-income flex size-7 items-center justify-center rounded-full">
      <ArrowDownLeft className="size-4" />
    </span>
  ) : (
    <span className="bg-expense-soft text-expense flex size-7 items-center justify-center rounded-full">
      <ArrowUpRight className="size-4" />
    </span>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description?: ReactNode
}) {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Icon className="size-8 opacity-40" />
      <p className="text-foreground text-sm font-medium">{title}</p>
      {description && <p className="max-w-xs text-sm">{description}</p>}
    </div>
  )
}
