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

// ─── Conversión de unidades (masa/volumen) ───────────────────────────────────
//
// Insumo.unidad (la unidad nativa de compra/stock) y LineaFormula.unidad (la
// unidad en la que se carga esa línea puntual, ej. gramos por precisión en
// una receta aunque el insumo se compre y stockee en kg) son campos
// independientes -- eso es intencional (permite cargar "800 g" de un insumo
// que se compra "por kg"), pero exige convertir cantidad y costo entre
// ambas unidades en cada punto donde se usan juntas. Sin esto, "800 g" se
// multiplicaba por el costo por kg tal cual (bug real: $7.760.000 en vez de
// $7.760) y, peor, Producción descontaba 800 "kg" de stock real en vez de
// 0.8. Solo se admite conversión dentro de la misma familia (masa o
// volumen) -- el resto de las unidades (caja, pack, docena, etc.) no tiene
// una conversión bien definida sin un dato adicional (ej. unidades por
// caja), así que se tratan como no convertibles a propósito, en vez de
// asumir 1:1 en silencio.

type FamiliaUnidad = 'masa' | 'volumen'

const FAMILIA_UNIDAD: Partial<Record<UnidadMedida, FamiliaUnidad>> = {
  gramo: 'masa',
  kg: 'masa',
  ml: 'volumen',
  litro: 'volumen',
}

// Factor de conversión a la unidad base de la familia (gramo para masa, ml
// para volumen).
const FACTOR_A_BASE: Partial<Record<UnidadMedida, number>> = {
  gramo: 1,
  kg: 1000,
  ml: 1,
  litro: 1000,
}

export function familiaUnidad(u: UnidadMedida): FamiliaUnidad | null {
  return FAMILIA_UNIDAD[u] ?? null
}

// ─── Conversión metro ↔ m² por ancho de rollo (Fase 41.7) ────────────────────
//
// "metro" y "m2" no son la misma familia (una es longitud, la otra área) --
// no existe un factor universal entre ambas, a diferencia de kg/gramo. Pero
// para telas y materiales que se compran/stockean por metro LINEAL de un
// rollo de ancho fijo, y se consumen por ÁREA en una fórmula (una cortina
// necesita m² de tela, no metros lineales), sí hay un factor: el ancho del
// rollo, propio de cada insumo/producto (Insumo.anchoRollo /
// Producto.anchoRollo). 1 metro lineal de un rollo de X m de ancho = X m².
// Sin ese dato cargado, metro y m2 siguen sin relación definida -- nunca se
// asume 1:1 en silencio (mismo criterio que las familias de masa/volumen).
function convertirPorAnchoRollo(desde: UnidadMedida, hacia: UnidadMedida, anchoRollo?: number): number | null {
  if (!anchoRollo || anchoRollo <= 0) return null
  if (desde === 'metro' && hacia === 'm2') return anchoRollo
  if (desde === 'm2' && hacia === 'metro') return 1 / anchoRollo
  return null
}

/** Unidades a las que `u` se puede convertir (incluye a `u` misma). Si `u`
 * no pertenece a ninguna familia convertible, devuelve solo `[u]` -- salvo
 * que se pase `anchoRollo`, en cuyo caso metro/m2 también se habilitan
 * entre sí (ver convertirPorAnchoRollo). */
export function unidadesCompatibles(u: UnidadMedida, anchoRollo?: number): UnidadMedida[] {
  const fam = FAMILIA_UNIDAD[u]
  const base = fam
    ? (Object.keys(FAMILIA_UNIDAD) as UnidadMedida[]).filter((x) => FAMILIA_UNIDAD[x] === fam)
    : [u]
  if (anchoRollo && anchoRollo > 0 && (u === 'metro' || u === 'm2')) {
    const par: UnidadMedida = u === 'metro' ? 'm2' : 'metro'
    return Array.from(new Set([...base, par]))
  }
  return base
}

/** Convierte una cantidad expresada en `desde` a la unidad `hacia`.
 * Devuelve null si no son convertibles -- el llamador debe tratar null
 * como "conversión inválida", nunca asumir 1:1. `anchoRollo` habilita el
 * caso especial metro↔m2 (ver comentario arriba). */
