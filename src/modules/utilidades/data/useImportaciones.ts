import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { EntidadImportable, ImportacionMasiva } from '../types'
import type { ItemExistenteDedup, RubroExistente } from '../lib/importCsv'
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
  // Punto 5 (audit Fase 34+): catálogo existente para chequeo de
  // nombre/código duplicado antes de insertar en la carga masiva.
  productosExistentes: ItemExistenteDedup[]
  serviciosExistentes: ItemExistenteDedup[]
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
  // Punto 5 (audit Fase 34+): catálogo existente para dedup pre-insert.
  const [productosExistentes, setProductosExistentes] = useState<ItemExistenteDedup[]>([])
  const [serviciosExistentes, setServiciosExistentes] = useState<ItemExistenteDedup[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)

    const [hist, rp, srp, mp, rs, srs, prod, serv] = await Promise.all([
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
      // Punto 5: nombre + código de TODOS los productos/servicios del
      // cliente, para chequear duplicados antes de insertar por carga
      // masiva (evita repetir la clase de bug que generó los 74 insumos
      // huérfanos de Punto Tex -- ver auditoría Fase 34+).
      supabase.from('productos').select('nombre, codigo').eq('cliente_id', clienteId),
      supabase.from('servicios').select('titulo').eq('cliente_id', clienteId),
    ])

    setHistorial((hist.data ?? []).map(filaAImportacion))
    setRubrosProducto(rp.data ?? [])
    setSubRubrosProducto((srp.data ?? []).map((s: any) => ({ id: s.id, rubroId: s.rubro_id, nombre: s.nombre })))
    setMarcasProducto(mp.data ?? [])
    setRubrosServicio(rs.data ?? [])
    setSubRubrosServicio((srs.data ?? []).map((s: any) => ({ id: s.id, rubroId: s.rubro_id, nombre: s.nombre })))
    setProductosExistentes(
      (prod.data ?? []).map((p: any) => ({ nombre: p.nombre, codigo: p.codigo })),
    )
    setServiciosExistentes((serv.data ?? []).map((s: any) => ({ nombre: s.titulo })))
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
    productosExistentes,
    serviciosExistentes,
    cargando: cargando || cargandoClienteId,
    error,
    ejecutarImportacion,
    recargar: cargar,
  }
}
