// Módulo Landing -- hook de datos. Una sola fila en
// edgy_gestion.landing_config por cliente (mismo patrón de "config
// única" que useParametrosLiquidacion en gastos-fijos): se trae con
// maybeSingle() y se guarda con upsert(onConflict: 'cliente_id').

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import { LANDING_CONFIG_DEFAULT, type HeroCtaTipo, type LandingConfig } from '../types'

const COLUMNAS =
  'hero_imagen_url, hero_contraste, hero_titulo, hero_bajada, hero_cta_tipo, hero_cta_producto_id, ' +
  'whatsapp_numero, promo_titulo, promo_texto, promo_activa, ' +
  'nosotros_titulo, nosotros_texto1, nosotros_texto2, nosotros_imagen_url, ' +
  'productos_destacados_ids, galeria_titulo, galeria_bajada, galeria_imagenes'

interface FilaLandingConfig {
  hero_imagen_url: string | null
  hero_contraste: number
  hero_titulo: string | null
  hero_bajada: string | null
  hero_cta_tipo: HeroCtaTipo
  hero_cta_producto_id: string | null
  whatsapp_numero: string | null
  promo_titulo: string | null
  promo_texto: string | null
  promo_activa: boolean
  nosotros_titulo: string | null
  nosotros_texto1: string | null
  nosotros_texto2: string | null
  nosotros_imagen_url: string | null
  productos_destacados_ids: string[] | null
  galeria_titulo: string | null
  galeria_bajada: string | null
  galeria_imagenes: string[] | null
}

function filaAConfig(fila: FilaLandingConfig | null): LandingConfig {
  if (!fila) return LANDING_CONFIG_DEFAULT
  return {
    heroImagenUrl: fila.hero_imagen_url,
    heroContraste: fila.hero_contraste,
    heroTitulo: fila.hero_titulo ?? '',
    heroBajada: fila.hero_bajada ?? '',
    heroCtaTipo: fila.hero_cta_tipo ?? 'catalogo',
    heroCtaProductoId: fila.hero_cta_producto_id,
    whatsappNumero: fila.whatsapp_numero ?? '',

    promoTitulo: fila.promo_titulo ?? '',
    promoTexto: fila.promo_texto ?? '',
    promoActiva: fila.promo_activa,

    nosotrosTitulo: fila.nosotros_titulo ?? '',
    nosotrosTexto1: fila.nosotros_texto1 ?? '',
    nosotrosTexto2: fila.nosotros_texto2 ?? '',
    nosotrosImagenUrl: fila.nosotros_imagen_url,

    productosDestacadosIds: fila.productos_destacados_ids ?? [],

    galeriaTitulo: fila.galeria_titulo ?? '',
    galeriaBajada: fila.galeria_bajada ?? '',
    galeriaImagenes: fila.galeria_imagenes ?? [],
  }
}

interface UseLandingConfigResult {
  config: LandingConfig
  cargando: boolean
  guardando: boolean
  error: string | null
  clienteId: string | null
  guardar: (nueva: LandingConfig) => Promise<boolean>
}

export function useLandingConfig(): UseLandingConfigResult {
  const { cliente } = useClienteActual()
  const clienteId = cliente?.id ?? null

  const [config, setConfig] = useState<LandingConfig>(LANDING_CONFIG_DEFAULT)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)
    const { data, error: errFetch } = await supabase
      .from('landing_config')
      .select(COLUMNAS)
      .eq('cliente_id', clienteId)
      .maybeSingle()

    if (errFetch) {
      setError('No pudimos cargar la configuración de la landing.')
      setCargando(false)
      return
    }
    setConfig(filaAConfig(data as unknown as FilaLandingConfig | null))
    setCargando(false)
  }, [clienteId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const guardar = useCallback(
    async (nueva: LandingConfig): Promise<boolean> => {
      if (!clienteId) return false
      setGuardando(true)
      setError(null)
      const { error: errUpsert } = await supabase.from('landing_config').upsert(
        {
          cliente_id: clienteId,
          hero_imagen_url: nueva.heroImagenUrl,
          hero_contraste: nueva.heroContraste,
          hero_titulo: nueva.heroTitulo.trim() || null,
          hero_bajada: nueva.heroBajada.trim() || null,
          hero_cta_tipo: nueva.heroCtaTipo,
          hero_cta_producto_id: nueva.heroCtaTipo === 'producto' ? nueva.heroCtaProductoId : null,
          whatsapp_numero: nueva.whatsappNumero.replace(/\D/g, '') || null,
          promo_titulo: nueva.promoTitulo.trim() || null,
          promo_texto: nueva.promoTexto.trim() || null,
          promo_activa: nueva.promoActiva,
          nosotros_titulo: nueva.nosotrosTitulo.trim() || null,
          nosotros_texto1: nueva.nosotrosTexto1.trim() || null,
          nosotros_texto2: nueva.nosotrosTexto2.trim() || null,
          nosotros_imagen_url: nueva.nosotrosImagenUrl,
          productos_destacados_ids: nueva.productosDestacadosIds,
          galeria_titulo: nueva.galeriaTitulo.trim() || null,
          galeria_bajada: nueva.galeriaBajada.trim() || null,
          galeria_imagenes: nueva.galeriaImagenes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'cliente_id' },
      )
      setGuardando(false)
      if (errUpsert) {
        setError('No pudimos guardar los cambios.')
        return false
      }
      setConfig(nueva)
      return true
    },
    [clienteId],
  )

  return { config, cargando, guardando, error, clienteId, guardar }
}
