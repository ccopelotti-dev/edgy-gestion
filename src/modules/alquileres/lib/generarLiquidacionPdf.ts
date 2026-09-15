// Liquidación mensual a un propietario -- mismo dato que ya mostraba el
// sistema viejo (Settlements.tsx: detalle de cobranzas del mes + bruto -
// comisión = neto a liquidar), pero con el motor de PDF propio de Edgy
// Gestión (@/lib/comprobantes-pdf/pdfHelpers, igual que el resto de los
// módulos) en vez del jsPDF+autoTable ad hoc que tenía el viejo.

import { jsPDF } from 'jspdf'
import {
  type EmpresaParaPdf,
  colorLegibleSobreBlanco,
  dibujarEncabezado,
  dibujarPie,
  imprimirOGuardarPdf,
} from '@/lib/comprobantes-pdf/pdfHelpers'
import { formatARS, formatDate } from './format'

export interface LineaLiquidacionPdf {
  fecha: string
  concepto: string
  unidadNombre: string
  montoTotal: number
}

export interface LiquidacionParaPdf {
  propietarioNombre: string
  mesLabel: string
  comisionPorcentaje: number
  lineas: LineaLiquidacionPdf[]
  totalBruto: number
  totalComision: number
  totalNeto: number
}

export async function generarLiquidacionPdf(
  empresa: EmpresaParaPdf,
  liq: LiquidacionParaPdf,
  nombreArchivo: string,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const marginX = 15

  const { y: y0, color } = await dibujarEncabezado(
    doc,
    empresa,
    'Liquidación de Alquileres',
    liq.mesLabel,
    formatDate(new Date().toISOString().slice(0, 10)),
  )
  let y = y0

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor('#333333')
  doc.text(`Propietario: ${liq.propietarioNombre}`, marginX, y)
  y += 5
  doc.setFontSize(9)
  doc.setTextColor('#666666')
  doc.text(`Comisión de administración: ${liq.comisionPorcentaje}%`, marginX, y)
  y += 9

  // ─── Tabla de cobranzas ─────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(colorLegibleSobreBlanco(color))
  doc.text('Cobranzas del mes', marginX, y)
  y += 6

  const colFecha = marginX
  const colUnidad = marginX + 25
  const colConcepto = marginX + 75
  const colMonto = pageWidth - marginX

  doc.setFontSize(8)
  doc.setTextColor('#6b6b6b')
  doc.text('Fecha', colFecha, y)
  doc.text('Unidad', colUnidad, y)
  doc.text('Concepto', colConcepto, y)
  doc.text('Monto', colMonto, y, { align: 'right' })
  y += 4
  doc.setDrawColor(230, 230, 230)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 5

  const pageHeight = doc.internal.pageSize.getHeight()

  if (liq.lineas.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.setTextColor('#999999')
    doc.text('Sin cobranzas registradas este mes.', marginX, y)
    y += 6
  } else {
    for (const l of liq.lineas) {
      if (y > pageHeight - 45) {
        doc.addPage()
        y = 20
      }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor('#333333')
      doc.text(formatDate(l.fecha), colFecha, y)
      const unidadWrap = doc.splitTextToSize(l.unidadNombre, colConcepto - colUnidad - 4)
      doc.text(unidadWrap, colUnidad, y)
      const conceptoWrap = doc.splitTextToSize(l.concepto || '—', colMonto - colConcepto - 24)
      doc.text(conceptoWrap, colConcepto, y)
      doc.text(formatARS(l.montoTotal), colMonto, y, { align: 'right' })
      const lineas = Math.max(
        Array.isArray(unidadWrap) ? unidadWrap.length : 1,
        Array.isArray(conceptoWrap) ? conceptoWrap.length : 1,
      )
      y += 5 * lineas
    }
  }

  y += 3
  doc.setDrawColor(230, 230, 230)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 8

  // ─── Totales ────────────────────────────────────────────────
  const colEtiqueta = pageWidth - marginX - 55
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor('#333333')
  doc.text('Bruto cobrado', colEtiqueta, y, { align: 'right' })
  doc.text(formatARS(liq.totalBruto), colMonto, y, { align: 'right' })
  y += 6
  doc.text(`Honorarios de administración (${liq.comisionPorcentaje}%)`, colEtiqueta, y, { align: 'right' })
  doc.text(`- ${formatARS(liq.totalComision)}`, colMonto, y, { align: 'right' })
  y += 8
  doc.setDrawColor(200, 200, 200)
  doc.line(colEtiqueta - 40, y - 4, pageWidth - marginX, y - 4)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(colorLegibleSobreBlanco(color))
  doc.text('NETO A LIQUIDAR', colEtiqueta, y, { align: 'right' })
  doc.text(formatARS(liq.totalNeto), colMonto, y, { align: 'right' })

  dibujarPie(doc, empresa)
  await imprimirOGuardarPdf(doc, nombreArchivo)
}