export function convertirCantidad(
  cantidad: number,
  desde: UnidadMedida,
  hacia: UnidadMedida,
  anchoRollo?: number,
): number | null {
  if (desde === hacia) return cantidad
  const factorDesde = FACTOR_A_BASE[desde]
  const factorHacia = FACTOR_A_BASE[hacia]
  if (factorDesde !== undefined && factorHacia !== undefined && FAMILIA_UNIDAD[desde] === FAMILIA_UNIDAD[hacia]) {
    return (cantidad * factorDesde) / factorHacia
  }
  const factorRollo = convertirPorAnchoRollo(desde, hacia, anchoRollo)
  if (factorRollo !== null) return cantidad * factorRollo
  return null
}

/** Convierte un costo expresado en $/`desde` a $/`hacia` (misma familia, o
 * metro↔m2 con `anchoRollo`). */
export function convertirCostoPorUnidad(
  costo: number,
  desde: UnidadMedida,
  hacia: UnidadMedida,
  anchoRollo?: number,
): number | null {
  if (desde === hacia) return costo
  const factorDesde = FACTOR_A_BASE[desde]
  const factorHacia = FACTOR_A_BASE[hacia]
  if (factorDesde !== undefined && factorHacia !== undefined && FAMILIA_UNIDAD[desde] === FAMILIA_UNIDAD[hacia]) {
    return (costo / factorDesde) * factorHacia
  }
  // $/metro -> $/m2: si 1 metro (que tiene `anchoRollo` m2) cuesta $C,
  // 1 m2 cuesta $C / anchoRollo. $/m2 -> $/metro: al revés.
  const factorRollo = convertirPorAnchoRollo(desde, hacia, anchoRollo)
  if (factorRollo !== null) return costo / factorRollo
  return null
}

// ─── Producción a medida (Fase 41) ───────────────────────────────────────────────
//
// Cortinas Punto Tex (y cualquier rubro que se fabrique contra un pedido
// puntual, no para stock genérico): la cantidad de cada línea de la
// Fórmula ya no sale de "cantidad fija × factor de lote", sino de las
// medidas reales del paño/ventana del cliente (Ficha de medida). El campo
// `cantidad` de la línea pasa a ser un MULTIPLICADOR sobre esa medida (ej.
// 1.05 = 5% de desperdicio/sisa), salvo en líneas "unidad" donde sigue
// siendo una cantidad por paño (ej. 2 soportes por ventana).
//
//   m2     -> cantidad × (Σ ancho×alto de todos los paños)
//   metro  -> cantidad × (Σ ancho, o Σ alto si fuenteDimension='alto')
//   unidad -> cantidad × cantidad de paños
//   otras  -> cantidad tal cual (no aplica factor de lote en modo a medida)

export interface PanoParaCalculo {
  ancho: number | null
  alto: number | null
}

export type ResultadoCalculoAMedida =
  | { ok: true; cantidades: Map<string, number> }
  | { ok: false; error: string }

/** Calcula la cantidad necesaria de cada línea de una fórmula a partir de
 * los paños reales de un ítem de Ficha de medida. Si falta una medida que
 * alguna línea necesita, devuelve error en vez de tratarla como 0 --
 * nunca hay que asumir en silencio con datos de fabricación real. */
