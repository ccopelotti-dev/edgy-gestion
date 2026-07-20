// ============================================================
// Comprobante de Pago -- PDF (Fase 17b)
// Edgy Gestión
//
// Documento inverso a un Recibo: un Recibo lo emite quien RECIBE el
// dinero (ej. Ventas > Cobranzas, cuando un cliente nos paga a
// nosotros). Acá es al revés -- SOMOS NOSOTROS los que le pagamos a un
// proveedor -- así que el título es "Comprobante de Pago" en vez de
// "Recibo", y el texto dice "Pagado a" en vez de "Recibí de". Pensado
// para Compras > Proveedores (ver src/modules/compras/lib/pdfComprobantes.ts),
// pero genérico: no asume "proveedor", solo `pagadoA` -- reutilizable el
// día de mañana desde otro módulo si hace falta.
//
// Reusa el mismo encabezado con banda de color + logo, y el mismo pie de
// página, que el resto de los comprobantes (ver ./pdfHelpers.ts).
// ============================================================

import { jsPDF } from 'jspdf'
import {
  type EmpresaParaPdf,
  formatARS,
  aclarar,
  dibujarEncabezado,
  dibujarPie,
} from './pdfHelpers'

export interface ImputacionParaPdf {
  /** Ej "FC-00006". */
  comprobante: string
  montoImputado: number
}

/** Una línea de pago -- Orden de Pago (Fase 22): puede combinar varias
 * formas dentro de un mismo pago (ej. transferencia + 3 cheques a
 * 30/60/90 días). `detalle` trae el N.º/banco/vencimiento si es un cheque. */
export interface LineaPagoParaPdf {
  medioPagoLabel: string
  monto: number
  detalle?: string | null
}

export interface PagoParaPdf {
  /** Ya formateado, ej "PAG-00001". */
  numero: string
  /** Ya formateada, ej "16/07/2026". */
  fecha: string
  pagadoA: string
  pagadoADocumento?: string | null
  monto: number
  medioPagoLabel: string
  imputaciones: ImputacionParaPdf[]
  /** Detalle de cómo se pagó -- si hay más de una línea, reemplaza al
   * resumen de "Medio de pago" único. */
  lineasPago?: LineaPagoParaPdf[]
  notas?: string | null
}

export async function generarComprobantePagoPdf(
  empresa: EmpresaParaPdf,
  pago: PagoParaPdf,
  nombreArchivo: string,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 15

  const { y: y0, color } = await dibujarEncabezado(doc, empresa, 'Comprobante de Pago', pago.numero, pago.fecha)
  let y = y0

  // ─── Pagado a ───────────────────────────────────────────────────
  doc.setTextColor('#888888')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text('Pagado a', marginX, y)
  y += 6
  doc.setTextColor('#222222')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(pago.pagadoA, marginX, y)
  if (pago.pagadoADocumento) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor('#555555')
    doc.text(pago.pagadoADocumento, pageWidth - marginX, y, { align: 'right' })
  }
  y += 12

  // ─── Importe pagado (destacado) ──────────────────────────────────
  const [rBg, gBg, bBg] = aclarar(color, 0.88)
  doc.setFillColor(rBg, gBg, bBg)
  doc.roundedRect(marginX, y - 7, pageWidth - marginX * 2, 18, 2, 2, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor('#555555')
  doc.text('Importe pagado', marginX + 6, y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(color)
  doc.text(`$ ${formatARS(pago.monto)}`, pageWidth - marginX - 6, y + 1, { align: 'right' })
  y += 20

  // ─── Medio(s) de pago ─────────────────────────────────────────
  // Si la Orden de Pago combinó varias formas (ej. transferencia + cheques
  // a distintos plazos), se detalla cada una; si fue una sola, se muestra
  // como el resumen simple de siempre.
  if (pago.lineasPago && pago.lineasPago.length > 1) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor('#6b6b6b')
    doc.text('Formas de pago', marginX, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    for (const linea of pago.lineasPago) {
      doc.setTextColor('#222222')
      doc.text(linea.medioPagoLabel, marginX, y)
      doc.text(formatARS(linea.monto), pageWidth - marginX, y, { align: 'right' })
      y += 5
      if (linea.detalle) {
        doc.setFontSize(8.5)
        doc.setTextColor('#888888')
        doc.text(linea.detalle, marginX, y)
        doc.setFontSize(9.5)
        y += 5
      }
    }
    y += 6
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor('#555555')
    doc.text('Medio de pago:', marginX, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#222222')
    doc.text(pago.medioPagoLabel, marginX + 32, y)
    y += 12
  }

  // ─── Comprobantes imputados ─────────────────────────────────────
  if (pago.imputaciones.length > 0) {
    doc.setDrawColor(color)
    doc.setLineWidth(0.3)
    doc.line(marginX, y, pageWidth - marginX, y)
    y += 5

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor('#6b6b6b')
    doc.text('En concepto de imputación a', marginX, y)
    doc.text('Monto imputado', pageWidth - marginX, y, { align: 'right' })
    y += 2
    doc.setDrawColor(230, 230, 230)
    doc.line(marginX, y, pageWidth - marginX, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor('#222222')
    const alturaMaxima = pageHeight - 45
    for (const imp of pago.imputaciones) {
      if (y > alturaMaxima) {
        doc.addPage()
        y = 20
      }
      doc.text(imp.comprobante, marginX, y)
      doc.text(formatARS(imp.montoImputado), pageWidth - marginX, y, { align: 'right' })
      y += 6
    }
    y += 6
  }

  // ─── Notas ────────────────────────────────────────────────────
  if (pago.notas) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor('#666666')
    const lineas = doc.splitTextToSize(pago.notas, pageWidth - marginX * 2)
    doc.text(lineas, marginX, y)
    y += 6 * (Array.isArray(lineas) ? lineas.length : 1)
  }

  // ─── Espacio de firma ───────────────────────────────────────────
  // El proveedor (o quien reciba el pago en su nombre) firma acá como
  // constancia de haberlo recibido -- documento físico clásico de "recibí
  // conforme". Se reserva como bloque fijo al pie, en una página nueva si
  // no entra debajo del resto del contenido.
  const alturaFirma = 30
  if (y > pageHeight - alturaFirma - 20) {
    doc.addPage()
    y = 20
  }
  y = Math.max(y, pageHeight - alturaFirma - 20)
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.2)
  doc.line(marginX, y, marginX + 70, y)
  doc.line(pageWidth - marginX - 70, y, pageWidth - marginX, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor('#888888')
  doc.text('Firma', marginX, y)
  doc.text('Aclaración', pageWidth - marginX - 70, y)

  dibujarPie(doc, empresa)
  doc.save(`${nombreArchivo}.pdf`)
}
