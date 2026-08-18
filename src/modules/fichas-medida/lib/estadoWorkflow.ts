// Fase 41.1 ("vericuetos"): estado de workflow por ficha, derivado en vivo
// de Presupuestos (Ventas) y Producciones (Productos y stock) -- SIN
// columna de estado propia acá, mismo criterio que
// fetchPedidosAMedidaPendientes (productos-stock/data/store.tsx): el
// listado de Fichas no tiene Context/reducer propio (habla directo con
// Supabase, como generarPresupuesto.ts), así que esta consulta vive acá
// en vez de en el store de otro módulo.
//
// Objetivo (pedido de Carlos): que el operador vea, sin salir de Fichas de
// medida, en qué paso del circuito está cada ficha -- Presupuesto
// (borrador/enviado/aprobado/...) y Producción (cuántos de los ítems a
// medida ya se produjeron) -- sin tener que ir a googlear entre módulos.

import { supabase } from '@/lib/supabase'
import type { FichaMedida } from '../types'
import type { EstadoPresupuesto } from '@/modules/ventas/types'

export interface EstadoWorkflowFicha {
  presupuestoEstado?: EstadoPresupuesto
  /** Cantidad de ítems de la ficha vinculados a un Producto a medida
   * (candidatos a pasar por Producción). 0 si la ficha no tiene ningún
   * ítem vinculado -- en ese caso no se muestra badge de Producción. */
  itemsAMedidaTotal: number
  itemsAMedidaProducidos: number
  /** itemId del primer ítem a medida todavía sin producir -- usado para el
   * atajo "Ir a Producción" (deep link con ?pedido=<itemId>, ver
   * Listado.tsx / Produccion.tsx). undefined si ya está todo producido. */
  primerItemPendienteId?: string
}

export async function fetchEstadosWorkflow(
  fichas: FichaMedida[],
): Promise<Map<string, EstadoWorkflowFicha>> {
  const resultado = new Map<string, EstadoWorkflowFicha>()
  if (fichas.length === 0) return resultado

  const presupuestoIds = Array.from(
    new Set(fichas.map((f) => f.presupuestoId).filter((id): id is string => Boolean(id))),
  )
  const estadoPorPresupuesto = new Map<string, EstadoPresupuesto>()
  if (presupuestoIds.length > 0) {
    const { data } = await supabase.from('presupuestos').select('id, estado').in('id', presupuestoIds)
    for (const p of (data ?? []) as any[]) estadoPorPresupuesto.set(p.id, p.estado as EstadoPresupuesto)
  }

  const itemsAMedida = fichas.flatMap((f) =>
    f.items.filter((it) => it.productoId).map((it) => ({ fichaId: f.id, itemId: it.id })),
  )
  const producidos = new Set<string>()
  if (itemsAMedida.length > 0) {
    const { data } = await supabase
      .from('producciones')
      .select('ficha_item_id')
      .in(
        'ficha_item_id',
        itemsAMedida.map((i) => i.itemId),
      )
    for (const p of (data ?? []) as any[]) if (p.ficha_item_id) producidos.add(p.ficha_item_id)
  }

  for (const f of fichas) {
    const itemsDeEstaFicha = itemsAMedida.filter((i) => i.fichaId === f.id)
    resultado.set(f.id, {
      presupuestoEstado: f.presupuestoId ? estadoPorPresupuesto.get(f.presupuestoId) : undefined,
      itemsAMedidaTotal: itemsDeEstaFicha.length,
      itemsAMedidaProducidos: itemsDeEstaFicha.filter((i) => producidos.has(i.itemId)).length,
      primerItemPendienteId: itemsDeEstaFicha.find((i) => !producidos.has(i.itemId))?.itemId,
    })
  }

  return resultado
}
