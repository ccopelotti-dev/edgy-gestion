import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { EntidadImportable, ImportacionMasiva } from '../types'
import type { RubroExistente } from '../lib/importCsv'
import { useClienteId } from './useClienteId'

function filaAImportacion(row: any): ImportacionMasiva {
  return {
    id: row.id,
    entidad: row.entidad,
    nombreArchivo: row.nombre_archivo,
    totalFilas: row.total_filas,
    filasValidas: row.filas_validas,
    filasConError: row.filas_con_error,
    estado: row.estado,
    createdAt: row.created_at,
  }
}

const TABLA_POR_ENTIDAD: Record<EntidadImportable, string> = {
  productos: 'productos',
  rubros_producto: 'rubros',
  servicios: 'servicios',
  rubros_servicio: 'rubros_servicio',
}

interface UseImportacionesResult {
  clienteId: string | null
  historial: ImportacionMasiva[]
  rubrosProducto: RubroExistente[]
  subRubrosProducto: { id: string; rubroId: string; nombre: string }[]
  marcasProducto: RubroExistente[]
  rubrosServicio: RubroExistente[]
  subRubrosServicio: { id: string; rubroId: string; nombre: string }[]
  cargando: boolean
  error: string | null
  ejecutarImportacion: (
    entidad: EntidadImportable,
    nombreArchivo: string,
    payloadsValidos: Record<string, unknown>[],
    totalFilas: number,
    filasConError: number,
  ) => Promise<boolean>
  recargar: () => Promise<void>
}

export function useImportaciones(): UseImportacionesResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()
  const [historial, setHistorial] = useState<ImportacionMasiva[]>([])
  const [rubrosProducto, setRubrosProducto] = useState<RubroExistente[]>([])
  const [subRubrosProducto, setSubRubrosProducto] = useState<
    { id: string; rubroId: string; nombre: string }[]
  >([])
  const [marcasProducto, setMarcasProducto] = useState<RubroExistente[]>([])
  const [rubrosServicio, setRubrosServicio] = useState<RubroExistente[]>([])
  const [subRubrosServicio, setSubRubrosServicio] = useState<
    { id: string; rubroId: string; nombre: string }[]
  >([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)

    const [hist, rp, srp, mp, rs, srs] = await Promise.all([
      supabase
        .from('importaciones_masivas')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('rubros').select('id, nombre').eq('cliente_id', clienteId),
      supabase.from('sub_rubros').select('id, rubro_id, nombre').in(
        'rubro_id',
        // sub_rubros no tiene cliente_id propio -- se filtra vía los rubros
        // ya traídos arriba, pero como es una consulta separada, resolvemos
        // con un segundo select acotado a los rubros del cliente.
        (await supabase.from('rubros').select('id').eq('cliente_id', clienteId)).data?.map(
          (r) => r.id,
        ) ?? [],
      ),
      supabase.from('marcas').select('id, nombre').eq('cliente_id', clienteId),
      supabase.from('rubros_servicio').select('id, nombre').eq('cliente_id', clienteId),
      supabase.from('sub_rubros_servicio').select('id, rubro_id, nombre').in(
        'rubro_id',
        (await supabase.from('rubros_servicio').select('id').eq('cliente_id', clienteId)).data?.map(
          (r) => r.id,
        ) ?? [],
      ),
    ])

    setHistorial((hist.data ?? []).map(filaAImportacion))
    setRubrosProducto(rp.data ?? [])
    setSubRubrosProducto((srp.data ?? []).map((s: any) => ({ id: s.id, rubroId: s.rubro_id, nombre: s.nombre })))
    setMarcasProducto(mp.data ?? [])
    setRubrosServicio(rs.data ?? [])
    setSubRubrosServicio((srs.data ?? []).map((s: any) => ({ id: s.id, rubroId: s.rubro_id, nombre: s.nombre })))
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

  const ejecutarImportacion = useCallback(
    async (
      entidad: EntidadImportable,
      nombreArchivo: string,
      payloadsValidos: Record<string, unknown>[],
      totalFilas: number,
      filasConError: number,
    ) => {
      if (!clienteId) return false
      setError(null)

      const tabla = TABLA_POR_ENTIDAD[entidad]
      const filas = payloadsValidos.map((p) => ({ ...p, cliente_id: clienteId }))

      if (filas.length > 0) {
        const { error: errInsert } = await supabase.from(tabla).insert(filas)
        if (errInsert) {
          setError(`No pudimos completar la importación: ${errInsert.message}`)
          return false
        }
      }

      const estado = filasConError > 0 ? 'con_errores' : 'completada'
      await supabase.from('importaciones_masivas').insert({
        cliente_id: clienteId,
        entidad,
        nombre_archivo: nombreArchivo,
        total_filas: totalFilas,
        filas_validas: payloadsValidos.length,
        filas_con_error: filasConError,
        estado,
      })

      await cargar()
      return true
    },
    [clienteId, cargar],
  )

  return {
    clienteId,
    historial,
    rubrosProducto,
    subRubrosProducto,
    marcasProducto,
    rubrosServicio,
    subRubrosServicio,
    cargando: cargando || cargandoClienteId,
    error,
    ejecutarImportacion,
    recargar: cargar,
  }
}
