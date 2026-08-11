// Helpers de formato -- misma línea que el resto de los módulos (ver
// modules/agenda/lib/format.ts).

const dateFmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const mesFmt = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })

export function formatFecha(iso: string): string {
  return dateFmt.format(new Date(iso + 'T00:00:00'))
}

// Se arma a partir de los componentes locales del Date (no de
// toISOString(), que da la fecha en UTC) para que un registro cargado
// pasadas las 21 hs en Argentina no quede fechado para el día siguiente.
export function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** 'YYYY-MM' del mes actual, local -- para precargar el período de un
 * nuevo recibo/gasto fijo. */
export function periodoActualISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 'YYYY-MM' -> "Agosto 2026". */
export function formatPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number)
  const texto = mesFmt.format(new Date(anio, mes - 1, 1))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}
