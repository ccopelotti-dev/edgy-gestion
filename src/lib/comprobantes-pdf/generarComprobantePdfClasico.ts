// ============================================================
// Motor de PDF "Clásico" (A4 vertical) -- congelado en Fase 38
// Edgy Gestión
//
// Este archivo es una copia congelada del motor original de
// generarComprobantePdf.ts tal como estaba ANTES del rediseño A5
// apaisada (Fase 38, normativa RG 1415). Se mantiene vivo a propósito
// -- NO es código muerto -- porque los comprobantes que ya se
// emitieron contra ARCA (con CAE real, ya cargados en la base de
// AFIP) tienen que seguir viéndose exactamente como se imprimieron/
// entregaron en su momento cada vez que alguien los vuelve a
// descargar. Cambiar retroactivamente el diseño de un comprobante que
// ya existe en el padrón de ARCA generaría una discrepancia entre lo
// que el cliente tiene en la mano y lo que Edgy Gestión le muestra
// después -- por eso pdfComprobantes.ts elige este motor o el nuevo
// según la fecha de creación del comprobante (ver CORTE_FORMATO_A5).
//
// No se debe seguir modificando este archivo salvo un bugfix crítico
// (ej. un crash) -- cualquier mejora de diseño va en
// generarComprobantePdf.ts, el motor nuevo.
// ============================================================

import { jsPDF } from 'jspdf'
import { imprimirOGuardarPdf } from './pdfHelpers'
import QRCode from 'qrcode'
import { construirUrlQrFiscal, type DatosQrFiscal } from './arcaQr'

const COLOR_DEFAULT = '#0F6E56'

export interface EmpresaParaPdfClasico {
  nombre: string
  cuit?: string | null
  direccion?: string | null
  telefono?: string | null
  logoUrl?: string | null
  colorMarca?: string | null
  ingresosBrutosCondicion?: string | null
  ingresosBrutosNumero?: string | null
  inicioActividades?: string | null
  provincia?: string | null
  mostrarIibbAlicuota?: boolean
  iibbAlicuota?: number | null
}

function leyendaCondicionIva(condicion: string): string {
  switch (condicion) {
    case 'responsable_inscripto':
      return 'IVA Responsable Inscripto'
    case 'monotributista':
      return 'Responsable Monotributo'
    case 'exento':
      return 'IVA Exento'
    default:
      return ''
  }
}

function leyendaIngresosBrutos(
  condicion?: string | null,
  numero?: string | null,
  provincia?: string | null,
): string | null {
  if (!condicion) return null
  if (condicion === 'exento') return 'IIBB: Exento'
  if (condicion === 'no_contribuyente') return 'IIBB: No contribuyente'
  const sufijo = condicion === 'inscripto_convenio_multilateral' ? ' (Conv. Multilateral)' : provincia ? ` (${provincia})` : ''
  return numero ? `IIBB N.º ${numero}${sufijo}` : null
}

export interface ItemParaPdfClasico {
  descripcion: string
  cantidad: number
  precioUnitario: number
  subtotal: number
}

export interface DatosAfipParaPdfClasico {
  cae: string
  vencimientoCae: string
  puntoVenta: number
  tipoComprobanteAfip: number
  numeroComprobante: number
  docTipoReceptor?: number
  tipoFiscal?: string
  condicionIvaEmisor?: string
}

export interface ComprobanteParaPdfClasico {
  tipoLabel: string
  numero: string
  fecha: string
  fechaIso?: string
  clienteNombre: string
  clienteDocumento?: string | null
  items: ItemParaPdfClasico[]
  subtotal: number
  descuentoGeneral?: number
  montoIva?: number
  total: number
  notas?: string | null
  afip?: DatosAfipParaPdfClasico
}

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

/** Igual que la versión del motor nuevo -- tolera tanto ISO como el
 * formato crudo de ARCA (AAAAMMDD) para no mostrar "Invalid Date" en
 * comprobantes viejos que quedaron guardados con el valor sin normalizar
 * (ver el fix en netlify/functions/arca-autorizar-comprobante.js). */
