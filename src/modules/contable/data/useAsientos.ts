import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useClienteId } from './useClienteId'
import { validarAsiento } from '../lib/partidaDoble'
import type { Asiento, AsientoInput, LineaAsiento, OrigenAsiento } from '../types'

interface AsientoRow {
  id: string
  numero: number
  fecha: string
  descripcion: string
  origen: OrigenAsiento
  origen_id: string | null
  created_at: string
}

interface LineaRow {
  id: string
  asiento_id: string
  cuenta_id: string
  debe: string | number
  haber: string | number
  centro_costo: string | null
  descripcion: string | null
}

function num(v: string | number): number {
  return typeof v === 'number' ? v : parseFloat(v)
}

interface UseAsientosResult {
  asientos: Asiento[]
  cargando: boolean
  error: string | null
  crearAsientoManual: (input: AsientoInput) => Promise<{ error: string | null }>
  crearAsientoDesdeOrigen: (
    input: AsientoInput,
    origen: OrigenAsiento,
    origenId?: string,
  ) => Promise<{ error: string | null; asientoId?: string }>
  eliminarAsiento: (id: string) => Promise<{ error: string | null }>
  recargar: () => Promise<void>
}

/**
 * Asientos (cabecera + líneas). El correlativo `numero` se calcula leyendo
 * el máximo actual del cliente -- no un serial de Postgres, porque tiene
 * que reiniciar por cliente y no por tabla global (ver 0014, comentario en
 * la tabla asientos).
 */
export function useAsientos(): UseAsientosResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()
  const [asientos, setAsientos] = useState<Asiento[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)

    const { data: cabeceras, error: errCab } = await supabase
      .from('asientos')
      .select('id, numero, fecha, descripcion, origen, origen_id, created_at')
      .eq('cliente_id', clienteId)
      .order('numero', { ascending: false })

    if (errCab) {
      setError('No pudimos cargar los asientos.')
      setCargando(false)
      return
    }

    const ids = (cabeceras ?? []).map((c) => c.id)
    let lineasPorAsiento = new Map<string, LineaAsiento[]>()

    if (ids.length > 0) {
      const { data: lineas, error: errLin } = await supabase
        .from('lineas_asiento')
        .select('id, asiento_id, cuenta_id, debe, haber, centro_costo, descripcion')
        .in('asiento_id', ids)

      if (errLin) {
        setError('No pudimos cargar las líneas de los asientos.')
        setCargando(false)
        return
      }

      lineasPorAsiento = new Map()
      for (const l of (lineas ?? []) as LineaRow[]) {
        const arr = lineasPorAsiento.get(l.asiento_id) ?? []
        arr.push({
          id: l.id,
          cuentaId: l.cuenta_id,
          debe: num(l.debe),
          haber: num(l.haber),
          centroCosto: l.centro_costo ?? undefined,
          descripcion: l.descripcion ?? undefined,
        })
        lineasPorAsiento.set(l.asiento_id, arr)
      }
    }

    setError(null)
    setAsientos(
      (cabeceras ?? []).map((c: AsientoRow) => ({
        id: c.id,
        numero: c.numero,
        fecha: c.fecha,
        descripcion: c.descripcion,
        origen: c.origen,
        origenId: c.origen_id ?? undefined,
        createdAt: c.created_at,
        lineas: lineasPorAsiento.get(c.id) ?? [],
      })),
    )
    setCargando(false)
  }, [clienteId])

  useEffect(() => {
    if (cargandoClienteId) return
    if (errorClienteId) {
      setError(errorClienteId)
      setCargando(false)
      return
    }
    recargar()
  }, [cargandoClienteId, errorClienteId, recargar])

  async function crearAsientoDesdeOrigen(input: AsientoInput, origen: OrigenAsiento, origenId?: string) {
    if (!clienteId) return { error: 'No se pudo resolver el cliente.' }

    const validacion = validarAsiento(input.lineas, input.fecha)
    if (!validacion.valido) return { error: validacion.errores.join(' ') }

    const siguienteNumero = asientos.length > 0 ? Math.max(...asientos.map((a) => a.numero)) + 1 : 1

    const { data: asientoIns, error: errAsiento } = await supabase
      .from('asientos')
      .insert({
        cliente_id: clienteId,
        numero: siguienteNumero,
        fecha: input.fecha,
        descripcion: input.descripcion,
        origen,
        origen_id: origenId ?? null,
      })
      .select('id')
      .single()

    if (errAsiento || !asientoIns) return { error: 'No pudimos crear el asiento.' }

    const { error: errLineas } = await supabase.from('lineas_asiento').insert(
      input.lineas.map((l) => ({
        asiento_id: asientoIns.id,
        cuenta_id: l.cuentaId,
        debe: l.debe,
        haber: l.haber,
        centro_costo: l.centroCosto ?? null,
        descripcion: l.descripcion ?? null,
      })),
    )

    if (errLineas) {
      // Revertir la cabecera si fallaron las líneas -- no dejar un asiento
      // "fantasma" sin líneas.
      await supabase.from('asientos').delete().eq('id', asientoIns.id)
      return { error: 'No pudimos guardar las líneas del asiento.' }
    }

    await recargar()
    return { error: null, asientoId: asientoIns.id as string }
  }

  async function crearAsientoManual(input: AsientoInput) {
    const res = await crearAsientoDesdeOrigen(input, 'manual')
    return { error: res.error }
  }

  async function eliminarAsiento(id: string) {
    const { error: errDel } = await supabase.from('asientos').delete().eq('id', id)
    if (errDel) return { error: 'No pudimos eliminar el asiento.' }
    await recargar()
    return { error: null }
  }

  return {
    asientos,
    cargando: cargando || cargandoClienteId,
    error,
    crearAsientoManual,
    crearAsientoDesdeOrigen,
    eliminarAsiento,
    recargar,
  }
}
