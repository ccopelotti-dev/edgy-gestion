export type TipoNegocio =
  | 'gastronomico'
  | 'comercio'
  | 'logistica'
  | 'produccion'
  | 'servicios'
  | 'agro'

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
export interface Rol {
  id: string
  cliente_id: string
  nombre: string
  es_sistema: boolean
  es_admin: boolean
  created_at: string
}

// Nivel real tal como lo usa la base — antes este tipo tenía valores
// ('ver'/'editar') que no coincidían con las filas reales ('lectura'/
// 'escritura'/'admin'), por lo que ningún permiso guardado con los
// valores viejos habría funcionado nunca contra nivel_rango() en SQL.
export type NivelPermiso = 'lectura' | 'escritura' | 'admin'

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
  gastronomico: ['mesas-salon', 'comandas-cocina', 'menu-qr', 'delivery-whatsapp', 'caja-turno'],
  comercio: ['productos-stock', 'ventas', 'compras'],
  logistica: ['rutas', 'rendicion', 'gps'],
  produccion: ['produccion-servicios', 'productos-stock'],
  servicios: ['servicios-contratados', 'clientes'],
  agro: ['rutas', 'gps', 'rendicion'],
}

// Roles sugeridos por tipo de negocio — semilla para el Paso 4 del wizard.
// "Dueño" no aparece acá porque se crea siempre, aparte, con es_admin=true.
export const ROLES_SUGERIDOS: Record<TipoNegocio, string[]> = {
  gastronomico: ['Encargado', 'Mozo', 'Cocina', 'Cajero', 'Delivery'],
  comercio: ['Encargado', 'Vendedor', 'Cajero'],
  logistica: ['Encargado', 'Chofer'],
  produccion: ['Encargado', 'Operario'],
  servicios: ['Encargado', 'Técnico'],
  agro: ['Encargado', 'Operario'],
}

