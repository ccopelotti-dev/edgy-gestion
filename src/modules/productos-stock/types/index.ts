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

// ─── Rubros y Sub-rubros ────────────────────────────────────────────────────────
// Reemplaza a la vieja "Categoria" (un solo nivel). Rubro y Sub-rubro son
// compartidos entre Producto e Insumo (mismo campo `tipo`, igual que antes).
// Un Sub-rubro siempre pertenece a un Rubro (rubroId obligatorio) y es opcional
// para el producto/insumo (podés clasificar solo por Rubro si todavia no hace
// falta el detalle del Sub-rubro).

export interface Rubro {
  id: string
  nombre: string
  tipo: 'producto' | 'insumo' | 'ambos'
  /** Plantilla de garantía default para todos los productos de este rubro
   * (Fase 4). Un producto puntual puede pisarla con su propia
   * `plantillaGarantiaId` -- ver comentario en Producto. */
  plantillaGarantiaId?: string
}

export interface SubRubro {
  id: string
  rubroId: string
  nombre: string
}

// ─── Marca ──────────────────────────────────────────────────────────────────────
// Catálogo simple por cliente, mismo patrón que Rubro -- evita que "Coca Cola"
// y "coca cola" queden como si fueran marcas distintas por errores de tipeo.

export interface Marca {
  id: string
  nombre: string
}

// ─── Listas de precio ───────────────────────────────────────────────────────────
// Fase 3 del refactor de Productos. Catálogo flexible (crear/renombrar/borrar,
// igual que Marca) de listas de precio -- ej. "Mostrador/Salón", "Delivery",
// "Mayorista/Eventos". Cada lista define un % de recargo por defecto sobre el
// costo del producto. El precio final en esa lista es
// costo * (1 + porcentajeRecargo / 100), salvo que el producto tenga un
// override puntual para esa combinación (ver ProductoPrecio).
//
// IMPORTANTE: Producto.precioVenta NO se toca en esta fase -- sigue siendo el
// precio que usan Ventas, Comandas, Menú QR, Delivery y
// Presupuestos/Cotizaciones (funciona como la lista "default" implícita).
// Migrar esos módulos a usar listas de precio en vez de precioVenta queda
// para una fase futura (Fase 6), a pedido del usuario.

export interface ListaPrecio {
  id: string
  nombre: string
  /** % de recargo por defecto sobre el costo (ej: 30 = +30% sobre costo). */
  porcentajeRecargo: number
}

export interface ProductoPrecio {
  id: string
  productoId: string
  listaId: string
  /** Override manual del precio para este producto en esta lista. Si no
   * hay fila para una combinación producto+lista, el precio se calcula
   * como costo * (1 + lista.porcentajeRecargo / 100). */
  precio: number
}

// ─── Garantía ───────────────────────────────────────────────────────────────────
// Fase 4 del refactor de Productos. Catálogo de plantillas de garantía (ej.
// "12 meses - electrodomésticos"), con duración en meses y texto libre de
// cobertura/condiciones. Se puede asignar una plantilla default a nivel
// Rubro (Rubro.plantillaGarantiaId, aplica a todos sus productos) y
// opcionalmente pisarla a nivel Producto puntual (Producto.plantillaGarantiaId).
//
// Esta fase deja todo LISTO del lado de Productos -- la activación real de
// una garantía (para qué cliente, desde cuándo corre) sucede recién cuando
// Ventas emite una factura, y eso es una fase futura (Fase 6, a pedido del
// usuario): en ese momento Ventas va a consultar si el producto vendido
// tiene una plantilla de garantía asignada (directa o heredada del rubro) y
// crear el registro de garantía emitida con la fecha de vencimiento
// calculada a partir de duracionMeses.

export interface PlantillaGarantia {
  id: string
  nombre: string
  /** Duración de la garantía, en meses. */
  duracionMeses: number
  /** Texto libre de cobertura/condiciones (ej: "Cubre defectos de fábrica, no cubre uso indebido"). */
  cobertura: string
}

