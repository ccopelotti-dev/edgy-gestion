/**
 * El color de marca lo elige cada cliente al cargar sus datos — puede
 * ser cualquier cosa, desde un terracota oscuro hasta un amarillo
 * pastel. El header y el rail lateral van pintados con ese color de
 * fondo, así que el texto/ícono de encima tiene que elegirse según
 * contraste real, no asumir siempre blanco.
 */

function hexARgb(hex: string): [number, number, number] {
  const limpio = hex.replace('#', '')
  const valor = limpio.length === 3
    ? limpio.split('').map((c) => c + c).join('')
    : limpio
  const num = parseInt(valor, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

/** Luminancia relativa (WCAG) — 0 (negro) a 1 (blanco). */
function luminancia([r, g, b]: [number, number, number]): number {
  const canal = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

const GRIS_OSCURO = '#201F1B'
const BLANCO = '#FFFFFF'

/** Para texto/íconos sobre un fondo de ese color: blanco si el fondo es
 * oscuro, gris oscuro si es claro. */
export function colorDeContraste(colorFondo: string | null | undefined): string {
  if (!colorFondo) return BLANCO
  try {
    return luminancia(hexARgb(colorFondo)) > 0.45 ? GRIS_OSCURO : BLANCO
  } catch {
    return BLANCO
  }
}

/** Mezcla un color con blanco — para tintes más claros del color de
 * marca (ej. la dona de categorías), sin tener que elegirlos a mano
 * para cada cliente. */
export function mezclarConBlanco(hex: string, porcentaje: number): string {
  try {
    const [r, g, b] = hexARgb(hex)
    const mezclar = (c: number) => Math.round(c + (255 - c) * porcentaje)
    return `rgb(${mezclar(r)}, ${mezclar(g)}, ${mezclar(b)})`
  } catch {
    return '#E5E3DC'
  }
}
