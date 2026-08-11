// Helpers de formato -- misma línea que el resto de los módulos (ver
// modules/viandas/lib/format.ts).

const dateFmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

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

export function formatHora(hhmmss: string): string {
  return hhmmss.slice(0, 5) // "14:30:00" -> "14:30"
}
