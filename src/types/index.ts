// Fase 15: el pack gastronómico se subdividió en dos variantes -- un
// bar/restorán con mesas y salón (todos los módulos, incluida la
// gestión de mesas) versus una rotisería/delivery sin salón (mismo
// núcleo de Ventas/Productos/Tesorería, pero sin mesas-salon ni
// comandas-cocina -- esta última exige mesaId por diseño, ver comentario
// en comandas-cocina/types). Antes existía un solo valor 'gastronomico'
// -- los clientes ya cargados con ese valor se migran a
// 'gastronomico_con_salon' (ver migración 0066).
// Fase 29: se suman 3 categorías combinadas -- muchos emprendedores/pymes
// tienen actividades entrelazadas (ej: un taller que fabrica y también
// vende al público) y no encajan en una sola categoría pura. No
// reemplazan a las puras, se ofrecen como alternativa en el wizard.
export type TipoNegocio =
  | 'gastronomico_con_salon'
  | 'gastronomico_sin_salon'
  | 'comercio'
  | 'logistica'
  | 'produccion'
  | 'servicios'
  | 'agro'
  | 'comercio_produccion'
  | 'comercio_servicios'
  | 'comercio_produccion_servicios'

export const TIPO_NEGOCIO_LABEL: Record<TipoNegocio, string> = {
  gastronomico_con_salon: 'Gastronómico con salón',
  gastronomico_sin_salon: 'Gastronómico sin salón',
  comercio: 'Comercio',
  logistica: 'Logística y transporte',
  produccion: 'Producción',
  servicios: 'Servicios',
  agro: 'Agro',
  comercio_produccion: 'Comercio y Producción',
  comercio_servicios: 'Comercio y Servicios',
  comercio_produccion_servicios: 'Comercio, Producción y Servicios',
}

export type EstadoCliente = 'pendiente' | 'activo'

export interface Cliente {
  id: string
  nombre: string
  tipo_negocio: TipoNegocio
  titular: string | null
  direccion: string | null
  telefono: string | null
  cuit: string | null
  logo_url: string | null
  color_marca: string | null
  slug: string | null
  estado: EstadoCliente
  /** Lista de precio (productos-stock) que usa Comandas/mostrador para
   * cotizar sus líneas -- null significa "seguir usando precioVenta",
   * comportamiento default sin cambios (Fase 6a del refactor de Productos). */
  lista_precio_comandas_id: string | null
  /** Igual que lista_precio_comandas_id pero para el canal Ventas/
   * Facturación (Fase 6c del refactor de Productos). */
  lista_precio_ventas_id: string | null
  /** Igual que lista_precio_comandas_id pero para el canal Delivery por
   * WhatsApp (Fase 6d del refactor de Productos). */
  lista_precio_delivery_id: string | null
  // Fase 28: cumplimiento fiscal ARCA -- estas columnas ya existían en
  // Supabase (Configuración > Empresa las carga hace rato) pero no
  // estaban declaradas acá; el motor de PDF de comprobantes (Fase 28)
  // las necesita para armar el recuadro fiscal del emisor (Anexo II RG
  // 1415) y el bloque de Transparencia Fiscal al Consumidor (RG
  // 5614/2024). `useClienteActual`/`useEmpresa` hacen `select('*')`,
  // así que el dato ya viaja en runtime -- esto solo lo declara en el tipo.
  provincia: string | null
  inicio_actividades: string | null
  ingresos_brutos_condicion: string | null
  ingresos_brutos_numero: string | null
  mostrar_iibb_alicuota: boolean
  iibb_alicuota: number | null
  created_at: string
}

export interface Modulo {
  id: string
  nombre: string
  slug: string
  vertical: TipoNegocio | 'core'
  descripcion: string | null
}

export interface ClienteModulo {
  id: string
  cliente_id: string
  modulo_id: string
  activo: boolean
  activado_en: string | null
}

// Los roles ya no son una lista fija: viven en la tabla `roles`, son
// reutilizables y definibles por cliente. Esto es solo el tipo de la fila.
//
// `vista` decide qué pantalla de /dashboard ve un usuario con este rol:
// el resumen ejecutivo (financiero) o un panel de accesos operativos
// (mesas, comandas, delivery, etc.). Es un campo separado de `es_admin`
// a propósito -- "¿puede administrar roles/equipo?" y "¿qué dashboard
// ve al entrar?" son preguntas distintas, aunque hoy coincidan 1 a 1
// (ver migración 0022_dashboard_operativo.sql).
export type VistaRol = 'administrativo' | 'operativo'

export interface Rol {
  id: string
  cliente_id: string
  nombre: string
  es_sistema: boolean
  es_admin: boolean
  vista: VistaRol
  created_at: string
}

