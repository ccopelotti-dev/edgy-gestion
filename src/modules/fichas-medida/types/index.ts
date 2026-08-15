// Tipos del módulo Fichas de medida.
//
// Origen: Punto Tex (Marina) toma medidas a domicilio para armar un
// presupuesto de productos hechos a medida -- hoy cortinas, mañana
// puede sumarse tapicería, fundas, etc. sin romper este modelo (ver
// comentario de la migración 0082_fichas_medida.sql). Dos tipos de
// ficha conviven en la misma tabla de ítems (columnas nullable según
// cuál no aplique), en vez de una tabla por rubro.

export type TipoFicha = 'generica' | 'cortinas'
export type EstadoFicha = 'borrador' | 'lista' | 'convertida'

export const TIPO_FICHA_LABEL: Record<TipoFicha, string> = {
  generica: 'Genérica',
  cortinas: 'Cortinas',
}

export const ESTADO_FICHA_LABEL: Record<EstadoFicha, string> = {
  borrador: 'Borrador',
  lista: 'Lista',
  convertida: 'Convertida a presupuesto',
}

// Opciones fijas de Tipo de barral / Tipo de cortina -- tomadas tal
// cual del papel de Punto Tex. Texto libre en la base de datos (no
// ameritan catálogo aparte), pero se centralizan acá para no repetir
// la lista en el dialog.
export const TIPOS_BARRAL = ['Fleje', 'Riel', 'Barral de madera o hierro'] as const
export const TIPOS_CORTINA = [
  'Presilla oculta',
  'Presilla alta',
  'Pasa barral',
  'Plizada',
  'Tabla escondida',
  'Pellizco doble',
  'Pellizco triple',
  'Tablón',
] as const

export interface PanoMedida {
  id: string
  ancho: number | null
  alto: number | null
}

export interface ItemFichaMedida {
  id: string
  producto: string
  tela?: string
  cantidad: number
  // Genérica
  medida?: string
  peso?: string
  // Cortinas
  incluyeBarral?: boolean
  tipoBarral?: string
  tipoCortina?: string
  notas?: string
  /** Solo se usa si la ficha es tipo 'cortinas' -- varias ventanas/paños
   * con Ancho/Alto propios por ítem. */
  panos: PanoMedida[]
}

export interface FichaMedida {
  id: string
  clienteVentaId: string
  /** Denormalizado en el join de lectura -- no se persiste acá, viene
   * siempre de clientes_venta (fuente de verdad real). */
  clienteNombre: string
  clienteTelefono?: string
  clienteDireccion?: string
  tipo: TipoFicha
  estado: EstadoFicha
  fechaPedido: string
  fechaEntrega?: string
  sena: number
  total: number
  notas?: string
  presupuestoId?: string
  items: ItemFichaMedida[]
  createdAt: string
  updatedAt: string
}
