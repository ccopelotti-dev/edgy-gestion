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
// Fase 38 (rediseño gráfico -- normativa ARCA): antes de esta fase el
// PDF era A4 vertical con un layout "moderno" libre, sin zonas
// definidas. A partir de acá el comprobante fiscal (Factura/Nota de
// crédito/Nota de débito) sigue el Anexo II Apartado B de la RG
// 1415 -- zona superior izquierda = emisor, zona superior derecha =
// datos del comprobante (numeración, fecha, CUIT, IIBB, inicio de
// actividades), letra fiscal destacada en un recuadro central -- con
// el tamaño y la orientación que definió Carlos según su experiencia
// de 20 años en gráfica (1998-2011): A5 apaisada, 20x15cm. El CAE +
// QR fiscal (RG 4892/2020) sigue siendo el mismo bloque de siempre.
//
// Clave de esta fase: el comprobante INTERNO (sin CAE, sin validar
// contra ARCA) usa EXACTAMENTE el mismo template visual -- letra "X"
// en el recuadro, numeración interna en vez de la fiscal, y una
// leyenda "COMPROBANTE NO VÁLIDO COMO FACTURA" en vez del bloque de
// CAE/QR. Así Carlos puede iterar el diseño con comprobantes internos
// sin gastar numeración real de ARCA en cada prueba. El Presupuesto
// (que también pasa por este motor, sin `letraFiscal`) sigue usando
// un encabezado simple, sin el recuadro fiscal -- no es un comprobante
// y no tiene sentido simular una letra ahí.
//
// Se generó con jsPDF (agregado en Fase 10) construyendo el layout a
// mano (texto + rectángulos + líneas) en vez de jspdf-autotable,
// porque los comprobantes de Edgy suelen tener pocas líneas y no
// justifica sumar una dependencia más.
// ============================================================

import { jsPDF } from 'jspdf'
import {
  imprimirOGuardarPdf,
  dibujarEncabezadoConDatosFiscales,
  type OpcionesEncabezadoFiscal,
} from './pdfHelpers'
import QRCode from 'qrcode'
import { construirUrlQrFiscal, type DatosQrFiscal } from './arcaQr'

const COLOR_DEFAULT = '#0F6E56'

// Fase 38m: A5 apaisada (20x15cm) se descartó -- con el pie fiscal
// obligatorio (QR + CAE + Régimen de Transparencia Fiscal, y a veces
// la leyenda de Factura A a Monotributista) ya no entraba en una sola
// hoja ni con UN solo ítem: se iba a una segunda página aun en el caso
// más simple. No era un problema de "muchos artículos" para ajustar
// con más compactación -- el bloque fiscal en sí ya no entraba. Se
// pasa a A4 vertical (21x29,7cm), manteniendo el ancho de página
// prácticamente igual (200mm -> 210mm, así que el layout horizontal
// -- recuadro fiscal, columnas de la tabla -- se traslada con cambios
// menores) y casi duplicando el alto disponible.
const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297

export interface EmpresaParaPdf {
  nombre: string
  cuit?: string | null
  /** Domicilio FISCAL -- Fase 38b: dejó de imprimirse en el PDF (era
   * un dato que Carlos no quería publicar). Se mantiene en el tipo por
   * si algún otro documento del motor lo sigue necesitando, pero
   * `generarComprobantePdf` ya no lo dibuja en ningún lado. */
  direccion?: string | null
  telefono?: string | null
  /** URL pública (Supabase Storage). Si falla la descarga o el
   * formato no es soportado, el PDF se genera igual sin logo. */
  logoUrl?: string | null
  /** Hex, ej "#0F6E56". Si no hay, se usa COLOR_DEFAULT. */
  colorMarca?: string | null
  /** Fase 28 (cumplimiento ARCA, Anexo II RG 1415) -- Ingresos Brutos,
   * fecha de inicio de actividades y jurisdicción. Todos opcionales:
   * si no están cargados en Configuración > Empresa, la franja fiscal
   * simplemente omite esa línea en vez de romper el PDF. */
  ingresosBrutosCondicion?: string | null
  ingresosBrutosNumero?: string | null
  inicioActividades?: string | null
  provincia?: string | null
  /** RG 5614/2024 -- Régimen de Transparencia Fiscal al Consumidor:
   * si la jurisdicción del cliente lo exige, además de "IVA Contenido"
   * se imprime la alícuota de IIBB declarada acá. */
  mostrarIibbAlicuota?: boolean
  iibbAlicuota?: number | null
  /** Fase 38b: nombre y apellido (o razón social) del titular tal como
   * figura ante ARCA -- Carlos lo pidió explícito en el recuadro
   * emisor, además del nombre de fantasía que ya va en la banda. */
  titular?: string | null
  /** Fase 38b: info comercial opcional (Configuración > Empresa),
   * distinta de los datos fiscales -- se imprime con un pictograma al
   * lado en el recuadro emisor. */
  sitioWeb?: string | null
  instagram?: string | null
  whatsappComercial?: string | null
  /** Fase 38e: ícono propio (jpg/png subido en Configuración > Empresa)
   * para cada red -- si está cargado, se usa esta imagen en vez del
   * pictograma genérico que dibuja el motor. Evita que Edgy tenga que
   * reproducir el logo real de WhatsApp/Instagram (marca registrada);
   * el negocio elige y sube el suyo bajo su propia responsabilidad. */
  sitioWebIconoUrl?: string | null
  instagramIconoUrl?: string | null
  whatsappIconoUrl?: string | null
}

