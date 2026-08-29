// ============================================================
// Módulo Home Keep — Helpers de formato
// (Clon exacto de compras/lib/format.ts para consistencia)
// ============================================================

export function formatARS(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return amount < 0 ? `-$ ${formatted}` : `$ ${formatted}`;
}

export function formatDate(isoDate: string): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate + (isoDate.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(isoDate: string): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ANTES: `new Date().toISOString().slice(0, 10)` -- toISOString() da la
// fecha en UTC, y Argentina es UTC-3. Se arma la fecha a partir de los
// componentes locales del Date en vez de UTC (mismo fix que Compras).
export function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function daysUntil(isoDate: string): number {
  const target = new Date(isoDate + 'T00:00:00');
  const today = new Date(todayISO() + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function formatNumero(prefijo: string, numero: number): string {
  return `${prefijo}-${numero.toString().padStart(5, '0')}`;
}

export const PREFIJO_COMPROBANTE: Record<string, string> = {
  factura: 'FC',
  nota_credito: 'NCC',
  nota_debito: 'NDC',
};

/** Número a mostrar en los listados de Comprobantes: mantiene el prefijo
 * interno (FC/NCC/NDC) para distinguir el tipo de un vistazo, pero la
 * parte numérica es la del PROVEEDOR (`numeroComprobanteProveedor`) apenas
 * está cargada -- nuestro correlativo interno es solo un ID de Supabase sin
 * ninguna utilidad fuera del sistema. Si todavía no se cargó ese dato, cae
 * al correlativo interno para no dejar el número vacío. */
export function formatNumeroComprobante(
  tipo: string,
  numero: number,
  numeroComprobanteProveedor?: string | null,
): string {
  const prefijo = PREFIJO_COMPROBANTE[tipo] ?? tipo;
  const parteNumerica = numeroComprobanteProveedor?.trim() || numero.toString().padStart(5, '0');
  return `${prefijo}-${parteNumerica}`;
}

export function formatCuit(cuit: string): string {
  if (!cuit || cuit.length !== 11) return cuit || '—';
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}
