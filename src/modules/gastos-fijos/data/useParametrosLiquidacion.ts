import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AlicuotasLiquidacion } from '../types'
import { useClienteId } from './useClienteId'

const DEFAULT_ALICUOTAS: AlicuotasLiquidacion = {
  jubilacion_empleado: 11,
  ley19032_empleado: 3,
  obra_social_empleado: 3,
  sindical_empleado: 0.5,
  seguro_vida_monto: 0,
  sipa_patronal: 20.4,
  fondo_nacional_empleo_patronal: 0.89,
  asignaciones_familiares_patronal: 4.44,
  obra_social_patronal: 6,
  art_alicuota: 0,
  art_monto_fijo: 0,
  sindical_patronal: 0,
  camara_patronal: 0,
}

interface UseParametrosLiquidacionResult {
  alicuotas: AlicuotasLiquidacion
  cargando: boolean
  error: string | null
  guardar: (nuevas: AlicuotasLiquidacion) => Promise<boolean>
}

/** Trae (o crea con defaults) la fila de parametros_liquidacion del
 * cliente -- son los porcentajes/importes que arman el recibo, y
 * quedan editables desde la propia pantalla de Sueldos (no requieren
 * deploy de código para ajustarse a un cambio de paritaria/ART). */
export function useParametrosLiquidacion(): UseParametrosLiquidacionResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()
  const [alicuotas, setAlicuotas] = useState<AlicuotasLiquidacion>(DEFAULT_ALICUOTAS)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)

    const { data, error: errFetch } = await supabase
      .from('parametros_liquidacion')
      .select('alicuotas')
      .eq('cliente_id', clienteId)
      .maybeSingle()

    if (errFetch) {
      setError('No pudimos cargar los parámetros de liquidación.')
      setCargando(false)
      return
    }

    setAlicuotas(data ? { ...DEFAULT_ALICUOTAS, ...(data.alicuotas as Partial<AlicuotasLiquidacion>) } : DEFAULT_ALICUOTAS)
    setCargando(false)
  }, [clienteId])

  useEffect(() => {
    if (cargandoClienteId) return
    if (errorClienteId) {
      setError(errorClienteId)
      setCargando(false)
      return
    }
    cargar()
  }, [cargandoClienteId, errorClienteId, cargar])

  const guardar = useCallback(
    async (nuevas: AlicuotasLiquidacion) => {
      if (!clienteId) return false
      setError(null)

      const { error: errUpsert } = await supabase
        .from('parametros_liquidacion')
        .upsert({ cliente_id: clienteId, alicuotas: nuevas, updated_at: new Date().toISOString() })

      if (errUpsert) {
        setError('No pudimos guardar los parámetros.')
        return false
      }

      setAlicuotas(nuevas)
      return true
    },
    [clienteId],
  )

  return { alicuotas, cargando: cargando || cargandoClienteId, error, guardar }
}
