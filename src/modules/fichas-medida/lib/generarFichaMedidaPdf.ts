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
  type EmpresaParaPdfCompleta,
  aclarar,
  colorLegibleSobreBlanco,
  dibujarEncabezadoConDatosFiscales,
  dibujarPie,
  imprimirOGuardarPdf,
  formatARS,
  formatNumeroConPuntoVenta,
} from '@/lib/comprobantes-pdf/pdfHelpers'
import type { FichaMedida, ItemFichaMedida } from '../types'
import { MODALIDAD_ENTREGA_LABEL, TIPO_FICHA_LABEL } from '../types'

function formatFechaCorta(iso?: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

/** Paños con ambas medidas cargadas -- son los únicos que se pueden
 * dibujar en el esquema (ver dibujarEsquemaCortina). Un paño con solo
 * ancho o solo alto no alcanza para un rectángulo proporcional. */
function panosDibujables(item: ItemFichaMedida): { ancho: number; alto: number }[] {
  return item.panos.filter((p): p is { id: string; ancho: number; alto: number } => Boolean(p.ancho && p.alto))
}

/** Arma las líneas de texto de un ítem -- la primera es el título
 * (producto + cantidad), el resto son detalles indentados. Cubre los dos
 * tipos de ficha (Genérica y Cortinas) leyendo solo los campos que cada
 * una carga.
 *
 * `conEsquema`: si el ítem va a llevar el dibujo técnico al lado (ver
 * dibujarEsquemaCortina), el detalle de cada paño ya queda representado
 * ahí -- acá alcanza con la cuenta ("Paños: 2"), no hace falta repetir
 * ancho/alto de cada uno en texto. Si NO hay dibujo (ítem genérico, o
 * paños sin medidas completas), se listan igual que antes para no perder
 * el dato. */
function descripcionItem(item: ItemFichaMedida, conEsquema: boolean): string[] {
  const lineas: string[] = []
  lineas.push(`${item.producto}${item.cantidad && item.cantidad !== 1 ? ` · cant. ${item.cantidad}` : ''}`)
  if (item.tela) lineas.push(`Tela: ${item.tela}`)
  if (item.color) lineas.push(`Color: ${item.color}`)
  if (conEsquema) {
    if (item.panos.length > 0) lineas.push(`Paños: ${item.panos.length}`)
  } else {
    for (const pano of item.panos) {
      const medida = [pano.ancho ? `Ancho ${pano.ancho}` : null, pano.alto ? `Alto ${pano.alto}` : null]
        .filter(Boolean)
        .join(' x ')
      if (medida) lineas.push(`Paño: ${medida}`)
    }
  }
  if (item.tipoBarral) lineas.push(`Barral: ${item.tipoBarral}${item.incluyeBarral ? '' : ' (no incluido)'}`)
  if (item.tipoCortina) lineas.push(`Tipo de cortina: ${item.tipoCortina}`)
  if (item.medida) lineas.push(`Medida: ${item.medida}`)
  if (item.peso) lineas.push(`Peso: ${item.peso}`)
  if (item.notas) lineas.push(`Notas: ${item.notas}`)
  return lineas
}

function formatMedidaCm(metros: number): string {
  return String(Math.round(metros * 100))
}

// Fase 41.6 (pedido de Carlos, 19-20/08): esquema técnico del ítem de
// cortina -- reemplaza la idea original de "dibujo artístico" (que
// hubiera necesitado arte por cada terminación) por algo que se arma
// solo con datos reales: un rectángulo por paño, proporcional a sus
// medidas, con ancho y alto escritos en cada lado. El título del
// recuadro es el Tipo de cortina elegido (Presilla alta, Pellizco
// doble, etc.) en vez de un dibujo distinto por variante -- un solo
// esquema genérico sirve para todas, el título aclara cuál es.
const ESQUEMA_ANCHO = 42
const ESQUEMA_ALTO_CANVAS = 28
const ESQUEMA_TITULO_ALTO = 5
const ESQUEMA_PADDING = 3
const ESQUEMA_COTA_ANCHO_ALTO = 5
/** Alto total que ocupa el recuadro (fijo, no depende de los datos --
 * así el llamador puede reservar el espacio antes de dibujar). */
const ESQUEMA_ALTO_TOTAL = ESQUEMA_TITULO_ALTO + ESQUEMA_PADDING + ESQUEMA_ALTO_CANVAS + ESQUEMA_COTA_ANCHO_ALTO + 3

function dibujarEsquemaCortina(
  doc: jsPDF,
  x: number,
  yTop: number,
  titulo: string,
  panos: { ancho: number; alto: number }[],
  color: string,
): void {
  doc.setFont('helvetica', 'bold')
  // Fase 43d: "Terminación: <tipo>" es bastante más largo que el tipo
  // solo -- se achica la fuente si no entra en el ancho del recuadro
  // (42mm con padding) en vez de dejarla desbordar el borde.
  let tituloFontSize = 8
  const anchoDisponibleTitulo = ESQUEMA_ANCHO - ESQUEMA_PADDING * 2
  doc.setFontSize(tituloFontSize)
  while (doc.getTextWidth(titulo) > anchoDisponibleTitulo && tituloFontSize > 5.5) {
    tituloFontSize -= 0.5
    doc.setFontSize(tituloFontSize)
  }
  // Fase 43d (20/08, a pedido de Carlos): con un color de marca claro
  // (ej. el beige de Punto Tex) este título quedaba casi invisible
  // sobre el fondo blanco del esquema -- ver colorLegibleSobreBlanco.
  doc.setTextColor(colorLegibleSobreBlanco(color))
  doc.text(titulo, x + ESQUEMA_ANCHO / 2, yTop + ESQUEMA_TITULO_ALTO - 1, { align: 'center' })

  const canvasTopBase = yTop + ESQUEMA_TITULO_ALTO + ESQUEMA_PADDING
  const canvasLeft = x + ESQUEMA_PADDING
  const canvasWidth = ESQUEMA_ANCHO - ESQUEMA_PADDING * 2
  const gap = 2

  const sumaAnchos = panos.reduce((s, p) => s + p.ancho, 0)
  const maxAlto = Math.max(...panos.map((p) => p.alto))
  const escala = Math.min((canvasWidth - gap * (panos.length - 1)) / sumaAnchos, ESQUEMA_ALTO_CANVAS / maxAlto)

  // Alto real (mm) que ocupa el paño más alto ya escalado -- cuando los
  // paños son más anchos que altos, el ancho es el que manda la escala
  // (ver Math.min arriba) y el dibujo termina ocupando mucho menos que
  // ESQUEMA_ALTO_CANVAS. Antes la cota de ancho se apoyaba siempre en el
  // piso fijo del canvas, dejando un hueco enorme entre el rectángulo y
  // su cota. Ahora se centra el dibujo verticalmente en el canvas y la
  // cota de ancho se apoya justo debajo de los rectángulos reales.
  const altoRealMax = maxAlto * escala
  const canvasTop = canvasTopBase + (ESQUEMA_ALTO_CANVAS - altoRealMax) / 2

  // Fase 43f (20/08, a pedido de Carlos): el contorno de los paños y el
  // borde del recuadro usan el mismo color de marca "legible" que el
  // título (colorLegibleSobreBlanco) en vez de un gris fijo -- así el
  // esquema entero queda consistente con la marca en vez de mezclar
  // grises sueltos con el color corregido del título.
  const colorContorno = colorLegibleSobreBlanco(color)
  let cursorX = canvasLeft
  doc.setDrawColor(colorContorno)
  doc.setLineWidth(0.25)
  for (const p of panos) {
    const w = p.ancho * escala
    const h = p.alto * escala
    doc.rect(cursorX, canvasTop, w, h)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor('#666666')
    // Cota de alto: texto vertical pegado al borde izquierdo del paño.
    doc.text(`${formatMedidaCm(p.alto)} cm`, cursorX + 2.2, canvasTop + h / 2, { angle: 90 })
    // Cota de ancho: centrada debajo del paño, todas a la misma altura
    // (la base real del dibujo) aunque los paños tengan distinto alto.
    doc.text(`${formatMedidaCm(p.ancho)} cm`, cursorX + w / 2, canvasTop + altoRealMax + ESQUEMA_COTA_ANCHO_ALTO, {
      align: 'center',
    })

    cursorX += w + gap
  }

  doc.setDrawColor(colorContorno)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, yTop - 2, ESQUEMA_ANCHO, ESQUEMA_ALTO_TOTAL, 1.5, 1.5)
}