export function calcularCantidadesAMedida(
  lineas: LineaFormula[],
  panos: PanoParaCalculo[],
): ResultadoCalculoAMedida {
  if (panos.length === 0) {
    return { ok: false, error: 'Este ítem de la ficha no tiene paños con medidas cargadas.' }
  }

  const necesitaAncho = lineas.some(
    (l) => l.unidad === 'metro' && (l.fuenteDimension ?? 'ancho') === 'ancho',
  )
  const necesitaAlto = lineas.some((l) => l.unidad === 'metro' && l.fuenteDimension === 'alto')
  const necesitaArea = lineas.some((l) => l.unidad === 'm2')

  if ((necesitaAncho || necesitaArea) && panos.some((p) => p.ancho === null)) {
    return { ok: false, error: 'Hay un paño sin Ancho cargado -- completá la medida antes de producir.' }
  }
  if ((necesitaAlto || necesitaArea) && panos.some((p) => p.alto === null)) {
    return { ok: false, error: 'Hay un paño sin Alto cargado -- completá la medida antes de producir.' }
  }

  const sumaAncho = panos.reduce((acc, p) => acc + (p.ancho ?? 0), 0)
  const sumaAlto = panos.reduce((acc, p) => acc + (p.alto ?? 0), 0)
  const sumaArea = panos.reduce((acc, p) => acc + (p.ancho ?? 0) * (p.alto ?? 0), 0)
  const cantidadPanos = panos.length

  const cantidades = new Map<string, number>()
  for (const l of lineas) {
    if (l.unidad === 'm2') cantidades.set(l.id, l.cantidad * sumaArea)
    else if (l.unidad === 'metro') {
      const dimension = (l.fuenteDimension ?? 'ancho') === 'alto' ? sumaAlto : sumaAncho
      cantidades.set(l.id, l.cantidad * dimension)
    } else if (l.unidad === 'unidad') cantidades.set(l.id, l.cantidad * cantidadPanos)
    else cantidades.set(l.id, l.cantidad)
  }
  return { ok: true, cantidades }
}

// ─── Chequeo de disponibilidad antes de producir (Fase 44) ───────────────────
//
// Carlos (Charcutería, 21/08): antes de lanzar un lote grande (ej. 40 kg de
// Salame) quiere saber si alcanza el stock de insumos ANTES de producir, no
// enterarse a mitad de camino. Reusa exactamente la misma conversión de
// unidades que `registrarProduccionConfirmada` (store.tsx) aplica al
// descontar de verdad -- así el chequeo previo nunca dice "alcanza" y
// después el registro real falla (o viceversa) por una diferencia de
// lógica entre los dos lugares.

export interface InsumoParaNecesidad {
  id: string
  nombre: string
  unidad: UnidadMedida
  stock: number
  anchoRollo?: number
  rubroId: string
  costo: number
  /** Fase 45h (Etapa 2 del split de OC): proveedor habitual del insumo,
   * ver Insumo.proveedorId. undefined = sin cargar. */
  proveedorId?: string
  /** Fase 48b: presentaciones de compra, ver Insumo.presentaciones -- se
   * usan para redondear la cantidad sugerida en la OC generada desde
   * faltantes (ver handleGenerarOC en Produccion.tsx). */
  presentaciones: InsumoPresentacion[]
}

export interface NecesidadInsumo {
  lineaId: string
  insumoId: string
  nombre: string
  unidadNativa: UnidadMedida
  /** Cantidad que este lote va a consumir de este insumo, ya convertida a
   * la unidad nativa del insumo (la misma que se le va a descontar al
   * stock real al registrar). */
  cantidadNecesaria: number
  stockActual: number
  /** max(0, cantidadNecesaria - stockActual). */
  faltante: number
  alcanza: boolean
  rubroId: string
  costoUnitario: number
  /** Fase 45h: se copia de InsumoParaNecesidad.proveedorId -- Producción
   * lo usa para agrupar los faltantes en la OC por proveedor real cuando
   * está cargado (Etapa 2), en vez de por rubro (Etapa 1). */
  proveedorId?: string
}

export type ResultadoNecesidadInsumos =
  | { ok: true; necesidades: NecesidadInsumo[] }
  | { ok: false; error: string }

/** Calcula, para un factor de lote dado, cuánto de cada insumo de la
 * fórmula hace falta y si el stock actual alcanza. Solo mira líneas
 * tipo='insumo' -- mano de obra y costos operativos no tienen stock que
 * chequear. Devuelve error (no asume nada en silencio) si alguna línea
 * queda con unidad incompatible con la del insumo, mismo criterio que el
 * registro real. */