// Fase 43k: `leyendaCondicionIva`/`leyendaIngresosBrutos` (Anexo II RG
// 1415) se removieron de acá -- ahora viven en pdfHelpers.ts, adentro
// de `dibujarEncabezadoConDatosFiscales`, que es quien dibuja esas
// líneas desde que el motor compartido migró al panel único.

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
  /** Fase 28: letra fiscal ('A'|'B'|'C') resuelta por ARCA para este
   * comprobante -- ver Comprobante.afip.tipoFiscal en el dominio de
   * Ventas. Determina si corresponde el bloque de Transparencia Fiscal
   * al Consumidor (RG 5614/2024, solo letra B). */
  tipoFiscal?: string
  /** Fase 28: condición de IVA del emisor declarada ante ARCA para
   * este comprobante ('responsable_inscripto'|'monotributista'|'exento').
   * Dispara la leyenda de condición de IVA y, si corresponde
   * (tipoFiscal='B'), el bloque de Transparencia Fiscal al Consumidor
   * (RG 5614/2024). Sin este dato no se imprime ninguno de los dos --
   * comprobantes viejos (de antes de esta fase) simplemente no lo tienen. */
  condicionIvaEmisor?: string
}

export interface ComprobanteParaPdf {
  /** Ej: "Factura B", "Recibo", "Nota de crédito", "Presupuesto". */
  tipoLabel: string
  /** Número interno de Edgy, ya formateado, ej: "FAC-00042". Se
   * muestra siempre como referencia; cuando hay `afip` con numeración
   * fiscal, esa pasa a ser el número principal del recuadro y este
   * queda como referencia chica al pie. */
  numero: string
  /** Ya formateada, ej: "11/07/2026". */
  fecha: string
  /** Fecha ISO (YYYY-MM-DD) del comprobante, sin formatear -- hace
   * falta así para armar el JSON del QR fiscal. Solo es obligatoria
   * si `afip` está presente. */
  fechaIso?: string
  clienteNombre: string
  /** Fase 45d (21/08, a pedido de Carlos): rótulo que va antes del
   * nombre -- 'Cliente' por defecto (Factura/Recibo/Presupuesto/etc.),
   * pero los documentos de Compras (Orden de compra, Pedido de
   * cotización) lo pisan a 'Proveedor', porque `clienteNombre` en esos
   * casos en realidad trae el nombre del proveedor, no de un cliente. */
  clienteLabel?: string
  clienteDocumento?: string | null
  /** Fase 38b: datos adicionales del cliente, todos opcionales -- si
   * no están cargados, esa línea simplemente no se dibuja. */
  clienteDireccion?: string | null
  clienteTelefono?: string | null
  /** Ya resuelta a texto (ej. "IVA Responsable Inscripto"), no el
   * código -- el motor de PDF no conoce la tabla de condiciones de IVA
   * del dominio de Ventas. */
  clienteCondicionIva?: string | null
  /** Anexo II RG 1415, inciso e) -- condición de venta (Contado,
   * Cuenta corriente, o el medio de pago puntual). Opcional: los
   * Presupuestos no tienen medio de pago todavía, así que no la
   * incluyen y esa línea simplemente no se dibuja. */
  condicionVenta?: string
  /** Fase 38b: dirección del PUNTO DE VENTA que emitió este
   * comprobante (no el domicilio fiscal del cliente/empresa, que dejó
   * de publicarse) -- se resuelve en pdfComprobantes.ts a partir de
   * `Comprobante.puntoVentaId`. Si el comprobante no tiene punto de
   * venta asociado (clientes de un solo local, o comprobantes viejos)
   * queda undefined y esa línea del recuadro simplemente no se dibuja. */
  puntoVentaDireccion?: string | null
  items: ItemParaPdf[]
  subtotal: number
  descuentoGeneral?: number
  montoIva?: number
  total: number
  notas?: string | null
  /** Fase 38: letra fiscal a mostrar en el recuadro superior --
   * 'A'|'B'|'C' cuando ARCA ya la resolvió, 'X' para comprobantes
   * internos o electrónicos todavía sin CAE. Si se omite (caso de
   * Presupuesto, que no es un comprobante fiscal) el motor usa el
   * encabezado simple, sin el recuadro Anexo II RG 1415. */
  letraFiscal?: 'A' | 'B' | 'C' | 'X'
  /** Fase 11: presente solo si ARCA ya aprobó el comprobante (CAE
   * obtenido). Dispara el bloque de CAE + QR fiscal obligatorio al
   * pie del PDF y la numeración fiscal en el recuadro superior. */
  afip?: DatosAfipParaPdf
  /** Fase 41.7 (20/08, a pedido de Carlos): bloque libre, dibujado
   * después de Notas y antes del pie de página -- hoy solo lo usa
   * Presupuesto (Detalle relevado de Ficha de medida, opcional a
   * elección del agente), pero queda genérico por si otro documento lo
   * necesita más adelante. Ningún llamador de Factura/Nota/Recibo lo
   * completa, así que el motor fiscal queda intacto. Recibe el jsPDF
   * activo + la Y actual (ya con salto de página resuelto si hacía
   * falta) + el ancho de página y el margen -- debe devolver la Y final
   * para que el pie de página no le pise el contenido. Puede agregar
   * más páginas si lo necesita (mismo `doc`, se sigue escribiendo
   * encima del mismo documento). */
  bloqueAdicional?: (doc: jsPDF, y: number, pageWidth: number, marginX: number) => number
}

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

