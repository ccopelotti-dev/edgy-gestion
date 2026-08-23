// ============================================================
// Motor compartido de PDF -- helpers comunes (Fase 17b)
// Edgy Gestión
//
// Extraído de generarComprobantePdf.ts para poder reutilizar el mismo
// encabezado con banda de color + logo, y el mismo pie de página, en
// documentos que NO son un comprobante con ítems -- como el Resumen de
// cuenta (Fase 17b) y el Comprobante de Pago (Fase 17b), ambos de
// Compras > Proveedores, pero pensados para ser igual de reutilizables
// desde Ventas > Clientes el día que haga falta.
//
// generarComprobantePdf.ts mantiene su propia copia interna de estos
// helpers (no se tocó ese archivo, que ya está en producción) -- los de
// acá son exactamente iguales, solo que exportados para los documentos
// nuevos.
// ============================================================

import { jsPDF } from 'jspdf'
import { corriendoEnElectron } from '@/lib/electronBridge'

export const COLOR_DEFAULT = '#0F6E56'

// Fase 14 -- App de escritorio: único punto de salida de los 4
// generadores de PDF (generarComprobantePdf, generarReciboPdf,
// generarResumenCuentaPdf, generarComprobantePagoPdf), cada uno llama
// esto en vez de `doc.save(...)` directo. Adentro de la app de
// escritorio manda los bytes a imprimir silenciosamente en la
// impresora configurada (ver electron/main.js); en cualquier
// navegador normal (o si Electron reporta un error, ej. no hay
// impresora configurada todavía) cae al mismo `doc.save(...)` de
// siempre, así nunca se pierde el documento.
//
// Fase 38 -- `copias`: cuántas veces mandarlo al buffer de impresión
// dentro de la app de escritorio (Carlos definió 2 por defecto para
// comprobantes: una para el cliente, otra para el local, en vez del
// juego Original/Duplicado/Triplicado de la factura papel). Solo tiene
// efecto en Electron -- en navegador no hay forma de controlar la
// cantidad de copias del diálogo de impresión del sistema, así que
// simplemente se ignora y se descarga el archivo una vez.
export async function imprimirOGuardarPdf(doc: jsPDF, nombreArchivo: string, copias = 1): Promise<void> {
  if (corriendoEnElectron()) {
    const bytes = doc.output('arraybuffer') as ArrayBuffer
    const resultado = await window.electronAPI!.imprimir(bytes, nombreArchivo, copias)
    if (resultado.ok) return
    alert(
      `No se pudo imprimir automáticamente (${resultado.error ?? 'error desconocido'}).\n\n` +
        'Se descargó el PDF -- también podés configurar la impresora predeterminada desde Utilidades > Impresora.',
    )
  }
  doc.save(`${nombreArchivo}.pdf`)
}

export interface EmpresaParaPdf {
  nombre: string
  cuit?: string | null
  direccion?: string | null
  telefono?: string | null
  /** URL pública (Supabase Storage). Si falla la descarga o el formato
   * no es soportado, el PDF se genera igual sin logo. */
  logoUrl?: string | null
  /** Hex, ej "#0F6E56". Si no hay, se usa COLOR_DEFAULT. */
  colorMarca?: string | null
}

export function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function hexToRgb(hex: string): [number, number, number] {
  const limpio = hex.replace('#', '')
  const bignum = parseInt(
    limpio.length === 3
      ? limpio.split('').map((c) => c + c).join('')
      : limpio,
    16,
  )
  return [(bignum >> 16) & 255, (bignum >> 8) & 255, bignum & 255]
}

/** Mezcla un color con blanco (0 = el color tal cual, 1 = blanco puro) --
 * se usa para el fondo clarito de los totales destacados, sin depender de
 * canal alpha (jsPDF no soporta fill con transparencia de forma simple). */
export function aclarar(hex: string, factor: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  const mezclar = (canal: number) => Math.round(canal + (255 - canal) * factor)
  return [mezclar(r), mezclar(g), mezclar(b)]
}

