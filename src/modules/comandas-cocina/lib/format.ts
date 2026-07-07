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

// Se arma a partir de los componentes locales del Date (no de
// toISOString(), que da la fecha en UTC — ver auditoría de huso
// horario de todo el repo) para que un comprobante emitido pasadas las
// 21 hs en Argentina no quede fechado para el día siguiente.
export function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export const ESTADO_COCINA_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
}
