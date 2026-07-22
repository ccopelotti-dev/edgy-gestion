// ============================================================
// Módulo Ventas — Modelo de dominio
// Edgy Gestión · Core administrativo
// ============================================================

// ─── Categorías de cliente ────────────────────────────────────

export interface CategoriaCliente {
  id: string;
  nombre: string;
  descuentoDefault: number;       // % descuento por defecto (0-100)
  listaPrecioId?: string;         // futura lista de precios
  color?: string;                 // color visual para badge
  createdAt: string;
}

// ─── Cliente ──────────────────────────────────────────────────

export type TipoDocumento = 'cuit' | 'cuil' | 'dni' | 'otro';

export type CondicionIva =
  | 'consumidor_final'
  | 'monotributista'
  | 'responsable_inscripto'
  | 'exento'
  | 'no_responsable';

export interface Cliente {
  id: string;
  nombre: string;
  tipoDocumento: TipoDocumento;
  documento: string;              // sin guiones ni puntos
  condicionIva: CondicionIva;
  email?: string;
  telefono?: string;
  direccion?: string;
  localidad?: string;
  provincia?: string;
  categoriaId?: string;
  limiteCredito: number;          // 0 = sin límite
  saldoCuentaCorriente: number;   // positivo = el cliente debe
  notas?: string;
  activo: boolean;
  metadatos?: Record<string, unknown>; // extensible por verticales
  createdAt: string;
  updatedAt: string;
}

// Cliente especial "Consumidor Final" para ventas rápidas
export const CONSUMIDOR_FINAL_ID = '__consumidor_final__';

