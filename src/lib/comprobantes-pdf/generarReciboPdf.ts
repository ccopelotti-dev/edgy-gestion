// ============================================================
// Recibo (Comprobante de Cobro) -- PDF
// Edgy Gestión
//
// Documento inverso al Comprobante de Pago de Compras (ver
// ./generarComprobantePagoPdf.ts): acá SOMOS NOSOTROS los que
// RECIBIMOS el dinero -- así que el título es "Recibo" y el texto dice
// "Recibí de" en vez de "Pagado a". Pensado para Ventas > Clientes/
// Cobranzas, pero genérico: no asume "cliente", solo `recibidoDe`.
//
// Mismo layout que generarComprobantePagoPdf.ts (medio(s) de pago,
// comprobantes imputados, notas, espacio de firma) para que se sienta
// parte de la misma familia de documentos -- ver ./pdfHelpers.ts.
// ============================================================

import { jsPDF } from 'jspdf'
import {
  type EmpresaParaPdf,
  formatARS,
  aclarar,
  dibujarEncabezado,
  dibujarPie,
} from './pdfHelpers'

export interface ImputacionReciboParaPdf {
  /** Ej "FAC-00006". */
  comprobante: string
  montoImputado: number
}

export interface ReciboParaPdf {
  /** Ya formateado, ej "COB-00003". */
  numero: string
  /** Ya formateada, ej "16/07/2026". */
  fecha: string
  recibidoDe: string
  recibidoDeDocumento?: string | null
  monto: number
  medioPagoLabel: string
  imputaciones: ImputacionReciboParaPdf[]
  notas?: string | null
}

export async function generarReciboPdf(
  empresa: EmpresaParaPdf,
  recibo: ReciboParaPdf,
  nombreArchivo: string,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 15

  const { y: y0, color } = await dibujarEncabezado(doc, empresa, 'Recibo', recibo.numero, recibo.fecha)
  let y = y0

  // ─── Recibí de ──────────────────────────────────────────────────
  doc.setTextColor('#888888')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text('Recibí de', marginX, y)
  y += 6
  doc.setTextColor('#222222')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(recibo.recibidoDe, marginX, y)
  if (recibo.recibidoDeDocumento) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor('#555555')
    doc.text(recibo.recibidoDeDocumento, pageWidth - marginX, y, { align: 'right' })
  }
  y += 12

  // ─── Importe recibido (destacado) ────────────────────────────────
  const [rBg, gBg, bBg] = aclarar(color, 0.88)
  doc.setFillColor(rBg, gBg, bBg)
  doc.roundedRect(marginX, y - 7, pageWidth - marginX * 2, 18, 2, 2, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor('#555555')
  doc.text('Importe recibido', marginX + 6, y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(color)
  doc.text(`$ ${formatARS(recibo.monto)}`, pageWidth - marginX - 6, y + 1, { align: 'right' })
  y += 20

  // ─── Medio de pago ────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor('#555555')
  doc.text('Medio de pago:', marginX, y)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#222222')
  doc.text(recibo.medioPagoLabel, marginX + 32, y)
  y += 12

  // ─── Comprobantes imputados ─────────────────────────────────────
  if (recibo.imputaciones.length > 0) {
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
    for (const imp of recibo.imputaciones) {
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
  if (recibo.notas) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor('#666666')
    const lineas = doc.splitTextToSize(recibo.notas, pageWidth - marginX * 2)
    doc.text(lineas, marginX, y)
    y += 6 * (Array.isArray(lineas) ? lineas.length : 1)
  }

  // ─── Espacio de firma ───────────────────────────────────────────
  // Quien recibió el pago en nombre nuestro firma acá como constancia
  // de haberlo cobrado -- documento físico clásico de "recibí conforme".
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
