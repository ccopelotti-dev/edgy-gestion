// ============================================================
// Módulo Ventas — Helpers de formato
// ============================================================

/**
 * Formatea un número como moneda argentina (ARS)
 * 12500.5 → "$ 12.500,50"
 */
export function formatARS(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-$ ${formatted}` : `$ ${formatted}`;
}

/**
 * Formatea fecha ISO a formato argentino
 * "2026-06-27" → "27/06/2026"
 */
export function formatDate(isoDate: string): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate + (isoDate.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Formatea fecha y hora
 * "2026-06-27T14:30:00" → "27/06/2026 14:30"
 */
export function formatDateTime(isoDate: string): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Devuelve la fecha de hoy en formato ISO (YYYY-MM-DD)
 *
 * ANTES usaba `new Date().toISOString().slice(0, 10)`, que da la fecha en
 * UTC. Como Argentina es UTC-3, pasadas las 21 hs (hora local) el reloj UTC
 * ya cambió de día: comprobantes, presupuestos, órdenes y el punto de venta
 * nuevos se creaban por defecto con la fecha de mañana, y "Ventas hoy" del
 * dashboard no encontraba nada aunque hubiera ventas cargadas esa misma
 * tarde/noche. Se arma la fecha a partir de los componentes locales del
 * Date (que sí respetan la zona horaria del navegador) en vez de UTC.
 */
export function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Devuelve un ISO string completo del momento actual
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Calcula días hasta una fecha desde hoy
 * Positivo = futuro, negativo = pasado
 */
export function daysUntil(isoDate: string): number {
  const target = new Date(isoDate + 'T00:00:00');
  const today = new Date(todayISO() + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/**
 * Formatea número de comprobante con prefijo
 * formatNumero('FAC', 42) → "FAC-00042"
 */
export function formatNumero(prefijo: string, numero: number): string {
  return `${prefijo}-${numero.toString().padStart(5, '0')}`;
}

/**
 * Prefijos por tipo de comprobante
 */
export const PREFIJO_COMPROBANTE: Record<string, string> = {
  factura: 'FAC',
  recibo: 'REC',
  nota_credito: 'NC',
  nota_debito: 'ND',
};

export const PREFIJO_ORDEN: Record<string, string> = {
  pedido: 'OP',
  produccion: 'OPR',
  servicio: 'OS',
};

/**
 * Formatea un porcentaje
 * 21 → "21%"
 * 10.5 → "10,5%"
 */
export function formatPct(pct: number): string {
  return pct % 1 === 0
    ? `${pct}%`
    : `${pct.toLocaleString('es-AR')}%`;
}

/**
 * Formatea un CUIT con guiones
 * "20123456789" → "20-12345678-9"
 */
export function formatCuit(cuit: string): string {
  if (!cuit || cuit.length !== 11) return cuit || '—';
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}

/**
 * Formatea cantidad con unidad
 */
export function formatQty(qty: number, unit?: string): string {
  const formatted = qty % 1 === 0
    ? qty.toString()
    : qty.toLocaleString('es-AR', { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}
