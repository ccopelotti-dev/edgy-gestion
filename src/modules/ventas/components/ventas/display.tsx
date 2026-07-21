// ============================================================
// Módulo Ventas — Componentes de display compartidos
// Edgy Gestion · React 19 + Tailwind CSS 4 + lucide-react
// ============================================================

import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Banknote,
  CreditCard,
  ArrowRightLeft,
  FileText,
  BookOpen,
  Wallet,
} from 'lucide-react';

import type {
  EstadoPresupuesto,
  EstadoOrden,
  TipoOrden,
  EstadoComprobante,
  MedioPago,
} from '../../types';

import {
  ESTADO_PRESUPUESTO_LABEL,
  labelEstadoOrden,
  ESTADO_COMPROBANTE_LABEL,
  TIPO_ORDEN_LABEL_CORTO,
  MEDIO_PAGO_LABEL,
} from '../../types';

import { formatARS } from '../../lib/format';

// ─── KpiCard ─────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  className?: string;
}

const trendConfig = {
  up: { icon: TrendingUp, color: 'text-green-600' },
  down: { icon: TrendingDown, color: 'text-red-600' },
  neutral: { icon: Minus, color: 'text-gray-400' },
} as const;

export function KpiCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  className = '',
}: KpiCardProps) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-gray-50/60 p-5 ${className}`}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
        {icon && <span className="text-gray-400">{icon}</span>}
        <span>{title}</span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        {trend && (() => {
          const cfg = trendConfig[trend];
          const TrendIcon = cfg.icon;
          return <TrendIcon className={`h-5 w-5 ${cfg.color}`} />;
        })()}
      </div>

      {subtitle && (
        <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
      )}
    </div>
  );
}

// ─── Badge base ──────────────────────────────────────────────

interface BadgeProps {
  children: React.ReactNode;
  color: string; // Tailwind color name: gray, blue, green, etc.
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
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[color] ?? colorMap.gray}`}
    >
      {icon}
      {children}
    </span>
  );
}

// ─── EstadoPresupuestoBadge ──────────────────────────────────

const estadoPresupuestoColor: Record<EstadoPresupuesto, string> = {
  borrador: 'gray',
  enviado: 'blue',
  aprobado: 'green',
  vencido: 'amber',
  cancelado: 'red',
};

export function EstadoPresupuestoBadge({
  estado,
}: {
  estado: EstadoPresupuesto;
}) {
  return (
    <Badge color={estadoPresupuestoColor[estado]}>
      {ESTADO_PRESUPUESTO_LABEL[estado]}
    </Badge>
  );
}

// ─── EstadoOrdenBadge ────────────────────────────────────────

const estadoOrdenColor: Record<EstadoOrden, string> = {
  pendiente: 'amber',
  en_preparacion: 'blue',
  terminado: 'teal',
  entregado_parcial: 'purple',
  entregado: 'green',
  cancelado: 'red',
};

export function EstadoOrdenBadge({
  estado,
  tipo,
}: {
  estado: EstadoOrden;
  tipo: TipoOrden;
}) {
  return (
    <Badge color={estadoOrdenColor[estado]}>
      {labelEstadoOrden(estado, tipo)}
    </Badge>
  );
}

// ─── TipoOrdenBadge ──────────────────────────────────────────

const tipoOrdenColor: Record<TipoOrden, string> = {
  pedido: 'blue',
  produccion: 'purple',
  servicio: 'teal',
};

export function TipoOrdenBadge({ tipo }: { tipo: TipoOrden }) {
  return (
    <Badge color={tipoOrdenColor[tipo]}>
      {TIPO_ORDEN_LABEL_CORTO[tipo]}
    </Badge>
  );
}

// ─── EstadoComprobanteBadge ──────────────────────────────────

const estadoComprobanteColor: Record<EstadoComprobante, string> = {
  emitido: 'amber',
  cobrado_parcial: 'blue',
  cobrado: 'green',
  anulado: 'red',
};

export function EstadoComprobanteBadge({
  estado,
}: {
  estado: EstadoComprobante;
}) {
  return (
    <Badge color={estadoComprobanteColor[estado]}>
      {ESTADO_COMPROBANTE_LABEL[estado]}
    </Badge>
  );
}

// ─── MedioPagoBadge ──────────────────────────────────────────

const medioPagoConfig: Record<MedioPago, { color: string; icon: React.ReactNode }> = {
  efectivo: { color: 'green', icon: <Banknote className="h-3 w-3" /> },
  tarjeta_debito: { color: 'blue', icon: <CreditCard className="h-3 w-3" /> },
  tarjeta_credito: { color: 'blue', icon: <CreditCard className="h-3 w-3" /> },
  transferencia: { color: 'purple', icon: <ArrowRightLeft className="h-3 w-3" /> },
  cheque: { color: 'amber', icon: <FileText className="h-3 w-3" /> },
  cuenta_corriente: { color: 'teal', icon: <BookOpen className="h-3 w-3" /> },
  mercadopago: { color: 'blue', icon: <Wallet className="h-3 w-3" /> },
  otro: { color: 'gray', icon: null },
};

export function MedioPagoBadge({ medio }: { medio: MedioPago }) {
  const cfg = medioPagoConfig[medio];
  return (
    <Badge color={cfg.color} icon={cfg.icon}>
      {MEDIO_PAGO_LABEL[medio]}
    </Badge>
  );
}

// ─── Amount ──────────────────────────────────────────────────

const amountSize = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg font-semibold',
} as const;

export function Amount({
  value,
  size = 'md',
}: {
  value: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const color = value >= 0 ? 'text-green-700' : 'text-red-700';
  return (
    <span className={`tabular-nums ${amountSize[size]} ${color}`}>
      {formatARS(value)}
    </span>
  );
}

// ─── EmptyState ──────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && (
        <div className="mb-3 text-gray-300">{icon}</div>
      )}
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
