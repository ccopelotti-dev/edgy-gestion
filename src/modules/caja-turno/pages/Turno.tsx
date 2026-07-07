// ============================================================
// Módulo Mesas y Salón — Tipos
// Edgy Gestión
//
// `estado` de la mesa queda denormalizado acá (no se recalcula leyendo
// comandas en cada render): lo actualiza este módulo directo cuando el
// mozo abre/cobra/libera una mesa, y lo actualiza Comandas y cocina
// (escribiendo directo a Supabase, sin pasar por este Context) cuando
// cambia el estado de la comanda asociada.
// ============================================================

export type EstadoMesa = 'libre' | 'ocupada' | 'cobro' | 'reservada'

export interface Sector {
  id: string
  nombre: string
  orden: number
}

export interface Mesa {
  id: string
  sectorId: string
  numero: number
  capacidad: number
  posX: number
  posY: number
  estado: EstadoMesa
  comandaActualId?: string
}

export interface MesasSalonState {
  sectores: Sector[]
  mesas: Mesa[]
}
