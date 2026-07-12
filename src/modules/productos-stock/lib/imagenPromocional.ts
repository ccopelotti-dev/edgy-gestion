// ============================================================
// Generador de imagen promocional JPG para Combos (Fase 5b)
// Edgy Gestión · Productos y Stock
//
// Compone, 100% client-side con la Canvas API del navegador (sin
// dependencias nuevas -- misma filosofía "minimal-dependency" que el resto
// del repo, ver qrcode/jsPDF), una imagen cuadrada (1080x1080, formato
// típico de redes sociales) con: logo del comercio, foto del combo (si
// tiene), nombre, precio bien resaltado y descripción -- pedido explícito
// del usuario ("esto sería muy premium...").
//
// Si no hay foto de combo o el logo no carga (ej. bloqueo CORS de un
// bucket/host de terceros), se degrada con elegancia a una plantilla con
// el espacio en blanco/color sólido en vez de romper la generación --
// mencionado por el propio usuario como aceptable ("si es necesario se
// puede hacer una plantilla previa con el espacio en blanco").
// ============================================================

import { formatARS } from './format'

export interface DatosImagenPromocionalCombo {
  nombre: string
  precio: number
  descripcion?: string
  /** Primera foto de la galería del combo (la "principal"), si tiene. */
  fotoUrl?: string
  /** Logo del comercio (clientes.logo_url), si tiene. */
  logoUrl?: string
  /** Color de marca del comercio (clientes.color_marca), hex, si tiene. */
  colorMarca?: string
}

const TAMANIO = 1080

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${url}`))
    img.src = url
  })
}

/** Dibuja una imagen ocupando todo el rectángulo dado, recortando (cover). */
function dibujarCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const escala = Math.max(w / img.width, h / img.height)
  const anchoEscalado = img.width * escala
  const altoEscalado = img.height * escala
  const dx = x + (w - anchoEscalado) / 2
  const dy = y + (h - altoEscalado) / 2
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.drawImage(img, dx, dy, anchoEscalado, altoEscalado)
  ctx.restore()
}

/** Parte un texto en líneas que entran en `maxWidth`, para dibujar párrafos. */
function partirTexto(ctx: CanvasRenderingContext2D, texto: string, maxWidth: number): string[] {
  const palabras = texto.split(/\s+/)
  const lineas: string[] = []
  let actual = ''
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (ctx.measureText(prueba).width > maxWidth && actual) {
      lineas.push(actual)
      actual = palabra
    } else {
      actual = prueba
    }
  }
  if (actual) lineas.push(actual)
  return lineas
}

function esColorClaro(hex: string): boolean {
  const limpio = hex.replace('#', '')
  if (limpio.length !== 6) return false
  const r = parseInt(limpio.slice(0, 2), 16)
  const g = parseInt(limpio.slice(2, 4), 16)
  const b = parseInt(limpio.slice(4, 6), 16)
  // Luminancia percibida
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
}

/**
 * Genera la imagen promocional del combo y devuelve un data URL JPEG listo
 * para mostrar en un <img> o descargar.
 */
export async function generarImagenPromocionalCombo(
  datos: DatosImagenPromocionalCombo,
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = TAMANIO
  canvas.height = TAMANIO
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear el lienzo para la imagen.')

  const colorMarca = datos.colorMarca && /^#[0-9a-fA-F]{6}$/.test(datos.colorMarca)
    ? datos.colorMarca
    : '#0f172a'

  // ── Fondo ──────────────────────────────────────────────────────────────
  ctx.fillStyle = colorMarca
  ctx.fillRect(0, 0, TAMANIO, TAMANIO)

  // ── Foto del combo (zona superior, ~62% de la altura) ────────────────────
  const altoFoto = Math.round(TAMANIO * 0.62)
  let fotoOk = false
  if (datos.fotoUrl) {
    try {
      const img = await cargarImagen(datos.fotoUrl)
      dibujarCover(ctx, img, 0, 0, TAMANIO, altoFoto)
      fotoOk = true
    } catch {
      // Se degrada a placeholder de color sólido -- sin romper la generación.
    }
  }
  if (!fotoOk) {
    const gradiente = ctx.createLinearGradient(0, 0, 0, altoFoto)
    gradiente.addColorStop(0, colorMarca)
    gradiente.addColorStop(1, '#1e293b')
    ctx.fillStyle = gradiente
    ctx.fillRect(0, 0, TAMANIO, altoFoto)
  }

  // Degradado oscuro al pie de la foto para que el nombre se lea bien encima.
  const sombra = ctx.createLinearGradient(0, altoFoto - 220, 0, altoFoto)
  sombra.addColorStop(0, 'rgba(0,0,0,0)')
  sombra.addColorStop(1, 'rgba(0,0,0,0.65)')
  ctx.fillStyle = sombra
  ctx.fillRect(0, altoFoto - 220, TAMANIO, 220)

  // ── Logo del comercio (esquina superior izquierda, badge blanco) ─────────
  if (datos.logoUrl) {
    try {
      const logo = await cargarImagen(datos.logoUrl)
      const tam = 120
      const margen = 32
      ctx.save()
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.beginPath()
      ctx.roundRect(margen, margen, tam, tam, 16)
      ctx.fill()
      const pad = 12
      dibujarCover(ctx, logo, margen + pad, margen + pad, tam - pad * 2, tam - pad * 2)
      ctx.restore()
    } catch {
      // Sin logo -- no rompe la generación.
    }
  }

  // ── Nombre del combo ───────────────────────────────────────────────────
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 64px sans-serif'
  const nombreLineas = partirTexto(ctx, datos.nombre, TAMANIO - 80)
  let yNombre = altoFoto - 40 - (nombreLineas.length - 1) * 70
  for (const linea of nombreLineas) {
    ctx.fillText(linea, 40, yNombre)
    yNombre += 70
  }

  // ── Precio (bien resaltado, badge de color contrastante) ──────────────
  const precioTexto = formatARS(datos.precio)
  ctx.font = 'bold 84px sans-serif'
  const anchoPrecio = ctx.measureText(precioTexto).width
  const padX = 36
  const padY = 24
  const badgeW = anchoPrecio + padX * 2
  const badgeH = 84 + padY * 2 - 10
  const badgeX = 40
  const badgeY = altoFoto + 36

  const colorBadge = esColorClaro(colorMarca) ? '#0f172a' : '#facc15'
  ctx.fillStyle = colorBadge
  ctx.beginPath()
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 18)
  ctx.fill()

  ctx.fillStyle = esColorClaro(colorBadge) ? '#0f172a' : '#ffffff'
  ctx.fillText(precioTexto, badgeX + padX, badgeY + badgeH - padY - 8)

  // ── Descripción / texto de promoción ──────────────────────────────────
  if (datos.descripcion?.trim()) {
    ctx.font = '38px sans-serif'
    ctx.fillStyle = esColorClaro(colorMarca) ? '#0f172a' : '#e2e8f0'
    const lineasDesc = partirTexto(ctx, datos.descripcion.trim(), TAMANIO - 80)
    let yDesc = badgeY + badgeH + 60
    const maxLineas = 4
    for (const linea of lineasDesc.slice(0, maxLineas)) {
      ctx.fillText(linea, 40, yDesc)
      yDesc += 48
    }
  }

  return canvas.toDataURL('image/jpeg', 0.92)
}
