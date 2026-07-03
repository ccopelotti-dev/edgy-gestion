// Modelo de dominio del Módulo Servicios.
// Pensado para clientes profesionales (médicos, ingenieros, abogados, oficios,
// consultores, etc.) — más simple que Productos y Stock: sin stock, sin
// fórmulas, sin recepción/transferencias. Es, en esencia, un catálogo de
// servicios ofrecidos con su modalidad de precio.
//
// Deliberadamente separado de Productos y Stock (no "Productos y servicios"
// como Contabilium): un rubro de Servicios no tiene nada que ver con un
// rubro de Productos/Insumos, y mezclar ambos habría forzado un campo
// `tipo` con demasiadas combinaciones sin sentido (ej. "solo servicios").

// ─── Rubros y Sub-rubros de Servicios ──────────────────────────────────────────
// Mismo patrón de 2 niveles que Productos y Stock (rubro obligatorio,
// sub-rubro opcional), pero en tablas propias: un "Rubro" de Productos
// (ej. Bebidas) no tiene relación alguna con uno de Servicios (ej. Salud,
// Legal, Construcción) y compartir la tabla solo habría agregado un campo
// `tipo` con una tercera opción sin necesidad real de cruce entre ambos.

export interface RubroServicio {
  id: string
  nombre: string
}

export interface SubRubroServicio {
  id: string
  rubroId: string
  nombre: string
}

// ─── Precio ─────────────────────────────────────────────────────────────────────
// La flexibilidad pedida para soportar distintas profesiones: un médico suele
// cobrar por sesión, un abogado por hora o por gestión (fijo), un oficio
// muchas veces "a convenir" (sin precio público, se cotiza por trabajo).

export type ModalidadPrecio = 'fijo' | 'por_hora' | 'por_sesion' | 'a_convenir'

export const MODALIDADES_PRECIO: { value: ModalidadPrecio; label: string }[] = [
  { value: 'fijo', label: 'Precio fijo' },
  { value: 'por_hora', label: 'Por hora' },
  { value: 'por_sesion', label: 'Por sesión' },
  { value: 'a_convenir', label: 'A convenir' },
]

export function modalidadPrecioLabel(m: ModalidadPrecio): string {
  return MODALIDADES_PRECIO.find((x) => x.value === m)?.label ?? m
}

// ─── Variantes ──────────────────────────────────────────────────────────────────
// Un servicio "con variantes" reemplaza el precio único por una lista (ej.
// "Consulta" con variantes "Primera vez" / "Control"; "Corte" con "Corto" /
// "Largo"). Cada variante tiene su propia modalidad y precio, porque no
// necesariamente cobran igual (ej. "Consulta domiciliaria" por sesión y
// "Seguimiento telefónico" a convenir, dentro del mismo servicio).

export interface VarianteServicio {
  id: string
  nombre: string
  modalidadPrecio: ModalidadPrecio
  /** Vacío/undefined cuando modalidadPrecio === 'a_convenir' */
  precio?: number
  /** Opcional: útil a futuro para un módulo de Turnos/Agenda (no incluido en esta entrega) */
  duracionEstimadaMin?: number
}

// ─── Servicio ───────────────────────────────────────────────────────────────────

export type TipoServicio = 'unico' | 'con_variantes'

export type EstadoServicio = 'activo' | 'inactivo'

export interface Servicio {
  id: string
  titulo: string
  descripcion: string
  rubroId: string
  subRubroId?: string
  tipo: TipoServicio
  estado: EstadoServicio
  /**
   * Imagen de referencia (URL). A diferencia de la galería de Productos
   * (subida a Supabase Storage), acá alcanza con una sola imagen por URL —
   * mismo campo que muestra Contabilium en su alta de servicio.
   */
  imagenUrl?: string

  // Si tipo === 'unico': precio directo acá.
  modalidadPrecio?: ModalidadPrecio
  precio?: number
  duracionEstimadaMin?: number

  // Si tipo === 'con_variantes': el precio vive en cada variante, estos
  // campos directos no se usan.
  variantes: VarianteServicio[]

  createdAt: string
}

// ─── State general del módulo ───────────────────────────────────────────────────

export interface ServiciosState {
  servicios: Servicio[]
  rubros: RubroServicio[]
  subRubros: SubRubroServicio[]
}