export function calcularNecesidadInsumos(
  lineas: LineaFormula[],
  factor: number,
  insumosPorId: Map<string, InsumoParaNecesidad>,
): ResultadoNecesidadInsumos {
  const necesidades: NecesidadInsumo[] = []
  for (const l of lineas) {
    if (l.tipo !== 'insumo' || !l.insumoId) continue
    const insumo = insumosPorId.get(l.insumoId)
    if (!insumo) {
      return {
        ok: false,
        error: `La línea "${l.descripcion}" usa un insumo que ya no existe -- revisá la fórmula.`,
      }
    }
    const cantidadNecesaria = convertirCantidad(l.cantidad * factor, l.unidad, insumo.unidad, insumo.anchoRollo)
    if (cantidadNecesaria === null) {
      return {
        ok: false,
        error: `La línea "${l.descripcion}" está cargada en ${unidadLabel(l.unidad)}, una unidad incompatible con la del insumo (${unidadLabel(insumo.unidad)}).`,
      }
    }
    const faltante = Math.max(0, cantidadNecesaria - insumo.stock)
    necesidades.push({
      lineaId: l.id,
      insumoId: insumo.id,
      nombre: insumo.nombre,
      unidadNativa: insumo.unidad,
      cantidadNecesaria,
      stockActual: insumo.stock,
      faltante,
      alcanza: faltante <= 0,
      rubroId: insumo.rubroId,
      costoUnitario: insumo.costo,
      proveedorId: insumo.proveedorId,
    })
  }
  return { ok: true, necesidades }
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
  /**
   * Etiqueta/badge opcional para resaltar una promoción puntual en el
   * catálogo (ej: "PROMO 2x1", "Black Friday", "Oportunidad") -- Fase 19
   * (prep), a pedido del usuario. undefined/'' = sin badge, se muestra
   * solo con el título de sección configurado en Configuración > Empresa
   * (combosTituloSeccion, default "Combos").
   */
  etiqueta?: string
  disponible: boolean
  /** Fase 27d: si está seteado, este combo solo se ofrece desde ESE
   * punto de venta (local); undefined/null = compartido, visible desde
   * cualquier local del cliente (default, sin cambios). */
  puntoVentaId?: string
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
  /** Fase 41: 'deposito' (default) es stock genérico y fungible -- Producción
   * suma al stock del producto, disponible para cualquier venta futura.
   * 'a_medida' es fabricación contra un pedido puntual (ver Ficha de
   * medida) -- Producción NO suma stock genérico, el lote queda imputado
   * 1 a 1 al pedido que lo originó hasta que se factura. */
  modalidadStock: 'deposito' | 'a_medida'
  /**
   * Galería de fotos del producto, para el catálogo visual.
   * URLs públicas (Supabase Storage, bucket "productos-imagenes").
   * El primer elemento es la foto principal.
   */
  imagenes: string[]
  /** Fase 48e (24/08, a pedido de Carlos): repositorio de documentación
   * técnica del producto (manual de instalación, ficha técnica del
   * fabricante, certificado de garantía, video de uso) -- mismo
   * Catálogo Técnico que ya tiene Insumo (Fase 48c/48d), aplicado acá.
   * No reemplaza ni se mezcla con `imagenes` (esa es la galería
   * pública del catálogo visual; esto es un repositorio interno, en
   * bucket privado o por texto/link). Lista vacía = sin documentos
   * cargados (default). Ver DocumentoTecnico. */
  documentos: DocumentoTecnico[]
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
  /**
   * Días de la semana en que el producto se produce/está disponible
   * (Fase 24a). Valores 0-6 siguiendo la convención de `Date.getDay()`
   * (0 = domingo ... 6 = sábado) para poder comparar directo contra
   * "hoy" sin traducir. `undefined` o `[]` = disponible todos los días
   * (default, no afecta a ningún producto existente).
   *
   * Pensado originalmente para Viandas (un menú que solo se elabora
   * ciertos días) pero es un campo genérico de Producto -- cualquier
   * artículo con disponibilidad acotada por día puede usarlo. Se
   * respeta en el Catálogo Público/Menú QR (`menu_publico()`, ver
   * migración 0064) -- los canales internos (Punto de Venta, Comandas,
   * Nuevo comprobante) NO lo filtran a propósito: el personal sabe qué
   * hay disponible hoy, la restricción es para que un cliente
   * autoservido no pida algo que no se está haciendo ese día.
   */
  diasDisponibles?: number[]
  /** Fase 27d: si está seteado, este producto solo se ofrece desde ESE
   * punto de venta (local) -- no aparece en el catálogo de venta de los
   * demás. undefined/null = compartido, visible desde cualquier local
   * del cliente (default, sin cambios). No afecta a Compras/Kardex/
   * administración de catálogo, que siguen viendo todo el catálogo. */
  puntoVentaId?: string
  /**
   * Fase 34+: si es true, este producto TAMBIÉN funciona como insumo --
   * aparece disponible para elegir en Formular Producto (ej. una tela que
   * se vende suelta pero también se usa para confeccionar cortinas). Al
   * marcarlo, el sistema crea/mantiene un registro espejo en `insumos`
   * (con `productoVinculadoId` apuntando acá) cuyo stock y costo se
   * sincronizan solos desde este producto -- no se cargan por separado.
   * Ver `productoVinculadoDe`/`espejarInsumoVinculado` en data/store.tsx.
   */
  esInsumo?: boolean
  /**
   * Fase 40: Servicio asociado a este producto (ej. "Instalación" para una
   * cortina), del módulo Servicios. Mismo patrón liviano que marcaId/
   * proveedorId -- un enlace opcional simple, no una tabla puente: la
   * gran mayoría de los casos reales es "este producto tiene UN servicio
   * típico asociado". Si el servicio es de tipo 'con_variantes', debería
   * elegirse la variante puntual al momento de vender (no acá).
   */
  servicioAsociadoId?: string
  /**
   * Si true, Ventas agrega automáticamente una segunda línea con el
   * servicio asociado al vender este producto. Si false (default), Ventas
   * solo sugiere agregarlo con un botón "+ agregar servicio" -- el
   * operador decide caso a caso (ej. instalación no siempre aplica si el
   * cliente retira el producto y lo coloca él mismo).
   */
  servicioAsociadoObligatorio?: boolean
  /**
   * % de ganancia sobre el costo, usado para calcular `precioVenta`
   * automáticamente desde Formular Producto (precioVenta = costo * (1 +
   * margenGanancia / 100)) -- a pedido de Carlos (17/08), para no tener que
   * ir a la ficha del Producto a cargar el precio a mano después de armar
   * la fórmula. `undefined` = el producto usa precio manual (default,
   * compatible con productos existentes/sin fórmula). Cuando está seteado,
   * el campo Precio venta se bloquea en ProductoDialog (mismo patrón que
   * Costo) y se recalcula solo la próxima vez que se guarde la fórmula.
   */
  margenGanancia?: number
  /**
   * Fase 41.7: ancho del rollo (en metros) para artículos que se compran/
   * venden por metro lineal pero, usados como insumo de una fórmula,
   * necesitan consumirse por m2 (ej. una tela: se vende "por metro" pero
   * una cortina la gasta por área -- ver comentario de convertirCantidad/
   * convertirCostoPorUnidad en este mismo archivo). undefined = no
   * aplica (producto que no es un rollo, o metro/m2 no se van a mezclar
   * para él). Si `esInsumo`, se espeja al insumo vinculado igual que
   * costo/stock/unidad -- ver sincronizarInsumoDeProducto en data/store.tsx.
   */
  anchoRollo?: number
  createdAt: string
}


