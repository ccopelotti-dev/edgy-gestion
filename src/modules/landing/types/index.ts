// Módulo Landing -- tipos.
//
// Una sola fila por cliente (edgy_gestion.landing_config, ver migración
// 0143_fase76_modulo_landing.sql + 0145_fase78_landing_editable_ampliada.sql).
// El sitio público (repo aparte, charcuteria-landing) lee una versión
// recortada de esto vía la función edgy_gestion.landing_publica(slug) --
// ver README/API-PUBLICA.md de ese repo.

export type HeroCtaTipo = 'catalogo' | 'producto'

export interface LandingConfig {
  /** Foto de fondo del hero -- URL pública del bucket landing-imagenes. */
  heroImagenUrl: string | null
  /** Porcentaje de contraste CSS (filter: contrast(N%)). 100 = normal. */
  heroContraste: number
  /** Título grande del hero. Vacío = se deja el texto fijo de la landing. */
  heroTitulo: string
  /** Bajada (párrafo) debajo del título del hero. */
  heroBajada: string
  /** Destino del botón principal del hero: al catálogo QR real, o a un
   * producto puntual (arma un link de WhatsApp con el nombre del
   * producto precargado). */
  heroCtaTipo: HeroCtaTipo
  /** Producto elegido cuando heroCtaTipo = 'producto'. */
  heroCtaProductoId: string | null
  /** Número de WhatsApp del negocio (solo dígitos, con código de país,
   * ej. "5492954367009") -- reemplaza el que hoy está fijo en el HTML. */
  whatsappNumero: string

  promoTitulo: string
  promoTexto: string
  promoActiva: boolean

  nosotrosTitulo: string
  nosotrosTexto1: string
  nosotrosTexto2: string
  nosotrosImagenUrl: string | null

  /** Ids de productos reales del catálogo, en el orden en que se
   * muestran en "Nuestros productos". Nombre/precio/imagen se resuelven
   * siempre contra el catálogo real -- nunca se copian acá. */
  productosDestacadosIds: string[]

  /** Título/bajada de la sección de galería (ex "Tienda de Picadas" --
   * generalizada para cualquier comercio gastronómico). */
  galeriaTitulo: string
  galeriaBajada: string
  /** URLs de fotos (bucket landing-imagenes), en el orden mostrado. */
  galeriaImagenes: string[]
}

export const LANDING_CONFIG_DEFAULT: LandingConfig = {
  heroImagenUrl: null,
  heroContraste: 100,
  heroTitulo: '',
  heroBajada: '',
  heroCtaTipo: 'catalogo',
  heroCtaProductoId: null,
  whatsappNumero: '',

  promoTitulo: '',
  promoTexto: '',
  promoActiva: false,

  nosotrosTitulo: '',
  nosotrosTexto1: '',
  nosotrosTexto2: '',
  nosotrosImagenUrl: null,

  productosDestacadosIds: [],

  galeriaTitulo: '',
  galeriaBajada: '',
  galeriaImagenes: [],
}

export const HERO_CONTRASTE_MIN = 50
export const HERO_CONTRASTE_MAX = 200

/** Tope simple de fotos en la galería -- "básico, no muy complejo" (pedido
 * explícito de Carlos). Se puede subir este número más adelante sin
 * migración: es solo un límite de UI/UX, no algo impuesto por la base. */
export const GALERIA_MAX_FOTOS = 10

export interface ProductoCatalogoOpcion {
  id: string
  nombre: string
  imagen: string | null
  rubroNombre: string | null
}
