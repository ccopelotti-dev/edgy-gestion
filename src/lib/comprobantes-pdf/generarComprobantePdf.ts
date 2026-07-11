// ============================================================
// Motor compartido de PDF para comprobantes comerciales (Fase 10)
// Edgy Gestión
//
// Pensado para ser GENÉRICO: hoy lo conecta Ventas (Comprobantes),
// pero Compras (órdenes de compra), Presupuestos/Cotizaciones,
// Comandas, etc. van a poder llamarlo con sus propios datos más
// adelante -- no hace falta reescribir el motor por módulo, alcanza
// con armar el objeto `ComprobanteParaPdf` correspondiente.
//
// Diseño "Moderno" (elegido por el usuario sobre la alternativa
// "Clásico" que se le mostró como mockup): banda de color en el
// encabezado con el logo y el nombre del comercio, usando el color de
// marca (`clientes.color_marca`, editable en Configuración > Empresa)
// como acento. Si el cliente no cargó logo o color, cae en un color y
// layout default prolijos -- nunca rompe la descarga por falta de
// esos datos opcionales.
//
// Se generó con jsPDF (agregado en esta fase, antes no había ninguna
// librería de PDF en el proyecto) construyendo el layout a mano
// (texto + rectángulos + líneas) en vez de jspdf-autotable, porque los
// comprobantes de Edgy suelen tener pocas líneas y no justifica sumar
// una dependencia más.
//
// Fase 11 (ARCA): si el comprobante ya tiene CAE (electrónico y
// aprobado), se agrega al pie el bloque obligatorio de CAE +
// vencimiento + QR fiscal (RG 4892/2020, ver ./arcaQr.ts). Para
// comprobantes internos o electrónicos todavía sin CAE, ese bloque
// simplemente no se dibuja -- el PDF nunca falla por faltar datos
// fiscales opcionales.
// ============================================================

import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { construirUrlQrFiscal, type DatosQrFiscal } from './arcaQr'

const COLOR_DEFAULT = '#0F6E56'

export interface EmpresaParaPdf {
  nombre: string
  cuit?: string | null
  direccion?: string | null
  telefono?: string | null
  /** URL pública (Supabase Storage). Si falla la descarga o el
   * formato no es soportado, el PDF se genera igual sin logo. */
  logoUrl?: string | null
  /** Hex, ej "#0F6E56". Si no hay, se usa COLOR_DEFAULT. */
  colorMarca?: string | null
}

export interface ItemParaPdf {
  descripcion: string
  cantidad: number
  precioUnitario: number
  subtotal: number
}

/**
 * Datos de autorización ARCA para el bloque fiscal del pie del PDF.
 * Solo se completa cuando el comprobante ya fue aprobado (CAE
 * obtenido) -- ver Comprobante.afip en el módulo Ventas.
 */
export interface DatosAfipParaPdf {
  cae: string
  /** ISO (YYYY-MM-DD). */
  vencimientoCae: string
  puntoVenta: number
  /** Código AFIP del tipo de comprobante (1=Factura A, 6=B, 11=C...). */
  tipoComprobanteAfip: number
  /** Número asignado por ARCA (CbteNro), no el número interno de Edgy. */
  numeroComprobante: number
  /** Código AFIP del tipo de documento del receptor (80=CUIT, 96=DNI...). */
  docTipoReceptor?: number
}