/** Cantidad máxima de fotos permitidas por producto en la galería. */
export const MAX_IMAGENES_PRODUCTO = 6

/** Labels y orden de los días de la semana, mismo índice que `Date.getDay()`
 * (0 = domingo). Usado por el selector de "Días disponibles" de Producto. */
export const DIA_SEMANA_LABEL: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
}

export const DIAS_SEMANA_ORDEN = [1, 2, 3, 4, 5, 6, 0]

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
  /** Fase 41.7: ver comentario en Producto.anchoRollo -- mismo campo,
   * espejado si viene de un producto vinculado. */
  anchoRollo?: number
  /** Fase 45h (Etapa 2 del split de OC, 21/08): proveedor habitual/
   * preferido de este insumo (catálogo de Compras) -- mismo patrón
   * liviano que Producto.proveedorId, un enlace opcional simple. undefined
   * = sin proveedor habitual cargado (default, sin cambios para insumos
   * existentes). Cuando está cargado, Producción lo usa para agrupar los
   * faltantes en una OC por proveedor real en vez de por rubro -- ver
   * `agruparFaltantesPorOC` más abajo. */
  proveedorId?: string
  /** Fase 48b (24/08, a pedido de Carlos -- Charcutería, caso Starter que
   * viene en sachets de 20 g Y de 40 g): presentaciones de compra de este
   * insumo -- reemplaza al campo único `pesoEnvase` de la Fase 48 (mismo
   * día, sin datos cargados todavía -- se pisó antes de usarse en serio)
   * porque un insumo puede tener MÁS de una presentación real. Lista
   * vacía = no hay presentaciones cargadas (default, sin cambios para
   * insumos existentes). Una puede marcarse `esDefault` -- ver
   * InsumoPresentacion. */
  presentaciones: InsumoPresentacion[]
  /** Fase 48c (24/08, a pedido de Carlos): foto de referencia del insumo --
   * URL pública (Supabase Storage, bucket "productos-imagenes", mismo
   * bucket que Producto.imagenes). A diferencia de Producto, acá alcanza
   * con UNA sola foto (es un insumo, no un ítem de catálogo visual) --
   * simplifica la UI y evita el overhead de una galería completa.
   * undefined = sin foto cargada (default, sin cambios para insumos
   * existentes). */
  imagenUrl?: string
  /** Fase 48c: repositorio de documentación técnica del insumo (fichas
   * técnicas, hojas de seguridad, instructivos de dosificación, videos de
   * uso) -- a pedido de Carlos, pensado explícitamente para que en el
   * futuro un agente de IA o una automatización pueda encontrar y leer
   * esta información (por eso cada documento tiene `titulo` obligatorio:
   * es lo que un agente va a usar para decidir qué documento abrir, sin
   * depender del nombre de archivo). Lista vacía = sin documentos
   * cargados (default). Ver DocumentoTecnico. */
  documentos: DocumentoTecnico[]
  createdAt: string
}

