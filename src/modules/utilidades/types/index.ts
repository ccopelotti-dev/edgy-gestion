// Modelo de dominio del Módulo Utilidades.
// Caja de herramientas transversal: no pertenece a un módulo de negocio
// puntual, pero varios módulos la necesitan. Ver Diseno_Modulo_Utilidades.md.
//
// A diferencia de Productos y Stock / Servicios (localStorage hasta su
// migración a Supabase), Explorador de archivos e Importación masiva son
// Supabase-backed desde el dia uno: un archivo no puede "vivir" en
// localStorage, y la importación masiva necesita escribir en tablas reales
// para ser útil. Tracking de horas sí sigue el patrón localStorage del
// resto de los módulos (no urge persistencia real todavía).

// ─── Explorador de archivos ─────────────────────────────────────────────────

/** Carpeta creada a mano por el usuario ("+ Crear carpeta"). Las carpetas
 * "automáticas" (una por módulo de origen) NO son filas de esta tabla -- se
 * calculan del lado del cliente a partir de los origenModulo presentes en
 * los archivos. */
export interface Carpeta {
  id: string
  nombre: string
  createdAt: string
}

/** Slugs de módulo reconocidos como origen automático de archivos. Ninguno
 * los usa todavía (ver nota en Explorador.tsx) -- quedan preparados para
 * cuando Tesorería/Productos y Stock/Ventas/Compras empiecen a adjuntar
 * comprobantes acá. */
export type ModuloOrigenArchivo = 'tesoreria' | 'productos-stock' | 'ventas' | 'compras' | 'servicios'

export interface Archivo {
  id: string
  carpetaId?: string
  origenModulo?: ModuloOrigenArchivo
  origenId?: string
  nombre: string
  /** Ruta del objeto en el bucket "archivos-cliente" (privado). La URL de
   * descarga se firma al vuelo, no se guarda una URL permanente. */
  path: string
  tamanioBytes: number
  createdAt: string
}

// ─── Importación masiva ─────────────────────────────────────────────────────
// Deliberadamente acotada a las entidades que ya tienen tabla real en
// Supabase (Productos, Rubros de Productos, Servicios, Rubros de Servicios).
// Contabilium soporta ~14 tipos (Clientes, Facturas, Plan de cuentas, etc.)
// pero la mayoría todavía no existen en Edgy -- se agregan acá cuando
// tengan tabla propia, no antes.

export type EntidadImportable = 'productos' | 'rubros_producto' | 'servicios' | 'rubros_servicio'

export const ENTIDADES_IMPORTABLES: { value: EntidadImportable; label: string }[] = [
  { value: 'productos', label: 'Productos' },
  { value: 'rubros_producto', label: 'Rubros (Productos y Stock)' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'rubros_servicio', label: 'Rubros (Servicios)' },
]

export type EstadoImportacion = 'completada' | 'con_errores'

export interface ImportacionMasiva {
  id: string
  entidad: EntidadImportable
  nombreArchivo: string
  totalFilas: number
  filasValidas: number
  filasConError: number
  estado: EstadoImportacion
  createdAt: string
}

/** Resultado de parsear + validar un CSV contra el esquema de una entidad,
 * antes de confirmar el import. */
export interface FilaImportacion {
  numeroFila: number
  datos: Record<string, string>
  valida: boolean
  error?: string
}

// ─── Tracking de horas ──────────────────────────────────────────────────────

export interface SeguimientoHoras {
  id: string
  nombre: string
  personaNombre: string
  /** Módulo/recurso al que se vincula (ej. 'productos-stock' + el id de una
   * Fórmula), para que Formular Producto pueda tirar de acá en vez de
   * cargar el costo de mano de obra a mano. Opcional -- un seguimiento
   * puede ser solo interno, sin vínculo. */
  origenModulo?: string
  origenId?: string
  createdAt: string
}

export interface EntradaHoras {
  id: string
  seguimientoId: string
  fecha: string
  horas: number
  descripcion: string
}

export interface UtilidadesState {
  seguimientos: SeguimientoHoras[]
  entradas: EntradaHoras[]
}