export const clienteConsumidorFinal: Cliente = {
  id: CONSUMIDOR_FINAL_ID,
  nombre: 'Consumidor Final',
  tipoDocumento: 'dni',
  documento: '0',
  condicionIva: 'consumidor_final',
  limiteCredito: 0,
  saldoCuentaCorriente: 0,
  activo: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ─── Presupuesto ──────────────────────────────────────────────

export type EstadoPresupuesto =
  | 'borrador'
  | 'enviado'
  | 'aprobado'
  | 'vencido'
  | 'cancelado';

export interface PresupuestoItem {
  id: string;
  productoId: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;              // % descuento por línea
  subtotal: number;               // cantidad * precioUnitario * (1 - descuento/100)
}

export interface Presupuesto {
  id: string;
  numero: number;
  clienteId: string;
  fecha: string;                  // ISO date
  validezDias: number;
  fechaVencimiento: string;       // ISO date, calculado
  estado: EstadoPresupuesto;
  items: PresupuestoItem[];
  subtotal: number;
  descuentoGeneral: number;       // % descuento sobre el total
  total: number;
  notas?: string;
  condiciones?: string;           // condiciones comerciales
  ordenId?: string;               // si se convirtió a orden
  createdAt: string;
  updatedAt: string;
}

// ─── Órdenes (Pedido / Producción / Servicio) ─────────────────

export type TipoOrden =
  | 'pedido'                      // entrega de mercadería
  | 'produccion'                  // elaboración / manufactura
  | 'servicio';                   // prestación de servicios

/**
 * 'terminado' -- se agrega entre 'en_preparacion' y 'entregado' (migración
 * 0060) para separar "la cocina ya terminó de preparar esto" de "el
 * cliente ya se lo llevó/fue servido". Antes de este cambio, "Facturar"
 * se habilitaba desde 'en_preparacion', lo que permitía facturar algo que
 * todavía se podía modificar en cocina -- ahora se habilita recién desde
 * 'terminado' en adelante. Esto además recupera la intención original del
 * diseño de `ordenes_venta` (ver comentario de la migración 0034: la
 * tabla real ya existía de antes con otro vocabulario y ese estado
 * intermedio nunca se llegó a incorporar al frontend).
 */
export type EstadoOrden =
  | 'pendiente'
  | 'en_preparacion'
  | 'terminado'
  | 'entregado_parcial'
  | 'entregado'                   // o "completado" para servicios
  | 'cancelado';

export interface OrdenItem {
  id: string;
  productoId?: string;            // opcional en servicios
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  subtotal: number;
  cantidadEntregada: number;      // para entregas parciales
}

export interface Orden {
  id: string;
  numero: number;
  tipo: TipoOrden;
  clienteId: string;
  presupuestoId?: string;         // si viene de un presupuesto
  fecha: string;
  fechaEntrega?: string;          // compromiso de entrega
  fechaCompletada?: string;       // cuándo se completó realmente
  estado: EstadoOrden;
  items: OrdenItem[];
  subtotal: number;
  descuentoGeneral: number;
  total: number;
  notas?: string;

  // Trazabilidad de origen (verticales y canales externos)
  origenModulo?: string;          // 'ventas-online', 'mesas-salon', etc.
  origenId?: string;              // ID en el módulo de origen
  origenCanal?: string;           // 'mercadolibre', 'tiendanube', etc.
  origenExternoId?: string;       // ID en la plataforma externa

  /**
   * Nombre/teléfono de contacto -- ya existen como columnas propias en
   * `ordenes_venta` (contacto_nombre/contacto_telefono) y las carga
   * Delivery-WhatsApp cuando el pedido no tiene un Cliente formal
   * vinculado (`clienteId` null). Ventas no las leía y por eso estas
   * comandas aparecían como "Cliente: Desconocido" -- se usan acá como
   * respaldo cuando no hay `clienteId`.
   */
  contactoNombre?: string;
  contactoTelefono?: string;

  /**
   * Despacho/logística (Fase 21) -- capa de envío ORTOGONAL al ciclo de
   * vida principal (`estado`): no toda Orden se despacha (una comanda de
   * salón servida en mesa o un service no tienen "en camino"), así que
   * esto vive aparte en vez de sumarse como un paso más de EstadoOrden.
   * El operador la completa a mano, normalmente después de facturar
   * (`comprobanteIds.length > 0`), pero nada lo obliga.
   *
   * Etapa 1 (esta fase): carga manual, sin integración real todavía --
   * `proveedorLogistica` es solo una etiqueta, y `numeroSeguimiento`/
   * `urlSeguimiento` son el número de pedido en la app de delivery (ej.
   * Rappi/PedidosYa) o la guía de un correo, tipeados por el operador.
   * El modelo queda listo para que una futura Etapa 2 (webhook/API por
   * proveedor) actualice estos mismos campos en vez de depender de
   * carga manual, sin cambiar nada de lo que ya lee la UI.
   */
  estadoLogistica?: EstadoLogistica;
  proveedorLogistica?: ProveedorLogistica;
  numeroSeguimiento?: string;
  urlSeguimiento?: string;
  fechaDespacho?: string;

  /**
   * Cadete y cobro contra entrega (Fase 23b) -- solo tiene sentido
   * cuando `proveedorLogistica === 'propio'` (un tercero como Rappi/
   * PedidosYa no necesita que Edgy Gestión sepa quién entregó ni
   * rendir su efectivo). `cadeteId` referencia una fila de
   * `usuarios_cliente` del mismo tenant; `cadeteNombre` es solo para
   * mostrar (se resuelve una vez, no hace falta ir a buscarlo de
   * nuevo). `cobraContraEntrega` marca que ese pedido queda pendiente
   * de "rendición" (Fase 23c) -- el cadete cobra en efectivo al
   * entregar y después liquida ese dinero contra la factura.
   */
  cadeteId?: string;
  cadeteNombre?: string;
  cobraContraEntrega?: boolean;

  /**
   * Dirección de entrega (Fase 22b) -- vive en `pedidos_delivery.direccion`,
   * no en `ordenes_venta` (una orden de producción/servicio no tiene
   * dirección). Solo se completa para órdenes con `origenModulo ===
   * 'ventas-online'`. Se muestra acá para no tener que ir al módulo
   * Ventas Online a verla -- todo el ciclo (incluido el despacho) se
   * gestiona desde Comandas.
   */
  direccionEntrega?: string;

  /**
   * Pago adelantado online (Fase 12) -- columnas `pago_*` de
   * `ordenes_venta`, cargadas por `crear-preferencia-pago`/`mp-webhook`
   * (Netlify functions) cuando el cliente paga desde el Catálogo
   * Público antes de que exista ninguna factura. Fase 23a: al facturar
   * esta orden, si `pagoEstado === 'aprobado'`, se genera automático un
   * Cobro imputado 100% a la factura recién creada (ver
   * `handleSaveComprobante` en Ordenes.tsx/Presupuestos.tsx) -- el
   * dinero que ya entró por Mercado Pago no queda "perdido" como saldo
   * pendiente en la factura.
   */
  pagoProveedor?: string;
  pagoEstado?: 'pendiente' | 'aprobado' | 'rechazado' | 'en_proceso';
  pagoMonto?: number;
  pagoPaymentId?: string;

  comprobanteIds: string[];       // comprobantes generados
  createdAt: string;
  updatedAt: string;
}

export type EstadoLogistica = 'sin_despacho' | 'en_camino' | 'entregado';

export type ProveedorLogistica =
  | 'propio'
  | 'rappi'
  | 'pedidosya'
  | 'andreani'
  | 'correo_argentino'
  | 'oca'
  | 'otro';

// Labels por tipo de orden
export const TIPO_ORDEN_LABEL: Record<TipoOrden, string> = {
  pedido: 'Orden de pedido',
  produccion: 'Orden de producción',
  servicio: 'Orden de servicio',
};

export const TIPO_ORDEN_LABEL_CORTO: Record<TipoOrden, string> = {
  pedido: 'Pedido',
  produccion: 'Producción',
  servicio: 'Servicio',
};

// ─── Comprobantes (facturación dual: interno / electrónica) ───

export type TipoComprobante =
  | 'factura'
  | 'recibo'
  | 'nota_credito'
  | 'nota_debito';

export type EstadoComprobante =
  | 'emitido'
  | 'cobrado_parcial'
  | 'cobrado'
  | 'anulado';

export type ModoEmision =
  | 'interno'                     // comprobante interno, sin AFIP
  | 'electronica';                // factura electrónica vía API AFIP

// Tipos fiscales AFIP (solo cuando modoEmision = 'electronica')
export type TipoFiscal =
  | 'A'                           // RI a RI
  | 'B'                           // RI a CF/Monotributo/Exento
  | 'C'                           // Monotributo a cualquiera
  | 'X';                          // interno (no fiscal)

export type MedioPago =
  | 'efectivo'
  | 'tarjeta_debito'
  | 'tarjeta_credito'
  | 'transferencia'
  | 'cheque'
  | 'cuenta_corriente'
  | 'mercadopago'
  | 'otro';

export interface ComprobanteItem {
  id: string;
  productoId?: string;
  /** Vínculo opcional a un Combo del catálogo (Fase 19) -- mutuamente
   * excluyente con productoId: una línea vinculada a un combo descuenta
   * stock de los componentes fijos de ESE combo, no de un producto único. */
  comboId?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  alicuotaIva: number;            // 0, 10.5, 21, 27
  subtotal: number;
  montoIva: number;
}

export interface DatosAfip {
  puntoVenta: number;
  tipoFiscal: TipoFiscal;
  // Fase 11: código AFIP del tipo de comprobante (1=Factura A, 6=B,
  // 11=C, 2/7/12=Nota Débito A/B/C, 3/8/13=Nota Crédito A/B/C) y
  // número asignado por ARCA (CbteNro) -- distinto del `numero` interno
  // de Edgy (ver Comprobante.numero), que sigue existiendo como
  // numeración propia del sistema. Se guardan acá porque son los que
  // hay que mostrar en el PDF fiscal y codificar en el QR (ver
  // src/lib/comprobantes-pdf/arcaQr.ts) -- no tiene sentido volver a
  // pedírselos a ARCA cada vez que se regenera el PDF.
  tipoComprobanteAfip?: number;
  numeroComprobante?: number;
  // Código AFIP del tipo de documento del receptor (80=CUIT, 86=CUIL,
  // 96=DNI, 99=Consumidor Final), también necesario para el QR.
  docTipoReceptor?: number;
  cae?: string;                   // devuelto por AFIP
  vencimientoCae?: string;        // devuelto por AFIP
  fechaEmisionAfip?: string;
  resultado?: 'A' | 'R';         // Aprobado / Rechazado
  observaciones?: string;
}

export interface Comprobante {
  id: string;
  tipo: TipoComprobante;
  modoEmision: ModoEmision;
  numero: number;                 // numeración interna correlativa
  clienteId: string;
  ordenId?: string;               // si viene de una orden
  fecha: string;
  items: ComprobanteItem[];
  subtotal: number;               // neto gravado
  descuentoGeneral: number;
  montoIva: number;               // total IVA
  total: number;                  // subtotal + IVA - descuentos
  estado: EstadoComprobante;
  medioPago: MedioPago;
  montoCobrado: number;           // cuánto se cobró hasta ahora
  saldoPendiente: number;         // total - montoCobrado

  // Datos AFIP (solo si modoEmision = 'electronica')
  afip?: DatosAfip;

  notas?: string;
  origenModulo?: string;
  origenId?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Cobranzas ────────────────────────────────────────────────

export interface ImputacionCobro {
  comprobanteId: string;
  montoImputado: number;
}

export interface Cobro {
  id: string;
  numero: number;
  clienteId: string;
  fecha: string;
  monto: number;
  medioPago: MedioPago;
  imputaciones: ImputacionCobro[];
  notas?: string;
  createdAt: string;
}

// ─── Estado global del módulo ─────────────────────────────────

export interface VentasState {
  categorias: CategoriaCliente[];
  clientes: Cliente[];
  presupuestos: Presupuesto[];
  ordenes: Orden[];
  comprobantes: Comprobante[];
  cobros: Cobro[];

  // Contadores para numeración correlativa
  nextNumeroPresupuesto: number;
  nextNumeroOrden: Record<TipoOrden, number>;
  nextNumeroComprobante: Record<TipoComprobante, number>;
  nextNumeroCobro: number;

  // Configuración
  config: VentasConfig;
}

export interface VentasConfig {
  ivaDefault: number;             // alícuota por defecto (21)
  validezPresupuestoDias: number; // días por defecto (15)
  modoEmisionDefault: ModoEmision;
  afipConfigurado: boolean;       // si hay credenciales AFIP
  puntoVentaAfip?: number;
}

// ─── Helpers ──────────────────────────────────────────────────

export const ESTADO_PRESUPUESTO_LABEL: Record<EstadoPresupuesto, string> = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  aprobado: 'Aprobado',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
};

export const ESTADO_ORDEN_LABEL: Record<EstadoOrden, string> = {
  pendiente: 'Pendiente',
  en_preparacion: 'En preparación',
  terminado: 'Terminado',
  entregado_parcial: 'Entrega parcial',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

// Para servicios se usa "Completado" en vez de "Entregado"
export function labelEstadoOrden(estado: EstadoOrden, tipo: TipoOrden): string {
  if (tipo === 'servicio') {
    if (estado === 'entregado') return 'Completado';
    if (estado === 'entregado_parcial') return 'Parcial';
    if (estado === 'en_preparacion') return 'En ejecución';
  }
  return ESTADO_ORDEN_LABEL[estado];
}

export const ESTADO_LOGISTICA_LABEL: Record<EstadoLogistica, string> = {
  sin_despacho: 'Sin despacho',
  en_camino: 'En camino',
  entregado: 'Entregado',
};

export const PROVEEDOR_LOGISTICA_LABEL: Record<ProveedorLogistica, string> = {
  propio: 'Delivery propio',
  rappi: 'Rappi',
  pedidosya: 'PedidosYa',
  andreani: 'Andreani',
  correo_argentino: 'Correo Argentino',
  oca: 'OCA',
  otro: 'Otro',
};

export const ESTADO_COMPROBANTE_LABEL: Record<EstadoComprobante, string> = {
  emitido: 'Emitido',
  cobrado_parcial: 'Cobro parcial',
  cobrado: 'Cobrado',
  anulado: 'Anulado',
};

export const TIPO_COMPROBANTE_LABEL: Record<TipoComprobante, string> = {
  factura: 'Factura',
  recibo: 'Recibo',
  nota_credito: 'Nota de crédito',
  nota_debito: 'Nota de débito',
};

/**
 * Label a mostrar para un comprobante concreto. Una "factura" con
 * modoEmision "interno" (sin AFIP, la única modalidad disponible hasta
 * que se conecte ARCA en Fase 11) no es una factura fiscal real -- es
 * una transacción informal -- así que se muestra como "Nota de
 * entrega" para no confundirla con una factura de verdad. Cuando el
 * comprobante sí pasa por AFIP (modoEmision "electronica") se muestra
 * "Factura" tal cual, porque ahí sí lo es.
 */
export function labelTipoComprobante(tipo: TipoComprobante, modoEmision: ModoEmision): string {
  if (tipo === 'factura' && modoEmision === 'interno') return 'Nota de entrega';
  return TIPO_COMPROBANTE_LABEL[tipo];
}

export const MEDIO_PAGO_LABEL: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  tarjeta_debito: 'Tarjeta débito',
  tarjeta_credito: 'Tarjeta crédito',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  cuenta_corriente: 'Cuenta corriente',
  mercadopago: 'MercadoPago',
  otro: 'Otro',
};

export const CONDICION_IVA_LABEL: Record<CondicionIva, string> = {
  consumidor_final: 'Consumidor Final',
  monotributista: 'Monotributista',
  responsable_inscripto: 'Responsable Inscripto',
  exento: 'Exento',
  no_responsable: 'No Responsable',
};

export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumento, string> = {
  cuit: 'CUIT',
  cuil: 'CUIL',
  dni: 'DNI',
  otro: 'Otro',
};

// ─── Utilidades de cálculo ────────────────────────────────────

export function calcularSubtotalItem(
  cantidad: number,
  precioUnitario: number,
  descuento: number
): number {
  return cantidad * precioUnitario * (1 - descuento / 100);
}

export function calcularTotalConIva(
  subtotal: number,
  alicuotaIva: number
): { montoIva: number; total: number } {
  const montoIva = subtotal * (alicuotaIva / 100);
  return { montoIva, total: subtotal + montoIva };
}

export function calcularTotalItems(
  items: { subtotal: number }[],
  descuentoGeneral: number
): number {
  const sub = items.reduce((sum, i) => sum + i.subtotal, 0);
  return sub * (1 - descuentoGeneral / 100);
}

// Genera un ID único simple
export function generarId(): string {
  return crypto.randomUUID();
}