/** Fase 48c/48d/48e: un documento del catálogo técnico de un Insumo o de
 * un Producto (mismo tipo, reutilizado -- ver Producto.documentos e
 * Insumo.documentos). `tipo` define qué campo tiene el contenido real:
 * 'pdf'/'imagen' -> `path` (bucket privado "archivos-cliente", igual que
 * utilidades/lib/archivos.ts -- fichas técnicas y hojas de seguridad
 * suelen ser información del proveedor/fabricante que no tiene sentido
 * dejar pública); 'video' -> `url` (link externo, ej. YouTube -- no se
 * aloja el video, solo se referencia); 'texto' -> `contenido` (Fase 48d,
 * a pedido de Carlos: especificación técnica escrita directo en el
 * sistema, sin subir ningún archivo -- ej. pegar la ficha del proveedor
 * tal cual). */
export type TipoDocumentoTecnico = 'pdf' | 'imagen' | 'video' | 'texto'

export interface DocumentoTecnico {
  id: string
  tipo: TipoDocumentoTecnico
  /** Título descriptivo obligatorio (ej. "Ficha técnica M-CULTURE RS 103",
   * "Hoja de seguridad", "Video: dosificación correcta") -- ver comentario
   * en Insumo.documentos sobre por qué es clave para uso futuro por IA. */
  titulo: string
  /** Notas libres opcionales (ej. "Dosis: 40 g cada 200 kg de masa"). */
  descripcion?: string
  /** Solo para tipo 'pdf'/'imagen': path del objeto en el bucket privado
   * "archivos-cliente" (ver subirArchivo en utilidades/lib/archivos.ts).
   * Se resuelve a URL firmada temporal recién al momento de ver/descargar. */
  path?: string
  /** Solo para tipo 'video': URL externa (ej. YouTube, Vimeo, Drive). */
  url?: string
  /** Fase 48d: solo para tipo 'texto' -- el contenido en sí, escrito
   * directo en el sistema (especificación técnica en texto plano). */
  contenido?: string
  createdAt: string
}

/** Fase 48b: una presentación de compra de un Insumo (ej. "Sachet 40 g").
 * `contenido` está en la unidad nativa del insumo (`Insumo.unidad`).
 * `esDefault` marca cuál usa el sistema para sugerir/redondear cantidades
 * automáticamente (OC generada desde faltantes de Producción) -- a lo
 * sumo una por insumo (garantizado por índice único parcial en la
 * migración). Las demás quedan disponibles para elegir a mano. */
