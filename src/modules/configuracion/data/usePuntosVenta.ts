import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { PuntoVenta } from '../types'
import { filaAPuntoVenta } from '../lib/mapeo'

interface NuevoPuntoVenta {
  alias: string
  numero: string | null
  direccion: string | null
  paraIntegraciones: boolean
}

interface UsePuntosVentaResult {
  puntosVenta: PuntoVenta[]
  cargando: boolean
  error: string | null
  crear: (datos: NuevoPuntoVenta) => Promise<boolean>
  marcarPorDefecto: (id: string) => Promise<boolean>
  darDeBaja: (id: string) => Promise<boolean>
}

export function usePuntosVenta(clienteId: string | null): UsePuntosVentaResult {
  const [puntosVenta, setPuntosVenta] = useState<PuntoVenta[]>([])
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
      .from('puntos_venta')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: true })

    if (errFetch) {
      setError('No pudimos cargar los puntos de venta.')
      setCargando(false)
      return
    }

    setPuntosVenta((data ?? []).map(filaAPuntoVenta))
    setCargando(false)
  }, [clienteId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const crear = useCallback(
    async (datos: NuevoPuntoVenta) => {
      if (!clienteId) return false
      setError(null)

      const { error: errInsert } = await supabase.from('puntos_venta').insert({
        cliente_id: clienteId,
        alias: datos.alias,
        numero: datos.numero || null,
        direccion: datos.direccion || null,
        para_integraciones: datos.paraIntegraciones,
      })

      if (errInsert) {
        setError(
          errInsert.code === '23505'
            ? 'Ya existe un punto de venta con ese número.'
            : 'No pudimos crear el punto de venta.',
        )
        return false
      }

      await cargar()
      return true
    },
    [clienteId, cargar],
  )

  // "Por defecto" es todo-o-nada: bajamos el flag de los demás y lo
  // subimos en el elegido, en dos pasos desde el cliente (no hay
  // trigger en la base para esto todavía).
  const marcarPorDefecto = useCallback(
    async (id: string) => {
      if (!clienteId) return false
      setError(null)

      const { error: errClear } = await supabase
        .from('puntos_venta')
        .update({ por_defecto: false })
        .eq('cliente_id', clienteId)

      if (errClear) {
        setError('No pudimos actualizar el punto de venta por defecto.')
        return false
      }

      const { error: errSet } = await supabase
        .from('puntos_venta')
        .update({ por_defecto: true })
        .eq('id', id)

      if (errSet) {
        setError('No pudimos actualizar el punto de venta por defecto.')
        return false
      }

      await cargar()
      return true
    },
    [clienteId, cargar],
  )

  const darDeBaja = useCallback(
    async (id: string) => {
      setError(null)
      const { error: errUpdate } = await supabase
        .from('puntos_venta')
        .update({ activo: false, fecha_baja: new Date().toISOString() })
        .eq('id', id)

      if (errUpdate) {
        setError('No pudimos dar de baja el punto de venta.')
        return false
      }

      await cargar()
      return true
    },
    [cargar],
  )

  return { puntosVenta, cargando, error, crear, marcarPorDefecto, darDeBaja }
}