/**
 * 22/08, bug real (Punto Tex): el jpeg de un logo subido desde el
 * celular (WhatsApp) venía con espacio de color CMYK -- el decoder de
 * JPEG que trae jsPDF de fábrica solo entiende JPEG baseline sRGB, así
 * que ante un CMYK (o un progresivo, u orientación EXIF rara -- todo
 * bastante común en fotos de celular) no tira error: dibuja pixels
 * basura, casi siempre negro sólido. Eso volvía negra la banda del
 * logo Y -- porque jsPDF sigue escribiendo el resto del content stream
 * de la página igual -- terminaba viéndose como "el PDF entero salió
 * negro" tanto en pantalla como impreso.
 *
 * El fix: en vez de pasarle a jsPDF los bytes crudos que bajó `fetch`
 * (vía FileReader.readAsDataURL, sin pasar por ningún decoder real),
 * dejamos que el decoder nativo del navegador (que sí entiende CMYK,
 * progresivo y EXIF) decodifique la imagen en un <img>, la volvemos a
 * dibujar en un <canvas> y exportamos ESO como PNG. Un PNG generado
 * por canvas siempre es RGB plano de 8 bits -- lo único que el
 * decoder de jsPDF garantiza soportar sin sorpresas.
 */
export async function logoADataUrl(
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
    // El logo es un plus visual -- si falla la descarga (CORS, red,
    // formato raro que ni el navegador puede decodificar) el
    // documento se genera igual, sin logo.
    return null
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Tamaño final con el que dibujar un logo dentro de un cuadro de
 * `maxWidth` x `maxHeight`, respetando su proporción real -- nunca lo
 * estira. Antes todos los headers hacían `addImage(..., logoSize,
 * logoSize)` a lo bruto, así que un logo que no fuera cuadrado (banner
 * horizontal, por ejemplo, como el de La Charcutería: "LA CHARCUTERIA -
 * Productos Artesanales" en formato apaisado) salía deformado (21/08,
 * a pedido de Carlos). `doc.getImageProperties` lee el ancho/alto real
 * del archivo sin tener que cargarlo aparte en un <img>. El resto del
 * layout (dónde arranca el texto de al lado) sigue midiendo contra
 * `maxWidth`/`maxHeight` como cota fija -- ver `dibujarEncabezado` y
 * `dibujarEncabezadoConDatosFiscales` -- así ningún logo, sea cual sea
 * su proporción, corre el resto del contenido del documento.
 */
function tamañoLogoProporcional(
  doc: jsPDF,
  dataUrl: string,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  try {
    const props = doc.getImageProperties(dataUrl)
    const escala = Math.min(maxWidth / props.width, maxHeight / props.height)
    return { width: props.width * escala, height: props.height * escala }
  } catch {
    // Si no se pueden leer las propiedades de la imagen, degradamos al
    // cuadro completo (mismo comportamiento que antes) en vez de fallar
    // la descarga del documento.
    return { width: maxWidth, height: maxHeight }
  }
}

/**
 * Dibuja la banda de encabezado (logo + nombre de la empresa a la
 * izquierda, tipo de documento + número + fecha a la derecha) -- común a
 * todos los documentos PDF del sistema. Devuelve el `y` desde donde
 * seguir dibujando el cuerpo del documento, y el color de marca resuelto
 * (para reusarlo en tablas/totales del cuerpo).
 */
export async function dibujarEncabezado(
  doc: jsPDF,
  empresa: EmpresaParaPdf,
  tituloDocumento: string,
  numero: string,
  fecha: string,
): Promise<{ y: number; color: string }> {
  const color = empresa.colorMarca || COLOR_DEFAULT
  const pageWidth = doc.internal.pageSize.getWidth()
  const marginX = 15
  const anchoBanda = 32

  // Fase 47 (23/08, bug real reportado por Carlos -- Charcutería, color de
  // marca #fbe6d5 un durazno/crema clarito): texto blanco fijo sobre la
  // banda quedaba invisible con un colorMarca claro. Mismo criterio que ya
  // usa dibujarEncabezadoConDatosFiscales (Fase 43c, caso Punto Tex) --
  // luminancia > 0.5 = fondo claro, va texto oscuro.
  const fondoClaro = luminanciaRelativa(color) > 0.5
  const colorTitulo = fondoClaro ? '#2b2320' : '#ffffff'
  const colorTexto = fondoClaro ? '#5c5450' : '#f0ece6'

  doc.setFillColor(color)
  doc.rect(0, 0, pageWidth, anchoBanda, 'F')

  let logoInfo: { dataUrl: string; formato: 'PNG' | 'JPEG' } | null = null
  if (empresa.logoUrl) {
    logoInfo = await logoADataUrl(empresa.logoUrl)
  }
  const logoBox = 20
  const textoX = logoInfo ? marginX + logoBox + 4 : marginX
  if (logoInfo) {
    try {
      const { width, height } = tamañoLogoProporcional(doc, logoInfo.dataUrl, logoBox, logoBox)
      // Fase 45c (21/08, a pedido de Carlos): alineado arriba, no
      // centrado -- así el borde superior del logo queda a la misma
      // altura que el nombre de la empresa de al lado, y lo que sobra de
      // la caja (logos más "cuadrados" que el cuadro de logoBox) fuga
      // hacia abajo en vez de repartirse mitad arriba/mitad abajo.
      const logoX = marginX + (logoBox - width) / 2
      const logoY = 6
      doc.addImage(logoInfo.dataUrl, logoInfo.formato, logoX, logoY, width, height)
    } catch {
      // Formato de imagen no soportado por jsPDF -- seguimos sin logo en
      // vez de romper la descarga del documento.
    }
  }

  doc.setTextColor(colorTitulo)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(empresa.nombre, textoX, 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(colorTexto)
  let yEmpresa = 20
  if (empresa.cuit) {
    doc.text(`CUIT ${empresa.cuit}`, textoX, yEmpresa)
    yEmpresa += 5
  }
  if (empresa.direccion) {
    doc.text(empresa.direccion, textoX, yEmpresa)
  }

  doc.setTextColor(colorTitulo)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(tituloDocumento, pageWidth - marginX, 14, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(colorTexto)
  if (numero) {
    doc.text(`N.º ${numero}`, pageWidth - marginX, 20, { align: 'right' })
    doc.text(fecha, pageWidth - marginX, 26, { align: 'right' })
  } else {
    // Documentos sin numeración correlativa propia (ej. Resumen de
    // cuenta) -- solo se muestra la fecha, un poco más arriba.
    doc.text(fecha, pageWidth - marginX, 22, { align: 'right' })
  }

  return { y: anchoBanda + 10, color }
}

// ============================================================
// Fase 43 (20/08, "Toma de Pedidos") -- encabezado tipo Anexo II sin
// letra fiscal ni titular
//
// Carlos pidió que la Ficha de medida (rebautizada "Toma de Pedidos")
// tome el mismo lenguaje visual que la Factura Electrónica -- recuadro
// emisor (nombre, domicilio, condición de IVA, contactos con
// pictograma) + recuadro documento (tipo, número correlativo con
// formato de punto de venta nativo, fecha, CUIT, IIBB, inicio de
// actividades) -- pero SIN la letra fiscal (A/B/C/X) ni la línea de
// titular ARCA, porque no es un comprobante fiscal ("no es obligatoria").
// Se dibuja como copia adaptada (2 columnas, sin el bloque central de
// la letra) del recuadro de generarComprobantePdf.ts en vez de
// importarlo -- mismo criterio que el resto de este archivo: capaz de
// evolucionar por separado sin arriesgar el motor fiscal en producción.
// Queda acá (no en generarFichaMedidaPdf.ts) para poder reusarlo
// también desde Resumen de cuenta / Comprobante de Pago el día que
// Carlos avance con el rediseño de la Biblioteca de PDF.
// ============================================================

export interface EmpresaParaPdfCompleta extends EmpresaParaPdf {
  ingresosBrutosCondicion?: string | null
  ingresosBrutosNumero?: string | null
  inicioActividades?: string | null
  provincia?: string | null
  sitioWeb?: string | null
  instagram?: string | null
  whatsappComercial?: string | null
  sitioWebIconoUrl?: string | null
  instagramIconoUrl?: string | null
  whatsappIconoUrl?: string | null
}

function formatFechaCortaISO(iso?: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function leyendaCondicionIvaEmisor(condicion: string): string {
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

function leyendaIngresosBrutosEmisor(
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

const COLOR_ICONO_WHATSAPP: [number, number, number] = [37, 178, 92]
const COLOR_ICONO_INSTAGRAM: [number, number, number] = [224, 108, 30]
const COLOR_ICONO_WEB: [number, number, number] = [110, 110, 110]

/** Mismo pictograma genérico (no el isotipo real de cada red, ver el
 * comentario largo en generarComprobantePdf.ts) -- copia exacta, acá
 * también dibujado a mano con las primitivas de jsPDF. */
function dibujarIconoContactoChico(
  doc: jsPDF,
  tipo: 'whatsapp' | 'instagram' | 'web',
  x: number,
  y: number,
  size: number,
): void {
  const [dr, dg, db] =
    tipo === 'whatsapp' ? COLOR_ICONO_WHATSAPP : tipo === 'instagram' ? COLOR_ICONO_INSTAGRAM : COLOR_ICONO_WEB
  doc.setFillColor(dr, dg, db)
  doc.roundedRect(x, y, size, size, size * 0.24, size * 0.24, 'F')
  doc.setDrawColor(255, 255, 255)
  doc.setFillColor(255, 255, 255)
  doc.setLineWidth(size * 0.07)
  const r = size / 2
  const cx = x + r
  const cy = y + r
  switch (tipo) {
    case 'whatsapp': {
      const bw = size * 0.58
      const bh = size * 0.48
      const bx = x + (size - bw) / 2
      const by = y + size * 0.24
      doc.roundedRect(bx, by, bw, bh, bh * 0.4, bh * 0.4, 'S')
      doc.triangle(bx + bw * 0.28, by + bh * 0.95, bx + bw * 0.52, by + bh * 0.95, bx + bw * 0.28, by + bh * 1.3, 'F')
      break
    }
    case 'instagram':
      doc.roundedRect(x + size * 0.2, y + size * 0.2, size * 0.6, size * 0.6, size * 0.14, size * 0.14, 'S')
      doc.circle(cx, cy, r * 0.42, 'S')
      doc.circle(x + size * 0.74, y + size * 0.26, size * 0.05, 'F')
      break
    case 'web':
      doc.circle(cx, cy, r * 0.62, 'S')
      doc.line(x + size * 0.19, cy, x + size * 0.81, cy)
      doc.ellipse(cx, cy, r * 0.28, r * 0.62, 'S')
      break
  }
}

/** Formatea el número correlativo con el mismo estilo visual que
 * `formatNumeroFiscal` de la Factura ("0005-00000001") -- acá
 * `puntoVentaNumero` ya viene formateado a 4 dígitos (ver
 * resolverNumeroPuntoVenta en src/lib/puntoVenta.ts), así que solo hay
 * que rellenar el correlativo a 8. */
export function formatNumeroConPuntoVenta(puntoVentaNumero: string, numero: number): string {
  return `${puntoVentaNumero}-${String(numero).padStart(8, '0')}`
}

/** Luminancia relativa (WCAG) de un color hex -- para decidir si el
 * texto que va ENCIMA de ese color debe ser oscuro o blanco. Hizo
 * falta desde que Punto Tex fue el primer cliente con un color de
 * marca muy claro (#e7e0cd, un beige) -- el encabezado tenía texto
 * blanco fijo (pensado para colores oscuros) y quedaba casi
 * ilegible/"lavado" sobre un fondo tan claro (ver Fase 43c). */
function luminanciaRelativa(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  const canal = (c: number) => {
    const cs = c / 255
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/** Mismo problema que arriba pero al revés: texto en el color de marca
 * DIRECTO, dibujado sobre fondo BLANCO (no sobre el panel de color) --
 * ej. el título del esquema técnico de la Ficha. Con una marca clara
 * como la de Punto Tex, el color sin modificar queda casi invisible
 * sobre blanco. Si la luminancia es alta, se oscurece el mismo color
 * (no se lo reemplaza por un gris genérico) para que siga siendo
 * "de la marca" pero legible. */
export function colorLegibleSobreBlanco(hex: string): string {
  if (luminanciaRelativa(hex) <= 0.55) return hex
  const [r, g, b] = hexToRgb(hex)
  const factor = 0.55
  const oscurecerCanal = (c: number) => Math.round(c * (1 - factor))
  return `#${[r, g, b]
    .map((c) => oscurecerCanal(c).toString(16).padStart(2, '0'))
    .join('')}`
}

/** Fase 43j (20/08, a pedido de Carlos -- previo a migrar el motor
 * compartido de comprobantes a este mismo header): datos que solo
 * aplican a comprobantes FISCALES (Factura/Nota de crédito/Nota de
 * débito) -- ninguno de los dos es obligatorio, así que Toma de
 * Pedidos (que no manda ninguno) sigue viéndose exactamente igual. */
export interface OpcionesEncabezadoFiscal {
  /** Letra destacada en el bloque central -- 'A'|'B'|'C' cuando ARCA ya
   * la resolvió, 'X' para comprobantes internos/sin CAE todavía. */
  letraFiscal?: 'A' | 'B' | 'C' | 'X'
  /** Código AFIP del tipo de comprobante (01, 06, 11...) -- se muestra
   * como "COD. XX" debajo de la letra; si no está, muestra "S/N". */
  codigoAfip?: number
  /** Nombre y apellido (o razón social) del titular tal como figura
   * ante ARCA -- se imprime debajo del nombre de fantasía. */
  titular?: string | null
}

/**
 * Encabezado alternativo -- Fase 43c (20/08, a pedido de Carlos, tomado
 * como "modelo base para todo"): UN solo panel de color (no banda
 * angosta + recuadro blanco debajo, que era la Fase 43 original) con
 * logo grande a la izquierda y las dos columnas de datos (emisor /
 * documento) adentro -- calcado del mockup que armó a mano en
 * Inkscape. Color de texto automático según el color de marca (ver
 * luminanciaRelativa) para que funcione igual de bien con marcas
 * oscuras que con una tan clara como la de Punto Tex.
 *
 * Fase 43j: sumó un tercer bloque central OPCIONAL (letra fiscal +
 * código AFIP) y la línea de titular, para poder usarse también como
 * base de Factura/Nota de crédito/Nota de débito el día que se migre
 * el motor compartido -- Toma de Pedidos, que no manda `opcionesFiscal`,
 * sigue exactamente igual que antes. Devuelve la Y desde donde seguir
 * dibujando el cuerpo, igual que `dibujarEncabezado`.
 */
export async function dibujarEncabezadoConDatosFiscales(
  doc: jsPDF,
  empresa: EmpresaParaPdfCompleta,
  tituloDocumento: string,
  numero: string,
  fecha: string,
  condicionIvaEmisor?: string | null,
  opcionesFiscal?: OpcionesEncabezadoFiscal,
  // Fase 43k (motor compartido): Toma de Pedidos dibuja su cuerpo con
  // margen de 15mm, pero el motor de comprobantes (Factura/Recibo/NC/
  // ND/Presupuesto/etc.) usa 8mm en el resto del documento (tabla de
  // ítems, totales, pie fiscal) -- si el header quedara fijo en 15,
  // el panel de color no alinearía con el borde izquierdo/derecho del
  // cuerpo. Parametrizable, con 15 de default para no tocar el único
  // llamador que ya estaba en producción (generarFichaMedidaPdf.ts).
  marginX = 15,
): Promise<{ y: number; color: string }> {
  const color = empresa.colorMarca || COLOR_DEFAULT
  const pageWidth = doc.internal.pageSize.getWidth()

  const fondoClaro = luminanciaRelativa(color) > 0.5
  const colorTitulo = fondoClaro ? '#2b2320' : '#ffffff'
  const colorTexto = fondoClaro ? '#5c5450' : '#f0ece6'
  // Fase 43j: las líneas divisorias del bloque de letra van en un gris
  // sutil fijo (jsPDF `setDrawColor` no acepta rgba/alpha) -- en el
  // diseño viejo eran gris clarito sobre blanco; acá, sobre un panel de
  // color, conviene que sean discretas en vez de competir con el texto.
  const colorDivisor = fondoClaro ? '#c9c2b8' : '#8a8a8a'

  let logoInfo: { dataUrl: string; formato: 'PNG' | 'JPEG' } | null = null
  if (empresa.logoUrl) logoInfo = await logoADataUrl(empresa.logoUrl)

  const logoSize = 28
  const colIzqX = logoInfo ? marginX + logoSize + 6 : marginX
  const colDerX = pageWidth / 2 + 10
  // Fase 43j: el bloque de letra fiscal se apoya justo a la izquierda
  // de la columna del documento -- mismo lugar relativo que ocupaba en
  // el diseño viejo de Factura (entre emisor y datos del comprobante),
  // con margen de sobra para no pisar ninguna de las dos columnas.
  const xLetra = colDerX - 15

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

  const leyendaIva = condicionIvaEmisor ? leyendaCondicionIvaEmisor(condicionIvaEmisor) : ''
  const iibbTexto = leyendaIngresosBrutosEmisor(empresa.ingresosBrutosCondicion, empresa.ingresosBrutosNumero, empresa.provincia)
  const partesDoc: string[] = []
  if (iibbTexto) partesDoc.push(iibbTexto)
  if (empresa.inicioActividades) partesDoc.push(`Inicio activ. ${formatFechaCortaISO(empresa.inicioActividades)}`)

  // Alto del panel: hay que saberlo ANTES de dibujar el rectángulo de
  // fondo -- jsPDF no tiene forma de "mandar atrás" algo ya dibujado --
  // así que se precalcula según cuántas líneas va a tener cada columna,
  // con los mismos saltos que se usan más abajo al dibujar de verdad.
  const topPad = 9
  const bottomPad = 8
  let altoColIzq = 6 // nombre
  if (opcionesFiscal?.titular) altoColIzq += 4.3
  if (empresa.direccion) altoColIzq += 4.3
  if (leyendaIva) altoColIzq += 4.3
  altoColIzq += contactos.length * 4.3

  let altoColDer = 6 + 4.5 // tipoDocumento + N.º
  altoColDer += 4.3 // Fecha
  if (empresa.cuit) altoColDer += 4.3
  if (partesDoc.length > 0) altoColDer += 4.3

  // Bloque de letra: compacto, mismas proporciones que el diseño viejo
  // (letra 16pt + "COD. XX" 6pt, con un pequeño margen) -- casi nunca es
  // el que termina definiendo el alto total, pero se lo tiene en cuenta
  // igual por si la empresa/documento tienen muy poco texto cargado.
  const altoLetra = opcionesFiscal?.letraFiscal ? 15 : 0

  const altoContenido = Math.max(altoColIzq, altoColDer, altoLetra, logoInfo ? logoSize : 0)
  const altoPanel = topPad + altoContenido + bottomPad

  doc.setFillColor(color)
  doc.rect(0, 0, pageWidth, altoPanel, 'F')

  if (logoInfo) {
    try {
      const { width, height } = tamañoLogoProporcional(doc, logoInfo.dataUrl, logoSize, logoSize)
      // Fase 45c (21/08, a pedido de Carlos): alineado arriba en vez de
      // centrado -- el borde superior del logo coincide con el arranque
      // del bloque de texto (yA = topPad + 4, ver más abajo), y el
      // espacio que sobra dentro de logoSize x logoSize (cuando el logo
      // no llena el cuadro por su proporción) fuga hacia abajo, no se
      // reparte arriba/abajo como antes.
      const logoX = marginX + (logoSize - width) / 2
      const logoY = topPad
      doc.addImage(logoInfo.dataUrl, logoInfo.formato, logoX, logoY, width, height)
    } catch {
      // Formato no soportado por jsPDF -- seguimos sin logo.
    }
  }

  // Bloque central -- letra fiscal + código AFIP, SOLO si el llamador
  // la mandó (Factura/NC/ND). Toma de Pedidos no manda `opcionesFiscal`,
  // así que este bloque entero se salta y el panel queda igual que
  // antes de esta fase.
  if (opcionesFiscal?.letraFiscal) {
    const yLetra = topPad + 8
    const yCod = yLetra + 3
    const yLineasTop = yLetra - 4.5
    const yLineasBottom = yCod + 1
    doc.setDrawColor(colorDivisor)
    doc.setLineWidth(0.25)
    doc.line(xLetra - 5.5, yLineasTop, xLetra - 5.5, yLineasBottom)
    doc.line(xLetra + 5.5, yLineasTop, xLetra + 5.5, yLineasBottom)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(colorTitulo)
    doc.text(opcionesFiscal.letraFiscal, xLetra, yLetra, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(colorTexto)
    const codTexto = opcionesFiscal.codigoAfip !== undefined ? `COD. ${String(opcionesFiscal.codigoAfip).padStart(2, '0')}` : 'S/N'
    doc.text(codTexto, xLetra, yCod, { align: 'center' })
  }

  // Columna izquierda -- nombre, titular, domicilio, condición de IVA,
  // contactos.
  let yA = topPad + 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(colorTitulo)
  doc.text(empresa.nombre, colIzqX, yA)
  yA += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(colorTexto)
  if (opcionesFiscal?.titular) {
    doc.text(opcionesFiscal.titular, colIzqX, yA)
    yA += 4.3
  }
  if (empresa.direccion) {
    doc.text(empresa.direccion, colIzqX, yA)
    yA += 4.3
  }
  if (leyendaIva) {
    doc.text(leyendaIva, colIzqX, yA)
    yA += 4.3
  }
  if (contactos.length > 0) {
    const iconoSize = 3.4
    doc.setFontSize(7.5)
    for (const c of contactos) {
      const yIcono = yA - iconoSize + 0.8
      let iconoPropio: { dataUrl: string; formato: 'PNG' | 'JPEG' } | null = null
      if (c.iconoUrl) iconoPropio = await logoADataUrl(c.iconoUrl)
      if (iconoPropio) {
        try {
          doc.addImage(iconoPropio.dataUrl, iconoPropio.formato, colIzqX, yIcono, iconoSize, iconoSize)
        } catch {
          dibujarIconoContactoChico(doc, c.tipo, colIzqX, yIcono, iconoSize)
        }
      } else {
        dibujarIconoContactoChico(doc, c.tipo, colIzqX, yIcono, iconoSize)
      }
      doc.setTextColor(colorTexto)
      doc.text(c.texto, colIzqX + iconoSize + 1.5, yA)
      yA += 4.3
    }
  }

  // Columna derecha -- tipo de documento, número, fecha, CUIT, IIBB.
  let yB = topPad + 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(colorTitulo)
  doc.text(tituloDocumento.toUpperCase(), colDerX, yB)
  yB += 6
  doc.setFontSize(9.5)
  doc.text(`N.º ${numero}`, colDerX, yB)
  yB += 4.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(colorTexto)
  doc.text(`Fecha: ${fecha}`, colDerX, yB)
  yB += 4.3
  if (empresa.cuit) {
    doc.text(`CUIT: ${empresa.cuit}`, colDerX, yB)
    yB += 4.3
  }
  if (partesDoc.length > 0) {
    doc.text(partesDoc.join(' · '), colDerX, yB)
    yB += 4.3
  }

  return { y: altoPanel + 8, color }
}

/** Pie de página común -- nombre y teléfono de la empresa emisora. */
export function dibujarPie(doc: jsPDF, empresa: EmpresaParaPdf): void {
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor('#999999')
  const pieTexto = empresa.telefono
    ? `${empresa.nombre} · ${empresa.telefono}`
    : empresa.nombre
  doc.text(pieTexto, 15, pageHeight - 10)
}
