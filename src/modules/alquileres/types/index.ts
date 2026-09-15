// Modelo de dominio del Módulo Alquileres (Fase 82, 15/09).
//
// Origen: migración desde un proyecto viejo y aparte ("GD Neuquén" /
// G-Admin-Prop, Supabase propio) que Carlos venía usando para administrar
// el alquiler de los departamentos de su suegro y de su cuñado, gestionado
// operativamente por Rosana y Mateo (el Cliente real de este módulo dentro
// de Edgy Gestión -- Carlos no opera el negocio, solo lo integró). Pensado
// desde el día 1 para ser reutilizable por otros clientes de Edgy que
// administren alquileres (no es exclusivo de GD Neuquén).
//
// Domina: Propietario (dueño real del inmueble, cobra el alquiler menos la
// comisión de administración) -> Propiedad (un edificio/complejo) ->
// Unidad (depto/local/cochera individual, lo que efectivamente se alquila)
// -> Inquilino (contrato vigente sobre una unidad) -> Pago (cobranza
// mensual, con el desglose que arma la liquidación al propietario).
//
// Mejoras deliberadas respecto del sistema viejo (ver migración
// 0148_fase82b_esquema_alquileres.sql para el detalle en la base): FKs
// reales entre todas las entidades, garantes como array tipado (no texto
// plano), montoTotal de un pago siempre consistente (columna generada en
// Supabase, no se recalcula a mano en cada pantalla).

export type TipoUnidad = 'departamento' | 'local' | 'cochera'
export const TIPOS_UNIDAD: { value: TipoUnidad; label: string }[] = [
  { value: 'departamento', label: 'Departamento' },
  { value: 'local', label: 'Local' },
  { value: 'cochera', label: 'Cochera' },
]

export type EstadoUnidad = 'disponible' | 'ocupada' | 'mantenimiento'
export const ESTADOS_UNIDAD: { value: EstadoUnidad; label: string }[] = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'ocupada', label: 'Ocupada' },
  { value: 'mantenimiento', label: 'En mantenimiento' },
]

export type FormaPago = 'efectivo' | 'transferencia'
export const FORMAS_PAGO: { value: FormaPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia bancaria' },
]

export interface Propietario {
  id: string
  nombreCompleto: string
  documento: string
  telefono: string
  email?: string
  direccion?: string
  /** % que se descuenta de cada cobranza como honorario de administración. */
  comisionPorcentaje: number
  /** Path dentro del bucket privado "archivos-cliente" (carpeta = cliente_id). */
  firmaPath?: string
  createdAt: string
}

export interface Propiedad {
  id: string
  propietarioId: string
  nombre: string
  direccion?: string
  createdAt: string
}

export interface Unidad {
  id: string
  propiedadId: string
  nombre: string
  tipo: TipoUnidad
  ambientes?: number
  superficieM2?: number
  extras?: string
  estado: EstadoUnidad
  createdAt: string
}

export interface Garante {
  nombre: string
  apellido: string
  documento?: string
  telefono?: string
  email?: string
  direccion?: string
}

export interface Inquilino {
  id: string
  unidadId: string
  nombre: string
  apellido: string
  documento?: string
  direccion?: string
  ciudad?: string
  provincia?: string
  codigoPostal?: string
  telefono?: string
  email?: string
  montoAlquiler: number
  inicioContrato?: string
  finContrato?: string
  montoDeposito: number
  frecuenciaAjuste?: string
  garantes: Garante[]
  notas?: string
  createdAt: string
}

export interface DatosBancariosPago {
  cbuAlias?: string
}

export interface Pago {
  id: string
  inquilinoId: string
  unidadId?: string
  propietarioId?: string
  fecha: string
  concepto?: string
  formaPago?: FormaPago
  montoAlquiler: number
  montoTasas: number
  montoExpensas: number
  montoOtros: number
  /** Generada en la base (monto_total) -- nunca se manda en un insert/update. */
  montoTotal: number
  comisionPorcentajeAplicado?: number
  comisionAdmin?: number
  saldoPropietario?: number
  periodoFechas: string[]
  datosBancarios?: DatosBancariosPago
  comprobantePath?: string
  numeroRecibo?: string
  firmadoPor?: string
  notas?: string
  createdAt: string
}

export type EstadoEvento = 'abierto' | 'cerrado'

export interface Evento {
  id: string
  unidadId: string
  fecha: string
  descripcion?: string
  accion?: string
  estado: EstadoEvento
  costo?: number
  createdAt: string
}

// Nota: `edgy_gestion.alquileres_eventos` (mantenimiento) ya existe en la
// base (ver migración 0148_fase82b_esquema_alquileres.sql) pero todavía no
// tiene pantalla propia ni entra al estado de este módulo -- se suma en una
// fase siguiente (el sistema viejo lo mostraba nada más como alertas en el
// Dashboard, sin un ABM dedicado).

export interface AlquileresState {
  propietarios: Propietario[]
  propiedades: Propiedad[]
  unidades: Unidad[]
  inquilinos: Inquilino[]
  pagos: Pago[]
}
