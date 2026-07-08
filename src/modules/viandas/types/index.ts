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
  menuDelDia?: string
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
