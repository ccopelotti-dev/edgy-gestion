// Fase 47 (23/08, pedido de Carlos -- Charcutería): PDF con el detalle de
// insumos imputados a un lote de Producción. Sirve para dos momentos: en
// 'borrador' es un preview de lo que se va a descontar (útil como lista de
// "insumos a procesar" antes de arrancar a producir), y en 'confirmada' es
// el comprobante real de lo que ya se descontó. Misma info en los dos
// casos -- viene siempre de Produccion.insumosImputados (ver comentario
// en types/index.ts), nunca se recalcula de la fórmula acá.

import { jsPDF } from 'jspdf'
import {
  type EmpresaParaPdf,
  dibujarEncabezado,
  dibujarPie,
  imprimirOGuardarPdf,
} from '@/lib/comprobantes-pdf/pdfHelpers'
import { formatARS, formatDate } from './format'
import { unidadAbrev, type InsumoImputado, type EstadoProduccion, type UnidadMedida } from '../types'

export interface LoteParaPdf {
  productoNombre: string
  factor: number
  cantidadTeorica: number
  cantidadRealProducida: number
  unidadProducida: UnidadMedida
  fecha: string
  notas?: string
  estado: EstadoProduccion
  insumosImputados: InsumoImputado[]
}

const ESTADO_LABEL: Record<EstadoProduccion, string> = {
  borrador: 'Borrador (todavía sin confirmar -- preview de lo que se va a descontar)',
  confirmada: 'Confirmada',
  anulada: 'Anulada',
}

export async function generarInsumosProduccionPdf(
  empresa: EmpresaParaPdf,
  lote: LoteParaPdf,
  nombreArchivo: string,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const marginX = 15

  const { y: y0, color } = await dibujarEncabezado(
    doc,
    empresa,
    'Insumos de Producción',
    lote.productoNombre,
    formatDate(lote.fecha),
  )
  let y = y0

  // ─── Datos del lote ───────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor('#333333')
  doc.text(`Producto: ${lote.productoNombre}`, marginX, y)
  doc.text(`Factor de lote: ${lote.factor}`, pageWidth - marginX, y, { align: 'right' })
  y += 5
  doc.text(
    `Rendimiento teórico: ${lote.cantidadTeorica.toFixed(2)} ${unidadAbrev(lote.unidadProducida)}`,
    marginX,
    y,
  )
  doc.text(
    `Rendimiento real: ${lote.cantidadRealProducida.toFixed(2)} ${unidadAbrev(lote.unidadProducida)}`,
    pageWidth - marginX,
    y,
    { align: 'right' },
  )
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(lote.estado === 'borrador' ? '#b45309' : '#16a34a')
  doc.text(`Estado: ${ESTADO_LABEL[lote.estado]}`, marginX, y)
  y += 7

  if (lote.notas) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.setTextColor('#666666')
    const notasWrap = doc.splitTextToSize(`Notas: ${lote.notas}`, pageWidth - marginX * 2)
    doc.text(notasWrap, marginX, y)
    y += 5 * (Array.isArray(notasWrap) ? notasWrap.length : 1) + 3
  }

  // ─── Tabla de insumos ───────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(color)
  doc.text('Insumos a procesar', marginX, y)
  y += 6

  const colInsumo = marginX
  const colCantidad = pageWidth - marginX - 68
  const colUnidad = pageWidth - marginX - 46
  const colCosto = pageWidth - marginX - 26
  const colSubtotal = pageWidth - marginX

  doc.setFontSize(8)
  doc.setTextColor('#6b6b6b')
  doc.text('Insumo', colInsumo, y)
  doc.text('Cantidad', colCantidad, y, { align: 'right' })
  doc.text('UM', colUnidad, y, { align: 'right' })
  doc.text('Costo unit.', colCosto, y, { align: 'right' })
  doc.text('Subtotal', colSubtotal, y, { align: 'right' })
  y += 4
  doc.setDrawColor(230, 230, 230)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 5

  const pageHeight = doc.internal.pageSize.getHeight()
  let total = 0

  if (lote.insumosImputados.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.setTextColor('#999999')
    doc.text('Este lote no tiene insumos imputados (fórmula sin líneas de insumo).', marginX, y)
    y += 6
  } else {
    for (const insumo of lote.insumosImputados) {
      if (y > pageHeight - 30) {
        doc.addPage()
        y = 20
      }
      const subtotal = insumo.cantidad * insumo.costoUnitario
      total += subtotal
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor('#333333')
      const nombreWrap = doc.splitTextToSize(insumo.nombre, colCantidad - colInsumo - 4)
      doc.text(nombreWrap, colInsumo, y)
      doc.text(insumo.cantidad.toFixed(2), colCantidad, y, { align: 'right' })
      doc.setTextColor('#666666')
      doc.text(unidadAbrev(insumo.unidad), colUnidad, y, { align: 'right' })
      doc.text(formatARS(insumo.costoUnitario), colCosto, y, { align: 'right' })
      doc.setTextColor('#222222')
      doc.text(formatARS(subtotal), colSubtotal, y, { align: 'right' })
      y += 5 * (Array.isArray(nombreWrap) ? nombreWrap.length : 1)
    }
  }

  y += 3
  doc.setDrawColor(230, 230, 230)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor('#222222')
  doc.text('Costo total de insumos', colCosto, y, { align: 'right' })
  doc.text(formatARS(total), colSubtotal, y, { align: 'right' })

  dibujarPie(doc, empresa)
  await imprimirOGuardarPdf(doc, nombreArchivo)
}
