// ============================================================
// Modulo Home Keep — Componentes de display compartidos
// Edgy Gestion · Clon de compras/components/compras/display.tsx
// (badges compartidos), con los tipos propios de Home Keep.
// ============================================================

import React from 'react';
import {
  Banknote,
  ArrowRightLeft,
  FileText,
  BookOpen,
  HelpCircle,
  CreditCard,
} from 'lucide-react';

import type {
  EstadoComprobante,
  MedioPago,
  EstadoPago,
} from '../types';

import {
  ESTADO_COMPROBANTE_LABEL,
  MEDIO_PAGO_LABEL,
} from '../types';

import { formatARS } from '../lib/format';

// ─── KpiCard ─────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function KpiCard({ title, value, subtitle, icon, className = '' }: KpiCardProps) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-gray-50/60 p-5 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
        {icon && <span className="text-gray-400">{icon}</span>}
        <span>{title}</span>
      </div>
      <div className="mt-2">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
      </div>
      {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
    </div>
  );
}

// ─── Badge base ──────────────────────────────────────────────

interface BadgeProps {
  children: React.ReactNode;
  color: string;
  icon?: React.ReactNode;
}

function Badge({ children, color, icon }: BadgeProps) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-50 text-gray-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700',
    teal: 'bg-teal-50 text-teal-700',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[color] ?? colorMap.gray}`}
    >
      {icon}
      {children}
    </span>
  );
}

// ─── EstadoComprobanteBadge ─────────────────────────────────

const estadoComprobanteColor: Record<EstadoComprobante, string> = {
  pendiente: 'amber',
  pagado_parcial: 'blue',
  pagado: 'green',
  anulado: 'red',
};

export function EstadoComprobanteBadge({ estado }: { estado: EstadoComprobante }) {
  return (
    <Badge color={estadoComprobanteColor[estado]}>
      {ESTADO_COMPROBANTE_LABEL[estado]}
    </Badge>
  );
}

// ─── EstadoPagoBadge ────────────────────────────────────────

const ESTADO_PAGO_LABEL: Record<EstadoPago, string> = {
  pendiente: 'Pendiente',
  pagada: 'Pagada',
  anulada: 'Anulada',
};

const estadoPagoColor: Record<EstadoPago, string> = {
  pendiente: 'amber',
  pagada: 'green',
  anulada: 'red',
};

export function EstadoPagoBadge({ estado }: { estado: EstadoPago }) {
  return (
    <Badge color={estadoPagoColor[estado]}>
      {ESTADO_PAGO_LABEL[estado]}
    </Badge>
  );
}

// ─── MedioPagoBadge ─────────────────────────────────────────

const medioPagoConfig: Record<MedioPago, { color: string; icon: React.ReactNode }> = {
  efectivo: { color: 'green', icon: <Banknote className="h-3 w-3" /> },
  transferencia: { color: 'purple', icon: <ArrowRightLeft className="h-3 w-3" /> },
  cheque: { color: 'amber', icon: <FileText className="h-3 w-3" /> },
  cuenta_corriente: { color: 'teal', icon: <BookOpen className="h-3 w-3" /> },
  tarjeta: { color: 'blue', icon: <CreditCard className="h-3 w-3" /> },
  otro: { color: 'gray', icon: <HelpCircle className="h-3 w-3" /> },
};

// Defensivo (11/09): un medio_pago que llegue de la base y no esté en
// medioPagoConfig no debe tumbar el módulo entero -- cae a "Otro" en vez
// de crashear. Esto fue justo lo que rompió Home Keep cuando el agente
// empezó a insertar medio_pago='tarjeta' antes de que existiera acá.
export function MedioPagoBadge({ medio }: { medio: MedioPago }) {
  const cfg = medioPagoConfig[medio] ?? medioPagoConfig.otro;
  const label = MEDIO_PAGO_LABEL[medio] ?? MEDIO_PAGO_LABEL.otro;
  return (
    <Badge color={cfg.color} icon={cfg.icon}>
      {label}
    </Badge>
  );
}

// ─── Amount ─────────────────────────────────────────────────

const amountSize = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg font-semibold',
} as const;

export function Amount({ value, size = 'md' }: { value: number; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const color = value >= 0 ? 'text-green-700' : 'text-red-700';
  return (
    <span className={`tabular-nums whitespace-nowrap ${amountSize[size]} ${color}`}>
      {formatARS(value)}
    </span>
  );
}

// ─── CupoDisponibleBar (Fase 72) ────────────────────────────
// Barra de progreso "gastado vs. límite" de una tarjeta -- mismo criterio
// visual que las barras a mano que ya usa Tesorería (sin librería de
// gráficos, para esto alcanza con CSS).

export function CupoDisponibleBar({
  limite,
  deudaFacturada,
  consumidoAbierto,
}: {
  limite: number;
  deudaFacturada: number;
  consumidoAbierto: number;
}) {
  const usado = deudaFacturada + consumidoAbierto;
  const pct = limite > 0 ? Math.min(100, (usado / limite) * 100) : 0;
  const disponible = limite - usado;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">
          Usado <span className="font-medium text-gray-900">{formatARS(usado)}</span> de {formatARS(limite)}
        </span>
        <span className={`font-medium ${disponible < 0 ? 'text-red-600' : 'text-gray-900'}`}>
          Disponible: {formatARS(disponible)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── EmptyState ─────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="mb-3 text-gray-300">{icon}</div>}
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
