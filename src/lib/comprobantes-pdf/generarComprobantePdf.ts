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
import { imprimirOGuardarPdf } from './pdfHelpers'
import QRCode from 'qrcode'
import { construirUrlQrFiscal, type DatosQrFiscal } from './arcaQr'

const COLOR_DEFAULT = '#0F6E56'

// A5 apaisada, tal como la definió Carlos (20 x 15 cm). jsPDF toma un
// array `format` como [ancho, alto] literal en la unidad indicada --
// no hace falta "orientation: landscape", alcanza con pasar el ancho
// primero.
const PAGE_WIDTH = 200
const PAGE_HEIGHT = 150

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

/** Leyenda de condición de IVA del emisor -- Anexo II RG 1415, espacio
 * superior izquierdo. Los 3 valores posibles vienen de
 * clientes_arca_config.condicion_iva (ver DatosAfipParaPdf.condicionIvaEmisor). */
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

/** Leyenda de Ingresos Brutos -- Anexo II RG 1415: "N.º de inscripción
 * ... o condición de NO CONTRIBUYENTE". */
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

async function logoADataUrl(
  url: string,
): Promise<{ dataUrl: string; formato: 'PNG' | 'JPEG' } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const formato: 'PNG' | 'JPEG' = blob.type.includes('png') ? 'PNG' : 'JPEG'
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('No se pudo leer el logo'))
      reader.readAsDataURL(blob)
    })
    return { dataUrl, formato }
  } catch {
    // El logo es un plus visual -- si falla la descarga (CORS, red,
    // formato raro) el comprobante se genera igual, sin logo.
    return null
  }
}

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
const COLOR_ICONO_WHATSAPP: [number, number, number] = [37, 178, 92] // verde
const COLOR_ICONO_INSTAGRAM: [number, number, number] = [224, 108, 30] // naranja
const COLOR_ICONO_WEB: [number, number, number] = [110, 110, 110] // gris neutro