export interface InsumoPresentacion {
  id: string
  nombre?: string
  contenido: number
  esDefault: boolean
}

/** Devuelve la presentación de compra a usar para sugerir/redondear
 * cantidades: la marcada `esDefault`, o si no hay ninguna marcada, la
 * primera de la lista (mejor una referencia aproximada que ninguna). */
export function presentacionDefault(presentaciones: InsumoPresentacion[]): InsumoPresentacion | undefined {
  return presentaciones.find((p) => p.esDefault) ?? presentaciones[0]
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
  /** Fase 41 (Producción a medida): solo aplica si unidad === 'metro' --
   * de qué medida del paño sale la longitud (ancho: barral/riel/zócalo,
   * que corren a lo ancho de la ventana; alto: correas/cadenas tensoras
   * verticales). Si no está cargado, se asume 'ancho'. */
  fuenteDimension?: 'ancho' | 'alto'
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
   * salazón pierde 30% de su peso). Por defecto es solo informativo (ver
   * `aplicarMermaCosto`): no cambia el cálculo de costo, pero hace
   * explícito y auditable un dato que hoy quedaba escondido dentro de
   * `cantidadProducida` cargado a mano.
   *
   * OJO con el nombre: no es lo mismo que `MotivoAjuste.merma` en Stock
   * (ver más abajo) -- ese es un ajuste IRREGULAR y puntual (se pudrió,
   * se rompió, faltante de conteo). Este campo es la pérdida NORMAL y
   * esperada de la receta, se repite en cada lote. Por eso en pantalla
   * se llama "Merma de proceso", para no pisarse con el otro concepto.
   */
  mermaPorcentaje: number
  /**
   * Fase 43o (20/08, a pedido de Carlos -- caso Charcutería, salame que
   * se vende por kg y pierde peso en el curado): si está en `true`, el
   * costo unitario deja de ser `total / cantidadProducida` y pasa a ser
   * `total / (cantidadProducida * (1 - mermaPorcentaje/100))` -- es
   * decir, el costo se reparte entre la cantidad REAL vendible después
   * de la pérdida, no la cantidad nominal cargada en la receta. Default
   * `false` a propósito: ningún cliente/fórmula existente cambia de
   * comportamiento a menos que lo tilde explícitamente. Solo tiene
   * sentido si `unidadProducida` está en la misma magnitud que erosiona
   * la merma (ej. Kilogramo) -- si el producto se cuenta por pieza
   * (Unidad) y el precio no varía con el peso real de cada una, dejar
   * este campo en `false` y usar la merma solo como dato informativo.
   */
  aplicarMermaCosto: boolean
  /**
   * Fase 43p (20/08, caso Charcutería -- "Lectura A"): unidad alternativa
   * opcional para CARGAR el rendimiento de un lote en Producción, cuando
   * es más práctico medirlo así que en `unidadProducida` (ej. contar "60
   * unidad" en vez de pesar "30 kg" cada vez que se saca un lote de
   * salame del secadero). No crea un segundo stock: Producción convierte
   * lo que se tipeé acá a `unidadProducida` con `equivalenciaSecundaria`
   * ANTES de aplicar el ajuste real -- el producto sigue con un solo
   * número de stock, en su unidad de siempre. Si queda sin cargar (caso
   * normal, todos los clientes existentes), Producción se ve exactamente
   * igual que antes.
   */
  unidadSecundaria?: UnidadMedida | null
  /**
   * Cuánto vale, en `unidadProducida`, UNA unidad de `unidadSecundaria`
   * (ej. 0.5 si unidadProducida='kg' y unidadSecundaria='unidad' -- cada
   * salame pesa en promedio 500g). Sin esto, `unidadSecundaria` no sirve
   * de nada -- los dos campos van siempre juntos.
   */
  equivalenciaSecundaria?: number | null
  createdAt: string
}