export interface ComprobanteParaPdf {
  /** Ej: "Factura B", "Recibo", "Nota de crédito", "Presupuesto". */
  tipoLabel: string
  /** Ya formateado, ej: "FAC-00042". */
  numero: string
  /** Ya formateada, ej: "11/07/2026". */
  fecha: string
  /** Fecha ISO (YYYY-MM-DD) del comprobante, sin formatear -- hace
   * falta así para armar el JSON del QR fiscal. Solo es obligatoria
   * si `afip` está presente. */
  fechaIso?: string
  clienteNombre: string
  clienteDocumento?: string | null
  items: ItemParaPdf[]
  subtotal: number
  descuentoGeneral?: number
  montoIva?: number
  total: number
  notas?: string | null
  /** Fase 11: presente solo si ARCA ya aprobó el comprobante (CAE
   * obtenido). Dispara el bloque de CAE + QR fiscal obligatorio al
   * pie del PDF. */
  afip?: DatosAfipParaPdf
}

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatFechaCorta(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'))
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function hexToRgb(hex: string): [number, number, number] {
  const limpio = hex.replace('#', '')
  const bignum = parseInt(
    limpio.length === 3
      ? limpio.split('').map((c) => c + c).join('')
      : limpio,
    16,
  )
  return [(bignum >> 16) & 255, (bignum >> 8) & 255, bignum & 255]
}

/** Mezcla un color con blanco (0 = el color tal cual, 1 = blanco puro) -- se
 * usa para el fondo clarito del total, sin depender de canal alpha (jsPDF no
 * soporta fill con transparencia de forma simple). */
function aclarar(hex: string, factor: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  const mezclar = (canal: number) => Math.round(canal + (255 - canal) * factor)
  return [mezclar(r), mezclar(g), mezclar(b)]
}

async function logoADataUrl(
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
    // formato raro) el comprobante se genera igual, sin logo.
    return null
  }
}

/**
 * Genera y dispara la descarga del PDF de un comprobante.
 * `nombreArchivo` va sin extensión (se le agrega .pdf acá).
 */