function dibujarIconoContacto(
  doc: jsPDF,
  tipo: 'whatsapp' | 'instagram' | 'web',
  x: number,
  y: number,
  size: number,
): void {
  const [dr, dg, db] =
    tipo === 'whatsapp' ? COLOR_ICONO_WHATSAPP : tipo === 'instagram' ? COLOR_ICONO_INSTAGRAM : COLOR_ICONO_WEB

  // Placa de fondo -- cuadrado con esquinas redondeadas, relleno sólido.
  doc.setFillColor(dr, dg, db)
  doc.roundedRect(x, y, size, size, size * 0.24, size * 0.24, 'F')

  // Glifo en blanco, encima de la placa.
  doc.setDrawColor(255, 255, 255)
  doc.setFillColor(255, 255, 255)
  doc.setLineWidth(size * 0.07)
  const r = size / 2
  const cx = x + r
  const cy = y + r
  switch (tipo) {
    case 'whatsapp': {
      // Globo de diálogo genérico con colita -- NO el auricular
      // estilizado que usa el isotipo real de WhatsApp.
      const bw = size * 0.58
      const bh = size * 0.48
      const bx = x + (size - bw) / 2
      const by = y + size * 0.24
      doc.roundedRect(bx, by, bw, bh, bh * 0.4, bh * 0.4, 'S')
      doc.triangle(
        bx + bw * 0.28, by + bh * 0.95,
        bx + bw * 0.52, by + bh * 0.95,
        bx + bw * 0.28, by + bh * 1.3,
        'F',
      )
      break
    }
    case 'instagram':
      // Pictograma tipo "cámara": cuadrado redondeado + lente + punto,
      // NO el isotipo real de Instagram.
      doc.roundedRect(x + size * 0.2, y + size * 0.2, size * 0.6, size * 0.6, size * 0.14, size * 0.14, 'S')
      doc.circle(cx, cy, r * 0.42, 'S')
      doc.circle(x + size * 0.74, y + size * 0.26, size * 0.05, 'F')
      break
    case 'web':
      // Globo terráqueo simplificado: círculo + meridiano + ecuador.
      doc.circle(cx, cy, r * 0.62, 'S')
      doc.line(x + size * 0.19, cy, x + size * 0.81, cy)
      doc.ellipse(cx, cy, r * 0.28, r * 0.62, 'S')
      break
  }
}

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
  // OJO: jsPDF por defecto asume orientation='portrait', y si el
  // ancho del array `format` es mayor que el alto, LO VUELVE A
  // INVERTIR para forzar vertical -- pasar [200, 150] sin más
  // terminaba dando una página de 150x200 (vertical), no la apaisada
  // que pidió Carlos. Hay que declarar 'landscape' explícitamente.
  const doc = new jsPDF({ unit: 'mm', format: [PAGE_WIDTH, PAGE_HEIGHT], orientation: 'landscape' })
  const color = empresa.colorMarca || COLOR_DEFAULT
  const pageWidth = PAGE_WIDTH
  const pageHeight = PAGE_HEIGHT
  const marginX = 8
  const conRecuadroFiscal = !!comprobante.letraFiscal

  // ─── Banda de encabezado ───────────────────────────────────
  const anchoBanda = 18
  doc.setFillColor(color)
  doc.rect(0, 0, pageWidth, anchoBanda, 'F')

  let logoInfo: { dataUrl: string; formato: 'PNG' | 'JPEG' } | null = null
  if (empresa.logoUrl) {
    logoInfo = await logoADataUrl(empresa.logoUrl)
  }
  const textoX = logoInfo ? marginX + 16 : marginX
  if (logoInfo) {
    try {
      doc.addImage(logoInfo.dataUrl, logoInfo.formato, marginX, 2, 14, 14)
    } catch {
      // Formato de imagen no soportado por jsPDF -- seguimos sin logo
      // en vez de romper la descarga del comprobante.
    }
  }

  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  // Fase 38c: tamaño bajado de 13 a 11 -- Carlos pidió tipografía más
  // conservadora/suave en toda la zona superior, no solo acá.
  doc.setFontSize(11)
  // Fase 38b: la banda ya NO muestra el domicilio fiscal (Carlos lo
  // sacó explícitamente -- "esa no se publica"). Queda solo el nombre
  // de fantasía; el resto de los datos del emisor vive en el recuadro
  // de abajo.
  doc.text(empresa.nombre, textoX, 11)

  // Sin recuadro fiscal (Presupuesto) -- encabezado simple clásico,
  // tipo/número/fecha arriba a la derecha de la banda.
  if (!conRecuadroFiscal) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(comprobante.tipoLabel, pageWidth - marginX, 8, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(`N.º ${comprobante.numero}`, pageWidth - marginX, 13, { align: 'right' })
    doc.text(comprobante.fecha, pageWidth - marginX, 17.5, { align: 'right' })
  }

  let y = anchoBanda + 3

  // ─── Recuadro fiscal (Anexo II RG 1415, Apartado B) ──────────
  // Tres columnas dentro de un mismo recuadro: (a) emisor -- nombre,
  // domicilio, condición de IVA; letra destacada A/B/C/X; (b)
  // comprobante -- numeración, fecha, CUIT, IIBB, inicio de
  // actividades. Solo se dibuja para comprobantes reales (Factura,
  // Nota de crédito/débito) -- el Presupuesto no manda `letraFiscal`.
  if (conRecuadroFiscal) {
    const yBox = y
    const xColA = marginX
    const xDivisor1 = marginX + 94
    const xDivisor2 = xDivisor1 + 22
    const xColBFin = pageWidth - marginX

    // Fase 38c: Carlos pidió sacar el recuadro con borde completo --
    // "muy de formulario impreso viejo" -- y dejar solo dos líneas
    // finas separando las 3 zonas (emisor / letra / comprobante), estilo
    // minimalista. La línea horizontal de cierre (antes de "Cliente:")
    // es la que reemplaza al borde inferior, más abajo.
    // Fase 38f/38g/38h/38i: las líneas ya no bajan hasta el final de la
    // caja -- acompañan solo al bloque de la letra fiscal. Se calculan
    // acá, ANTES de dibujar nada, a partir de las mismas coordenadas
    // que después usa el bloque de la letra (yLetra/ySN, más abajo) --
    // antes eran dos números sueltos que había que mantener en sync a
    // mano, y quedaban desalineados entre sí más fácil.
    // Fase 38j: el motivo por el que seguían "viéndose abiertas" pese a
    // acortar hLineas ronda tras ronda es que arrancaban en yBox --el
    // techo de TODA la columna-- en vez de arrancar donde realmente
    // empieza a verse la letra. Eso dejaba ~4mm de línea "flotando" por
    // encima del glifo, sin nada que la justifique. Ahora arrancan justo
    // encima del alto de mayúscula de la letra y terminan justo debajo
    // del renglón COD./S-N, envolviéndola de verdad.
    const xLetra = (xDivisor1 + xDivisor2) / 2
    const yLetra = yBox + 8
    const ySN = yLetra + 3
    const yLineasTop = yLetra - 4.5
    const yLineasBottom = ySN + 1
    doc.setDrawColor(190, 190, 190)
    doc.setLineWidth(0.25)
    doc.line(xDivisor1, yLineasTop, xDivisor1, yLineasBottom)
    doc.line(xDivisor2, yLineasTop, xDivisor2, yLineasBottom)

    // (a) Emisor -- Fase 38b: titular como figura en ARCA (no el
    // nombre de fantasía, que ya va en la banda), dirección del punto
    // de venta que emitió ESTE comprobante (no el domicilio fiscal),
    // condición de IVA, e info comercial con pictograma. Cada línea es
    // opcional y solo suma si hay dato -- así nunca queda un renglón
    // en blanco esperando un dato que no está cargado.
    let yA = yBox + 6
    doc.setFont('helvetica', 'bold')
    // Fase 38c: 9 -> 8.3, en línea con el resto de la zona superior.
    doc.setFontSize(8.3)
    doc.setTextColor('#222222')
    doc.text(empresa.titular || empresa.nombre, xColA + 3, yA)
    yA += 4.5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.2)
    doc.setTextColor('#555555')
    if (comprobante.puntoVentaDireccion) {
      doc.text(comprobante.puntoVentaDireccion, xColA + 3, yA)
      yA += 4.5
    }
    if (comprobante.afip?.condicionIvaEmisor) {
      const leyenda = leyendaCondicionIva(comprobante.afip.condicionIvaEmisor)
      if (leyenda) {
        doc.text(leyenda, xColA + 3, yA)
        yA += 4.5
      }
    }
    // Fase 38c: la fila de contactos pasa de horizontal a vertical --
    // WhatsApp, Instagram, Web, en ese orden fijo (Carlos lo pidió así
    // explícitamente), un renglón por dato, cada uno con su placa de
    // color a la izquierda.
    // Fase 38e: si el negocio subió su propio ícono (Configuración >
    // Empresa) se usa esa imagen tal cual en vez del pictograma
    // genérico -- así puede mostrar el logo real de cada red sin que
    // Edgy tenga que reproducirlo.
    const contactos: { tipo: 'whatsapp' | 'instagram' | 'web'; texto: string; iconoUrl?: string | null }[] = []
    if (empresa.whatsappComercial) {
      contactos.push({ tipo: 'whatsapp', texto: empresa.whatsappComercial, iconoUrl: empresa.whatsappIconoUrl })
    }
    if (empresa.instagram) {
      contactos.push({ tipo: 'instagram', texto: empresa.instagram, iconoUrl: empresa.instagramIconoUrl })
    }
    if (empresa.sitioWeb) {
      contactos.push({ tipo: 'web', texto: empresa.sitioWeb, iconoUrl: empresa.sitioWebIconoUrl })
    }
    if (contactos.length > 0) {
      const iconoSize = 3
      doc.setFontSize(6.8)
      for (const c of contactos) {
        const yIcono = yA - iconoSize + 0.9
        let iconoPropio: { dataUrl: string; formato: 'PNG' | 'JPEG' } | null = null
        if (c.iconoUrl) iconoPropio = await logoADataUrl(c.iconoUrl)
        if (iconoPropio) {
          try {
            doc.addImage(iconoPropio.dataUrl, iconoPropio.formato, xColA + 3, yIcono, iconoSize, iconoSize)
          } catch {
            // Formato no soportado por jsPDF -- cae al pictograma genérico.
            dibujarIconoContacto(doc, c.tipo, xColA + 3, yIcono, iconoSize)
          }
        } else {
          dibujarIconoContacto(doc, c.tipo, xColA + 3, yIcono, iconoSize)
        }
        doc.setTextColor('#555555')
        doc.text(c.texto, xColA + 3 + iconoSize + 1.3, yA)
        yA += iconoSize + 0.8
      }
    }

    // Letra fiscal destacada -- Fase 38f: Carlos pidió subirla a la
    // parte superior de la caja, alineada con la primera línea de las
    // columnas de al lado (titular / tipo de comprobante). Fase 38i:
    // bloque todavía más compacto (18->16pt, gap 4->3mm) -- xLetra/
    // yLetra/ySN ya se calcularon arriba, junto con hLineas, para que
    // las líneas verticales y el texto nunca se desalineen entre sí.
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor('#222222')
    doc.text(comprobante.letraFiscal!, xLetra, yLetra, { align: 'center' })
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor('#777777')
    const cod = comprobante.afip?.tipoComprobanteAfip
    doc.text(cod !== undefined ? `COD. ${String(cod).padStart(2, '0')}` : 'S/N', xLetra, ySN, { align: 'center' })

    // (b) Comprobante -- Fase 38c: tamaños bajados en línea con el
    // resto de la caja superior.
    const xColB = xDivisor2 + 3
    let yB = yBox + 6
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.8)
    doc.setTextColor('#222222')
    doc.text(comprobante.tipoLabel.toUpperCase(), xColB, yB)
    yB += 5
    const numeroFiscal = comprobante.afip
      ? formatNumeroFiscal(comprobante.afip.puntoVenta, comprobante.afip.numeroComprobante)
      : comprobante.numero
    doc.setFontSize(8.3)
    doc.text(`N.º ${numeroFiscal}`, xColB, yB)
    yB += 4.5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.2)
    doc.setTextColor('#555555')
    doc.text(`Fecha: ${comprobante.fecha}`, xColB, yB)
    yB += 4.2
    doc.setFontSize(6.5)
    if (empresa.cuit) {
      doc.text(`CUIT: ${empresa.cuit}`, xColB, yB)
      yB += 4
    }
    const iibbTexto = leyendaIngresosBrutos(
      empresa.ingresosBrutosCondicion,
      empresa.ingresosBrutosNumero,
      empresa.provincia,
    )
    const partesB: string[] = []
    if (iibbTexto) partesB.push(iibbTexto)
    if (empresa.inicioActividades) partesB.push(`Inicio activ. ${formatFechaCorta(empresa.inicioActividades)}`)
    if (partesB.length > 0) doc.text(partesB.join(' · '), xColB, yB)

    // Fase 38c: línea fina de cierre de la zona superior -- reemplaza
    // al borde inferior del recuadro que sacamos arriba, separa el
    // bloque emisor/comprobante del bloque de datos del cliente.
    // Fase 38h: antes usaba una altura fija (hBox=34, pensada para el
    // peor caso -- titular + dirección + condición IVA + 3 contactos a
    // la vez). Carlos pidió subir esta línea para no regalarle espacio
    // de más a la tabla de ítems cuando el negocio no tiene tantos
    // datos cargados -- ahora se calcula según lo que realmente se
    // dibujó en cada columna (yA/yB), con un margen chico.
    const yCierre = Math.max(yA, yB) + 3
    doc.setDrawColor(210, 210, 210)
    doc.setLineWidth(0.2)
    doc.line(xColA, yCierre, xColBFin, yCierre)

    y = yCierre + 5
  }

  // ─── Datos del cliente + condición de venta ──────────────────
  // Fase 38b: se agregan dirección/teléfono/condición de IVA cuando
  // están cargados -- antes solo se mostraba nombre y documento.
  // Fase 38h: Carlos pidió unificar tamaños -- "Cliente:" y "Cond. de
  // venta:" pasan al tamaño chico estándar (7.2, igual que "25 de Mayo
  // 152"/CUIT/IIBB de la caja de arriba), y el NOMBRE del cliente en
  // particular pasa a negrita al mismo tamaño que el titular (8.3),
  // para que se note quién es el destinatario del comprobante.
  const labelCliente = 'Cliente: '
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
  doc.setFontSize(6.5)
  doc.setTextColor('#6b6b6b')
  doc.text('Descripción', colDesc, y)
  doc.text('Cant.', colCant, y, { align: 'right' })
  doc.text('P. unit.', colPU, y, { align: 'right' })
  doc.text('Subtotal', colSub, y, { align: 'right' })
  y += 2
  doc.setDrawColor(230, 230, 230)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 4

  // Fase 38i: fuente de la fila de artículos bajada a 5pt (pedido
  // explícito) e interlineado "standar" -- antes 4.8mm por línea, tuneado
  // para la fuente de 9pt anterior, quedaba muy espaciado para 5pt. El
  // salto de línea ahora es proporcional a la altura real del texto
  // (fontSize en pt -> mm, con un pequeño margen de aire).
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.setTextColor('#222222')
  const lineHeightItem = 2.4

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
