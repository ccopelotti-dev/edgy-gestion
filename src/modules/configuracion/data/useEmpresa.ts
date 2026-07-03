import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { DatosEmpresa } from '../types'
import { empresaAFila, filaAEmpresa } from '../lib/mapeo'
import { useClienteId } from './useClienteId'

interface UseEmpresaResult {
  empresa: DatosEmpresa | null
  cargando: boolean
  guardando: boolean
  error: string | null
  guardar: (cambios: Partial<DatosEmpresa>) => Promise<boolean>
}

/**
 * Trae la fila real de edgy_gestion.clientes del usuario logueado —
 * los "datos nativos" cargados en el wizard de onboarding (Paso 1) —
 * y permite editarla. El update pasa por RLS (policy
 * "clientes_update_admin", migración 0009) y por el trigger que
 * protege slug/estado/cuit/tipo_negocio incluso si alguien intenta
 * mandarlos desde acá.
 */
export function useEmpresa(): UseEmpresaResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()
  const [empresa, setEmpresa] = useState<DatosEmpresa | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!clienteId) return
    setCargando(true)
    setError(null)

    const { data, error: errFetch } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', clienteId)
      .single()

    if (errFetch || !data) {
      setError('No pudimos cargar los datos de la empresa.')
      setCargando(false)
      return
    }

    setEmpresa(filaAEmpresa(data))
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
    async (cambios: Partial<DatosEmpresa>) => {
      if (!empresa) return false
      setGuardando(true)
      setError(null)

      const { data, error: errUpdate } = await supabase
        .from('clientes')
        .update(empresaAFila(cambios))
        .eq('id', empresa.id)
        .select()
        .single()

      setGuardando(false)

      if (errUpdate || !data) {
        setError(errUpdate?.message ?? 'No pudimos guardar los cambios.')
        return false
      }

      setEmpresa(filaAEmpresa(data))
      return true
    },
    [empresa],
  )

  return { empresa, cargando: cargando || cargandoClienteId, guardando, error, guardar }
}
