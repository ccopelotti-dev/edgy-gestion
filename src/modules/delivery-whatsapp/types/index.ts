// Módulo Ventas Online (antes "Delivery por WhatsApp") — tipos.
//
// Scope acordado: "Registro manual del pedido" -- el operador recibe
// el pedido por WhatsApp fuera del sistema y lo carga acá a mano. No
// hay integración técnica con la API de WhatsApp.
//
// Fase 7b (Menú QR con acción comercial): un pedido también puede
// llegar solo, generado por el cliente final desde el menú público
// (src/pages/MenuPublico.tsx) -- `origen` distingue ambos casos.
//
// Fase 8b/8c (Catálogo Público genérico + convergencia): el pedido ya
// no vive solo, entero, en `pedidos_delivery` -- ahora es una fila de
// `ordenes_venta` (el motor central que también usan otros rubros sin
// Kit Gastronómico) más una fila de extensión logística acá, unidas
// por `orden_venta_id`. `ordenVentaId` es el único campo nuevo en el
// tipo de dominio: Index.tsx y Pedido.tsx no lo necesitan, solo lo usa
// store.tsx para saber a qué `ordenes_venta` hay que escribirle cuando
// cambia el medio de pago, el comprobante o el estado general. El
// resto de los campos (cliente, ítems, total, etc.) siguen viniendo
// desde `ordenes_venta` como siempre, así que el resto del módulo no
// nota la diferencia.

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
  /** Fase 8b/8c: id de la fila en `ordenes_venta` que contiene los
   * datos reales del pedido (cliente, ítems, total, medio de pago,
   * comprobante). `id` en cambio identifica la fila de extensión
   * logística en `pedidos_delivery` -- son dos tablas distintas. */
  ordenVentaId: string
  /** Fase 8 (cierre): número correlativo de `ordenes_venta.numero` --
   * solo para armar un identificador legible en el PDF de descarga
   * ("PED-00007"). Opcional porque un pedido recién creado a mano
   * (CREAR_PEDIDO) todavía no lo conoce en el estado optimista local
   * -- se completa en la próxima carga desde Supabase. */
  numero?: number
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
   * lo generó el cliente final desde el catálogo público -- Fase 7b. */
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
