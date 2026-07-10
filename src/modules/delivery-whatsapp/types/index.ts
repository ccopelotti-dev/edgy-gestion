// Módulo Delivery por WhatsApp — tipos.
//
// Scope acordado: "Registro manual del pedido" -- el operador recibe
// el pedido por WhatsApp fuera del sistema y lo carga acá a mano. No
// hay integración técnica con la API de WhatsApp.
//
// Fase 7b (Menú QR con acción comercial): un pedido también puede
// llegar solo, generado por el cliente final desde el menú público
// (src/pages/MenuPublico.tsx vía la función crear_pedido_menu_publico)
// -- `origen` distingue ambos casos. A partir de ahí sigue exactamente
// el mismo circuito (pendiente -> en camino -> entregado, con la Venta
// real generándose recién al entregar), no hay nada especial que
// tratar distinto en el resto del módulo.

export type EstadoPedidoDelivery = 'pendiente' | 'en_camino' | 'entregado' | 'cancelado'
export type OrigenPedidoDelivery = 'operador' | 'menu_qr'

export interface ItemPedidoDelivery {
  descripcion: string
  cantidad: number
  precioUnitario: number
  /** Vínculo permanente al catálogo real (productos-stock) -- opcional:
   * si se deja sin vincular, el ítem sigue siendo texto libre como
   * siempre (comportamiento default sin cambios). Vinculado, permite
   * descontar stock y activar garantía automáticamente al marcar el
   * pedido como "Entregado" -- Fase 6d del refactor de Productos,
   * mismo criterio que el selector de catálogo de Ventas (Fase 6c). */
  productoId?: string
  varianteId?: string
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
  /** 'operador' (default) si lo cargó el operador a mano, 'menu_qr' si
   * lo generó el cliente final desde el menú público -- Fase 7b. */
  origen: OrigenPedidoDelivery
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
