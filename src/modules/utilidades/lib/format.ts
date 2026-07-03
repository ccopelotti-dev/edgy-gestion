// Helpers de formato — misma copia liviana que el resto de los módulos.

const dateFmt = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
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
