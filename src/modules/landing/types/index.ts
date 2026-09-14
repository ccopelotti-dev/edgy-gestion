// Módulo Landing -- tipos.
//
// Una sola fila por cliente (edgy_gestion.landing_config, ver migración
// 0143_fase76_modulo_landing.sql). El sitio público (repo aparte,
// charcuteria-landing) lee una versión recortada de esto vía la función
// edgy_gestion.landing_publica(slug) -- ver README de ese repo.

export interface LandingConfig {
  /** Foto de fondo del hero -- URL pública del bucket landing-imagenes. */
  heroImagenUrl: string | null
  /** Porcentaje de contraste CSS (filter: contrast(N%)). 100 = normal. */
  heroContraste: number
  promoTitulo: string
  promoTexto: string
  promoActiva: boolean
}

export const LANDING_CONFIG_DEFAULT: LandingConfig = {
  heroImagenUrl: null,
  heroContraste: 100,
  promoTitulo: '',
  promoTexto: '',
  promoActiva: false,
}

export const HERO_CONTRASTE_MIN = 50
export const HERO_CONTRASTE_MAX = 200
