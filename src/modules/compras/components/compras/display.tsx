// ============================================================
// Modulo Compras — Componentes de display compartidos
// Edgy Gestion · React 19 + Tailwind CSS 4 + lucide-react
// ============================================================

import React from 'react';
import {
  Banknote,
  ArrowRightLeft,
  FileText,
  BookOpen,
  HelpCircle,
} from 'lucide-react';

import type {
  EstadoCotizacion,
  EstadoOrdenCompra,
  EstadoComprobanteCompra,
  MedioPagoCompra,
} from '../../types';

import {
  ESTADO_COTIZACION_LABEL,
  ESTADO_OC_LABEL,
  ESTADO_COMPROBANTE_COMPRA_LABEL,
  MEDIO_PAGO_COMPRA_LABEL,
} from '../../types';

import { formatARS } from '../../lib/format';

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
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[color] ?? colorMap.gray}`}
    >
      {icon}
      {children}
    </span>
  );
}

// ─── EstadoCotizacionBadge ──────────────────────────────────

const estadoCotizacionColor: Record<EstadoCotizacion, string> = {
  borrador: 'gray',
  enviado: 'blue',
  respondido: 'purple',
  aprobado: 'green',
  vencido: 'amber',
  cancelado: 'red',
};

export function EstadoCotizacionBadge({ estado }: { estado: EstadoCotizacion }) {
  return (
    <Badge color={estadoCotizacionColor[estado]}>
      {ESTADO_COTIZACION_LABEL[estado]}
    </Badge>
  );
}

// ─── EstadoOCBadge ──────────────────────────────────────────

const estadoOCColor: Record<EstadoOrdenCompra, string> = {
  pendiente: 'amber',
  parcial: 'purple',
  recibida: 'green',
  cancelada: 'red',
};

export function EstadoOCBadge({ estado }: { estado: EstadoOrdenCompra }) {
  return (
    <Badge color={estadoOCColor[estado]}>
      {ESTADO_OC_LABEL[estado]}
    </Badge>
  );
}

// ─── EstadoComprobanteBadge ─────────────────────────────────

const estadoComprobanteColor: Record<EstadoComprobanteCompra, string> = {
  pendiente: 'amber',
  pagado_parcial: 'blue',
  pagado: 'green',
  anulado: 'red',
};

export function EstadoComprobanteBadge({ estado }: { estado: EstadoComprobanteCompra }) {
  return (
    <Badge color={estadoComprobanteColor[estado]}>
      {ESTADO_COMPROBANTE_COMPRA_LABEL[estado]}
    </Badge>
  );
}

// ─── MedioPagoBadge ─────────────────────────────────────────

const medioPagoConfig: Record<MedioPagoCompra, { color: string; icon: React.ReactNode }> = {
  efectivo: { color: 'green', icon: <Banknote className="h-3 w-3" /> },
  transferencia: { color: 'purple', icon: <ArrowRightLeft className="h-3 w-3" /> },
  cheque: { color: 'amber', icon: <FileText className="h-3 w-3" /> },
  cuenta_corriente: { color: 'teal', icon: <BookOpen className="h-3 w-3" /> },
  otro: { color: 'gray', icon: <HelpCircle className="h-3 w-3" /> },
};

export function MedioPagoBadge({ medio }: { medio: MedioPagoCompra }) {
  const cfg = medioPagoConfig[medio];
  return (
    <Badge color={cfg.color} icon={cfg.icon}>
      {MEDIO_PAGO_COMPRA_LABEL[medio]}
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