/** Convierte a fecha corta es-AR. Acepta tanto ISO (YYYY-MM-DD) como
 * el formato crudo de ARCA (YYYYMMDD, ej. CAEFchVto) -- comprobantes
 * emitidos antes de la Fase 38 pueden tener quedado guardado el
 * formato crudo en la base, así que el motor lo tolera acá en vez de
 * mostrar "Invalid Date". Si de última no se puede parsear, se
 * muestra el valor tal cual en vez de romper. */
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

/** Mezcla un color con blanco (0 = el color tal cual, 1 = blanco puro) -- se
 * usa para el fondo clarito del total, sin depender de canal alpha (jsPDF no
 * soporta fill con transparencia de forma simple). */
// Fase 38b: oscurece el color de marca hacia el negro un `factor`
// (0-1). Se usa en el recuadro de Total para lograr contraste real
// contra el texto blanco (antes se aclaraba el color y se escribía
// en ese mismo color, con poco contraste).
function oscurecer(hex: string, factor: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  const mezclar = (canal: number) => Math.round(canal * (1 - factor))
  return [mezclar(r), mezclar(g), mezclar(b)]
}

// Fase 43k: `logoADataUrl` (descarga del logo a data URL) se removió de
// acá -- el header ahora se dibuja íntegro adentro de
// `dibujarEncabezadoConDatosFiscales` (pdfHelpers.ts), que tiene su
// propia copia.

/** Número fiscal formateado como lo exige ARCA en la representación
 * gráfica: PtoVta a 4 dígitos - CbteNro a 8 dígitos (ej "0001-00000094"). */
function formatNumeroFiscal(puntoVenta: number, numeroComprobante: number): string {
  return `${String(puntoVenta).padStart(4, '0')}-${String(numeroComprobante).padStart(8, '0')}`
}

