// ============================================================
// Módulo Caja por turno — Tipos
// Edgy Gestión
//
// Un "turno" es la unidad de apertura/cierre de caja que usan Mesas y
// Salón y Comandas y cocina para saber si pueden operar (igual que en
// Frambuesa: sin turno abierto, el plano queda en modo lectura). El
// arqueo (diferencia) se calcula al cerrar comparando lo declarado por
// el cajero contra el movimiento real de efectivo en Tesorería durante
// ese turno — el cálculo en sí vive en data/store.tsx, no acá.
// ============================================================

export type EstadoTurno = 'abierto' | 'cerrado'

export interface TurnoCaja {
  id: string
  usuarioAperturaId?: string
  usuarioAperturaNombre?: string
  fechaApertura: string // ISO timestamp completo
  montoApertura: number
  usuarioCierreId?: string
  usuarioCierreNombre?: string
  fechaCierre?: string
  montoCierreDeclarado?: number
  // Fase 13b (arqueo ciego): monto esperado (apertura + neto de
  // efectivo en Tesorería) calculado al cerrar -- se guarda para poder
  // auditar el arqueo después, nunca se le muestra al cajero antes de
  // que declare su conteo físico.
  montoEsperado?: number
  diferencia?: number
  estado: EstadoTurno
  notas?: string
}

export interface CajaTurnoState {
  turnos: TurnoCaja[]
}
