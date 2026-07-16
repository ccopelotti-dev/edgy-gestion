// ============================================================
// Resumen de cuenta clásico -- PDF (Fase 17b)
// Edgy Gestión
//
// Documento tipo "estado de cuenta corriente": lista cronológica de
// movimientos (comprobantes que aumentan la deuda -- Debe -- y pagos o
// notas de crédito que la disminuyen -- Haber) con saldo corriente fila
// a fila, cerrando con el saldo final. Pensado para Compras > Proveedores
// (ver src/modules/compras/lib/pdfComprobantes.ts), pero genérico: no
// asume "proveedor", solo `entidadNombre` -- reutilizable el día de
// mañana desde Ventas > Clientes.
//
// Reusa el mismo encabezado con banda de color + logo, y el mismo pie de
// página, que el resto de los comprobantes (ver ./pdfHelpers.ts) para que
// se sienta parte de la misma familia de documentos.
// ============================================================

import { jsPDF } from 'jspdf'
import {
  type EmpresaParaPdf,
  formatARS,
  aclarar,
  dibujarEncabezado,
  dibujarPie,
} from './pdfHelpers'

export interface MovimientoResumenCuenta {
  /** Ya formateada, ej "16/07/2026". */
  fecha: string
  /** Ej "FC-00006" o "PAG-00001". */
  comprobante: string
  /** Ej "Factura", "Nota de crédito", "Transferencia". */
  detalle?: string
  /** Aumenta el saldo (lo que le debemos a la entidad). */
  debe?: number
  /** Disminuye el saldo (lo que le pagamos / nos acreditó). */
  haber?: number
}

export interface ResumenCuentaParaPdf {
  entidadNombre: string
  entidadDocumento?: string | null
  saldoInicial?: number
  movimientos: MovimientoResumenCuenta[]
  saldoFinal: number
  notas?: string | null
}

export async function generarResumenCuentaPdf(
  empresa: EmpresaParaPdf,
  resumen: ResumenCuentaParaPdf,
  nombreArchivo: string,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 15

  const fechaHoy = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const { y: y0, color } = await dibujarEncabezado(doc, empresa, 'Resumen de cuenta', '', fechaHoy)
  let y = y0

  // ─── Entidad (proveedor / cliente) ────────────────────────────
  doc.setTextColor('#3a3a3a')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(resumen.entidadNombre, marginX, y)
  if (resumen.entidadDocumento) {
    doc.text(resumen.entidadDocumento, pageWidth - marginX, y, { align: 'right' })
  }
  y += 10

  // ─── Tabla de movimientos ──────────────────────────────────────
  const colFecha = marginX
  const colComp = marginX + 26
  const colDebe = pageWidth - marginX - 80
  const colHaber = pageWidth - marginX - 45
  const colSaldo = pageWidth - marginX

  doc.setDrawColor(color)
  doc.setLineWidth(0.3)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor('#6b6b6b')
  doc.text('Fecha', colFecha, y)
  doc.text('Comprobante', colComp, y)
  doc.text('Debe', colDebe, y, { align: 'right' })
  doc.text('Haber', colHaber, y, { align: 'right' })
  doc.text('Saldo', colSaldo, y, { align: 'right' })
  y += 2
  doc.setDrawColor(230, 230, 230)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor('#222222')

  const alturaMaxima = pageHeight - 45
  let saldoCorriente = resumen.saldoInicial ?? 0

  if (resumen.saldoInicial !== undefined) {
    if (y > alturaMaxima) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'italic')
    doc.setTextColor('#888888')
    doc.text('Saldo anterior', colComp, y)
    doc.text(formatARS(saldoCorriente), colSaldo, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setTextColor('#222222')
    y += 6
  }

  if (resumen.movimientos.length === 0) {
    if (y > alturaMaxima) {
      doc.addPage()
      y = 20
    }
    doc.setTextColor('#888888')
    doc.text('Sin movimientos registrados.', colFecha, y)
    y += 6
  }

  for (const mov of resumen.movimientos) {
    if (y > alturaMaxima) {
      doc.addPage()
      y = 20
    }
    saldoCorriente += (mov.debe ?? 0) - (mov.haber ?? 0)
    doc.text(mov.fecha, colFecha, y)
    const etiquetaComp = mov.detalle ? `${mov.comprobante} (${mov.detalle})` : mov.comprobante
    doc.text(etiquetaComp, colComp, y)
    doc.text(mov.debe ? formatARS(mov.debe) : '—', colDebe, y, { align: 'right' })
    doc.text(mov.haber ? formatARS(mov.haber) : '—', colHaber, y, { align: 'right' })
    doc.text(formatARS(saldoCorriente), colSaldo, y, { align: 'right' })
    y += 6
  }

  y += 4
  doc.setDrawColor(230, 230, 230)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 8

  // ─── Saldo final destacado ──────────────────────────────────────
  if (y > pageHeight - 30) {
    doc.addPage()
    y = 20
  }
  const [rBg, gBg, bBg] = aclarar(color, 0.88)
  doc.setFillColor(rBg, gBg, bBg)
  doc.roundedRect(colHaber - 5, y - 6, colSaldo - colHaber + 5, 10, 1.5, 1.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(color)
  doc.text('Saldo final', colHaber, y)
  doc.text(formatARS(resumen.saldoFinal), colSaldo, y, { align: 'right' })
  y += 16

  // ─── Notas ────────────────────────────────────────────────────
  if (resumen.notas) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor('#666666')
    const lineas = doc.splitTextToSize(resumen.notas, pageWidth - marginX * 2)
    doc.text(lineas, marginX, y)
  }

  dibujarPie(doc, empresa)
  doc.save(`${nombreArchivo}.pdf`)
}
