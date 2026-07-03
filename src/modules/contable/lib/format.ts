// Helpers de formato — misma copia liviana que el resto de los módulos.

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
  // Evita el corrimiento de un día por huso horario al parsear "yyyy-mm-dd"
  // como si fuera UTC medianoche -- se arma la fecha local explícitamente.
  const [y, m, d] = iso.split('-').map(Number)
  return dateFmt.format(new Date(y, (m ?? 1) - 1, d ?? 1))
}

export function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