// ─── Combos ─────────────────────────────────────────────────────────────────────
// Fase 5 del refactor de Productos. Un combo agrupa productos existentes en
// un ítem vendible a precio fijo (ej: "Combo Menú" = Hamburguesa + Papas +
// 1 bebida a elección). Confirmado con el usuario:
//   - Composición mixta: componentes FIJOS (producto + cantidad exacta) más
//     slots de ELECCIÓN (rubro + cantidad a elegir de ese rubro, ej. "elegí
//     1 bebida"). La elección real del cliente sucede recién al vender el
//     combo -- acá solo se define el slot (de qué rubro, cuántos).
//   - Precio: el precio de venta final queda editable a mano por el usuario,
//     pero la UI calcula un "precio sugerido" sumando el precio de venta
//     base de cada componente fijo (cantidad x precioVenta del producto) y
//     restando descuentoPorcentaje -- confirmado con el usuario (Fase 5b):
//     no se usa ninguna lista de precios para esto, solo precioVenta base.
//   - Stock: el combo NO tiene stock propio. Vender un combo (Fase 6) va a
//     descontar stock de cada componente fijo; los slots de elección van a
//     descontar del producto puntual que el cliente elija en ese momento.
//     Acá solo se arma la "receta" del combo, sin tocar stock.
//
// Fase 5b (mejoras, a pedido del usuario): se suma galería de fotos (mismo
// patrón que Productos, hasta MAX_IMAGENES_PRODUCTO), campo de % de
// descuento para el cálculo del precio sugerido, y generación de una imagen
// promocional JPG (logo + foto + nombre + precio + descripción) -- ver
// lib/imagenPromocional.ts.
//
// Esta fase deja todo LISTO del lado de Productos -- igual que Listas de
// precio (Fase 3) y Garantía (Fase 4), la venta real de un combo (con
// descuento de stock de sus componentes) se conecta en Fase 6.

export interface ComboComponenteFijo {
  id: string
  productoId: string
  cantidad: number
}

export interface ComboComponenteEleccion {
  id: string
  /** Rubro del que el cliente va a elegir productos al momento de la venta. */
  rubroId: string
  /** Cantidad de ítems a elegir de este rubro (ej: 1 = "elegí 1 bebida"). */
  cantidad: number
}

export interface Combo {
  id: string
  nombre: string
  descripcion: string
  /**
   * Precio de venta final del combo. Se sugiere automáticamente en la UI
   * (suma de precioVenta de componentes fijos, menos descuentoPorcentaje)
   * pero queda editable a mano -- el usuario puede pisar el valor sugerido.
   */
  precioVenta: number
  /** % de descuento aplicado sobre la suma de precioVenta de los componentes fijos para llegar al precio sugerido. */
  descuentoPorcentaje: number
  /** Galería de fotos del combo (mismo patrón que Producto.imagenes, hasta MAX_IMAGENES_PRODUCTO). La primera es la principal. */
  imagenes: string[]
  disponible: boolean
  componentesFijos: ComboComponenteFijo[]
  componentesEleccion: ComboComponenteEleccion[]
  createdAt: string
}

// ─── Variantes de producto ────────────────────────────────────────────────────
// Fase 2 del refactor de Productos. Un producto "con variantes" (ej. una
// remera con combinaciones color/talle) reemplaza el stock único por N
// variantes, CADA UNA CON SU PROPIO STOCK -- confirmado con el usuario, es
// el comportamiento estándar de retail con talles/colores. El precio de
// venta sigue siendo el del producto padre (mismo precio para todas las
// variantes) -- a diferencia de Servicios, acá no se abre precio por
// variante.

export interface ProductoVariante {
  id: string
  /** Color de la variante (opcional -- puede haber productos solo con talle, o solo con color). */
  color?: string
  /** Talle de la variante (opcional). */
  talle?: string
  /** Código de barras propio de esta combinación (opcional, distinto al del producto padre). */
  codigoBarras?: string
  stock: number
}

// ─── Producto ───────────────────────────────────────────────────────────────────

export type EstadoProducto = 'activo' | 'inactivo'

export type TipoProducto = 'unico' | 'con_variantes'

