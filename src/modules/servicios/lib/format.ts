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

// ANTES: `new Date().toISOString().slice(0, 10)` -- da la fecha en UTC.
// Como Argentina es UTC-3, pasadas las 21 hs (hora local) el reloj UTC ya
// cambió de día. Se arma la fecha a partir de los componentes locales del
// Date en vez de UTC.
export function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
