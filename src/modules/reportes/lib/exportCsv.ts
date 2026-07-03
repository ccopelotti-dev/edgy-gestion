// Export a CSV genérico, reusable en las 4 pestañas del módulo -- mismo
// ResultadoReporte (columnas + filas) sea cual sea el reporte de origen.

import type { ResultadoReporte } from '../types'

function escaparCelda(valor: string | number): string {
  const texto = String(valor)
  // Si tiene el separador, comillas o salto de línea, hay que entrecomillar.
  if (texto.includes(';') || texto.includes('"') || texto.includes('\n')) {
    return `"${texto.replace(/"/g, '""')}"`
  }
  return texto
}

export function exportarCSV(nombreArchivo: string, resultado: ResultadoReporte): void {
  const header = resultado.columnas.map(escaparCelda).join(';')
  const filas = resultado.filas.map((fila) =>
    resultado.columnas.map((col) => escaparCelda(fila[col] ?? '')).join(';'),
  )
  const contenido = [header, ...filas].join('\n')

  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo.endsWith('.csv') ? nombreArchivo : `${nombreArchivo}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