function formatFechaCorta(valor: string): string {
  if (!valor) return '—'
  const iso = /^\d{8}$/.test(valor)
    ? `${valor.slice(0, 4)}-${valor.slice(4, 6)}-${valor.slice(6, 8)}`
    : valor
  const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'))
  if (isNaN(d.getTime())) return valor
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

function aclarar(hex: string, factor: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  const mezclar = (canal: number) => Math.round(canal + (255 - canal) * factor)
  return [mezclar(r), mezclar(g), mezclar(b)]
}

// 22/08, bugfix crítico (excepción al "no tocar" de la cabecera del
// archivo -- ver ahí por qué): igual que en pdfHelpers.ts, un jpeg CMYK
// o progresivo (foto de celular subida como logo) hacía que el decoder
// de jsPDF dibujara pixels basura -- casi siempre negro sólido, en la
// página entera. Se redibuja el logo en un <canvas> vía el decoder
// nativo del navegador antes de pasárselo a jsPDF (que solo garantiza
// soportar el PNG plano de 8 bits que sale de ahí).
async function logoADataUrl(
  url: string,
): Promise<{ dataUrl: string; formato: 'PNG' | 'JPEG' } | null> {
  let objectUrl: string | null = null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    objectUrl = URL.createObjectURL(blob)
    const urlParaImg = objectUrl
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('No se pudo obtener contexto 2D para redibujar el logo'))
            return
          }
          ctx.drawImage(img, 0, 0)
          resolve(canvas.toDataURL('image/png'))
        } catch (e) {
          reject(e instanceof Error ? e : new Error('No se pudo redibujar el logo'))
        }
      }
      img.onerror = () => reject(new Error('No se pudo decodificar el logo'))
      img.src = urlParaImg
    })
    return { dataUrl, formato: 'PNG' }
  } catch {
    return null
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Genera y dispara la descarga del PDF de un comprobante -- versión
 * "Clásica" (A4 vertical), congelada en Fase 38. Ver el comment de
 * cabecera del archivo para por qué sigue viva.
 */
export async function generarComprobantePdfClasico(
  empresa: EmpresaParaPdfClasico,
  comprobante: ComprobanteParaPdfClasico,
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

  // ─── Franja fiscal del emisor (Fase 28 -- Anexo II RG 1415) ──
  let y = anchoBanda + 6
  const partesFiscales: string[] = []
  const iibbTexto = leyendaIngresosBrutos(
    empresa.ingresosBrutosCondicion,
    empresa.ingresosBrutosNumero,
    empresa.provincia,
  )
  if (iibbTexto) partesFiscales.push(iibbTexto)
  if (empresa.inicioActividades) {
    partesFiscales.push(`Inicio activ. ${formatFechaCorta(empresa.inicioActividades)}`)
  }
  if (comprobante.afip?.condicionIvaEmisor) {
    const leyenda = leyendaCondicionIva(comprobante.afip.condicionIvaEmisor)
    if (leyenda) partesFiscales.push(leyenda)
  }
  if (partesFiscales.length > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor('#8a8a8a')
    doc.text(partesFiscales.join('  ·  '), marginX, y)
    y += 6
  } else {
    y += 4
  }

  // ─── Datos del cliente ──────────────────────────────────────
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

  // ─── Transparencia Fiscal al Consumidor (Fase 28 -- RG 5614/2024) ──
  if (
    comprobante.afip?.tipoFiscal === 'B' &&
    comprobante.montoIva &&
    comprobante.montoIva > 0
  ) {
    if (y > pageHeight - 40) {
      doc.addPage()
      y = 20
    }
    doc.setDrawColor(230, 230, 230)
    doc.setLineWidth(0.3)
    doc.rect(marginX, y, pageWidth - marginX * 2, empresa.mostrarIibbAlicuota && empresa.iibbAlicuota ? 22 : 16)
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor('#555555')
    doc.text('Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)', marginX + 3, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor('#222222')
    doc.text(`IVA Contenido: $ ${formatARS(comprobante.montoIva)}`, marginX + 3, y)
    if (empresa.mostrarIibbAlicuota && empresa.iibbAlicuota) {
      y += 6
      const juris = empresa.provincia ? ` (${empresa.provincia})` : ''
      doc.text(
        `Ingresos Brutos${juris}: alícuota ${empresa.iibbAlicuota}% incluida en el precio`,
        marginX + 3,
        y,
      )
    }
    y += 10
  }

  // ─── CAE + QR fiscal (Fase 11 -- RG 4892/2020) ───────────────
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

  await imprimirOGuardarPdf(doc, nombreArchivo)
}