export interface Producto {
  id: string
  codigo: string
  nombre: string
  descripcion: string
  rubroId: string
  subRubroId?: string
  /** Marca del producto (catálogo `marcas`), opcional -- no todos los rubros
   * la necesitan (una empanada casera no tiene marca, una gaseosa sí). */
  marcaId?: string
  /** Proveedor preferido/default para este producto (catálogo de Compras).
   * No reemplaza el campo `proveedor` de texto libre por remito en
   * Recepción -- ese es puntual, este es el default sugerido del catálogo. */
  proveedorId?: string
  precioVenta: number
  costo: number
  iva: AlicuotaIVA
  unidadVenta: UnidadMedida
  /** Si tipo === 'con_variantes', este campo es la SUMA del stock de todas
   * las variantes (se mantiene sincronizado por el reducer) -- así el resto
   * del sistema (alertas de stock bajo, valor de inventario) sigue
   * funcionando sin tener que saber de variantes. El desglose real vive en
   * `variantes`. */
  stock: number
  stockMinimo: number
  controlaStock: boolean
  disponible: boolean
  estado: EstadoProducto
  /** Si tiene fórmula, el costo se calcula automáticamente */
  tieneFormula: boolean
  /**
   * Galería de fotos del producto, para el catálogo visual.
   * URLs públicas (Supabase Storage, bucket "productos-imagenes").
   * El primer elemento es la foto principal.
   */
  imagenes: string[]
  /**
   * Código que lee el lector (de fábrica: EAN-13/UPC-A: 8-14 dígitos, o
   * interno: generado por Edgy para productos propios sin código de fábrica).
   * Opcional y único por cliente cuando está cargado — ver validación de
   * unicidad en el reducer (ADD_PRODUCTO/UPDATE_PRODUCTO).
   */
  codigoBarras?: string
  /** 'unico' (default, como hasta ahora) o 'con_variantes' (color/talle). */
  tipo: TipoProducto
  /** Solo relevante si tipo === 'con_variantes'. Vacío si tipo === 'unico'. */
  variantes: ProductoVariante[]
  /** Override puntual de la plantilla de garantía (Fase 4). Si no está
   * seteado, hereda la plantilla del rubro (Rubro.plantillaGarantiaId), si
   * el rubro tiene una asignada. */
  plantillaGarantiaId?: string
  createdAt: string
}

/** Cantidad máxima de fotos permitidas por producto en la galería. */
export const MAX_IMAGENES_PRODUCTO = 6

// ─── Insumo ─────────────────────────────────────────────────────────────────────

export interface Insumo {
  id: string
  nombre: string
  rubroId: string
  subRubroId?: string
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
  /**
   * Fase 9 (recetas/costeo real): % de merma DE PROCESO -- la pérdida
   * esperada y repetible de este proceso puntual (ej: un salame que en
   * salazón pierde 30% de su peso). Es solo informativo: no cambia el
   * cálculo de costo (que sigue siendo total / cantidadProducida), pero
   * hace explícito y auditable un dato que hoy quedaba escondido dentro
   * de `cantidadProducida` cargado a mano.
   *
   * OJO con el nombre: no es lo mismo que `MotivoAjuste.merma` en Stock
   * (ver más abajo) -- ese es un ajuste IRREGULAR y puntual (se pudrió,
   * se rompió, faltante de conteo). Este campo es la pérdida NORMAL y
   * esperada de la receta, se repite en cada lote. Por eso en pantalla
   * se llama "Merma de proceso", para no pisarse con el otro concepto.
   */
  mermaPorcentaje: number
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
  /** Si itemTipo === 'producto' y el producto es 'con_variantes', identifica
   * la variante puntual afectada (ej. "Remera Roja M"). Vacío para
   * productos 'unico' e insumos. */
  varianteId?: string
  cantidad: number
  motivo?: MotivoAjuste
  nota?: string
  costoUnitario?: number
  fecha: string
  origen?: 'recepcion' | 'transferencia' | 'ajuste_manual' | 'formula' | 'venta'
  origenId?: string
  /** Vencimiento del lote que ingresó con este movimiento (perecederos).
   * Se copia desde LineaRecepcion.fechaVencimiento al confirmar la
   * recepción -- ver Control de Stock para la alerta de "por vencer". */
  fechaVencimiento?: string
}

// ─── Recepción ──────────────────────────────────────────────────────────────────

export type EstadoRecepcion = 'borrador' | 'confirmada' | 'cancelada'

export interface LineaRecepcion {
  id: string
  itemTipo: 'producto' | 'insumo'
  itemId: string
  /** Igual que en MovimientoStock: variante puntual si el producto es
   * 'con_variantes'. Se copia al movimiento que esta línea genera al
   * confirmar la recepción. */
  varianteId?: string
  cantidad: number
  costoUnitario: number
  /** Vencimiento del lote que ingresa (opcional -- perecederos). */
  fechaVencimiento?: string
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
  rubroId?: string // null = todos los rubros
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
  rubros: Rubro[]
  subRubros: SubRubro[]
  marcas: Marca[]
  listasPrecio: ListaPrecio[]
  productosPrecios: ProductoPrecio[]
  plantillasGarantia: PlantillaGarantia[]
  combos: Combo[]
  formulas: Formula[]
  movimientos: MovimientoStock[]
  recepciones: Recepcion[]
  transferencias: Transferencia[]
  reglasControl: ReglaControl[]
  registrosControl: RegistroControl[]
}
