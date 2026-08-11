// PDF del recibo de sueldo -- formato Anexo III (Decreto 407/2026,
// reglamentario del Art. 140 LCT según Ley 27.802): 4 secciones
// (identificación, contribuciones patronales, bruto y deducciones,
// neto) + gráfico de composición del costo laboral total.
//
// El QR de validación pública queda pendiente de la integración ARCA
// de facturación electrónica (decisión explícita, fuera de alcance
// de esta entrega) -- por eso no aparece acá todavía.

import { jsPDF } from 'jspdf'
import {
  type EmpresaParaPdf,
  formatARS,
  aclarar,
  dibujarEncabezado,
  dibujarPie,
  imprimirOGuardarPdf,
} from '@/lib/comprobantes-pdf/pdfHelpers'
import type { ReciboConcepto, RubroContribucion } from '../types'
import { RUBRO_CONTRIBUCION_LABEL } from '../types'
import { formatFecha, formatPeriodo } from './format'
import { montoALetras } from './numeroALetras'

export interface ReciboSueldoParaPdf {
  numero: string // ya formateado, ej "REC-00003"
  periodo: string // 'YYYY-MM'
  fechaPago: string | null // ISO, puede no estar si sigue en borrador
  empleadoNombre: string
  empleadoCuil: string | null
  empleadoCategoria: string | null
  fechaIngreso: string
  presentismo: boolean
  esRectificativa: boolean
  conceptos: ReciboConcepto[]
  totalRemunerativo: number
  totalDeducciones: number
  neto: number
  totalContribucionesPatronales: number
}

const COLORES_RUBRO: Record<RubroContribucion, string> = {
  sindical: '#7c3aed',
  seguridad_social: '#2563eb',
  obra_social: '#16a34a',
  pami: '#ea580c',
  art: '#dc2626',
  camaras: '#0891b2',
  otros: '#6b7280',
}

/** Dibuja una porción de torta como abanico de triángulos desde el
 * centro (jsPDF no tiene primitiva de arco/pie nativa) -- suficiente
 * resolución visual para un documento impreso/PDF. */
function dibujarPorcion(doc: jsPDF, cx: number, cy: number, r: number, anguloInicio: number, anguloFin: number, color: string) {
  const [red, green, blue] = hexToRgbLocal(color)
  doc.setFillColor(red, green, blue)
  const pasos = Math.max(2, Math.ceil(((anguloFin - anguloInicio) * 180) / Math.PI / 4))
  const delta = (anguloFin - anguloInicio) / pasos
  for (let i = 0; i < pasos; i++) {
    const a1 = anguloInicio + delta * i
    const a2 = anguloInicio + delta * (i + 1)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const x2 = cx + r * Math.cos(a2)
    const y2 = cy + r * Math.sin(a2)
    doc.triangle(cx, cy, x1, y1, x2, y2, 'F')
  }
}

