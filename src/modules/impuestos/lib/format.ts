const dateFmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const mesFmt = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })

export function formatFecha(iso: string): string {
  return dateFmt.format(new Date(iso + 'T00:00:00'))
}

export function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function periodoActualISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number)
  const texto = mesFmt.format(new Date(anio, mes - 1, 1))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** 'YYYY-MM' del período anterior al dado. */
export function periodoAnterior(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number)
  const d = new Date(anio, mes - 1 - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Primer y último día del período 'YYYY-MM', en ISO -- para filtrar
 * comprobantes por rango de fecha. */
export function rangoPeriodo(periodo: string): { desde: string; hasta: string } {
  const [anio, mes] = periodo.split('-').map(Number)
  const desde = `${periodo}-01`
  const ultimoDia = new Date(anio, mes, 0).getDate()
  const hasta = `${periodo}-${String(ultimoDia).padStart(2, '0')}`
  return { desde, hasta }
}

export function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}
