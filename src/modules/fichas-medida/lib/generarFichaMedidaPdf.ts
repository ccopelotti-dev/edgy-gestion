// ============================================================
// Ficha de medida -- PDF (Fase 41)
// Edgy Gestión
//
// Comprobante para enviarle al cliente el detalle relevado en la visita
// de medición/replanteo -- no es un documento fiscal (sin CAE, QR ni
// letra fiscal), así que reusa el motor genérico compartido (el mismo
// que Resumen de cuenta / Comprobante de Pago en Compras > Proveedores),
// no el motor de Factura/ARCA. Ver ./pdfHelpers.ts.
// ============================================================

import { jsPDF } from 'jspdf'
import {
  type EmpresaParaPdf,
  aclarar,
  dibujarEncabezado,
  dibujarPie,
  imprimirOGuardarPdf,
  formatARS,
} from '@/lib/comprobantes-pdf/pdfHelpers'
import type { FichaMedida, ItemFichaMedida } from '../types'
import { MODALIDAD_ENTREGA_LABEL, TIPO_FICHA_LABEL } from '../types'

function formatFechaCorta(iso?: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

/** Arma las líneas de texto de un ítem -- la primera es el título
 * (producto + cantidad), el resto son detalles indentados. Cubre los dos
 * tipos de ficha (Genérica y Cortinas) leyendo solo los campos que cada
 * una carga. */
function descripcionItem(item: ItemFichaMedida): string[] {
  const lineas: string[] = []
  lineas.push(`${item.producto}${item.cantidad && item.cantidad !== 1 ? ` · cant. ${item.cantidad}` : ''}`)
  if (item.tela) lineas.push(`Tela: ${item.tela}`)
  for (const pano of item.panos) {
    const medida = [pano.ancho ? `Ancho ${pano.ancho}` : null, pano.alto ? `Alto ${pano.alto}` : null]
      .filter(Boolean)
      .join(' x ')
    if (medida) lineas.push(`Paño: ${medida}`)
  }
  if (item.tipoBarral) lineas.push(`Barral: ${item.tipoBarral}${item.incluyeBarral ? '' : ' (no incluido)'}`)
  if (item.tipoCortina) lineas.push(`Tipo de cortina: ${item.tipoCortina}`)
  if (item.medida) lineas.push(`Medida: ${item.medida}`)
  if (item.peso) lineas.push(`Peso: ${item.peso}`)
  if (item.notas) lineas.push(`Notas: ${item.notas}`)
  return lineas
}

export async function generarFichaMedidaPdf(
  empresa: EmpresaParaPdf,
  ficha: FichaMedida,
  nombreArchivo: string,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 15
  const alturaMaxima = pageHeight - 45

  const fechaHoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const { y: y0, color } = await dibujarEncabezado(doc, empresa, 'Ficha de medida', '', fechaHoy)
  let y = y0

  // ─── Cliente ────────────────────────────────────────────────────
  doc.setTextColor('#888888')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text('Cliente', marginX, y)
  y += 6
  doc.setTextColor('#222222')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(ficha.clienteNombre, marginX, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor('#555555')
  doc.text(TIPO_FICHA_LABEL[ficha.tipo], pageWidth - marginX, y, { align: 'right' })
  y += 8

  const domicilio = ficha.domicilioTrabajo || ficha.clienteDireccion
  if (domicilio) {
    doc.setFontSize(9.5)
    doc.setTextColor('#555555')
    doc.text(`Domicilio: ${domicilio}`, marginX, y)
    y += 6
  }

  // ─── Fechas (Pedido / Replanteo / Entrega) ─────────────────────
  y += 2
  const [rBg, gBg, bBg] = aclarar(color, 0.9)
  doc.setFillColor(rBg, gBg, bBg)
  doc.roundedRect(marginX, y - 5, pageWidth - marginX * 2, 16, 2, 2, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor('#555555')
  const col1 = marginX + 4
  const col2 = marginX + (pageWidth - marginX * 2) / 3 + 2
  const col3 = marginX + ((pageWidth - marginX * 2) / 3) * 2
  doc.text('Pedido', col1, y)
  doc.text('Replanteo', col2, y)
  doc.text('Entrega', col3, y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor('#222222')
  doc.text(formatFechaCorta(ficha.fechaPedido) || '-', col1, y + 6)
  const replanteoTexto = ficha.fechaReplanteo
    ? `${formatFechaCorta(ficha.fechaReplanteo)}${ficha.horaReplanteo ? ` ${ficha.horaReplanteo}` : ''}`
    : '-'
  doc.text(replanteoTexto, col2, y + 6)
  doc.text(formatFechaCorta(ficha.fechaEntrega) || '-', col3, y + 6)
  y += 16

  // ─── Modalidad de entrega ───────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor('#555555')
  doc.text('Modalidad de entrega:', marginX, y)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#222222')
  doc.text(MODALIDAD_ENTREGA_LABEL[ficha.modalidadEntrega], marginX + 42, y)
  y += 10

  // ─── Detalle relevado (ítems) ───────────────────────────────────
  doc.setDrawColor(color)
  doc.setLineWidth(0.3)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor('#6b6b6b')
  doc.text('Detalle relevado', marginX, y)
  y += 2
  doc.setDrawColor(230, 230, 230)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 6

  for (const item of ficha.items) {
    const lineas = descripcionItem(item)
    if (lineas.length === 0) continue
    if (y > alturaMaxima) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor('#222222')
    doc.text(lineas[0], marginX, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor('#666666')
    for (const linea of lineas.slice(1)) {
      if (y > alturaMaxima) {
        doc.addPage()
        y = 20
      }
      doc.text(linea, marginX + 4, y)
      y += 4.5
    }
    y += 3
  }
  y += 4

  // ─── Notas generales ────────────────────────────────────────────
  if (ficha.notas) {
    if (y > alturaMaxima) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor('#6b6b6b')
    doc.text('Notas', marginX, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor('#444444')
    const lineas = doc.splitTextToSize(ficha.notas, pageWidth - marginX * 2)
    doc.text(lineas, marginX, y)
    y += 6 * (Array.isArray(lineas) ? lineas.length : 1)
  }

  // Fase 41.4: el recuadro de Seña/Total que iba acá se quitó -- esos
  // campos salieron del formulario de FichaDialog (sin uso real desde
  // que el cobro de seña se desacopló de la Ficha, Fase 41.2) y de acá
  // en más siempre van a guardarse en 0, así que el recuadro condicional
  // `ficha.total > 0` nunca se hubiera vuelto a mostrar.

  dibujarPie(doc, empresa)
  await imprimirOGuardarPdf(doc, nombreArchivo)
}