function hexToRgbLocal(hex: string): [number, number, number] {
  const limpio = hex.replace('#', '')
  const n = parseInt(limpio, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function dibujarLinea(
  doc: jsPDF,
  y: number,
  marginX: number,
  pageWidth: number,
  concepto: string,
  base: number | null,
  monto: number,
) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor('#333333')
  doc.text(concepto, marginX, y)
  if (base !== null) {
    doc.setTextColor('#888888')
    doc.text(formatARS(base), pageWidth - marginX - 32, y, { align: 'right' })
  }
  doc.setTextColor('#222222')
  doc.text(formatARS(monto), pageWidth - marginX, y, { align: 'right' })
}

export async function generarReciboSueldoPdf(
  empresa: EmpresaParaPdf,
  recibo: ReciboSueldoParaPdf,
  nombreArchivo: string,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const marginX = 15

  const titulo = recibo.esRectificativa ? 'Recibo de Sueldo (Rectificativa)' : 'Recibo de Sueldo'
  const { y: y0, color } = await dibujarEncabezado(
    doc,
    empresa,
    titulo,
    recibo.numero,
    recibo.fechaPago ? formatFecha(recibo.fechaPago) : formatPeriodo(recibo.periodo),
  )
  let y = y0

  // ─── Sección 1: Identificación ───────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(color)
  doc.text('1. Identificación', marginX, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor('#333333')
  doc.text(`Trabajador: ${recibo.empleadoNombre}`, marginX, y)
  doc.text(`Período: ${formatPeriodo(recibo.periodo)}`, pageWidth - marginX, y, { align: 'right' })
  y += 5
  doc.text(`CUIL: ${recibo.empleadoCuil ?? '—'}`, marginX, y)
  doc.text(`Categoría: ${recibo.empleadoCategoria ?? '—'}`, pageWidth - marginX, y, { align: 'right' })
  y += 5
  doc.text(`Fecha de ingreso: ${formatFecha(recibo.fechaIngreso)}`, marginX, y)
  y += 10

  // ─── Sección 2: Contribuciones patronales + gráfico ──────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(color)
  doc.text('2. Contribuciones a cargo del empleador', marginX, y)
  y += 6

  const contribuciones = recibo.conceptos.filter((c) => c.tipo === 'contribucion_patronal')
  const anchoTexto = pageWidth - marginX * 2 - 55 // deja lugar al gráfico a la derecha
  let yTexto = y
  doc.setFontSize(8)
  doc.setTextColor('#6b6b6b')
  doc.text('Concepto', marginX, yTexto)
  doc.text('Base', marginX + anchoTexto - 32, yTexto, { align: 'right' })
  doc.text('Monto', marginX + anchoTexto, yTexto, { align: 'right' })
  yTexto += 4
  doc.setDrawColor(230, 230, 230)
  doc.line(marginX, yTexto, marginX + anchoTexto, yTexto)
  yTexto += 5

  if (contribuciones.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.setTextColor('#999999')
    doc.text('Sin contribuciones patronales cargadas.', marginX, yTexto)
    yTexto += 6
  } else {
    for (const c of contribuciones) {
      dibujarLinea(doc, yTexto, marginX, marginX + anchoTexto + 32, c.concepto, c.baseCalculo, c.monto)
      yTexto += 5
    }
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor('#222222')
  doc.text('Total contribuciones patronales', marginX, yTexto + 2)
  doc.text(formatARS(recibo.totalContribucionesPatronales), marginX + anchoTexto, yTexto + 2, { align: 'right' })

  // Gráfico de torta -- composición por rubro, a la derecha del bloque.
  const porRubro = new Map<RubroContribucion, number>()
  for (const c of contribuciones) {
    if (!c.rubro) continue
    porRubro.set(c.rubro, (porRubro.get(c.rubro) ?? 0) + c.monto)
  }
  const totalRubros = Array.from(porRubro.values()).reduce((a, b) => a + b, 0)
  const cx = marginX + anchoTexto + 20
  const cy = y + 14
  const r = 12
  if (totalRubros > 0) {
    let anguloActual = -Math.PI / 2
    for (const [rubro, monto] of porRubro.entries()) {
      const angulo = (monto / totalRubros) * Math.PI * 2
      dibujarPorcion(doc, cx, cy, r, anguloActual, anguloActual + angulo, COLORES_RUBRO[rubro])
      anguloActual += angulo
    }
    // Leyenda debajo del gráfico
    let yLeyenda = cy + r + 5
    doc.setFontSize(6.5)
    for (const [rubro, monto] of porRubro.entries()) {
      const [red, green, blue] = hexToRgbLocal(COLORES_RUBRO[rubro])
      doc.setFillColor(red, green, blue)
      doc.rect(cx - r, yLeyenda - 2.2, 2.5, 2.5, 'F')
      doc.setTextColor('#444444')
      const pct = Math.round((monto / totalRubros) * 100)
      doc.text(`${RUBRO_CONTRIBUCION_LABEL[rubro]} (${pct}%)`, cx - r + 4, yLeyenda)
      yLeyenda += 3.6
    }
  } else {
    doc.setFontSize(7)
    doc.setTextColor('#bbbbbb')
    doc.text('Sin datos', cx, cy, { align: 'center' })
  }

  y = Math.max(yTexto + 10, cy + r + 5 + porRubro.size * 3.6 + 4)

  // ─── Sección 3: Remuneración bruta y deducciones ─────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(color)
  doc.text('3. Remuneración bruta y deducciones', marginX, y)
  y += 6

  const remunerativos = recibo.conceptos.filter((c) => c.tipo === 'remunerativo')
  const deducciones = recibo.conceptos.filter((c) => c.tipo === 'deduccion')

  doc.setFontSize(8)
  doc.setTextColor('#6b6b6b')
  doc.text('Conceptos remunerativos', marginX, y)
  doc.text('Base', pageWidth - marginX - 32, y, { align: 'right' })
  doc.text('Monto', pageWidth - marginX, y, { align: 'right' })
  y += 4
  doc.setDrawColor(230, 230, 230)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 5
  for (const c of remunerativos) {
    dibujarLinea(doc, y, marginX, pageWidth, c.concepto, c.baseCalculo, c.monto)
    y += 5
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor('#222222')
  doc.text('Total remuneración bruta', marginX, y + 2)
  doc.text(formatARS(recibo.totalRemunerativo), pageWidth - marginX, y + 2, { align: 'right' })
  y += 10

  doc.setFontSize(8)
  doc.setTextColor('#6b6b6b')
  doc.text('Deducciones', marginX, y)
  y += 4
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 5
  if (deducciones.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.setTextColor('#999999')
    doc.text('Sin deducciones cargadas.', marginX, y)
    y += 5
  } else {
    for (const c of deducciones) {
      dibujarLinea(doc, y, marginX, pageWidth, c.concepto, null, -c.monto)
      y += 5
    }
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor('#222222')
  doc.text('Total deducciones', marginX, y + 2)
  doc.text(`- ${formatARS(recibo.totalDeducciones)}`, pageWidth - marginX, y + 2, { align: 'right' })
  y += 12

  // ─── Sección 4: Remuneración neta ─────────────────────────────
  const [rBg, gBg, bBg] = aclarar(color, 0.88)
  doc.setFillColor(rBg, gBg, bBg)
  doc.roundedRect(marginX, y - 6, pageWidth - marginX * 2, 20, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(color)
  doc.text('4. Remuneración neta', marginX + 5, y)
  doc.setFontSize(14)
  doc.text(formatARS(recibo.neto), pageWidth - marginX - 5, y + 1, { align: 'right' })
  y += 7
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor('#555555')
  const letras = doc.splitTextToSize(montoALetras(recibo.neto), pageWidth - marginX * 2 - 10)
  doc.text(letras, marginX + 5, y)
  y += 6 * (Array.isArray(letras) ? letras.length : 1) + 8

  // ─── Espacio de firma ───────────────────────────────────────
  const pageHeight = doc.internal.pageSize.getHeight()
  if (y > pageHeight - 30) {
    doc.addPage()
    y = 20
  }
  y = Math.max(y, pageHeight - 30)
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.2)
  doc.line(marginX, y, marginX + 70, y)
  doc.line(pageWidth - marginX - 70, y, pageWidth - marginX, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor('#888888')
  doc.text('Firma del empleador', marginX, y)
  doc.text('Recibí conforme', pageWidth - marginX - 70, y)

  dibujarPie(doc, empresa)
  await imprimirOGuardarPdf(doc, nombreArchivo)
}
