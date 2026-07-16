// ============================================================
// Generador de imagen promocional JPG para Combos (Fase 5b)
// Edgy Gestión · Productos y Stock
//
// Compone, 100% client-side con la Canvas API del navegador (sin
// dependencias nuevas -- misma filosofía "minimal-dependency" que el resto
// del repo, ver qrcode/jsPDF), un flyer rectangular vertical (1080x1620,
// pensado para historias/redes) con: banda de logo + etiqueta (posición
// configurable), foto(s) del combo, nombre, precio bien resaltado y
// descripción -- pedido explícito del usuario ("esto sería muy premium...").
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
  /** Etiqueta/badge del combo (Combo.etiqueta, ej. "Imperdible"). Si viene
   * vacío/undefined, no se dibuja badge y la banda superior/inferior queda
   * solo con el logo (o desaparece si tampoco hay logo). */
  etiqueta?: string
  /** Foto(s) elegidas de la galería del combo -- 1 (ocupa todo el ancho) o 2
   * (se reparten según `layout`, estilo "pantalla dividida"). Si viene vacío
   * o undefined, se degrada al placeholder de color sólido. */
  fotos?: string[]
  /** Cómo repartir el espacio cuando hay 2 fotos. Se ignora con 1 sola.
   * 'protagonista' = la primera foto ocupa mas espacio que la segunda. */
  layout?: 'lado_a_lado' | 'arriba_abajo' | 'protagonista'
  /** Logo del comercio (clientes.logo_url), si tiene. */
  logoUrl?: string
  /** Color de marca del comercio (clientes.color_marca), hex, si tiene. */
  colorMarca?: string
  /** Posición de la banda de logo/etiqueta en el flyer completo. */
  logoPos?: 'arriba' | 'abajo'
  /** Posición de la etiqueta respecto del logo, dentro de la banda. */
  badgePos?: 'arriba_logo' | 'abajo_logo'
  /** Color de fondo de la caja de la etiqueta (hex). Default blanco. */
  badgeColorFondo?: string
  /** Color de la tipografía de la etiqueta (hex). Default color de marca. */
  badgeColorTexto?: string
}

// Rectángulo vertical (antes era un cuadrado 1080x1080) -- 50% más de alto,
// a pedido del usuario, para que se lea mejor como flyer/historia.
const ANCHO = 1080
const ALTO = Math.round(ANCHO * 1.5) // 1620

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

/** Dibuja `texto` varias veces con micro-desplazamientos para simular una
 * tipografía "pesada" (Black/Heavy) sin depender de que el navegador tenga
 * instalada esa variante para la fuente genérica sans-serif -- pedido del
 * usuario ("letra Bold pesada") para la etiqueta/badge del flyer. */
function fillTextPesado(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number) {
  const offsets: Array<[number, number]> = [
    [0, 0],
    [0.8, 0],
    [0, 0.8],
    [0.8, 0.8],
    [-0.4, -0.4],
  ]
  for (const [dx, dy] of offsets) ctx.fillText(texto, x + dx, y + dy)
}

/**
 * Genera la imagen promocional del combo y devuelve un data URL JPEG listo
 * para mostrar en un <img> o descargar.
 */
