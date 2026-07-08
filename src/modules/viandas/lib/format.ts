// Helpers de formato — misma línea que el resto de los módulos.

const currencyFmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatARS(value: number): string {
  return currencyFmt.format(value)
}

const dateFmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function formatFecha(iso: string): string {
  return dateFmt.format(new Date(iso + 'T00:00:00'))
}

// Se arma a partir de los componentes locales del Date (no de
// toISOString(), que da la fecha en UTC — ver auditoría de huso
// horario de todo el repo) para que un registro cargado pasadas las
// 21 hs en Argentina no quede fechado para el día siguiente.
export function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Calcula días hasta una fecha desde hoy.
 * Positivo = futuro, negativo = pasado (vencido).
 */
export function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00')
  const today = new Date(todayISO() + 'T00:00:00')
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}
