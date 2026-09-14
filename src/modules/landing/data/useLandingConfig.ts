// Módulo Landing -- hook de datos. Una sola fila en
// edgy_gestion.landing_config por cliente (mismo patrón de "config
// única" que useParametrosLiquidacion en gastos-fijos): se trae con
// maybeSingle() y se guarda con upsert(onConflict: 'cliente_id').

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import { LANDING_CONFIG_DEFAULT, type LandingConfig } from '../types'

interface FilaLandingConfig {
  hero_imagen_url: string | null
  hero_contraste: number
  promo_titulo: string | null
  promo_texto: string | null
  promo_activa: boolean
}

function filaAConfig(fila: FilaLandingConfig | null): LandingConfig {
  if (!fila) return LANDING_CONFIG_DEFAULT
  return {
    heroImagenUrl: fila.hero_imagen_url,
    heroContraste: fila.hero_contraste,
    promoTitulo: fila.promo_titulo ?? '',
    promoTexto: fila.promo_texto ?? '',
    promoActiva: fila.promo_activa,
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
      .select('hero_imagen_url, hero_contraste, promo_titulo, promo_texto, promo_activa')
      .eq('cliente_id', clienteId)
      .maybeSingle()

    if (errFetch) {
      setError('No pudimos cargar la configuración de la landing.')
      setCargando(false)
      return
    }
    setConfig(filaAConfig(data as FilaLandingConfig | null))
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
          promo_titulo: nueva.promoTitulo.trim() || null,
          promo_texto: nueva.promoTexto.trim() || null,
          promo_activa: nueva.promoActiva,
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
