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

export function formatARS(value: number): string {
  return currencyFmt.format(value)
}

export function formatARSCompact(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$ ${numberFmtCompact(abs / 1_000_000)} M`
  if (abs >= 1_000) return `${sign}$ ${numberFmtCompact(abs / 1_000)} K`
  return formatARS(value)
}

const compactFmt = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})
function numberFmtCompact(value: number): string {
  return compactFmt.format(value)
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

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function daysUntil(iso: string): number {
  const today = new Date(todayISO() + 'T00:00:00').getTime()
  const target = new Date(iso + 'T00:00:00').getTime()
  return Math.round((target - today) / 86_400_000)
}
