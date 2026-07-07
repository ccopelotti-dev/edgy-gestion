// Helpers de formato — misma línea que Tesorería.

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
