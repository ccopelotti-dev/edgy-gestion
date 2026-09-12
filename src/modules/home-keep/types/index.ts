// ============================================================
// Módulo Home Keep ("Kit Hogar") — Modelo de dominio
// Edgy Gestión · Clon recortado de Compras: sin Cotizaciones, sin
// Órdenes de Compra, sin catálogo de Insumos/Productos (no hay stock).
// Solo Proveedores, Comprobantes y Pagos.
// ============================================================

import type { UnidadMedida } from '@/modules/productos-stock/types';

// ─── Proveedor ───────────────────────────────────────────────
// (idéntico a Compras -- misma tabla `proveedores_hogar`, mismas columnas)

export type CondicionIvaProveedor =
  | 'responsable_inscripto'
  | 'monotributista'
  | 'exento';

export interface Proveedor {
  id: string;
  nombre: string;
  /** Nombre comercial / de fantasía, distinto de la razón social (`nombre`). */
  nombreFantasia?: string;
  cuit: string;
  condicionIva: CondicionIvaProveedor;
  /** Fase 70c: numero de inscripcion en Ingresos Brutos (IIBB). */
  ingresosBrutos?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  localidad?: string;
  provincia?: string;
  contacto?: string;
  rubro?: string;
  notas?: string;
  saldoCuentaCorriente: number; // positivo = le debemos
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Item de Comprobante ─────────────────────────────────────
// A diferencia de Compras, acá no hay catálogo de Insumos/Productos (Home
// Keep no maneja stock) -- un ítem es siempre texto libre, con la
// posibilidad de clasificarlo por Categoría de gasto (tabla
// `categorias_gasto`, compartida con el resto del sistema).

export interface ItemComprobante {
  id: string;
  descripcion: string;
  cantidad: number;
  /** Unidad en la que se cargó `cantidad` -- solo informativa, no hay
   * stock real detrás para convertir. */
  unidad?: UnidadMedida;
  precioUnitario: number;
  descuento: number;            // %
  subtotal: number;             // cantidad * precio * (1 - desc/100)
  alicuotaIva: number;          // 0, 10.5, 21, 27
  montoIva: number;
  /** Categoría de gasto personal (tabla categorias_gasto) -- para poder
   * clasificar el gasto (ej. "Alimentación y Supermercado"). */
  categoriaGastoId?: string;
}

// ─── Comprobantes ────────────────────────────────────────────

export type TipoComprobante =
  | 'factura'
  | 'nota_credito'
  | 'nota_debito';

export type EstadoComprobante =
  | 'pendiente'
  | 'pagado_parcial'
  | 'pagado'
  | 'anulado';

export type MedioPago =
  | 'efectivo'
  | 'transferencia'
  | 'cheque'
  | 'cuenta_corriente'
  | 'tarjeta'
  | 'otro';

/** Impuesto/percepción adicional cargado a mano en un comprobante. Lista
 * libre porque varía según proveedor; cada uno suma directo al total. */
export interface ImpuestoAdicional {
  id: string;
  concepto: string;
  monto: number;
}

export interface Comprobante {
  id: string;
  tipo: TipoComprobante;
  numero: number;
  proveedorId: string;
  fecha: string;
  fechaVencimiento?: string;
  items: ItemComprobante[];
  subtotal: number;
  montoIva: number;
  otrosImpuestos?: ImpuestoAdicional[];
  total: number;
  estado: EstadoComprobante;
  medioPago: MedioPago;
  montoPagado: number;
  saldoPendiente: number;
  /**
   * Nro. de comprobante fiscal del PROVEEDOR (el que viene impreso en la
   * factura física, ej. "0001-00000542") -- distinto de `numero`, que es el
   * correlativo interno de Edgy Gestión.
   */
  numeroComprobanteProveedor?: string;
  /** Fase 74 (07/09): vínculo opcional a la Servicio (obligación
   * recurrente -- ver ServicioHogar) que este comprobante puntual está
   * pagando. Cuando se completa, el panel de Servicios lo toma como
   * "cubierto" para el período y lo saca de pendientes. */
  servicioHogarId?: string;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Pagos ───────────────────────────────────────────────────

export interface ImputacionPago {
  comprobanteId: string;
  montoImputado: number;
}

/**
 * Estado de vida de un Pago. Se arma en `pendiente` (se decide qué se
 * cancela y con qué combinación de medios, sin comprometer todavía ninguna
 * cuenta bancaria ni cheque real) y recién al confirmarlo pasa a `pagada`
 * (ver ConfirmarPagoDialog): ahí se elige la cuenta bancaria real para las
 * líneas de transferencia/efectivo, se emiten los cheques reales en
 * Tesorería para las líneas de cheque, y se actualiza el saldo de los
 * comprobantes y del proveedor.
 */
export type EstadoPago = 'pendiente' | 'pagada' | 'anulada';

/**
 * Una línea de pago describe UNA forma de pago dentro de un Pago. Pueden
 * combinarse varias en un mismo pago -- ej. parte por transferencia y el
 * resto con cheques a distintos plazos.
 */
export interface LineaPago {
  id: string;
  medioPago: MedioPago;
  monto: number;
  /** Transferencia / efectivo -- cuenta bancaria real, elegida al confirmar. */
  cuentaBancariaId?: string;
  /** Cheque -- datos del cheque a emitir (puede ser diferido). */
  chequeNumero?: string;
  chequeBanco?: string;
  /** Fecha de pago/vencimiento del cheque. */
  chequeFechaPago?: string;
  /** Id del Cheque ya creado en Tesorería -- se completa al confirmar. */
  chequeId?: string;
  /** Fase 67 (01/09): foto del ticket/comprobante de ESTA línea de pago
   * en particular -- mismo criterio que en Compras (ver
   * modules/compras/types/index.ts y src/lib/creditos.ts). */
  imagenUrl?: string;
  /** Si esta línea generó un reintegro/crédito esperado (ej. Promo
   * Pampa) -- borrador de formulario, no se persiste en la línea. */
  reintegroConcepto?: string;
  reintegroMonto?: number;
}

export interface Pago {
  id: string;
  numero: number;
  proveedorId: string;
  fecha: string;
  estado: EstadoPago;
  monto: number;
  /** Medio "principal" -- si el pago combina medios distintos entre sus
   * líneas, queda en 'otro'. El detalle real está en `lineasPago`. */
  medioPago: MedioPago;
  imputaciones: ImputacionPago[];
  lineasPago: LineaPago[];
  /** Fecha en que se confirmó/ejecutó el pago (estado pasa a 'pagada'). */
  fechaConfirmacion?: string;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Ingresos (Fase 70) ────────────────────────────────────────
// De dónde sale la plata para pagar los gastos del hogar: un aporte
// del negocio (La Charcutería) o un ingreso fijo de otro integrante de
// la familia. El aporte del negocio se registra DOBLE -- acá como
// ingreso, y además como egreso real en la Tesorería del negocio (ver
// ADD_INGRESO en data/store.tsx) -- así el negocio también refleja la
// salida de esa plata.

export type TipoIngreso = 'aporte_negocio' | 'ingreso_familiar' | 'otro';

export interface Ingreso {
  id: string;
  fecha: string;
  tipo: TipoIngreso;
  /** "La Charcutería" para aporte_negocio, nombre del familiar para
   * ingreso_familiar, libre para 'otro'. Cuando hay `usuarioClienteId`
   * cargado, `origen` se autocompleta con su nombre (queda igual como
   * texto de respaldo/legado, pero la relación real vive en el id). */
  origen?: string;
  /** Fase 71i (06/09): integrante de la familia (usuarios_cliente) que
   * aporta este ingreso -- solo tiene sentido para tipo='ingreso_familiar'.
   * Permite mostrar/cargar el mismo ingreso tanto desde acá (Ingresos)
   * como desde la ficha de la persona en Perfil Familiar. */
  usuarioClienteId?: string;
  concepto?: string;
  monto: number;
  /** Solo relevante para tipo='aporte_negocio' -- cómo salió la plata
   * de la Charcutería, para reflejarlo bien en su Tesorería (caja vs.
   * banco). Se ignora para ingreso_familiar/otro. */
  medioPago?: MedioPago;
  /** Ingreso fijo mensual (ej. sueldo de un familiar) -- para poder
   * recordarlo/sugerirlo cada mes. */
  recurrente: boolean;
  diaMesRecurrente?: number;
  /** Id del movimiento espejo en movimientos_caja del negocio, cuando
   * tipo='aporte_negocio' -- solo para trazabilidad/debug. */
  movimientoCajaId?: string;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

export const TIPO_INGRESO_LABEL: Record<TipoIngreso, string> = {
  aporte_negocio: 'Aporte de la Charcutería',
  ingreso_familiar: 'Ingreso familiar',
  otro: 'Otro ingreso',
};

// ─── Tarjetas de crédito (Fase 70) ─────────────────────────────
// Resumen con detalle completo de consumos y cuotas -- se paga con el
// mismo mecanismo simplificado de registrarMovimientoTesoreria que usa
// el resto de Home Keep (no hace falta modelar el banco como
// "proveedor" ni forzar el resumen dentro del circuito de
// Pago/imputaciones pensado para comprobantes de proveedor).

export interface TarjetaCredito {
  id: string;
  nombre: string; // ej. "Visa Santander - Carlos"
  banco?: string;
  /** Texto libre legado -- aclaración manual opcional. El vínculo real
   * al titular es usuarioClienteId (Fase 72c). */
  titular?: string;
  /** Fase 72c (06/09, a pedido de Carlos): integrante de la familia
   * (usuarios_cliente) titular de la tarjeta. El alta de una tarjeta se
   * hace desde su ficha en Perfil Familiar -- Home Keep > Tarjetas sigue
   * siendo donde se maneja su funcionamiento (resúmenes, consumos,
   * cupo, pagos), no el alta. */
  usuarioClienteId?: string;
  ultimosDigitos?: string;
  diaCierre?: number;
  diaVencimiento?: number;
  limite?: number;
  activa: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConsumoTarjeta {
  id: string;
  /** Fase 72: explícito ahora porque un consumo puede existir "abierto"
   * (ver resumenId) sin estar anidado bajo ningún ResumenTarjeta.consumos. */
  tarjetaId: string;
  /** Fase 72: id del ResumenTarjeta que ya facturó este consumo. undefined
   * = consumo "abierto" -- cargado el día de la compra (o por el agente de
   * WhatsApp más adelante), todavía no apareció en ningún resumen mensual.
   * Se concilia (barre de abierto a facturado) al cargar el resumen real,
   * ver ADD_RESUMEN_TARJETA en store.tsx. */
  resumenId?: string;
  descripcion: string;
  fechaConsumo?: string;
  /** Monto de ESTA cuota puntual, no el total de la compra original. */
  monto: number;
  cuotaActual: number;
  cuotasTotales: number;
  /** Agrupa todas las cuotas de una misma compra a través de distintos
   * resúmenes/meses -- ver matcheo por descripción en store.tsx. */
  compraId?: string;
  categoriaGastoId?: string;
  /** Fase 72: reintegro esperado por promoción bancaria en ESTE consumo
   * (ej. Promo Pampa) -- si se completa, genera una fila en
   * creditos_pendientes (mismo mecanismo que ya existía para líneas de
   * pago, Fase 67), visible en Tesorería > Créditos y Reintegros. */
  reintegroConcepto?: string;
  reintegroMonto?: number;
}

export type EstadoResumenTarjeta = 'pendiente' | 'pagado_parcial' | 'pagado';

export interface ResumenTarjeta {
  id: string;
  tarjetaId: string;
  /** 'YYYY-MM' del cierre. */
  periodo: string;
  fechaCierre?: string;
  fechaVencimiento?: string;
  total: number;
  pagoMinimo?: number;
  estado: EstadoResumenTarjeta;
  montoPagado: number;
  saldoPendiente: number;
  consumos: ConsumoTarjeta[];
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

export const ESTADO_RESUMEN_TARJETA_LABEL: Record<EstadoResumenTarjeta, string> = {
  pendiente: 'Pendiente',
  pagado_parcial: 'Pago parcial',
  pagado: 'Pagado',
};

// ─── Vehículos e Inmuebles (Fase 74) ────────────────────────────
// Mismo patrón que TarjetaCredito (Fase 72c): el alta se hace desde la
// ficha del titular en Perfil Familiar (usuarioClienteId), y la
// gestión funcional (a qué se le asocia, qué se paga) vive en Home
// Keep. Inmuebles se simplificó a titular único a pedido explícito de
// Carlos (07/09) -- la cotitularidad (uno o los dos cónyuges) queda
// para una fase futura.

export interface Vehiculo {
  id: string;
  /** Integrante de la familia (usuarios_cliente) titular -- el alta se
   * hace desde su ficha en Perfil Familiar. */
  usuarioClienteId?: string;
  patente?: string;
  marca?: string;
  modelo?: string;
  anio?: number;
  notas?: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Inmueble {
  id: string;
  /** Titular único (Fase 74, simplificado a pedido de Carlos) -- el
   * alta se hace desde su ficha en Perfil Familiar, mismo criterio que
   * Vehiculo y TarjetaCredito. */
  usuarioClienteId?: string;
  nombre: string;
  direccion?: string;
  /** Identificador catastral/partida (ej. "47-03-J-3-030") -- formato
   * libre porque cada municipio/provincia lo referencia distinto. */
  partidaInmobiliaria?: string;
  notas?: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Servicios (Fase 74) ─────────────────────────────────────────
// Definición de una obligación recurrente (impuestos, tasas, seguros,
// luz/gas/internet, colegio, etc.) -- no es el pago puntual (eso sigue
// siendo un Comprobante), sino la "ficha" del servicio en sí, con una
// estimación de monto/vencimiento para precargar el panel antes de que
// llegue el comprobante real del mes.

export type TipoVinculoServicio = 'vehiculo' | 'inmueble' | 'persona' | 'general';

export type PeriodicidadServicio = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';

export interface ServicioHogar {
  id: string;
  nombre: string; // ej. "Seguro Auto NATIVA", "Impuesto Inmobiliario Casa 1"
  categoriaGastoId?: string;
  proveedorId?: string;
  /** Con qué está vinculada esta obligación, para trazabilidad -- ver
   * criterio pedido por Carlos: vehículos/inmuebles se cargan primero
   * en Perfil Familiar, y el servicio (póliza, impuesto) se vincula acá. */
  tipoVinculo: TipoVinculoServicio;
  vehiculoId?: string;
  inmuebleId?: string;
  /** Solo para tipoVinculo='persona' -- ej. colegio o psicóloga de un
   * integrante puntual. */
  usuarioClienteId?: string;
  periodicidad: PeriodicidadServicio;
  diaVencimientoAproximado?: number;
  montoEstimado?: number;
  activo: boolean;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

export const TIPO_VINCULO_SERVICIO_LABEL: Record<TipoVinculoServicio, string> = {
  vehiculo: 'Vehículo',
  inmueble: 'Inmueble',
  persona: 'Persona',
  general: 'General',
};

export const PERIODICIDAD_SERVICIO_LABEL: Record<PeriodicidadServicio, string> = {
  mensual: 'Mensual',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

// ─── Estado global ───────────────────────────────────────────

/** Fase 70g (05/09, a pedido de Carlos): categoría de gasto personal
 * (tabla compartida `categorias_gasto`, ver comentario en
 * ItemComprobante.categoriaGastoId) -- se carga acá para poder mostrar el
 * desglose de gastos por categoría en el Dashboard. */
export interface CategoriaGasto {
  id: string;
  nombre: string;
}

export interface HomeKeepState {
  proveedores: Proveedor[];
  comprobantes: Comprobante[];
  pagos: Pago[];
  ingresos: Ingreso[];
  tarjetas: TarjetaCredito[];
  resumenesTarjeta: ResumenTarjeta[];
  /** Fase 72: consumos de tarjeta sin resumen todavía (ver
   * ConsumoTarjeta.resumenId) -- se muestran aparte para "cupo disponible"
   * y el gasto acumulado del mes, y se barren cuando se cargan dentro de
   * un resumen real. */
  consumosAbiertos: ConsumoTarjeta[];
  categoriasGasto: CategoriaGasto[];
  /** Fase 74: vehículos e inmuebles (alta desde Perfil Familiar) y
   * servicios (obligaciones recurrentes) que arma el panel dinámico
   * de pagos de servicios continuos. */
  vehiculos: Vehiculo[];
  inmuebles: Inmueble[];
  serviciosHogar: ServicioHogar[];
  nextNumeroComprobante: Record<TipoComprobante, number>;
  nextNumeroPago: number;
  config: HomeKeepConfig;
}

export interface HomeKeepConfig {
  ivaDefault: number;
}

// ─── Labels ──────────────────────────────────────────────────

export const ESTADO_COMPROBANTE_LABEL: Record<EstadoComprobante, string> = {
  pendiente: 'Pendiente',
  pagado_parcial: 'Pago parcial',
  pagado: 'Pagado',
  anulado: 'Anulado',
};

export const TIPO_COMPROBANTE_LABEL: Record<TipoComprobante, string> = {
  factura: 'Factura',
  nota_credito: 'Nota de crédito',
  nota_debito: 'Nota de débito',
};

export const MEDIO_PAGO_LABEL: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  cuenta_corriente: 'Cuenta corriente',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
};

export const CONDICION_IVA_PROV_LABEL: Record<CondicionIvaProveedor, string> = {
  responsable_inscripto: 'Responsable Inscripto',
  monotributista: 'Monotributista',
  exento: 'Exento',
};

// ─── Helpers ─────────────────────────────────────────────────

export function calcularSubtotalItem(cantidad: number, precio: number, descuento: number): number {
  return cantidad * precio * (1 - descuento / 100);
}

export function generarId(): string {
  return crypto.randomUUID();
}

// ─── Agenda familiar (Fase 75k) ──────────────────────────────
// Duplicado deliberado del módulo Agenda (core) -- ver comentario largo
// en la migración 0136_fase75k_home_keep_tareas.sql. Agenda "de negocio"
// mezcla tareas de La Charcutería con lo personal en la misma tabla y
// por eso Cónyuge/Hijo la tienen bloqueada (permisos_rol); esta es una
// tabla propia (`home_keep_tareas`) con su propia RLS atada al permiso
// de home_keep, que esos roles ya tienen. Categorías recortadas
// respecto de CategoriaTarea del módulo Agenda: sin 'trabajo' ni
// 'replanteo' (conceptos de negocio que no aplican acá).

export type CategoriaTareaHogar = 'personal' | 'escolar' | 'salud' | 'pago' | 'otro';
export type PrioridadTareaHogar = 'baja' | 'media' | 'alta';
export type EstadoTareaHogar = 'pendiente' | 'hecho';

export const CATEGORIA_TAREA_HOGAR_LABEL: Record<CategoriaTareaHogar, string> = {
  personal: 'Personal',
  escolar: 'Escolar',
  salud: 'Salud',
  pago: 'Pago',
  otro: 'Otro',
};

export const PRIORIDAD_TAREA_HOGAR_LABEL: Record<PrioridadTareaHogar, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
};

export interface TareaHogar {
  id: string;
  clienteId: string;
  /** A quién de la familia le corresponde este evento -- null = evento
   * compartido, visible para todos (ej. un feriado, un evento familiar).
   * Se resuelve contra `usuarios_cliente` (mismo criterio que
   * Ingreso.usuarioClienteId, Fase 71i). */
  usuarioClienteId?: string;
  titulo: string;
  descripcion: string | null;
  fecha: string; // YYYY-MM-DD
  horaInicio: string | null;
  horaFin: string | null;
  categoria: CategoriaTareaHogar;
  prioridad: PrioridadTareaHogar;
  estado: EstadoTareaHogar;
  /** Tag libre para integraciones automáticas (ej. 'acadeu') -- permite
   * que un job de sincronización identifique sus propias filas para
   * actualizarlas o evitar duplicarlas, sin tocar lo cargado a mano.
   * null/undefined = cargado a mano por alguien de la familia. */
  origen?: string;
  createdAt: string;
}
