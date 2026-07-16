// Helpers de formato — misma copia liviana que el resto de los módulos.

const dateFmt = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

// ANTES: `new Date(iso)` -- para un string de solo fecha ("2026-07-06",
// sin hora), el motor de JS lo interpreta como medianoche UTC. En
// Argentina (UTC-3) eso cae a las 21 hs del día ANTERIOR en hora local,
// así que el formateador mostraba siempre un día menos del que
// correspondía (no solo de noche: siempre). Se agrega "T00:00:00" (sin
// "Z") para que se interprete como medianoche LOCAL en vez de UTC.
export function formatDate(iso: string): string {
  if (!iso) return '—'
  // Soporta tanto fechas "solo dia" (yyyy-mm-dd, ej. las de Recepcion) como
  // timestamps completos de Supabase (created_at de importaciones_masivas,
  // que ya viene con "T..." y zona horaria) -- agregar T00:00:00 a este
  // ultimo caso rompia el parseo (RangeError: Invalid time value).
  return dateFmt.format(new Date(iso + (iso.includes('T') ? '' : 'T00:00:00')))
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

const numberFmt = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatHoras(value: number): string {
  return `${numberFmt.format(value)} hs`
}

/** Tamaño de archivo legible (bytes -> KB/MB). */
export function formatTamanio(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