// ─── Producción (Fase 9, cierre) ─────────────────────────────────────────────
// Antes, "Registrar producción" (ver Formular Producto) solo generaba
// movimientos_stock anónimos con origen: 'formula' -- no había ningún
// registro propio del LOTE ejecutado, así que no se podía armar un
// historial de producción real (fechas, factor usado, rendimiento real
// vs. teórico). Esta fase agrega ese registro de primera clase: cada vez
// que se ejecuta REGISTRAR_PRODUCCION se crea una fila acá, y los
// movimientos de stock de ese lote comparten `origenId` con `Produccion.id`
// (antes `origenId` era un uuid descartable que no apuntaba a nada real).
/** Fase 47 (23/08, pedido de Carlos -- Charcutería): "Registrar producción"
 * deja el lote en 'borrador' SIN tocar stock todavía; recién al "Confirmar"
 * se descuentan los insumos y se suma el producto terminado -- mismo
 * patrón que ya usan Recepción y Transferencias. 'anulada' queda reservado
 * para un borrador descartado sin llegar a confirmarse (no se usa todavía
 * desde la UI, pero evita otra migración el día que haga falta). Los lotes
 * históricos (de antes de esta fase) nacieron ya confirmados -- el stock
 * para ellos se movió con la lógica vieja, de una sola vez. */
export type EstadoProduccion = 'borrador' | 'confirmada' | 'anulada'

/** Fase 47: foto de un insumo imputado a un lote, tomada al crear el
 * borrador (nombre y costo incluidos, no solo el id -- mismo criterio que
 * LineaFormula.costoUnitario, para que el PDF y el descuento al confirmar
 * no dependan de que la fórmula/insumo no haya cambiado mientras tanto).
 * `cantidad` y `unidad` están en la unidad NATIVA del insumo (ya
 * convertida desde la unidad de la línea de fórmula). */
export interface InsumoImputado {
  insumoId: string
  nombre: string
  cantidad: number
  unidad: UnidadMedida
  costoUnitario: number
}

export interface Produccion {
  id: string
  formulaId: string
  productoId: string
  /** Multiplicador de lote (1 = la receta tal cual, 2 = el doble, etc). */
  factor: number
  /** cantidadProducida de la fórmula × factor, calculado al momento de registrar. */
  cantidadTeorica: number
  /** Rendimiento REAL de este lote puntual (puede diferir del teórico). */
  cantidadRealProducida: number
  fecha: string
  notas?: string
  createdAt: string
  /** Fase 41: si está cargado, esta producción es "a medida" -- se ejecutó
   * atada a este ítem puntual de Ficha de medida (ver
   * calcularCantidadesAMedida), no sumó stock genérico del producto, y el
   * pedido se considera cerrado cuando se factura el presupuesto vinculado
   * a la ficha. */
  fichaItemId?: string
  /** Fase 47: ver EstadoProduccion. */
  estado: EstadoProduccion
  /** Fase 47: ver InsumoImputado. Se congela al crear el borrador. */
  insumosImputados: InsumoImputado[]
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
// Fase 27e-1: antes de esta fase, sucursalOrigen/sucursalDestino eran texto
// libre y "Nueva transferencia" no existía (botón permanentemente
// deshabilitado, sin diálogo de alta -- ver Transferencias.tsx). Ahora
// apuntan a un punto de venta real (`puntos_venta`) y el alta mueve stock
// de verdad, vía la función `crear_transferencia` (RPC atómica -- ver
// migración 0073), no por el flujo optimista de ADD_+syncToSupabase que
// usa el resto del store.

export interface LineaTransferencia {
  id: string
  itemTipo: 'producto' | 'insumo'
  itemId: string
  /** Igual que en MovimientoStock/LineaRecepcion: variante puntual si el
   * producto es 'con_variantes'. */
  varianteId?: string
  cantidad: number
}

export type EstadoTransferencia = 'confirmada' | 'anulada'

export interface Transferencia {
  id: string
  fecha: string
  origenPuntoVentaId: string
  destinoPuntoVentaId: string
  estado: EstadoTransferencia
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
  producciones: Produccion[]
  movimientos: MovimientoStock[]
  recepciones: Recepcion[]
  transferencias: Transferencia[]
  reglasControl: ReglaControl[]
  registrosControl: RegistroControl[]
}
