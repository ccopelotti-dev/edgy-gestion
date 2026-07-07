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

const dateTimeFmt = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso))
}

// Se arma a partir de los componentes locales del Date (no de
// toISOString(), que da la fecha en UTC — ver auditoría de huso
// horario de todo el repo) para que un turno abierto pasadas las 21 hs
// en Argentina no quede fechado para el día siguiente.
export function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function nowISO(): string {
  return new Date().toISOString()
}