/**
 * Fase 38b/38c: pictogramas genéricos para la línea de info comercial
 * (WhatsApp/Instagram/web) -- dibujados a mano con las primitivas
 * vectoriales de jsPDF, a propósito NO son los logos de marca reales.
 * Carlos pidió expresamente que se vean "como los logos reales" y se
 * ofreció a mandar los archivos vectoriales -- no corresponde
 * reproducir el isotipo exacto de WhatsApp/Instagram (son marcas
 * registradas con diseño protegido) ni siquiera partiendo de un
 * vector que él provea, así que la solución acá es la más cercana
 * posible sin cruzar esa línea: una placa cuadrada con esquinas
 * redondeadas (mismo lenguaje visual "app icon" que sus referencias)
 * rellena con el color asociado a cada red, y adentro un glifo blanco
 * genérico (un globo de diálogo para WhatsApp, una cámara para
 * Instagram) -- reconocible por color y forma general, sin calcar el
 * isotipo protegido.
 */
// Fase 43k: los pictogramas de contacto (WhatsApp/Instagram/Web) se
// removieron de acá -- ahora los dibuja `dibujarEncabezadoConDatosFiscales`
// (pdfHelpers.ts), que tiene su propia copia (`dibujarIconoContactoChico`).

/**
 * Genera y dispara la descarga (o impresión silenciosa, ver
 * imprimirOGuardarPdf) del PDF de un comprobante.
 * `nombreArchivo` va sin extensión (se le agrega .pdf acá).
 * `copias`: cuántas veces mandarlo al buffer de impresión dentro de la
 * app de escritorio (Fase 38 -- Carlos definió 2 por defecto para
 * comprobantes: una para el cliente, otra para el local). No tiene
 * efecto en navegador normal, donde `imprimirOGuardarPdf` solo
 * descarga el archivo una vez.
 */
