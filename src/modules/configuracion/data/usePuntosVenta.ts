import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { PuntoVenta } from '../types'
import { filaAPuntoVenta } from '../lib/mapeo'

interface NuevoPuntoVenta {
  alias: string
  numero: string | null
  direccion: string | null
  paraIntegraciones: boolean
  /** Fase 27d-2: identificador público para el link propio del Menú
   * público de este local (`/menu/<slug cliente>/<este slug>`). */
  slug: string | null
}

interface UsePuntosVentaResult {
  puntosVenta: PuntoVenta[]
  cargando: boolean
  error: string | null
  crear: (datos: NuevoPuntoVenta) => Promise<boolean>
  marcarPorDefecto: (id: string) => Promise<boolean>
  darDeBaja: (id: string) => Promise<boolean>
  /** Fase 27d-2: para puntos de venta creados antes de esta fase, que
   * todavía no tienen slug -- permite cargarlo/editarlo después sin
   * tener que recrear el punto de venta. */
  actualizarSlug: (id: string, slug: string | null) => Promise<boolean>
  /** Fase 36: branding propio del local (logo/nombre visible/color).
   * Cualquier campo en null borra el override y ese local vuelve a
   * usar el branding del cliente. */
  actualizarBranding: (
    id: string,
    datos: { logoUrl?: string | null; nombreVisible?: string | null; colorMarca?: string | null },
  ) => Promise<boolean>
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
        slug: datos.slug || null,
      })

      if (errInsert) {
        setError(
          errInsert.code === '23505'
            ? 'Ya existe un punto de venta con ese número o identificador de link.'
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

  const actualizarSlug = useCallback(
    async (id: string, slug: string | null) => {
      setError(null)
      const { error: errUpdate } = await supabase
        .from('puntos_venta')
        .update({ slug: slug || null })
        .eq('id', id)

      if (errUpdate) {
        setError(
          errUpdate.code === '23505'
            ? 'Ya hay otro local usando ese identificador de link.'
            : 'No pudimos actualizar el identificador del link.',
        )
        return false
      }

      await cargar()
      return true
    },
    [cargar],
  )

  const actualizarBranding = useCallback(
    async (
      id: string,
      datos: { logoUrl?: string | null; nombreVisible?: string | null; colorMarca?: string | null },
    ) => {
      setError(null)
      const patch: Record<string, string | null> = {}
      if ('logoUrl' in datos) patch.logo_url = datos.logoUrl ?? null
      if ('nombreVisible' in datos) patch.nombre_visible = datos.nombreVisible ?? null
      if ('colorMarca' in datos) patch.color_marca = datos.colorMarca ?? null

      // Ojo -- sin .select(), Postgrest devuelve "sin error" aunque RLS
      // haya bloqueado la fila y no se haya tocado nada (0 filas
      // afectadas no es un error para Postgrest). Con .select() se ve
      // si realmente hubo una fila devuelta, así se puede distinguir un
      // guardado real de uno que la política de seguridad frenó en
      // silencio (ej. alguien sin permiso de admin del cliente).
      const { data: filaActualizada, error: errUpdate } = await supabase
        .from('puntos_venta')
        .update(patch)
        .eq('id', id)
        .select('id')

      if (errUpdate) {
        setError('No pudimos actualizar el branding del local.')
        return false
      }

      if (!filaActualizada || filaActualizada.length === 0) {
        setError('No tenés permiso para editar este local, o la fila no existe.')
        return false
      }

      await cargar()
      return true
    },
    [cargar],
  )

  return {
    puntosVenta,
    cargando,
    error,
    crear,
    marcarPorDefecto,
    darDeBaja,
    actualizarSlug,
    actualizarBranding,
  }
}
