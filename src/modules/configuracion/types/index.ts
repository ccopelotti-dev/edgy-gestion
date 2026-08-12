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

// Fase 28: condición del negocio ante Ingresos Brutos -- dato exigido
// por el Anexo II de la RG 1415 en el recuadro fiscal de toda factura
// ("N° de inscripción ... o condición de NO CONTRIBUYENTE"). No
// confundir con `CategoriaImpositiva` (esa es la condición ante IVA).
export type IngresosBrutosCondicion =
  | 'inscripto_local'
  | 'inscripto_convenio_multilateral'
  | 'exento'
  | 'no_contribuyente'

// Fase 15: mismo split que src/types/index.ts (única fuente real es la
// columna clientes.tipo_negocio -- este tipo es una copia local para no
// importar del módulo Ventas/onboarding acá, ver comentario del archivo).
export type TipoNegocio =
  | 'gastronomico_con_salon'
  | 'gastronomico_sin_salon'
  | 'comercio'
  | 'logistica'
  | 'produccion'
  | 'servicios'
  | 'agro'
  // Fase 29: categorías combinadas -- ver comentario espejo en
  // src/types/index.ts.
  | 'comercio_produccion'
  | 'comercio_servicios'
  | 'comercio_produccion_servicios'

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
  // Fase 28: cumplimiento fiscal ARCA -- Ingresos Brutos (Anexo II RG
  // 1415) y el bloque de Transparencia Fiscal al Consumidor (RG
  // 5614/2024). `provincia` (arriba) se reutiliza como jurisdicción de
  // IIBB, no hace falta un campo aparte.
  ingresosBrutosCondicion: IngresosBrutosCondicion | null
  ingresosBrutosNumero: string | null
  mostrarIibbAlicuota: boolean
  iibbAlicuota: number | null
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
  /** Fase 27d-2: identificador público de ESTE local en el Menú
   * público (`/menu/<slug del cliente>/<este slug>`) -- análogo a
   * `clientes.slug` pero a nivel local. Único por cliente, nullable
   * (un local sin slug simplemente no tiene link propio todavía). */
  slug: string | null
  createdAt: string
  /** Fase 36: branding propio de este local, para clientes multi-marca
   * (ej. Punto Tex / Rúa bajo el mismo cliente). null en cualquiera de
   * los tres = se usa el branding del cliente (clientes.logo_url/
   * nombre/color_marca), sin cambios respecto a antes. */
  logoUrl: string | null
  nombreVisible: string | null
  colorMarca: string | null
}

export const CATEGORIAS_IMPOSITIVAS: { value: CategoriaImpositiva; label: string }[] = [
  { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
  { value: 'monotributista', label: 'Monotributista' },
  { value: 'responsable_no_inscripto', label: 'Responsable no inscripto' },
  { value: 'exento', label: 'Exento' },
]

export const INGRESOS_BRUTOS_CONDICIONES: { value: IngresosBrutosCondicion; label: string }[] = [
  { value: 'inscripto_local', label: 'Inscripto — Local (una sola provincia)' },
  { value: 'inscripto_convenio_multilateral', label: 'Inscripto — Convenio Multilateral' },
  { value: 'exento', label: 'Exento' },
  { value: 'no_contribuyente', label: 'No contribuyente' },
]

export const PERSONERIAS: { value: Personeria; label: string }[] = [
  { value: 'fisica', label: 'Persona física' },
  { value: 'juridica', label: 'Persona jurídica' },
]

export const TIPOS_NEGOCIO_LABEL: Record<TipoNegocio, string> = {
  gastronomico_con_salon: 'Gastronómico con salón',
  gastronomico_sin_salon: 'Gastronómico sin salón',
  comercio: 'Comercio',
  logistica: 'Logística',
  produccion: 'Producción',
  servicios: 'Servicios',
  agro: 'Agro',
  comercio_produccion: 'Comercio y Producción',
  comercio_servicios: 'Comercio y Servicios',
  comercio_produccion_servicios: 'Comercio, Producción y Servicios',
}
