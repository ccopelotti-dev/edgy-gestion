import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useClienteId } from './useClienteId'
import { formatARS } from '../lib/format'
import type { DefinicionReporte, FiltrosInventario, ResultadoReporte } from '../types'

// Reportes de Inventario: ÚNICA categoría de este módulo con datos reales,
// porque Productos, Rubros (de Productos y de Servicios) y Servicios son
// las únicas entidades con tabla propia en Supabase hoy (ver 0008/0010/0011).
// Se consulta directo -- no existe forma de leer el estado local (Context +
// localStorage) del módulo Productos y Stock desde acá.

export const DEFINICIONES_INVENTARIO: DefinicionReporte[] = [
  {
    id: 'stock-actual',
    nombre: 'Stock actual',
    categoria: 'inventario',
    descripcion: 'Todos los productos con su stock, rubro y estado.',
    datosReales: true,
  },
  {
    id: 'stock-bajo',
    nombre: 'Stock bajo mínimo',
    categoria: 'inventario',
    descripcion: 'Productos cuyo stock actual está en o por debajo del mínimo.',
    datosReales: true,
  },
  {
    id: 'valorizacion',
    nombre: 'Valorización de inventario',
    categoria: 'inventario',
    descripcion: 'Valor del stock a costo (stock × costo), con total general.',
    datosReales: true,
  },
  {
    id: 'servicios-por-rubro',
    nombre: 'Servicios por rubro',
    categoria: 'inventario',
    descripcion: 'Catálogo de servicios con su rubro, tipo y modalidad de precio.',
    datosReales: true,
  },
]

interface ProductoRow {
  id: string
  nombre: string
  rubro_id: string | null
  sub_rubro_id: string | null
  stock: number
  stock_minimo: number
  costo: number
  estado: string
}

interface ServicioRow {
  id: string
  titulo: string
  rubro_id: string
  sub_rubro_id: string | null
  tipo: string
  modalidad_precio: string | null
  precio: number | null
  estado: string
}

interface UseReportesInventarioResult {
  cargando: boolean
  error: string | null
  rubrosProducto: { id: string; nombre: string }[]
  rubrosServicio: { id: string; nombre: string }[]
  generar: (reporteId: string, filtros: FiltrosInventario) => ResultadoReporte
}