// Nivel real tal como lo usa la base — antes este tipo tenía valores
// ('ver'/'editar') que no coincidían con las filas reales ('lectura'/
// 'escritura'/'admin'), por lo que ningún permiso guardado con los
// valores viejos habría funcionado nunca contra nivel_rango() en SQL.
export type NivelPermiso = 'sin_acceso' | 'lectura' | 'escritura' | 'admin'

export interface PermisoRol {
  id: string
  rol_id: string
  modulo_id: string
  nivel: NivelPermiso
}

export type AuthMode = 'full' | 'pin'

export interface UsuarioCliente {
  id: string
  cliente_id: string
  user_id: string | null
  email: string | null
  rol: string | null // texto libre legado — usar rol_id para altas nuevas
  rol_id: string | null
  cuil: string | null
  nombre: string | null
  auth_mode: AuthMode
  /** null = acceso global (todos los puntos de venta del cliente).
   * Fase 27a. FK a `puntos_venta` (Configuración > Facturación) --
   * mismo catálogo que ya existía pensado para esto, ver
   * src/modules/configuracion/types/index.ts (`PuntoVenta`). */
  punto_venta_id: string | null
  /** Fase 30: true = la próxima vez que entra al dashboard, se le pide
   * definir un email nuevo antes de dejarlo pasar. Lo prende el staff
   * desde ClienteDetalle.tsx. */
  debe_cambiar_email: boolean
}

export interface Permiso {
  id: string
  usuario_cliente_id: string
  modulo_id: string
  nivel: NivelPermiso
}

export interface PersonalEdgy {
  user_id: string
  nombre: string | null
  activo: boolean
  created_at: string
}

// Catálogo sugerido por tipo de negocio — preselección en el Paso 3 del wizard.
// No reemplaza la tabla `modulos`, es solo el mapeo de sugerencia inicial.
export const MODULOS_SUGERIDOS: Record<TipoNegocio, string[]> = {
  gastronomico_con_salon: ['mesas-salon', 'comandas-cocina', 'menu-qr', 'ventas-online', 'caja-turno', 'viandas'],
  // Sin salón (rotisería/delivery): mismos módulos de venta/catálogo/caja,
  // pero sin mesas-salon ni comandas-cocina -- esta última exige mesaId
  // por diseño (Comanda.mesaId no es opcional), así que el ciclo de
  // cocina/entrega corre por ordenes_venta (Ventas Online) en vez de
  // Comandas.
  gastronomico_sin_salon: ['menu-qr', 'ventas-online', 'caja-turno', 'viandas'],
  comercio: ['productos-stock', 'ventas', 'compras'],
  logistica: ['rutas', 'rendicion', 'gps'],
  produccion: ['produccion-servicios', 'productos-stock'],
  servicios: ['servicios', 'clientes'],
  agro: ['rutas', 'gps', 'rendicion'],
  // Combinadas: unión (sin duplicados) de los módulos de cada categoría
  // pura que las compone.
  comercio_produccion: ['productos-stock', 'ventas', 'compras', 'produccion-servicios'],
  comercio_servicios: ['productos-stock', 'ventas', 'compras', 'servicios', 'clientes'],
  comercio_produccion_servicios: [
    'productos-stock',
    'ventas',
    'compras',
    'produccion-servicios',
    'servicios',
    'clientes',
  ],
}

// Roles sugeridos por tipo de negocio — semilla para el Paso 4 del wizard.
// "Dueño" no aparece acá porque se crea siempre, aparte, con es_admin=true.
export const ROLES_SUGERIDOS: Record<TipoNegocio, string[]> = {
  gastronomico_con_salon: ['Encargado', 'Mozo', 'Cocina', 'Cajero', 'Delivery'],
  // Sin "Mozo" -- no hay mesas que atender sin salón.
  gastronomico_sin_salon: ['Encargado', 'Cocina', 'Cajero', 'Delivery'],
  comercio: ['Encargado', 'Vendedor', 'Cajero'],
  logistica: ['Encargado', 'Chofer'],
  produccion: ['Encargado', 'Operario'],
  servicios: ['Encargado', 'Técnico'],
  agro: ['Encargado', 'Operario'],
  // Combinadas: unión (sin duplicados) de los roles de cada categoría
  // pura que las compone.
  comercio_produccion: ['Encargado', 'Vendedor', 'Cajero', 'Operario'],
  comercio_servicios: ['Encargado', 'Vendedor', 'Cajero', 'Técnico'],
  comercio_produccion_servicios: ['Encargado', 'Vendedor', 'Cajero', 'Operario', 'Técnico'],
}
