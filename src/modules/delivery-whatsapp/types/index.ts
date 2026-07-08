// Módulo Delivery por WhatsApp — tipos.
//
// Scope acordado: "Registro manual del pedido" -- el operador recibe
// el pedido por WhatsApp fuera del sistema y lo carga acá a mano. No
// hay integración técnica con la API de WhatsApp.

export type EstadoPedidoDelivery = 'pendiente' | 'en_camino' | 'entregado' | 'cancelado'

export interface ItemPedidoDelivery {
  descripcion: string
  cantidad: number
  precioUnitario: number
}

export interface PedidoDelivery {
  id: string
  clienteVentaId?: string
  clienteVentaNombre?: string
  clienteNombre: string
  telefono?: string
  direccion: string
  items: ItemPedidoDelivery[]
  total: number
  medioPago?: string
  estado: EstadoPedidoDelivery
  comprobanteId?: string
  notas?: string
  fecha: string
  createdAt: string
}

export interface DeliveryWhatsappState {
  pedidos: PedidoDelivery[]
}

export const ESTADO_PEDIDO_DELIVERY_LABEL: Record<EstadoPedidoDelivery, string> = {
  pendiente: 'Pendiente',
  en_camino: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}
