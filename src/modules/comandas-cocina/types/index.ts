// ============================================================
// Módulo Comandas y cocina — Tipos
// Edgy Gestión
//
// Una Comanda es, en esencia, el "carrito abierto" de una mesa. Al
// cerrarla (cobro) se resuelve en un Comprobante real de Ventas — la
// comanda en sí no factura nada, solo junta los ítems y les da
// seguimiento de cocina (`estadoCocina` por ítem, no por comanda
// entera: un plato puede estar "listo" mientras otro de la misma mesa
// sigue "en preparación").
// ============================================================

export type EstadoComanda = 'abierta' | 'cobro' | 'cerrada' | 'cancelada'
export type EstadoCocina = 'pendiente' | 'en_preparacion' | 'listo' | 'entregado'

export interface ComandaItem {
  id: string
  comandaId: string
  productoId?: string
  descripcion: string
  cantidad: number
  precioUnitario: number
  subtotal: number
  estadoCocina: EstadoCocina
  nota?: string
}

export interface Comanda {
  id: string
  mesaId: string
  turnoId: string
  mozoUsuarioId?: string
  estado: EstadoComanda
  fechaApertura: string
  fechaCierre?: string
  subtotal: number
  total: number
  comprobanteId?: string
  notas?: string
  items: ComandaItem[]
  /** Cliente registrado (Ventas → Clientes) opcional -- Fase 7a. Sin
   * elegir uno, la comanda sigue facturando a "Consumidor Final" como
   * siempre (comportamiento default sin cambios). Elegir uno habilita
   * facturar a cuenta corriente, que necesita una ficha real a la que
   * imputarle el saldo pendiente. */
  clienteVentaId?: string
  clienteVentaNombre?: string
}

export interface ComandasCocinaState {
  comandas: Comanda[]
}
