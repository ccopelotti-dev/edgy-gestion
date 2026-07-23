// Fase 15: el pack gastronómico se subdividió en dos variantes -- un
// bar/restorán con mesas y salón (todos los módulos, incluida la
// gestión de mesas) versus una rotisería/delivery sin salón (mismo
// núcleo de Ventas/Productos/Tesorería, pero sin mesas-salon ni
// comandas-cocina -- esta última exige mesaId por diseño, ver comentario
// en comandas-cocina/types). Antes existía un solo valor 'gastronomico'
// -- los clientes ya cargados con ese valor se migran a
// 'gastronomico_con_salon' (ver migración 0066).
export type TipoNegocio =
  | 'gastronomico_con_salon'
  | 'gastronomico_sin_salon'
  | 'comercio'
  | 'logistica'
  | 'produccion'
  | 'servicios'
  | 'agro'

export const TIPO_NEGOCIO_LABEL: Record<TipoNegocio, string> = {
  gastronomico_con_salon: 'Gastronómico con salón',
  gastronomico_sin_salon: 'Gastronómico sin salón',
  comercio: 'Comercio',
  logistica: 'Logística y transporte',
  produccion: 'Producción',
  servicios: 'Servicios',
  agro: 'Agro',
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
}
