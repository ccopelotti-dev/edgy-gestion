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

// ANTES: `new Date(iso)` -- para un string de solo fecha ("2026-07-06",
// sin hora), el motor de JS lo interpreta como medianoche UTC. En
// Argentina (UTC-3) eso cae a las 21 hs del día ANTERIOR en hora local,
// así que todas las fechas de Reportes se mostraban un día antes del que
// correspondía (siempre, no solo de noche). Se agrega "T00:00:00" (sin
// "Z") para que se interprete como medianoche LOCAL en vez de UTC.
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso + 'T00:00:00'))
}
