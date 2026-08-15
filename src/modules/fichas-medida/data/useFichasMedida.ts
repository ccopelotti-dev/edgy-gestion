import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { EstadoFicha, FichaMedida, ItemFichaMedida, TipoFicha } from '../types'
import { useClienteId } from './useClienteId'

// Nested select vía PostgREST: trae ficha + cliente (clientes_venta) +
// items + paños en una sola consulta. Volumen chico por diseño (fichas de
// un negocio a medida, no miles de filas), así que no hace falta paginar
// ni separar el detalle en una consulta aparte.
const SELECT_FICHA = `
  *,
  clientes_venta(nombre, telefono, direccion),
  ficha_medida_items(*, ficha_medida_panos(*))
`

function filaAFicha(row: any): FichaMedida {
  const cv = row.clientes_venta ?? {}
  const items: ItemFichaMedida[] = (row.ficha_medida_items ?? [])
    .slice()
    .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((it: any) => ({
      id: it.id,
      producto: it.producto,
      tela: it.tela ?? undefined,
      cantidad: Number(it.cantidad),
      medida: it.medida ?? undefined,
      peso: it.peso ?? undefined,
      incluyeBarral: it.incluye_barral ?? undefined,
      tipoBarral: it.tipo_barral ?? undefined,
      tipoCortina: it.tipo_cortina ?? undefined,
      notas: it.notas ?? undefined,
      panos: (it.ficha_medida_panos ?? [])
        .slice()
        .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
        .map((p: any) => ({
          id: p.id,
          ancho: p.ancho !== null ? Number(p.ancho) : null,
          alto: p.alto !== null ? Number(p.alto) : null,
        })),
    }))

  return {
    id: row.id,
    clienteVentaId: row.cliente_venta_id,
    clienteNombre: cv.nombre ?? 'Cliente',
    clienteTelefono: cv.telefono ?? undefined,
    clienteDireccion: cv.direccion ?? undefined,
    tipo: row.tipo as TipoFicha,
    estado: row.estado as EstadoFicha,
    fechaPedido: row.fecha_pedido,
    fechaEntrega: row.fecha_entrega ?? undefined,
    sena: Number(row.sena),
    total: Number(row.total),
    notas: row.notas ?? undefined,
    presupuestoId: row.presupuesto_id ?? undefined,
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface NuevaFichaMedida {
  clienteVentaId: string
  tipo: TipoFicha
  estado: EstadoFicha
  fechaPedido: string
  fechaEntrega?: string
  sena: number
  total: number
  notas?: string
  items: Omit<ItemFichaMedida, 'id'>[]
}

interface UseFichasMedidaResult {
  clienteId: string | null
  fichas: FichaMedida[]
  cargando: boolean
  error: string | null
  crear: (data: NuevaFichaMedida) => Promise<string | null>
  actualizar: (fichaId: string, data: NuevaFichaMedida) => Promise<boolean>
  cambiarEstado: (fichaId: string, estado: EstadoFicha) => Promise<boolean>
  marcarConvertida: (fichaId: string, presupuestoId: string) => Promise<boolean>
  eliminar: (fichaId: string) => Promise<boolean>
  recargar: () => Promise<void>
}

export function useFichasMedida(): UseFichasMedidaResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()
  const [fichas, setFichas] = useState<FichaMedida[]>([])
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
      .from('fichas_medida')
      .select(SELECT_FICHA)
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })

    if (errFetch) {
      setError('No pudimos cargar las fichas de medida.')
      setCargando(false)
      return
    }

    setFichas((data ?? []).map(filaAFicha))
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

  // Inserta ítems (y sus paños) de una ficha ya creada -- secuencial, uno
  // por uno: cada INSERT depende de que el padre (ficha o ítem) ya esté
  // commiteado, porque las policies de RLS de las tablas hijas resuelven
  // vía EXISTS contra el padre (ver migración 0082). Insertar todo junto
  // en paralelo dispara una carrera real: el hijo puede llegar a Postgres
  // antes de que el padre sea visible todavía, y el EXISTS del RLS falla.
  // Mismo criterio ya usado en Ventas (ver comentario "carrera RLS" en
  // ventas/data/store.tsx, ADD_PRESUPUESTO/ADD_ORDEN).
  async function insertarItems(fichaId: string, items: Omit<ItemFichaMedida, 'id'>[]) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const itemId = crypto.randomUUID()
      const { error: errItem } = await supabase.from('ficha_medida_items').insert({
        id: itemId,
        ficha_id: fichaId,
        producto: it.producto,
        tela: it.tela || null,
        cantidad: it.cantidad,
        medida: it.medida || null,
        peso: it.peso || null,
        incluye_barral: it.incluyeBarral ?? null,
        tipo_barral: it.tipoBarral || null,
        tipo_cortina: it.tipoCortina || null,
        notas: it.notas || null,
        orden: i,
      })
      if (errItem) {
        setError('La ficha se guardó, pero un ítem no se pudo cargar.')
        continue
      }
      if (it.panos.length > 0) {
        const filasPanos = it.panos.map((p, j) => ({
          id: crypto.randomUUID(),
          item_id: itemId,
          ancho: p.ancho,
          alto: p.alto,
          orden: j,
        }))
        const { error: errPanos } = await supabase.from('ficha_medida_panos').insert(filasPanos)
        if (errPanos) setError('La ficha se guardó, pero algunas medidas no se pudieron cargar.')
      }
    }
  }

  const crear = useCallback(
    async (data: NuevaFichaMedida) => {
      if (!clienteId) return null
      setError(null)
      const fichaId = crypto.randomUUID()

      const { error: errFicha } = await supabase.from('fichas_medida').insert({
        id: fichaId,
        cliente_id: clienteId,
        cliente_venta_id: data.clienteVentaId,
        tipo: data.tipo,
        estado: data.estado,
        fecha_pedido: data.fechaPedido,
        fecha_entrega: data.fechaEntrega || null,
        sena: data.sena,
        total: data.total,
        notas: data.notas || null,
      })

      if (errFicha) {
        setError('No pudimos guardar la ficha.')
        return null
      }

      await insertarItems(fichaId, data.items)
      await cargar()
      return fichaId
    },
    [clienteId, cargar],
  )

  const actualizar = useCallback(
    async (fichaId: string, data: NuevaFichaMedida) => {
      setError(null)
      const { error: errFicha } = await supabase
        .from('fichas_medida')
        .update({
          cliente_venta_id: data.clienteVentaId,
          tipo: data.tipo,
          estado: data.estado,
          fecha_pedido: data.fechaPedido,
          fecha_entrega: data.fechaEntrega || null,
          sena: data.sena,
          total: data.total,
          notas: data.notas || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fichaId)

      if (errFicha) {
        setError('No pudimos actualizar la ficha.')
        return false
      }

      // Full-replace de ítems -- más simple y confiable que diffear filas
      // (borra en cascada los paños de cada ítem eliminado).
      const { error: errDelete } = await supabase.from('ficha_medida_items').delete().eq('ficha_id', fichaId)
      if (errDelete) {
        setError('No pudimos actualizar los ítems de la ficha.')
        return false
      }

      await insertarItems(fichaId, data.items)
      await cargar()
      return true
    },
    [cargar],
  )

  const cambiarEstado = useCallback(
    async (fichaId: string, estado: EstadoFicha) => {
      setError(null)
      const { error: errUpdate } = await supabase
        .from('fichas_medida')
        .update({ estado, updated_at: new Date().toISOString() })
        .eq('id', fichaId)

      if (errUpdate) {
        setError('No pudimos actualizar el estado de la ficha.')
        return false
      }
      await cargar()
      return true
    },
    [cargar],
  )

  const marcarConvertida = useCallback(
    async (fichaId: string, presupuestoId: string) => {
      setError(null)
      const { error: errUpdate } = await supabase
        .from('fichas_medida')
        .update({ estado: 'convertida', presupuesto_id: presupuestoId, updated_at: new Date().toISOString() })
        .eq('id', fichaId)

      if (errUpdate) {
        setError('No pudimos vincular la ficha con el presupuesto.')
        return false
      }
      await cargar()
      return true
    },
    [cargar],
  )

  const eliminar = useCallback(
    async (fichaId: string) => {
      setError(null)
      const { error: errDelete } = await supabase.from('fichas_medida').delete().eq('id', fichaId)

      if (errDelete) {
        setError('No pudimos eliminar la ficha.')
        return false
      }
      await cargar()
      return true
    },
    [cargar],
  )

  return {
    clienteId,
    fichas,
    cargando: cargando || cargandoClienteId,
    error,
    crear,
    actualizar,
    cambiarEstado,
    marcarConvertida,
    eliminar,
    recargar: cargar,
  }
}
