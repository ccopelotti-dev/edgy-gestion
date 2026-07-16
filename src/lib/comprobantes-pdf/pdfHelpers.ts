// ============================================================
// Motor compartido de PDF -- helpers comunes (Fase 17b)
// Edgy Gestión
//
// Extraído de generarComprobantePdf.ts para poder reutilizar el mismo
// encabezado con banda de color + logo, y el mismo pie de página, en
// documentos que NO son un comprobante con ítems -- como el Resumen de
// cuenta (Fase 17b) y el Comprobante de Pago (Fase 17b), ambos de
// Compras > Proveedores, pero pensados para ser igual de reutilizables
// desde Ventas > Clientes el día que haga falta.
//
// generarComprobantePdf.ts mantiene su propia copia interna de estos
// helpers (no se tocó ese archivo, que ya está en producción) -- los de
// acá son exactamente iguales, solo que exportados para los documentos
// nuevos.
// ============================================================

import { jsPDF } from 'jspdf'

export const COLOR_DEFAULT = '#0F6E56'

export interface EmpresaParaPdf {
  nombre: string
  cuit?: string | null
  direccion?: string | null
  telefono?: string | null
  /** URL pública (Supabase Storage). Si falla la descarga o el formato
   * no es soportado, el PDF se genera igual sin logo. */
  logoUrl?: string | null
  /** Hex, ej "#0F6E56". Si no hay, se usa COLOR_DEFAULT. */
  colorMarca?: string | null
}

export function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function hexToRgb(hex: string): [number, number, number] {
  const limpio = hex.replace('#', '')
  const bignum = parseInt(
    limpio.length === 3
      ? limpio.split('').map((c) => c + c).join('')
      : limpio,
    16,
  )
  return [(bignum >> 16) & 255, (bignum >> 8) & 255, bignum & 255]
}

/** Mezcla un color con blanco (0 = el color tal cual, 1 = blanco puro) --
 * se usa para el fondo clarito de los totales destacados, sin depender de
 * canal alpha (jsPDF no soporta fill con transparencia de forma simple). */
export function aclarar(hex: string, factor: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  const mezclar = (canal: number) => Math.round(canal + (255 - canal) * factor)
  return [mezclar(r), mezclar(g), mezclar(b)]
}

export async function logoADataUrl(
  url: string,
): Promise<{ dataUrl: string; formato: 'PNG' | 'JPEG' } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const formato: 'PNG' | 'JPEG' = blob.type.includes('png') ? 'PNG' : 'JPEG'
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('No se pudo leer el logo'))
      reader.readAsDataURL(blob)
    })
    return { dataUrl, formato }
  } catch {
    // El logo es un plus visual -- si falla la descarga (CORS, red,
    // formato raro) el documento se genera igual, sin logo.
    return null
  }
}

/**
 * Dibuja la banda de encabezado (logo + nombre de la empresa a la
 * izquierda, tipo de documento + número + fecha a la derecha) -- común a
 * todos los documentos PDF del sistema. Devuelve el `y` desde donde
 * seguir dibujando el cuerpo del documento, y el color de marca resuelto
 * (para reusarlo en tablas/totales del cuerpo).
 */
export async function dibujarEncabezado(
  doc: jsPDF,
  empresa: EmpresaParaPdf,
  tituloDocumento: string,
  numero: string,
  fecha: string,
): Promise<{ y: number; color: string }> {
  const color = empresa.colorMarca || COLOR_DEFAULT
  const pageWidth = doc.internal.pageSize.getWidth()
  const marginX = 15
  const anchoBanda = 32

  doc.setFillColor(color)
  doc.rect(0, 0, pageWidth, anchoBanda, 'F')

  let logoInfo: { dataUrl: string; formato: 'PNG' | 'JPEG' } | null = null
  if (empresa.logoUrl) {
    logoInfo = await logoADataUrl(empresa.logoUrl)
  }
  const textoX = logoInfo ? marginX + 24 : marginX
  if (logoInfo) {
    try {
      doc.addImage(logoInfo.dataUrl, logoInfo.formato, marginX, 6, 20, 20)
    } catch {
      // Formato de imagen no soportado por jsPDF -- seguimos sin logo en
      // vez de romper la descarga del documento.
    }
  }

  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(empresa.nombre, textoX, 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  let yEmpresa = 20
  if (empresa.cuit) {
    doc.text(`CUIT ${empresa.cuit}`, textoX, yEmpresa)
    yEmpresa += 5
  }
  if (empresa.direccion) {
    doc.text(empresa.direccion, textoX, yEmpresa)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(tituloDocumento, pageWidth - marginX, 14, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  if (numero) {
    doc.text(`N.º ${numero}`, pageWidth - marginX, 20, { align: 'right' })
    doc.text(fecha, pageWidth - marginX, 26, { align: 'right' })
  } else {
    // Documentos sin numeración correlativa propia (ej. Resumen de
    // cuenta) -- solo se muestra la fecha, un poco más arriba.
    doc.text(fecha, pageWidth - marginX, 22, { align: 'right' })
  }

  return { y: anchoBanda + 10, color }
}

/** Pie de página común -- nombre y teléfono de la empresa emisora. */
export function dibujarPie(doc: jsPDF, empresa: EmpresaParaPdf): void {
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor('#999999')
  const pieTexto = empresa.telefono
    ? `${empresa.nombre} · ${empresa.telefono}`
    : empresa.nombre
  doc.text(pieTexto, 15, pageHeight - 10)
}