export async function generarImagenPromocionalCombo(
  datos: DatosImagenPromocionalCombo,
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = ANCHO
  canvas.height = ALTO
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear el lienzo para la imagen.')

  const colorMarca = datos.colorMarca && /^#[0-9a-fA-F]{6}$/.test(datos.colorMarca)
    ? datos.colorMarca
    : '#0f172a'
  const logoPos = datos.logoPos ?? 'arriba'
  const badgePos = datos.badgePos ?? 'arriba_logo'
  const badgeColorFondo = datos.badgeColorFondo && /^#[0-9a-fA-F]{6}$/.test(datos.badgeColorFondo)
    ? datos.badgeColorFondo
    : '#ffffff'
  const badgeColorTexto = datos.badgeColorTexto && /^#[0-9a-fA-F]{6}$/.test(datos.badgeColorTexto)
    ? datos.badgeColorTexto
    : colorMarca
  const tieneLogo = !!datos.logoUrl
  const tieneBadge = !!datos.etiqueta?.trim()

  // ── Fondo ──────────────────────────────────────────────────────────────
  ctx.fillStyle = colorMarca
  ctx.fillRect(0, 0, ANCHO, ALTO)

  // ── Banda de logo + etiqueta: alto y posición ─────────────────────────
  // La banda (logo, y opcionalmente la etiqueta arriba o debajo de él) se
  // ubica al principio o al final del flyer según `logoPos` -- foto y texto
  // siempre van "en el medio", en el mismo orden.
  const logoSize = 130
  const badgeFontSize = 44
  const badgeH = badgeFontSize + 18 * 2 // 80
  const paddingBanda = 32
  const gapBandaInterno = 20

  let alturaBanda = 0
  if (tieneLogo || tieneBadge) {
    alturaBanda = paddingBanda * 2
    if (tieneLogo) alturaBanda += logoSize
    if (tieneBadge) alturaBanda += badgeH
    if (tieneLogo && tieneBadge) alturaBanda += gapBandaInterno
  }

  const yBanda = logoPos === 'abajo' ? ALTO - alturaBanda : 0
  const yFoto = logoPos === 'abajo' ? 0 : alturaBanda
  const restante = ALTO - alturaBanda
  const altoFoto = Math.round(restante * 0.62)

  // ── Foto(s) del combo ──────────────────────────────────────────────────
  // 1 foto ocupa todo el ancho. Con 2: "pantalla dividida" -- lado a lado,
  // arriba/abajo, o "protagonista" (una más grande que la otra) -- a
  // elección del usuario. La franja fina entre fotos aprovecha el color de
  // fondo ya pintado arriba, no hace falta dibujarla aparte.
  const fotos = (datos.fotos ?? []).filter(Boolean).slice(0, 2)
  const layout = datos.layout ?? 'lado_a_lado'
  const gapFotos = 6
  let fotoOk = false

  if (fotos.length === 1) {
    try {
      const img = await cargarImagen(fotos[0])
      dibujarCover(ctx, img, 0, yFoto, ANCHO, altoFoto)
      fotoOk = true
    } catch {
      // Se degrada a placeholder de color sólido -- sin romper la generación.
    }
  } else if (fotos.length === 2) {
    try {
      const [img1, img2] = await Promise.all(fotos.map(cargarImagen))
      if (layout === 'arriba_abajo') {
        const mitad = (altoFoto - gapFotos) / 2
        dibujarCover(ctx, img1, 0, yFoto, ANCHO, mitad)
        dibujarCover(ctx, img2, 0, yFoto + mitad + gapFotos, ANCHO, mitad)
      } else if (layout === 'protagonista') {
        const RATIO_PROTAGONISTA = 0.62
        const wGrande = Math.round((ANCHO - gapFotos) * RATIO_PROTAGONISTA)
        const wChica = ANCHO - gapFotos - wGrande
        dibujarCover(ctx, img1, 0, yFoto, wGrande, altoFoto)
        dibujarCover(ctx, img2, wGrande + gapFotos, yFoto, wChica, altoFoto)
      } else {
        const mitad = (ANCHO - gapFotos) / 2
        dibujarCover(ctx, img1, 0, yFoto, mitad, altoFoto)
        dibujarCover(ctx, img2, mitad + gapFotos, yFoto, mitad, altoFoto)
      }
      fotoOk = true
    } catch {
      // Se degrada a placeholder de color sólido -- sin romper la generación.
    }
  }
  if (!fotoOk) {
    const gradiente = ctx.createLinearGradient(0, yFoto, 0, yFoto + altoFoto)
    gradiente.addColorStop(0, colorMarca)
    gradiente.addColorStop(1, '#1e293b')
    ctx.fillStyle = gradiente
    ctx.fillRect(0, yFoto, ANCHO, altoFoto)
  }

  // Degradado oscuro al pie de la foto para que el nombre se lea bien encima.
  const sombra = ctx.createLinearGradient(0, yFoto + altoFoto - 220, 0, yFoto + altoFoto)
  sombra.addColorStop(0, 'rgba(0,0,0,0)')
  sombra.addColorStop(1, 'rgba(0,0,0,0.65)')
  ctx.fillStyle = sombra
  ctx.fillRect(0, yFoto + altoFoto - 220, ANCHO, 220)

  // ── Banda de logo + etiqueta (dibujo) ──────────────────────────────────
  if (alturaBanda > 0) {
    let cursorY = yBanda + paddingBanda
    const elementos: Array<'logo' | 'badge'> = tieneLogo && tieneBadge
      ? badgePos === 'arriba_logo' ? ['badge', 'logo'] : ['logo', 'badge']
      : tieneLogo ? ['logo'] : ['badge']

    for (const el of elementos) {
      if (el === 'logo' && datos.logoUrl) {
        try {
          const logo = await cargarImagen(datos.logoUrl)
          const logoX = (ANCHO - logoSize) / 2
          ctx.save()
          ctx.fillStyle = 'rgba(255,255,255,0.92)'
          ctx.beginPath()
          ctx.roundRect(logoX, cursorY, logoSize, logoSize, 16)
          ctx.fill()
          const pad = 12
          dibujarCover(ctx, logo, logoX + pad, cursorY + pad, logoSize - pad * 2, logoSize - pad * 2)
          ctx.restore()
        } catch {
          // Sin logo -- no rompe la generación.
        }
        cursorY += logoSize + gapBandaInterno
      } else if (el === 'badge' && tieneBadge) {
        const texto = datos.etiqueta!.trim()
        ctx.font = `bold ${badgeFontSize}px sans-serif`
        const anchoTexto = ctx.measureText(texto).width
        const padXBadge = 28
        const badgeW = anchoTexto + padXBadge * 2
        const badgeX = (ANCHO - badgeW) / 2
        ctx.fillStyle = badgeColorFondo
        ctx.beginPath()
        ctx.roundRect(badgeX, cursorY, badgeW, badgeH, 14)
        ctx.fill()
        ctx.fillStyle = badgeColorTexto
        ctx.textBaseline = 'alphabetic'
        fillTextPesado(ctx, texto, badgeX + padXBadge, cursorY + badgeH - 22)
        cursorY += badgeH + gapBandaInterno
      }
    }
  }

  // ── Nombre del combo ───────────────────────────────────────────────────
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 64px sans-serif'
  const nombreLineas = partirTexto(ctx, datos.nombre, ANCHO - 80)
  let yNombre = yFoto + altoFoto - 40 - (nombreLineas.length - 1) * 70
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
  const badgeWPrecio = anchoPrecio + padX * 2
  const badgeHPrecio = 84 + padY * 2 - 10
  const badgeXPrecio = 40
  const badgeYPrecio = yFoto + altoFoto + 36

  const colorBadgePrecio = esColorClaro(colorMarca) ? '#0f172a' : '#facc15'
  ctx.fillStyle = colorBadgePrecio
  ctx.beginPath()
  ctx.roundRect(badgeXPrecio, badgeYPrecio, badgeWPrecio, badgeHPrecio, 18)
  ctx.fill()

  ctx.fillStyle = esColorClaro(colorBadgePrecio) ? '#0f172a' : '#ffffff'
  ctx.fillText(precioTexto, badgeXPrecio + padX, badgeYPrecio + badgeHPrecio - padY - 8)

  // ── Descripción / texto de promoción ──────────────────────────────────
  if (datos.descripcion?.trim()) {
    ctx.font = '38px sans-serif'
    ctx.fillStyle = esColorClaro(colorMarca) ? '#0f172a' : '#e2e8f0'
    const lineasDesc = partirTexto(ctx, datos.descripcion.trim(), ANCHO - 80)
    let yDesc = badgeYPrecio + badgeHPrecio + 60
    const maxLineas = 4
    for (const linea of lineasDesc.slice(0, maxLineas)) {
      ctx.fillText(linea, 40, yDesc)
      yDesc += 48
    }
  }

  return canvas.toDataURL('image/jpeg', 0.92)
}
