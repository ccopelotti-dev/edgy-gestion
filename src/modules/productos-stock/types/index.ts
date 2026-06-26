// Modelo de dominio del Módulo Productos y Stock.
// Diseñado para ser generalista: gastronomía, comercio, producción, servicios, agro.

// ─── Unidades ───────────────────────────────────────────────────────────────────

export type UnidadMedida =
  | 'unidad'
  | 'kg'
  | 'gramo'
  | 'litro'
  | 'ml'
  | 'caja'
  | 'pack'
  | 'docena'
  | 'metro'
  | 'rollo'
  | 'hora'
  | 'm2'
  | 'm3'

export const UNIDADES: { value: UnidadMedida; label: string }[] = [
  { value: 'unidad', label: 'Unidad' },
  { value: 'kg', label: 'Kilogramo' },
  { value: 'gramo', label: 'Gramo' },
  { value: 'litro', label: 'Litro' },
  { value: 'ml', label: 'Mililitro' },
  { value: 'caja', label: 'Caja' },
  { value: 'pack', label: 'Pack' },
  { value: 'docena', label: 'Docena' },
  { value: 'metro', label: 'Metro' },
  { value: 'rollo', label: 'Rollo' },
  { value: 'hora', label: 'Hora' },
  { value: 'm2', label: 'm²' },
  { value: 'm3', label: 'm³' },
]

export function unidadLabel(u: UnidadMedida): string {
  return UNIDADES.find((x) => x.value === u)?.label ?? u
}

export function unidadAbrev(u: UnidadMedida): string {
  const map: Record<UnidadMedida, string> = {
    unidad: 'u',
    kg: 'kg',
    gramo: 'g',
    litro: 'l',
    ml: 'ml',
    caja: 'cj',
    pack: 'pk',
    docena: 'doc',
    metro: 'm',
    rollo: 'rl',
    hora: 'hs',
    m2: 'm²',
    m3: 'm³',
  }
  return map[u] ?? u
}

// ─── IVA ────────────────────────────────────────────────────────────────────────

export type AlicuotaIVA = 0 | 10.5 | 21 | 27

export const ALICUOTAS_IVA: { value: AlicuotaIVA; label: string }[] = [
  { value: 0, label: 'Exento' },
  { value: 10.5, label: '10,5%' },
  { value: 21, label: '21%' },
  { value: 27, label: '27%' },
]

// ─── Categorías ─────────────────────────────────────────────────────────────────

export interface Categoria {
  id: string
  nombre: string
  tipo: 'producto' | 'insumo' | 'ambos'
}

// ─── Producto ───────────────────────────────────────────────────────────────────

export type EstadoProducto = 'activo' | 'inactivo'

export interface Producto {
  id: string
  codigo: string
  nombre: string
  descripcion: string
  categoriaId: string
  precioVenta: number
  costo: number
  iva: AlicuotaIVA
  unidadVenta: UnidadMedida
  stock: number
  stockMinimo: number
  controlaStock: boolean
  disponible: boolean
  estado: EstadoProducto
  /** Si tiene fórmula, el costo se calcula automáticamente */
  tieneFormula: boolean
  createdAt: string
}

// ─── Insumo ─────────────────────────────────────────────────────────────────────

export interface Insumo {
  id: string
  nombre: string
  categoriaId: string
  unidad: UnidadMedida
  stock: number
  stockMinimo: number
  costo: number
  /** Si true, este insumo también puede venderse como producto */
  esComercializable: boolean
  /** ID del producto vinculado (solo si esComercializable = true) */
  productoVinculadoId?: string
  createdAt: string
}

// ─── Formular Producto ──────────────────────────────────────────────────────────
// Reemplaza "Recetas" de Frambuesa. Permite definir la composición de un producto
// con tres capas de costo: insumos, mano de obra y costos operativos.

export type TipoLineaFormula = 'insumo' | 'mano_de_obra' | 'costo_operativo'

export interface LineaFormula {
  id: string
  tipo: TipoLineaFormula
  /** Para tipo=insumo: ID del insumo */
  insumoId?: string
  /** Descripción libre (para mano de obra y costos operativos) */
  descripcion: string
  cantidad: number
  unidad: UnidadMedida
  costoUnitario: number
  /** Módulo origen para integración futura (ej: 'rrhh', 'tesoreria', 'activos') */
  origenModulo?: string
  /** ID del recurso en el módulo origen */
  origenId?: string
}

export interface Formula {
  id: string
  productoId: string
  /** Cantidad que produce esta fórmula (ej: 1 docena, 10 unidades) */
  cantidadProducida: number
  unidadProducida: UnidadMedida
  lineas: LineaFormula[]
  notas: string
  createdAt: string
}

// ─── Stock ──────────────────────────────────────────────────────────────────────

export type MotivoAjuste =
  | 'merma'
  | 'rotura'
  | 'conteo_fisico'
  | 'devolucion'
  | 'otro'

export const MOTIVOS_AJUSTE: { value: MotivoAjuste; label: string }[] = [
  { value: 'merma', label: 'Merma' },
  { value: 'rotura', label: 'Rotura' },
  { value: 'conteo_fisico', label: 'Conteo físico' },
  { value: 'devolucion', label: 'Devolución' },
  { value: 'otro', label: 'Otro' },
]

export interface MovimientoStock {
  id: string
  tipo: 'ingreso' | 'egreso' | 'ajuste'
  itemTipo: 'producto' | 'insumo'
  itemId: string
  cantidad: number
  motivo?: MotivoAjuste
  nota?: string
  costoUnitario?: number
  fecha: string
  origen?: 'recepcion' | 'transferencia' | 'ajuste_manual' | 'formula'
  origenId?: string
}

// ─── Recepción ──────────────────────────────────────────────────────────────────

export type EstadoRecepcion = 'borrador' | 'confirmada' | 'cancelada'

export interface LineaRecepcion {
  id: string
  itemTipo: 'producto' | 'insumo'
  itemId: string
  cantidad: number
  costoUnitario: number
}

export interface Recepcion {
  id: string
  fecha: string
  proveedor: string
  numeroRemito: string
  estado: EstadoRecepcion
  lineas: LineaRecepcion[]
  notas: string
  createdAt: string
}

// ─── Transferencia ──────────────────────────────────────────────────────────────

export interface LineaTransferencia {
  id: string
  itemTipo: 'producto' | 'insumo'
  itemId: string
  cantidad: number
}

export interface Transferencia {
  id: string
  fecha: string
  sucursalOrigen: string
  sucursalDestino: string
  lineas: LineaTransferencia[]
  notas: string
  createdAt: string
}

// ─── Control de Stock ───────────────────────────────────────────────────────────

export interface ReglaControl {
  id: string
  nombre: string
  categoriaId?: string // null = todas las categorías
  frecuenciaDias: number
  createdAt: string
}

export interface RegistroControl {
  id: string
  reglaId: string
  itemTipo: 'producto' | 'insumo'
  itemId: string
  stockSistema: number
  stockContado: number
  diferencia: number
  fecha: string
}

// ─── State general del módulo ───────────────────────────────────────────────────

export interface ProductosStockState {
  productos: Producto[]
  insumos: Insumo[]
  categorias: Categoria[]
  formulas: Formula[]
  movimientos: MovimientoStock[]
  recepciones: Recepcion[]
  transferencias: Transferencia[]
  reglasControl: ReglaControl[]
  registrosControl: RegistroControl[]
}
