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

const timeFmt = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' })

export function formatHora(iso: string): string {
  return timeFmt.format(new Date(iso))
}

export function nowISO(): string {
  return new Date().toISOString()
}

export const ESTADO_COCINA_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
}
