// Módulo Configuración — tipos.
// DatosEmpresa refleja la fila real de edgy_gestion.clientes (más los
// campos fiscales nuevos de la migración 0009). Los datos "nativos" del
// alta (nombre, titular, dirección, teléfono, cuit, tipo de negocio,
// slug) los carga el wizard de onboarding (NuevoProyecto.tsx) — acá
// solo se leen y, según el campo, se pueden editar o no.

export type CategoriaImpositiva =
  | 'exento'
  | 'responsable_inscripto'
  | 'responsable_no_inscripto'
  | 'monotributista'

export type Personeria = 'fisica' | 'juridica'

export type TipoNegocio =
  | 'gastronomico'
  | 'comercio'
  | 'logistica'
  | 'produccion'
  | 'servicios'
  | 'agro'

export type EstadoCliente = 'pendiente' | 'activo'

export interface DatosEmpresa {
  id: string
  nombre: string
  tipoNegocio: TipoNegocio
  titular: string | null
  direccion: string | null
  telefono: string | null
  cuit: string | null
  logoUrl: string | null
  colorMarca: string | null
  slug: string | null
  estado: EstadoCliente
  // Campos fiscales — no se cargan en el wizard, se completan acá.
  categoriaImpositiva: CategoriaImpositiva | null
  personeria: Personeria | null
  inicioActividades: string | null
  provincia: string | null
  localidad: string | null
  codigoPostal: string | null
  // Fase 16 (Backlog menor): horario de atención del Catálogo público
  // -- opcional y apagado por defecto. horarioDias usa la misma
  // convención que JS Date.getDay(): 0 = domingo … 6 = sábado.
  horarioActivo: boolean
  horarioApertura: string | null
  horarioCierre: string | null
  horarioDias: number[]
  // Fase 19 (prep): título personalizable de la sección de Combos en el
  // catálogo público y demás listados. Default 'Combos'.
  combosTituloSeccion: string
}

/**
 * Puntos de venta — unifica "sucursal" y "punto de venta ARCA" en una
 * sola entidad, igual que lo hace Contabilium (ver
 * /modulos/miCuenta/sucursales.aspx, que en la UI se llama "Puntos de
 * venta ARCA"). `numero` es el número fiscal AFIP y queda opcional
 * hasta que el cliente conecte facturación electrónica; hasta entonces
 * el punto de venta funciona igual como agrupador de local/depósito.
 */
export interface PuntoVenta {
  id: string
  clienteId: string
  numero: string | null
  alias: string
  direccion: string | null
  activo: boolean
  porDefecto: boolean
  paraIntegraciones: boolean
  fechaBaja: string | null
  createdAt: string
}

export const CATEGORIAS_IMPOSITIVAS: { value: CategoriaImpositiva; label: string }[] = [
  { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
  { value: 'monotributista', label: 'Monotributista' },
  { value: 'responsable_no_inscripto', label: 'Responsable no inscripto' },
  { value: 'exento', label: 'Exento' },
]

export const PERSONERIAS: { value: Personeria; label: string }[] = [
  { value: 'fisica', label: 'Persona física' },
  { value: 'juridica', label: 'Persona jurídica' },
]

export const TIPOS_NEGOCIO_LABEL: Record<TipoNegocio, string> = {
  gastronomico: 'Gastronómico',
  comercio: 'Comercio',
  logistica: 'Logística',
  produccion: 'Producción',
  servicios: 'Servicios',
  agro: 'Agro',
}
