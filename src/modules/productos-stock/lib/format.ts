// Helpers de formato — misma línea que Tesorería.

import type { UnidadMedida } from '../types'

const currencyFmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numberFmt = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactFmt = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

export function formatARS(value: number): string {
  return currencyFmt.format(value)
}

export function formatARSCompact(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$ ${compactFmt.format(abs / 1_000_000)} M`
  if (abs >= 1_000) return `${sign}$ ${compactFmt.format(abs / 1_000)} K`
  return formatARS(value)
}

export function formatNumber(value: number): string {
  return numberFmt.format(value)
}

const dateFmt = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const dateLongFmt = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso + 'T00:00:00'))
}

export function formatDateLong(iso: string): string {
  return dateLongFmt.format(new Date(iso + 'T00:00:00'))
}

// ANTES: `new Date().toISOString().slice(0, 10)` -- da la fecha en UTC.
// Como Argentina es UTC-3, pasadas las 21 hs (hora local) el reloj UTC ya
// cambió de día, así que recepciones/fórmulas nuevas se creaban con fecha
// de mañana por defecto. Se arma la fecha a partir de los componentes
// locales del Date en vez de UTC.
export function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function formatQty(value: number, unit: string): string {
  return `${numberFmt.format(value)} ${unit}`
}

// ─── Conversión de unidades ─────────────────────────────────────────────────
// Usado por Compras (conexión con Recepción, ver actualizarStockCompra.ts):
// una línea de compra puede cargarse en una unidad distinta a la que el
// insumo/producto vinculado usa para su stock (ej. comprás "kg" de un
// insumo que lleva el stock en "gramo"). Solo hay conversión conocida
// dentro del mismo grupo (peso, volumen, o docena/unidad) -- unidades como
// 'caja', 'pack', 'rollo', 'hora', 'm2', 'm3' no tienen un factor universal
// (una "caja" no siempre trae la misma cantidad), así que fuera de su
// propio grupo no se puede convertir.

const GRUPOS_CONVERSION: Partial<Record<UnidadMedida, number>>[] = [
  { kg: 1000, gramo: 1 },
  { litro: 1000, ml: 1 },
  { docena: 12, unidad: 1 },
]

/**
 * Convierte `cantidad` de la unidad `desde` a la unidad `hacia`. Devuelve
 * `null` si no hay una conversión conocida entre esas dos unidades (el
 * llamador debe usar la cantidad tal cual en ese caso, avisando al
 * usuario que no se convirtió).
 */
export function convertirUnidad(
  cantidad: number,
  desde: UnidadMedida,
  hacia: UnidadMedida,
): number | null {
  if (desde === hacia) return cantidad
  for (const grupo of GRUPOS_CONVERSION) {
    const factorDesde = grupo[desde]
    const factorHacia = grupo[hacia]
    if (factorDesde != null && factorHacia != null) {
      return (cantidad * factorDesde) / factorHacia
    }
  }
  return null
}
