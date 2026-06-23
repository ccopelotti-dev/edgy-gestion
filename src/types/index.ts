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

export type RolUsuario = 'admin' | 'encargado' | 'mozo' | 'cocina' | 'cajero'

export interface UsuarioCliente {
  id: string
  cliente_id: string
  user_id: string
  email: string
  rol: RolUsuario
}

export type NivelPermiso = 'ver' | 'editar' | 'admin'

export interface Permiso {
  id: string
  usuario_cliente_id: string
  modulo_id: string
  nivel: NivelPermiso
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