export function useReportesInventario(): UseReportesInventarioResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()

  const [productos, setProductos] = useState<ProductoRow[]>([])
  const [rubros, setRubros] = useState<{ id: string; nombre: string }[]>([])
  const [subRubros, setSubRubros] = useState<{ id: string; nombre: string }[]>([])
  const [servicios, setServicios] = useState<ServicioRow[]>([])
  const [rubrosServicio, setRubrosServicio] = useState<{ id: string; nombre: string }[]>([])
  const [subRubrosServicio, setSubRubrosServicio] = useState<{ id: string; nombre: string }[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)

    const [p, r, sr, s, rs] = await Promise.all([
      supabase
        .from('productos')
        .select('id, nombre, rubro_id, sub_rubro_id, stock, stock_minimo, costo, estado')
        .eq('cliente_id', clienteId),
      supabase.from('rubros').select('id, nombre').eq('cliente_id', clienteId),
      supabase.from('sub_rubros').select('id, nombre, rubro_id'),
      supabase
        .from('servicios')
        .select('id, titulo, rubro_id, sub_rubro_id, tipo, modalidad_precio, precio, estado')
        .eq('cliente_id', clienteId),
      supabase.from('rubros_servicio').select('id, nombre').eq('cliente_id', clienteId),
    ])

    if (p.error || r.error || s.error || rs.error) {
      setError('No pudimos cargar los datos para los reportes.')
      setCargando(false)
      return
    }

    const rubroIds = (r.data ?? []).map((x) => x.id)
    const subRubrosDelCliente = (sr.data ?? []).filter((x) => rubroIds.includes(x.rubro_id))

    const rubroServicioIds = (rs.data ?? []).map((x) => x.id)
    const { data: subRubrosServicioData } = await supabase
      .from('sub_rubros_servicio')
      .select('id, nombre, rubro_id')
    const subRubrosServicioDelCliente = (subRubrosServicioData ?? []).filter((x) =>
      rubroServicioIds.includes(x.rubro_id),
    )

    setProductos(p.data ?? [])
    setRubros(r.data ?? [])
    setSubRubros(subRubrosDelCliente)
    setServicios(s.data ?? [])
    setRubrosServicio(rs.data ?? [])
    setSubRubrosServicio(subRubrosServicioDelCliente)
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

  const rubrosMap = useMemo(() => new Map(rubros.map((r) => [r.id, r.nombre])), [rubros])
  const subRubrosMap = useMemo(() => new Map(subRubros.map((s) => [s.id, s.nombre])), [subRubros])
  const rubrosServicioMap = useMemo(
    () => new Map(rubrosServicio.map((r) => [r.id, r.nombre])),
    [rubrosServicio],
  )
  const subRubrosServicioMap = useMemo(
    () => new Map(subRubrosServicio.map((s) => [s.id, s.nombre])),
    [subRubrosServicio],
  )

  const generar = useCallback(
    (reporteId: string, filtros: FiltrosInventario): ResultadoReporte => {
      const busqueda = filtros.busqueda?.trim().toLowerCase()

      if (reporteId === 'stock-actual' || reporteId === 'stock-bajo') {
        let lista = productos
        if (reporteId === 'stock-bajo') {
          lista = lista.filter((p) => p.stock <= p.stock_minimo)
        }
        if (filtros.rubroId) lista = lista.filter((p) => p.rubro_id === filtros.rubroId)
        if (busqueda) lista = lista.filter((p) => p.nombre.toLowerCase().includes(busqueda))

        return {
          columnas: ['Producto', 'Rubro', 'Sub-rubro', 'Stock', 'Stock Mínimo', 'Estado'],
          filas: lista.map((p) => ({
            Producto: p.nombre,
            Rubro: (p.rubro_id && rubrosMap.get(p.rubro_id)) || 'Sin rubro',
            'Sub-rubro': (p.sub_rubro_id && subRubrosMap.get(p.sub_rubro_id)) || '-',
            Stock: p.stock,
            'Stock Mínimo': p.stock_minimo,
            Estado: p.estado,
          })),
        }
      }

      if (reporteId === 'valorizacion') {
        let lista = productos
        if (filtros.rubroId) lista = lista.filter((p) => p.rubro_id === filtros.rubroId)
        if (busqueda) lista = lista.filter((p) => p.nombre.toLowerCase().includes(busqueda))

        const filas = lista.map((p) => ({
          Producto: p.nombre,
          Rubro: (p.rubro_id && rubrosMap.get(p.rubro_id)) || 'Sin rubro',
          Stock: p.stock,
          Costo: formatARS(p.costo),
          Valor: formatARS(p.stock * p.costo),
        }))

        const total = lista.reduce((sum, p) => sum + p.stock * p.costo, 0)
        filas.push({ Producto: 'TOTAL', Rubro: '', Stock: '' as unknown as number, Costo: '', Valor: formatARS(total) })

        return { columnas: ['Producto', 'Rubro', 'Stock', 'Costo', 'Valor'], filas }
      }

      if (reporteId === 'servicios-por-rubro') {
        let lista = servicios
        if (filtros.rubroId) lista = lista.filter((s) => s.rubro_id === filtros.rubroId)
        if (busqueda) lista = lista.filter((s) => s.titulo.toLowerCase().includes(busqueda))

        return {
          columnas: ['Servicio', 'Rubro', 'Sub-rubro', 'Tipo', 'Modalidad', 'Precio', 'Estado'],
          filas: lista.map((s) => ({
            Servicio: s.titulo,
            Rubro: rubrosServicioMap.get(s.rubro_id) || 'Sin rubro',
            'Sub-rubro': (s.sub_rubro_id && subRubrosServicioMap.get(s.sub_rubro_id)) || '-',
            Tipo: s.tipo === 'con_variantes' ? 'Con variantes' : 'Único',
            Modalidad: s.modalidad_precio ?? '-',
            Precio: s.precio != null ? formatARS(s.precio) : 'A convenir',
            Estado: s.estado,
          })),
        }
      }

      return { columnas: [], filas: [] }
    },
    [productos, servicios, rubrosMap, subRubrosMap, rubrosServicioMap, subRubrosServicioMap],
  )

  return {
    cargando: cargando || cargandoClienteId,
    error,
    rubrosProducto: rubros,
    rubrosServicio,
    generar,
  }
}
