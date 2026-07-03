import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useClienteId } from './useClienteId'
import type { AsientoModelo, LineaAsientoModelo } from '../types'

interface ModeloRow {
  id: string
  nombre: string
  descripcion: string
  created_at: string
}

interface LineaModeloRow {
  id: string
  asiento_modelo_id: string
  cuenta_id: string
  debe: string | number
  haber: string | number
  descripcion: string | null
}

function num(v: string | number): number {
  return typeof v === 'number' ? v : parseFloat(v)
}

export interface LineaModeloInput {
  cuentaId: string
  debe: number
  haber: number
  descripcion?: string
}

export interface ModeloInput {
  nombre: string
  descripcion: string
  lineas: LineaModeloInput[]
}

interface UseAsientosModeloResult {
  modelos: AsientoModelo[]
  cargando: boolean
  error: string | null
  crear: (input: ModeloInput) => Promise<{ error: string | null }>
  actualizar: (id: string, input: ModeloInput) => Promise<{ error: string | null }>
  eliminar: (id: string) => Promise<{ error: string | null }>
  recargar: () => Promise<void>
}

/** Plantillas de asiento reutilizables (ej. alquiler mensual) -- guardan
 * líneas con montos fijos o en 0 (a completar al aplicar). No generan
 * asientos por sí solas: "aplicar" un modelo es tomar sus líneas como punto
 * de partida de un asiento nuevo vía useAsientos().crearAsientoDesdeOrigen. */
export function useAsientosModelo(): UseAsientosModeloResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()
  const [modelos, setModelos] = useState<AsientoModelo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)

    const { data: cabeceras, error: errCab } = await supabase
      .from('asientos_modelo')
      .select('id, nombre, descripcion, created_at')
      .eq('cliente_id', clienteId)
      .order('nombre')

    if (errCab) {
      setError('No pudimos cargar los modelos de asiento.')
      setCargando(false)
      return
    }

    const ids = (cabeceras ?? []).map((c) => c.id)
    let lineasPorModelo = new Map<string, LineaAsientoModelo[]>()

    if (ids.length > 0) {
      const { data: lineas, error: errLin } = await supabase
        .from('lineas_asiento_modelo')
        .select('id, asiento_modelo_id, cuenta_id, debe, haber, descripcion')
        .in('asiento_modelo_id', ids)

      if (!errLin) {
        lineasPorModelo = new Map()
        for (const l of (lineas ?? []) as LineaModeloRow[]) {
          const arr = lineasPorModelo.get(l.asiento_modelo_id) ?? []
          arr.push({
            id: l.id,
            cuentaId: l.cuenta_id,
            debe: num(l.debe),
            haber: num(l.haber),
            descripcion: l.descripcion ?? undefined,
          })
          lineasPorModelo.set(l.asiento_modelo_id, arr)
        }
      }
    }

    setError(null)
    setModelos(
      (cabeceras ?? []).map((c: ModeloRow) => ({
        id: c.id,
        nombre: c.nombre,
        descripcion: c.descripcion,
        createdAt: c.created_at,
        lineas: lineasPorModelo.get(c.id) ?? [],
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

  async function crear(input: ModeloInput) {
    if (!clienteId) return { error: 'No se pudo resolver el cliente.' }
    if (input.lineas.length < 2) return { error: 'Un modelo necesita al menos 2 líneas.' }

    const { data: modeloIns, error: errModelo } = await supabase
      .from('asientos_modelo')
      .insert({ cliente_id: clienteId, nombre: input.nombre, descripcion: input.descripcion })
      .select('id')
      .single()

    if (errModelo || !modeloIns) return { error: 'No pudimos crear el modelo.' }

    const { error: errLineas } = await supabase.from('lineas_asiento_modelo').insert(
      input.lineas.map((l) => ({
        asiento_modelo_id: modeloIns.id,
        cuenta_id: l.cuentaId,
        debe: l.debe,
        haber: l.haber,
        descripcion: l.descripcion ?? null,
      })),
    )

    if (errLineas) {
      await supabase.from('asientos_modelo').delete().eq('id', modeloIns.id)
      return { error: 'No pudimos guardar las líneas del modelo.' }
    }

    await recargar()
    return { error: null }
  }

  async function actualizar(id: string, input: ModeloInput) {
    const { error: errUpd } = await supabase
      .from('asientos_modelo')
      .update({ nombre: input.nombre, descripcion: input.descripcion })
      .eq('id', id)
    if (errUpd) return { error: 'No pudimos actualizar el modelo.' }

    await supabase.from('lineas_asiento_modelo').delete().eq('asiento_modelo_id', id)
    const { error: errLineas } = await supabase.from('lineas_asiento_modelo').insert(
      input.lineas.map((l) => ({
        asiento_modelo_id: id,
        cuenta_id: l.cuentaId,
        debe: l.debe,
        haber: l.haber,
        descripcion: l.descripcion ?? null,
      })),
    )
    if (errLineas) return { error: 'No pudimos actualizar las líneas del modelo.' }

    await recargar()
    return { error: null }
  }

  async function eliminar(id: string) {
    const { error: errDel } = await supabase.from('asientos_modelo').delete().eq('id', id)
    if (errDel) return { error: 'No pudimos eliminar el modelo.' }
    await recargar()
    return { error: null }
  }

  return { modelos, cargando: cargando || cargandoClienteId, error, crear, actualizar, eliminar, recargar }
}
