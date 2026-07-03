// Helpers de formato — mismo criterio que el resto de los módulos (cada uno
// mantiene su propia copia liviana, ver lib/format.ts de Productos y Stock
// y de Tesorería).

const currencyFmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatARS(value: number): string {
  return currencyFmt.format(value)
}

const dateFmt = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso + 'T00:00:00'))
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