/** Título "Detalle relevado" + un bloque por ítem (esquema técnico +
 * texto). Extraído de `generarFichaMedidaPdf` (Fase 41.7, 20/08) para
 * poder reusarlo también desde el PDF de Presupuesto -- Carlos pidió
 * la posibilidad de incluir este mismo detalle ahí, opcional, cuando el
 * presupuesto viene de una Ficha de medida. Devuelve la Y final para
 * que el llamador siga dibujando debajo (Notas, totales, etc.) sin
 * pisarlo. `doc` puede ya traer páginas agregadas -- esta función solo
 * agrega más si el contenido no entra en `alturaMaxima`. */
export function dibujarDetalleRelevado(
  doc: jsPDF,
  yInicial: number,
  pageWidth: number,
  marginX: number,
  alturaMaxima: number,
  color: string,
  ficha: Pick<FichaMedida, 'tipo' | 'items'>,
): number {
  let y = yInicial

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
    const panosDibujo = ficha.tipo === 'cortinas' ? panosDibujables(item) : []
    const conEsquema = panosDibujo.length > 0
    const lineas = descripcionItem(item, conEsquema)
    if (lineas.length === 0) continue

    // Alto del bloque: si hay esquema, es fijo (ESQUEMA_ALTO_TOTAL) salvo
    // que el texto sea más largo (ítem con muchos detalles); si no hay
    // esquema, es el texto solo -- mismo criterio que antes.
    const alturaTexto = 5 + (lineas.length - 1) * 4.5 + 3
    const alturaBloque = conEsquema ? Math.max(ESQUEMA_ALTO_TOTAL + 3, alturaTexto) : alturaTexto

    if (y + alturaBloque > alturaMaxima) {
      doc.addPage()
      y = 20
    }

    const textoX = conEsquema ? marginX + ESQUEMA_ANCHO + 6 : marginX
    const yInicioBloque = y

    if (conEsquema) {
      // Fase 43d: "Terminación: <tipo>" en vez del tipo solo -- Carlos
      // pidió aclarar a qué se refiere esa palabra sobre el esquema
      // (quedaba muy "vacío" con solo "Pasa barral" como título).
      const tituloEsquema = item.tipoCortina ? `Terminación: ${item.tipoCortina}` : 'Cortina'
      dibujarEsquemaCortina(doc, marginX, y, tituloEsquema, panosDibujo, color)
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor('#222222')
    doc.text(lineas[0], textoX, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor('#666666')
    for (const linea of lineas.slice(1)) {
      doc.text(linea, textoX + 4, y)
      y += 4.5
    }

    y = yInicioBloque + alturaBloque
  }

  return y + 4
}

export async function generarFichaMedidaPdf(
  empresa: EmpresaParaPdfCompleta,
  ficha: FichaMedida,
  nombreArchivo: string,
  condicionIvaEmisor?: string | null,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 15
  const alturaMaxima = pageHeight - 45

  const fechaHoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  // Fase 43 (20/08, "Toma de Pedidos"): encabezado tipo Anexo II (sin
  // letra fiscal ni titular) con la numeración correlativa propia de
  // esta sección, formato de punto de venta nativo -- ver
  // dibujarEncabezadoConDatosFiscales en pdfHelpers.ts.
  const numeroFormateado = formatNumeroConPuntoVenta(ficha.puntoVentaNumero, ficha.numero)
  const { y: y0, color } = await dibujarEncabezadoConDatosFiscales(
    doc,
    empresa,
    'Toma de pedidos',
    numeroFormateado,
    fechaHoy,
    condicionIvaEmisor,
  )
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
  y = dibujarDetalleRelevado(doc, y, pageWidth, marginX, alturaMaxima, color, ficha)

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