export async function generarComprobantePdf(
  empresa: EmpresaParaPdf,
  comprobante: ComprobanteParaPdf,
  nombreArchivo: string,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const color = empresa.colorMarca || COLOR_DEFAULT
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 15
  const anchoBanda = 32

  // ─── Banda de encabezado ───────────────────────────────────
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
      // Formato de imagen no soportado por jsPDF -- seguimos sin logo
      // en vez de romper la descarga del comprobante.
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
  doc.text(comprobante.tipoLabel, pageWidth - marginX, 14, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`N.º ${comprobante.numero}`, pageWidth - marginX, 20, { align: 'right' })
  doc.text(comprobante.fecha, pageWidth - marginX, 26, { align: 'right' })

  // ─── Datos del cliente ──────────────────────────────────────
  let y = anchoBanda + 10
  doc.setTextColor('#3a3a3a')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(comprobante.clienteNombre, marginX, y)
  if (comprobante.clienteDocumento) {
    doc.text(comprobante.clienteDocumento, pageWidth - marginX, y, { align: 'right' })
  }
  y += 8

  // ─── Tabla de ítems ─────────────────────────────────────────
  const colDesc = marginX
  const colCant = pageWidth - marginX - 70
  const colPU = pageWidth - marginX - 45
  const colSub = pageWidth - marginX

  doc.setDrawColor(color)
  doc.setLineWidth(0.3)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor('#6b6b6b')
  doc.text('Descripción', colDesc, y)
  doc.text('Cant.', colCant, y, { align: 'right' })
  doc.text('P. unit.', colPU, y, { align: 'right' })
  doc.text('Subtotal', colSub, y, { align: 'right' })
  y += 2
  doc.setDrawColor(230, 230, 230)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor('#222222')

  const alturaMaxima = pageHeight - 55
  for (const item of comprobante.items) {
    if (y > alturaMaxima) {
      doc.addPage()
      y = 20
    }
    const lineasDesc = doc.splitTextToSize(item.descripcion, colCant - colDesc - 5)
    doc.text(lineasDesc, colDesc, y)
    doc.text(String(item.cantidad), colCant, y, { align: 'right' })
    doc.text(formatARS(item.precioUnitario), colPU, y, { align: 'right' })
    doc.text(formatARS(item.subtotal), colSub, y, { align: 'right' })
    y += 5 * (Array.isArray(lineasDesc) ? lineasDesc.length : 1)
  }

  y += 4
  doc.setDrawColor(230, 230, 230)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 8

  // ─── Totales ────────────────────────────────────────────────
  if (y > pageHeight - 45) {
    doc.addPage()
    y = 20
  }

  doc.setFontSize(9.5)
  doc.setTextColor('#555555')
  doc.text('Subtotal', colPU, y, { align: 'right' })
  doc.text(formatARS(comprobante.subtotal), colSub, y, { align: 'right' })
  y += 6

  if (comprobante.montoIva && comprobante.montoIva > 0) {
    doc.text('IVA', colPU, y, { align: 'right' })
    doc.text(formatARS(comprobante.montoIva), colSub, y, { align: 'right' })
    y += 6
  }

  if (comprobante.descuentoGeneral && comprobante.descuentoGeneral > 0) {
    doc.text(`Descuento (${comprobante.descuentoGeneral}%)`, colPU, y, { align: 'right' })
    doc.text(`-${formatARS((comprobante.subtotal + (comprobante.montoIva ?? 0)) * (comprobante.descuentoGeneral / 100))}`, colSub, y, { align: 'right' })
    y += 6
  }

  y += 2
  const [rBg, gBg, bBg] = aclarar(color, 0.88)
  doc.setFillColor(rBg, gBg, bBg)
  doc.roundedRect(colPU - 5, y - 6, colSub - colPU + 5, 10, 1.5, 1.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(color)
  doc.text('Total', colPU, y)
  doc.text(formatARS(comprobante.total), colSub, y, { align: 'right' })
  y += 16

  // ─── Notas ──────────────────────────────────────────────────
  if (comprobante.notas) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor('#666666')
    const lineasNotas = doc.splitTextToSize(comprobante.notas, pageWidth - marginX * 2)
    doc.text(lineasNotas, marginX, y)
    y += 6 * (Array.isArray(lineasNotas) ? lineasNotas.length : 1)
  }

  // ─── CAE + QR fiscal (Fase 11 -- RG 4892/2020) ───────────────
  // Solo se dibuja si el comprobante ya tiene CAE (electrónico y
  // aprobado por ARCA). Si falta algún dato o falla la generación del
  // QR, se muestra igual el CAE en texto -- es válido como respaldo
  // aunque no salga la imagen.
  if (comprobante.afip && comprobante.fechaIso) {
    const altoBloque = 32
    if (y > pageHeight - altoBloque - 12) {
      doc.addPage()
      y = 20
    }

    let qrDataUrl: string | null = null
    if (empresa.cuit) {
      const datosQr: DatosQrFiscal = {
        fecha: comprobante.fechaIso,
        cuitEmisor: empresa.cuit.replace(/\D/g, ''),
        puntoVenta: comprobante.afip.puntoVenta,
        tipoComprobanteAfip: comprobante.afip.tipoComprobanteAfip,
        numeroComprobante: comprobante.afip.numeroComprobante,
        importeTotal: comprobante.total,
        tipoDocumentoReceptor: comprobante.afip.docTipoReceptor,
        numeroDocumentoReceptor: comprobante.clienteDocumento ?? undefined,
        cae: comprobante.afip.cae,
      }
      const urlQr = construirUrlQrFiscal(datosQr)
      if (urlQr) {
        try {
          qrDataUrl = await QRCode.toDataURL(urlQr, { margin: 0, width: 200 })
        } catch {
          qrDataUrl = null
        }
      }
    }

    doc.setDrawColor(230, 230, 230)
    doc.line(marginX, y, pageWidth - marginX, y)
    y += 8

    const qrSize = 26
    if (qrDataUrl) {
      try {
        doc.addImage(qrDataUrl, 'PNG', marginX, y, qrSize, qrSize)
      } catch {
        qrDataUrl = null
      }
    }

    const textoX2 = qrDataUrl ? marginX + qrSize + 6 : marginX
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor('#222222')
    doc.text(`CAE: ${comprobante.afip.cae}`, textoX2, y + 6)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor('#555555')
    doc.text(`Vencimiento CAE: ${formatFechaCorta(comprobante.afip.vencimientoCae)}`, textoX2, y + 12)
    doc.text('Comprobante autorizado por ARCA', textoX2, y + 18)

    y += qrSize + 6
  }

  // ─── Pie de página ────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor('#999999')
  const pieTexto = empresa.telefono
    ? `${empresa.nombre} · ${empresa.telefono}`
    : empresa.nombre
  doc.text(pieTexto, marginX, pageHeight - 10)

  doc.save(`${nombreArchivo}.pdf`)
}