export async function generarComprobantePdf(
  empresa: EmpresaParaPdf,
  comprobante: ComprobanteParaPdf,
  nombreArchivo: string,
  copias = 1,
): Promise<void> {
  // Fase 38m: A4 vertical -- ancho (210) menor que alto (297), así que
  // acá "portrait" es explícito pero también lo que jsPDF asume por
  // default; se deja declarado igual, por prolijidad y para que quede
  // claro que es intencional (antes, en A5 apaisada, hacía falta
  // declarar 'landscape' a mano porque si no jsPDF invertía el array).
  const doc = new jsPDF({ unit: 'mm', format: [PAGE_WIDTH, PAGE_HEIGHT], orientation: 'portrait' })
  const color = empresa.colorMarca || COLOR_DEFAULT
  const pageWidth = PAGE_WIDTH
  const pageHeight = PAGE_HEIGHT
  const marginX = 8
  const conRecuadroFiscal = !!comprobante.letraFiscal

  // ─── Encabezado (Fase 43k, 20/08 -- motor compartido migrado) ──
  // Antes esta zona se dibujaba a mano acá mismo (banda angosta +
  // recuadro fiscal de 3 columnas). Ahora usa el mismo panel único de
  // color con contraste automático que ya se probó y aprobó en Toma de
  // Pedidos (`dibujarEncabezadoConDatosFiscales`, pdfHelpers.ts) --
  // Carlos lo pidió explícito como "modelo base para todo" el sistema.
  // La letra fiscal (A/B/C/X) y la línea de titular ARCA solo se arman
  // cuando el comprobante las necesita (`conRecuadroFiscal`) --
  // Presupuesto/OC/Cotización/Pedido siguen sin esos dos elementos,
  // igual que antes, pero ahora también se benefician del resto del
  // panel (domicilio del punto de venta, condición de IVA, contactos)
  // que antes solo tenía el recuadro fiscal.
  //
  // La dirección que se muestra es la del PUNTO DE VENTA que emitió
  // este comprobante (`comprobante.puntoVentaDireccion`, resuelta en
  // pdfComprobantes.ts a partir de `Comprobante.puntoVentaId`) --
  // NUNCA `empresa.direccion` (domicilio fiscal, dejó de publicarse,
  // ver el comentario en `EmpresaParaPdf.direccion` más arriba). Mismo
  // criterio que ya usa Toma de Pedidos.
  const empresaParaHeader: EmpresaParaPdf = {
    ...empresa,
    direccion: comprobante.puntoVentaDireccion ?? null,
  }
  const numeroParaHeader = comprobante.afip
    ? formatNumeroFiscal(comprobante.afip.puntoVenta, comprobante.afip.numeroComprobante)
    : comprobante.numero
  const condicionIvaEmisor = comprobante.afip?.condicionIvaEmisor ?? null
  const opcionesFiscal: OpcionesEncabezadoFiscal | undefined = conRecuadroFiscal
    ? {
        letraFiscal: comprobante.letraFiscal,
        codigoAfip: comprobante.afip?.tipoComprobanteAfip,
        titular: empresa.titular,
      }
    : undefined

  const { y: yHeader } = await dibujarEncabezadoConDatosFiscales(
    doc,
    empresaParaHeader,
    comprobante.tipoLabel,
    numeroParaHeader,
    comprobante.fecha,
    condicionIvaEmisor,
    opcionesFiscal,
    marginX,
  )
  let y = yHeader

  // ─── Datos del cliente + condición de venta ──────────────────
  // Fase 38b: se agregan dirección/teléfono/condición de IVA cuando
  // están cargados -- antes solo se mostraba nombre y documento.
  // Fase 38h: Carlos pidió unificar tamaños -- "Cliente:" y "Cond. de
  // venta:" pasan al tamaño chico estándar (7.2, igual que "25 de Mayo
  // 152"/CUIT/IIBB de la caja de arriba), y el NOMBRE del cliente en
  // particular pasa a negrita al mismo tamaño que el titular (8.3),
  // para que se note quién es el destinatario del comprobante.
  const labelCliente = `${comprobante.clienteLabel ?? 'Cliente'}: `
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  doc.setTextColor('#555555')
  doc.text(labelCliente, marginX, y)
  const anchoLabelCliente = doc.getTextWidth(labelCliente)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.3)
  doc.setTextColor('#222222')
  doc.text(comprobante.clienteNombre, marginX + anchoLabelCliente, y)
  if (comprobante.condicionVenta) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.2)
    doc.setTextColor('#555555')
    doc.text(`Cond. de venta: ${comprobante.condicionVenta}`, pageWidth - marginX, y, { align: 'right' })
  }
  y += 4.5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  doc.setTextColor('#666666')
  if (comprobante.clienteDireccion || comprobante.clienteTelefono) {
    const partesContacto = [
      comprobante.clienteDireccion,
      comprobante.clienteTelefono ? `Tel. ${comprobante.clienteTelefono}` : null,
    ].filter(Boolean)
    doc.text(partesContacto.join('  ·  '), marginX, y)
    y += 4
  }
  if (comprobante.clienteDocumento || comprobante.clienteCondicionIva) {
    // Fase 38h: `clienteDocumento` ya viene con el prefijo del tipo de
    // documento resuelto ("CUIT 20227014734", "DNI 30111222", etc.) --
    // ver pdfComprobantes.ts, que es quien conoce la tabla de tipos.
    const partesFiscales = [comprobante.clienteDocumento, comprobante.clienteCondicionIva].filter(Boolean)
    doc.text(partesFiscales.join('  ·  '), marginX, y)
    y += 4
  }
  y += 1

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
  doc.setFontSize(8.5)
  doc.setTextColor('#6b6b6b')
  doc.text('Descripción', colDesc, y)
  doc.text('Cant.', colCant, y, { align: 'right' })
  doc.text('P. unit.', colPU, y, { align: 'right' })
  doc.text('Subtotal', colSub, y, { align: 'right' })
  y += 2
  doc.setDrawColor(230, 230, 230)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 5.5

  // Fase 38m: con el cambio de A5 apaisada a A4 vertical sobra alto de
  // sobra, así que la fuente de la fila de artículos vuelve de 5pt a
  // 7.2pt -- la medida "estándar" que ya usa el resto de las líneas de
  // bajada del documento (dirección, condición IVA, etc.). El
  // interlineado (4mm) copia el mismo ritmo que esas otras líneas de
  // 7.2pt (ver "Cliente:"/dirección más arriba, también en pasos de 4mm).
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  doc.setTextColor('#222222')
  const lineHeightItem = 4

  const alturaMaxima = pageHeight - 50
  for (const item of comprobante.items) {
    if (y > alturaMaxima) {
      doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = 15
    }
    const lineasDesc = doc.splitTextToSize(item.descripcion, colCant - colDesc - 5)
    doc.text(lineasDesc, colDesc, y)
    doc.text(String(item.cantidad), colCant, y, { align: 'right' })
    doc.text(formatARS(item.precioUnitario), colPU, y, { align: 'right' })
    doc.text(formatARS(item.subtotal), colSub, y, { align: 'right' })
    y += lineHeightItem * (Array.isArray(lineasDesc) ? lineasDesc.length : 1)
  }

  y += 3
  doc.setDrawColor(230, 230, 230)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 6

  // ─── Totales ────────────────────────────────────────────────
  if (y > pageHeight - 40) {
    doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = 15
  }

  doc.setFontSize(8.5)
  doc.setTextColor('#555555')
  doc.text('Subtotal', colPU, y, { align: 'right' })
  doc.text(formatARS(comprobante.subtotal), colSub, y, { align: 'right' })
  y += 5

  if (comprobante.montoIva && comprobante.montoIva > 0) {
    doc.text('IVA', colPU, y, { align: 'right' })
    doc.text(formatARS(comprobante.montoIva), colSub, y, { align: 'right' })
    y += 5
  }

  if (comprobante.descuentoGeneral && comprobante.descuentoGeneral > 0) {
    doc.text(`Descuento (${comprobante.descuentoGeneral}%)`, colPU, y, { align: 'right' })
    doc.text(`-${formatARS((comprobante.subtotal + (comprobante.montoIva ?? 0)) * (comprobante.descuentoGeneral / 100))}`, colSub, y, { align: 'right' })
    y += 5
  }

  y += 1.5
  // Fase 38b: antes el recuadro usaba un tinte muy claro del color de
  // marca con el texto en ese mismo color -- poco contraste, y el
  // importe quedaba pegado al borde derecho (el ancho de la caja
  // terminaba justo en colSub, donde el texto se alineaba a la
  // derecha). Ahora: relleno sólido oscuro + texto blanco.
  // Fase 38j: el lado izquierdo de la caja abre `padTotal` para darle
  // aire a la palabra "Total", pero el lado derecho usa un padding bien
  // chico (`padTotalDer`) -- con el mismo valor de antes en ambos lados
  // la caja se pasaba del margen derecho que respeta el resto del
  // documento (colSub), se veía "descolgada" hacia afuera. Con esto la
  // caja queda contenida dentro del margen y el importe (en colSub,
  // igual que Subtotal/IVA) conserva un mínimo de aire del borde.
  // Fase 38l: `padTotal` (izquierda) subió de 4 a 10mm -- Carlos pidió
  // más "vuelo" del lado izquierdo, la caja quedaba demasiado ceñida a
  // la palabra "Total" (menos de 1mm de aire). El lado derecho no se
  // toca (sigue en colSub + padTotalDer, ya alineado al margen).
  const padTotal = 10
  const padTotalDer = 1.5
  const boxTotalX = colPU - 5 - padTotal
  const boxTotalW = colSub - colPU + 5 + padTotal + padTotalDer
  const [rBg, gBg, bBg] = oscurecer(color, 0.35)
  doc.setFillColor(rBg, gBg, bBg)
  doc.roundedRect(boxTotalX, y - 5.5, boxTotalW, 9, 1.5, 1.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor('#ffffff')
  // Fase 38k: "Total" ahora se alinea a la derecha en colPU, igual que
  // "Subtotal"/"IVA" arriba -- antes arrancaba en colPU hacia la
  // derecha (align por defecto = izquierda), así que su borde derecho
  // no coincidía con el de esas etiquetas, aunque el importe sí
  // compartiera el eje con colSub.
  doc.text('Total', colPU, y, { align: 'right' })
  // El importe va en colSub para compartir el mismo eje de alineación
  // derecho que Subtotal/IVA de arriba.
  doc.text(formatARS(comprobante.total), colSub, y, { align: 'right' })
  y += 10

  // ─── Notas ──────────────────────────────────────────────────
  if (comprobante.notas) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor('#666666')
    const lineasNotas = doc.splitTextToSize(comprobante.notas, pageWidth - marginX * 2)
    doc.text(lineasNotas, marginX, y)
    y += 5 * (Array.isArray(lineasNotas) ? lineasNotas.length : 1)
  }

  // ─── Transparencia Fiscal al Consumidor (Fase 28 -- RG 5614/2024) ──
  // Solo aplica a facturas tipo B (Responsable Inscripto vendiéndole a
  // alguien que no es Responsable Inscripto -- consumidor final,
  // monotributista, exento) con IVA > 0.
  if (
    comprobante.afip?.tipoFiscal === 'B' &&
    comprobante.montoIva &&
    comprobante.montoIva > 0
  ) {
    if (y > pageHeight - 34) {
      doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = 15
    }
    doc.setDrawColor(230, 230, 230)
    doc.setLineWidth(0.3)
    doc.rect(marginX, y, pageWidth - marginX * 2, empresa.mostrarIibbAlicuota && empresa.iibbAlicuota ? 18 : 13)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor('#555555')
    doc.text('Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)', marginX + 3, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor('#222222')
    doc.text(`IVA Contenido: $ ${formatARS(comprobante.montoIva)}`, marginX + 3, y)
    if (empresa.mostrarIibbAlicuota && empresa.iibbAlicuota) {
      y += 5
      const juris = empresa.provincia ? ` (${empresa.provincia})` : ''
      doc.text(
        `Ingresos Brutos${juris}: alícuota ${empresa.iibbAlicuota}% incluida en el precio`,
        marginX + 3,
        y,
      )
    }
    y += 8
  }

  // ─── Pie fiscal: CAE + QR, o leyenda "no válido como factura" ──
  if (comprobante.afip && comprobante.fechaIso) {
    // Fase 11 (RG 4892/2020) -- solo se dibuja si el comprobante ya
    // tiene CAE (electrónico y aprobado por ARCA).
    const altoBloque = 26
    if (y > pageHeight - altoBloque - 8) {
      doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = 15
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
    y += 6

    const qrSize = 20
    if (qrDataUrl) {
      try {
        doc.addImage(qrDataUrl, 'PNG', marginX, y, qrSize, qrSize)
      } catch {
        qrDataUrl = null
      }
    }

    const textoX2 = qrDataUrl ? marginX + qrSize + 5 : marginX
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor('#222222')
    doc.text(`CAE: ${comprobante.afip.cae}`, textoX2, y + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor('#555555')
    doc.text(`Vencimiento CAE: ${formatFechaCorta(comprobante.afip.vencimientoCae)}`, textoX2, y + 10)
    doc.text('Comprobante autorizado por ARCA', textoX2, y + 15)

    y += qrSize + 4
  } else if (comprobante.letraFiscal === 'X') {
    // Fase 38 -- comprobante interno o electrónico todavía sin CAE:
    // mismo template, sin bloque fiscal. Leyenda estándar de documento
    // no fiscal en vez del CAE/QR.
    const altoBloque = 14
    if (y > pageHeight - altoBloque - 8) {
      doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = 15
    }
    doc.setDrawColor(210, 210, 210)
    doc.setLineWidth(0.3)
    doc.rect(marginX, y, pageWidth - marginX * 2, altoBloque, 'S')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor('#999999')
    doc.text('COMPROBANTE NO VÁLIDO COMO FACTURA', pageWidth / 2, y + 6, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text('Documento interno / sin autorización de ARCA', pageWidth / 2, y + 10.5, { align: 'center' })
    y += altoBloque + 4
  }

  // ─── Bloque adicional (Fase 41.7 -- ver comentario en ComprobanteParaPdf) ──
  if (comprobante.bloqueAdicional) {
    if (y > pageHeight - 40) {
      doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = 15
    }
    y = comprobante.bloqueAdicional(doc, y, pageWidth, marginX)
  }

  // ─── Pie de página ────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor('#999999')
  const pieTexto = empresa.telefono
    ? `${empresa.nombre} · ${empresa.telefono}`
    : empresa.nombre
  doc.text(pieTexto, marginX, pageHeight - 6)
  // Referencia al número interno de Edgy -- solo tiene sentido cuando
  // arriba se mostró la numeración fiscal en su lugar (si no hay
  // `afip`, el número interno ya es el que se ve en el recuadro).
  if (comprobante.afip) {
    doc.text(`Ref. interna: ${comprobante.numero}`, pageWidth - marginX, pageHeight - 6, { align: 'right' })
  }

  await imprimirOGuardarPdf(doc, nombreArchivo, copias)
}
