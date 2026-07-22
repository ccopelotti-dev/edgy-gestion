// ============================================================
// Módulo Viandas — Tipos
// Edgy Gestión
//
// Patrón parent-child (PlanVianda -> EntregaVianda) igual al de
// SeguimientoHoras/EntradaHoras de Utilidades. El cliente del plan es
// un cliente_venta real de Ventas (no un Consumidor Final ni un
// cliente propio del módulo), porque el abono se cobra a una persona
// identificada -- a diferencia de una mesa, que no tiene datos de
// facturación.
// ============================================================

export type PeriodoVianda = 'semanal' | 'mensual'
export type EstadoPlanVianda = 'activo' | 'cancelado'

export interface PlanVianda {
  id: string
  clienteVentaId: string
  /** Se resuelve con un join a clientes_venta en el fetch -- no vive en la tabla planes_vianda. */
  clienteVentaNombre?: string
  cantidadPeriodo: number
  periodo: PeriodoVianda
  precioAbono: number
  fechaInicio: string
  fechaVencimiento: string
  estado: EstadoPlanVianda
  notas?: string
  createdAt: string
}

export interface EntregaVianda {
  id: string
  planId: string
  fecha: string
  cantidad: number
  /**
   * Producto real del catálogo (rubro "Viandas") -- Fase 24b. Reemplaza al
   * antiguo `menuDelDia` de texto libre: ahora cada entrega es una línea de
   * catálogo real, así se puede descontar stock/insumos y facturar en cta.
   * cte. como cualquier otra venta. `productoNombre` se resuelve con un
   * join a `productos` en el fetch (no vive en la tabla entregas_vianda).
   */
  productoId: string
  productoNombre?: string
  /**
   * Prorrateo del abono (Fase 24b, decisión explícita del cliente): cada
   * entrega se factura a `precioAbono / cantidadPeriodo` del plan, NO al
   * precio de catálogo del producto -- es una foto tomada al momento de
   * generar la entrega (si `precioAbono` cambia después, las entregas ya
   * generadas no se recalculan).
   */
  precioUnitario: number
  /** Orden en `ordenes_venta` (tipo 'pedido', origenModulo 'viandas')
   * generada para esta entrega -- dispara el ciclo normal de Comandas
   * (Ordenes.tsx) hasta facturarse en cta. cte. */
  ordenId: string
  /** Se completa recién cuando la Orden pasa a 'entregado' y se factura
   * automáticamente (ver handleCambiarEstado en ventas/pages/Ordenes.tsx). */
  comprobanteId?: string
  createdAt: string
}

export interface ViandasState {
  planes: PlanVianda[]
  entregas: EntregaVianda[]
}

export const PERIODO_VIANDA_LABEL: Record<PeriodoVianda, string> = {
  semanal: 'Semanal',
  mensual: 'Mensual',
}

export const ESTADO_PLAN_VIANDA_LABEL: Record<EstadoPlanVianda, string> = {
  activo: 'Activo',
  cancelado: 'Cancelado',
}
