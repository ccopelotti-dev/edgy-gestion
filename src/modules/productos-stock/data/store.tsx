// ============================================================
// Módulo Productos y Stock — State Management
// Edgy Gestión · Context + useReducer + Supabase (antes localStorage)
//
// Mismo patrón que Compras: se reutiliza el reducer ORIGINAL sin
// tocarlo (incluida su función uid(), ahora generando UUIDs reales
// porque las tablas nuevas usan uuid como tipo de columna), y se
// sincroniza cada acción contra Supabase comparando el estado antes
// y después de aplicar el reducer.
//
// productos, rubros y sub_rubros YA EXISTÍAN en Supabase (carga
// masiva + Reportes). Esta reescritura los suma al resto de las
// entidades (insumos, fórmulas, movimientos, recepciones,
// transferencias, control) que hasta ahora sólo vivían acá.
//
// FIX de huso horario (ver auditoría de toISOString): las 8 fechas que
// antes se armaban con `new Date().toISOString().slice(0, 10)` -- en
// UTC -- ahora usan todayISO() de lib/format, que arma la fecha con los
// componentes locales del Date. Antes, pasadas las 21 hs (hora
// Argentina), un producto/insumo/fórmula/recepción/transferencia/regla de
// control nuevo, o un ajuste/recepción rápida de stock, quedaba fechado
// para el día siguiente.
//
// FASE 2 (variantes de color/talle): un producto 'con_variantes' tiene
// stock INDIVIDUAL por combinación (ej. "Remera Roja M": 5, "Remera Azul
// L": 3). El array `variantes` se sincroniza con delete+reinsert en cada
// ADD/UPDATE_PRODUCTO (mismo patrón que `servicio_variantes` en el store
// de Servicios) -- el formulario de producto SIEMPRE manda el stock
// actual de cada variante existente (no lo resetea), así que esto es
// seguro salvo la rara carrera de editar el producto justo mientras se
// confirma una recepción de esa misma variante en simultáneo.
//
// FASE 3 (listas de precio): catálogo flexible de "listas" (ej.
// Mostrador/Salón, Delivery, Mayorista/Eventos), cada una con un % de
// recargo por defecto sobre el costo del producto. El precio final en una
// lista es costo * (1 + %recargo / 100), salvo que el producto tenga un
// override puntual (ProductoPrecio) para esa combinación producto+lista.
// precioVenta del producto NO se toca en esta fase -- sigue siendo el
// precio que usan Ventas/Comandas/Menú QR/Delivery/Presupuestos (es la
// lista "default" implícita). Migrar esos módulos a usar listas de precio
// en vez de precioVenta queda para una fase futura (Fase 6), a pedido del
// usuario -- por ahora las listas solo se administran acá, en Productos.
//
// FASE 4 (garantía): catálogo de plantillas de garantía (nombre, duración
// en meses, cobertura), asignable como default a nivel Rubro y opcional
// override a nivel Producto puntual. Igual que Fase 3, esta fase deja todo
// LISTO del lado de Productos -- la activación real de una garantía (para
// qué cliente, desde cuándo corre) sucede recién cuando Ventas emite una
// factura, que es la Fase 6 (a pedido del usuario).
//
// FASE 5 (combos): un combo agrupa productos existentes en un ítem vendible
// a precio fijo, con composición mixta -- componentes FIJOS (producto +
// cantidad) más slots de ELECCIÓN (rubro + cantidad a elegir de ese rubro,
// ej. "elegí 1 bebida"). El combo NO tiene stock propio: vender un combo
// (Fase 6) va a descontar stock de cada componente fijo, y del producto
// puntual que el cliente elija en cada slot de elección. Acá solo se arma
// la "receta" del combo (igual patrón que Formula: delete+reinsert de los
// hijos en cada UPDATE_COMBO).
// ============================================================

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import type {
  ProductosStockState,
  Producto,
  ProductoVariante,
  Insumo,
  Rubro,
  SubRubro,
  Marca,
  ListaPrecio,
  ProductoPrecio,
  PlantillaGarantia,
  Combo,
  ComboComponenteFijo,
  ComboComponenteEleccion,
  Formula,
  LineaFormula,
  Produccion,
  MovimientoStock,
  Recepcion,
  LineaRecepcion,
  Transferencia,
  EstadoTransferencia,
  ReglaControl,
  RegistroControl,
} from '../types'
import { seedState } from './seed'
import { supabase } from '@/lib/supabase'
import { resolverPuntoVentaId, ajustarStockPuntoVenta } from '@/lib/puntoVenta'
import { useClienteActual } from '@/hooks/useClienteActual'
import { todayISO } from '../lib/format'

// ─── Helpers de id ──────────────────────────────────────────

// uid() generaba antes un formato propio (Date.now()-seq-random). Las
// tablas nuevas en Supabase usan `uuid` como tipo de columna, así que
// ahora genera UUIDs reales. La firma (sin argumentos, retorna string)
// no cambia, así que el reducer de abajo funciona exactamente igual.
function uid(): string {
  return crypto.randomUUID()
}

// ─── Acciones (idénticas a la versión anterior) ────────────

type Action =
  | { type: 'ADD_PRODUCTO'; payload: Omit<Producto, 'id' | 'createdAt'> }
  | { type: 'UPDATE_PRODUCTO'; payload: Producto }
  | { type: 'DELETE_PRODUCTO'; payload: string }
  | { type: 'ADD_INSUMO'; payload: Omit<Insumo, 'id' | 'createdAt'> }
  | { type: 'UPDATE_INSUMO'; payload: Insumo }
  | { type: 'DELETE_INSUMO'; payload: string }
  | { type: 'ADD_RUBRO'; payload: Omit<Rubro, 'id'> }
  | { type: 'UPDATE_RUBRO'; payload: Rubro }
  | { type: 'DELETE_RUBRO'; payload: string }
  | { type: 'ADD_SUBRUBRO'; payload: Omit<SubRubro, 'id'> }
  | { type: 'UPDATE_SUBRUBRO'; payload: SubRubro }
  | { type: 'DELETE_SUBRUBRO'; payload: string }
  | { type: 'ADD_MARCA'; payload: Omit<Marca, 'id'> }
  | { type: 'UPDATE_MARCA'; payload: Marca }
  | { type: 'DELETE_MARCA'; payload: string }
  | { type: 'ADD_LISTA_PRECIO'; payload: Omit<ListaPrecio, 'id'> }
  | { type: 'UPDATE_LISTA_PRECIO'; payload: ListaPrecio }
  | { type: 'DELETE_LISTA_PRECIO'; payload: string }
  | {
      type: 'SET_PRECIO_PRODUCTO'
      payload: { productoId: string; listaId: string; precio: number | null }
    }
  | { type: 'ADD_PLANTILLA_GARANTIA'; payload: Omit<PlantillaGarantia, 'id'> }
  | { type: 'UPDATE_PLANTILLA_GARANTIA'; payload: PlantillaGarantia }
  | { type: 'DELETE_PLANTILLA_GARANTIA'; payload: string }
  | { type: 'ADD_COMBO'; payload: Omit<Combo, 'id' | 'createdAt'> }
  | { type: 'UPDATE_COMBO'; payload: Combo }
  | { type: 'DELETE_COMBO'; payload: string }
  | { type: 'ADD_FORMULA'; payload: Omit<Formula, 'id' | 'createdAt'> }
  | { type: 'UPDATE_FORMULA'; payload: Formula }
  | { type: 'DELETE_FORMULA'; payload: string }
  | { type: 'ADD_MOVIMIENTO'; payload: Omit<MovimientoStock, 'id'> }
  | { type: 'ADD_RECEPCION'; payload: Omit<Recepcion, 'id' | 'createdAt'> }
  | { type: 'CONFIRMAR_RECEPCION'; payload: string }
  | { type: 'CANCELAR_RECEPCION'; payload: string }
  // Fase 27e-1: ADD_TRANSFERENCIA se retira -- "Nueva transferencia" ahora
  // llama directo a la RPC `crear_transferencia` (movimiento de stock
  // atómico server-side) y recarga el estado con SET_STATE, en vez de pasar
  // por el flujo optimista dispatch+syncToSupabase que usa el resto del
  // store. Ver Transferencias.tsx.
  | { type: 'ADD_REGLA_CONTROL'; payload: Omit<ReglaControl, 'id' | 'createdAt'> }
  | { type: 'ADD_REGISTRO_CONTROL'; payload: Omit<RegistroControl, 'id'> }
  | {
      type: 'AJUSTAR_STOCK'
      payload: {
        itemTipo: 'producto' | 'insumo'
        itemId: string
        /** Solo si itemTipo === 'producto' y el producto es 'con_variantes'. */
        varianteId?: string
        cantidad: number
        motivo?: MovimientoStock['motivo']
        nota?: string
      }
    }
  | {
      type: 'RECIBIR_STOCK'
      payload: {
        itemTipo: 'producto' | 'insumo'
        itemId: string
        /** Solo si itemTipo === 'producto' y el producto es 'con_variantes'. */
        varianteId?: string
        cantidad: number
        costoUnitario?: number
        nota?: string
      }
    }
  | {
      /**
       * Fase 9 (recetas/costeo real): ejecuta una Fórmula como un lote de
       * producción real -- descuenta el stock de los insumos consumidos
       * (escalados por `factor`) y suma el stock del producto terminado
       * usando `cantidadRealProducida` (el rendimiento REAL de este lote
       * puntual, que puede diferir del teórico por variación normal del
       * proceso). Genera movimientos de stock con origen: 'formula' (ya
       * estaba previsto en el tipo `MovimientoStock`, nunca se había
       * implementado). Todos los movimientos de un mismo lote comparten
       * `origenId` (un uuid generado acá, no el id de la fórmula) para
       * poder agruparlos como "un mismo lote" sin necesitar una tabla
       * nueva de producciones.
       */
      type: 'REGISTRAR_PRODUCCION'
      payload: {
        formulaId: string
        /** Multiplicador de lote (1 = la receta tal cual, 2 = el doble, etc). */
        factor: number
        /** Rendimiento real de ESTE lote (puede diferir de cantidadProducida * factor). */
        cantidadRealProducida: number
        fecha: string
        notas?: string
      }
    }
  | { type: 'RESET' }
  | { type: 'SET_STATE'; payload: ProductosStockState }

// ─── Reducer (copia EXACTA del original, más SET_STATE) ────

function reducer(state: ProductosStockState, action: Action): ProductosStockState {
  switch (action.type) {
    case 'SET_STATE':
      return action.payload

    // ── Productos ──────────────────────────────────────────────────────────────
    case 'ADD_PRODUCTO': {
      const nuevo: Producto = {
        ...action.payload,
        id: uid(),
        createdAt: todayISO(),
      }
      return {
        ...state,
        productos: [...state.productos, nuevo],
        insumos: sincronizarInsumoDeProducto(nuevo, state.insumos),
      }
    }
    case 'UPDATE_PRODUCTO':
      return {
        ...state,
        productos: state.productos.map((p) =>
          p.id === action.payload.id ? action.payload : p,
        ),
        insumos: sincronizarInsumoDeProducto(action.payload, state.insumos),
      }
    case 'DELETE_PRODUCTO':
      return {
        ...state,
        productos: state.productos.filter((p) => p.id !== action.payload),
        // Desvincula (no borra) el insumo espejo, si tenía uno -- ver
        // sincronizarInsumoDeProducto. Le pasamos esInsumo:false "a mano"
        // para forzar la rama de desvinculación sin necesitar el producto
        // completo (ya se está borrando).
        insumos: state.insumos.map((i) =>
          i.productoVinculadoId === action.payload ? { ...i, productoVinculadoId: undefined } : i,
        ),
      }

    // ── Insumos ───────────────────────────────────────────────────────────────
    case 'ADD_INSUMO': {
      const nuevo: Insumo = {
        ...action.payload,
        id: uid(),
        createdAt: todayISO(),
      }
      return { ...state, insumos: [...state.insumos, nuevo] }
    }
    case 'UPDATE_INSUMO':
      return {
        ...state,
        insumos: state.insumos.map((i) =>
          i.id === action.payload.id ? action.payload : i,
        ),
      }
    case 'DELETE_INSUMO':
      return {
        ...state,
        insumos: state.insumos.filter((i) => i.id !== action.payload),
      }

    // ── Rubros y Sub-rubros ───────────────────────────────────────────────────
    case 'ADD_RUBRO': {
      const nuevo: Rubro = { ...action.payload, id: uid() }
      return { ...state, rubros: [...state.rubros, nuevo] }
    }
    case 'UPDATE_RUBRO':
      return {
        ...state,
        rubros: state.rubros.map((r) => (r.id === action.payload.id ? action.payload : r)),
      }
    case 'DELETE_RUBRO':
      return {
        ...state,
        rubros: state.rubros.filter((r) => r.id !== action.payload),
        subRubros: state.subRubros.filter((sr) => sr.rubroId !== action.payload),
      }
    case 'ADD_SUBRUBRO': {
      const nuevo: SubRubro = { ...action.payload, id: uid() }
      return { ...state, subRubros: [...state.subRubros, nuevo] }
    }
    case 'UPDATE_SUBRUBRO':
      return {
        ...state,
        subRubros: state.subRubros.map((sr) =>
          sr.id === action.payload.id ? action.payload : sr,
        ),
      }
    case 'DELETE_SUBRUBRO':
      return {
        ...state,
        subRubros: state.subRubros.filter((sr) => sr.id !== action.payload),
      }

    // ── Marcas ────────────────────────────────────────────────────────────────
    case 'ADD_MARCA': {
      const nueva: Marca = { ...action.payload, id: uid() }
      return { ...state, marcas: [...state.marcas, nueva] }
    }
    case 'UPDATE_MARCA':
      return {
        ...state,
        marcas: state.marcas.map((m) => (m.id === action.payload.id ? action.payload : m)),
      }
    case 'DELETE_MARCA':
      return {
        ...state,
        marcas: state.marcas.filter((m) => m.id !== action.payload),
      }

    // ── Listas de precio (Fase 3) ────────────────────────────────────────────
    case 'ADD_LISTA_PRECIO': {
      const nueva: ListaPrecio = { ...action.payload, id: uid() }
      return { ...state, listasPrecio: [...state.listasPrecio, nueva] }
    }
    case 'UPDATE_LISTA_PRECIO':
      return {
        ...state,
        listasPrecio: state.listasPrecio.map((l) =>
          l.id === action.payload.id ? action.payload : l,
        ),
      }
    case 'DELETE_LISTA_PRECIO':
      return {
        ...state,
        listasPrecio: state.listasPrecio.filter((l) => l.id !== action.payload),
        productosPrecios: state.productosPrecios.filter(
          (pp) => pp.listaId !== action.payload,
        ),
      }
    case 'SET_PRECIO_PRODUCTO': {
      const { productoId, listaId, precio } = action.payload
      const existente = state.productosPrecios.find(
        (pp) => pp.productoId === productoId && pp.listaId === listaId,
      )
      // precio === null: quitar el override y volver al cálculo automático
      // (costo * (1 + %recargo / 100)).
      if (precio === null) {
        if (!existente) return state
        return {
          ...state,
          productosPrecios: state.productosPrecios.filter((pp) => pp.id !== existente.id),
        }
      }
      if (existente) {
        return {
          ...state,
          productosPrecios: state.productosPrecios.map((pp) =>
            pp.id === existente.id ? { ...pp, precio } : pp,
          ),
        }
      }
      const nuevo: ProductoPrecio = { id: uid(), productoId, listaId, precio }
      return { ...state, productosPrecios: [...state.productosPrecios, nuevo] }
    }

    // ── Plantillas de garantía (Fase 4) ──────────────────────────────────────
    case 'ADD_PLANTILLA_GARANTIA': {
      const nueva: PlantillaGarantia = { ...action.payload, id: uid() }
      return { ...state, plantillasGarantia: [...state.plantillasGarantia, nueva] }
    }
    case 'UPDATE_PLANTILLA_GARANTIA':
      return {
        ...state,
        plantillasGarantia: state.plantillasGarantia.map((pg) =>
          pg.id === action.payload.id ? action.payload : pg,
        ),
      }
    case 'DELETE_PLANTILLA_GARANTIA':
      // Los rubros/productos que tenían esta plantilla asignada quedan sin
      // garantía (igual que la FK "on delete set null" del lado Supabase).
      return {
        ...state,
        plantillasGarantia: state.plantillasGarantia.filter((pg) => pg.id !== action.payload),
        rubros: state.rubros.map((r) =>
          r.plantillaGarantiaId === action.payload
            ? { ...r, plantillaGarantiaId: undefined }
            : r,
        ),
        productos: state.productos.map((p) =>
          p.plantillaGarantiaId === action.payload
            ? { ...p, plantillaGarantiaId: undefined }
            : p,
        ),
      }

    // ── Combos (Fase 5) ───────────────────────────────────────────────────────
    case 'ADD_COMBO': {
      const nuevo: Combo = {
        ...action.payload,
        id: uid(),
        createdAt: todayISO(),
      }
      return { ...state, combos: [...state.combos, nuevo] }
    }
    case 'UPDATE_COMBO':
      return {
        ...state,
        combos: state.combos.map((c) => (c.id === action.payload.id ? action.payload : c)),
      }
    case 'DELETE_COMBO':
      return {
        ...state,
        combos: state.combos.filter((c) => c.id !== action.payload),
      }

    // ── Fórmulas ──────────────────────────────────────────────────────────────
    case 'ADD_FORMULA': {
      const nueva: Formula = {
        ...action.payload,
        id: uid(),
        createdAt: todayISO(),
      }
      return { ...state, formulas: [...state.formulas, nueva] }
    }
    case 'UPDATE_FORMULA':
      return {
        ...state,
        formulas: state.formulas.map((f) =>
          f.id === action.payload.id ? action.payload : f,
        ),
      }
    case 'DELETE_FORMULA':
      return {
        ...state,
        formulas: state.formulas.filter((f) => f.id !== action.payload),
      }

    case 'REGISTRAR_PRODUCCION': {
      const { formulaId, factor, cantidadRealProducida, fecha, notas } = action.payload
      const formula = state.formulas.find((f) => f.id === formulaId)
      if (!formula) return state

      // Fase 9 (cierre): el id del lote ahora es el id de un registro real
      // en `producciones` (antes era un uuid descartable que no apuntaba a
      // nada) -- así los movimientos de esta ejecución puntual quedan
      // agrupados bajo una fila que sí se puede listar como historial.
      const loteId = uid()
      const nuevaProduccion: Produccion = {
        id: loteId,
        formulaId,
        productoId: formula.productoId,
        factor,
        cantidadTeorica: formula.cantidadProducida * factor,
        cantidadRealProducida,
        fecha,
        notas,
        createdAt: todayISO(),
      }
      const nuevosMovimientos: MovimientoStock[] = []
      let insumos = state.insumos
      let productos = state.productos

      for (const linea of formula.lineas) {
        if (linea.tipo !== 'insumo' || !linea.insumoId) continue
        const cantidadConsumida = linea.cantidad * factor

        // Fase 34+ (fix): si el insumo consumido está vinculado a un
        // producto, el descuento se aplica sobre el producto y se espeja
        // de vuelta -- el movimiento se registra ya con el ítem efectivo,
        // para que el Kardex de una existencia vinculada (ej. un género
        // que se vende suelto y también se consume por confección) no
        // quede partido entre "Insumo" y "Producto".
        const vinculado = productoVinculadoDe(linea.insumoId, insumos, productos)
        const itemTipoConsumo = vinculado ? 'producto' : 'insumo'
        const itemIdConsumo = vinculado ? vinculado.id : linea.insumoId

        nuevosMovimientos.push({
          id: uid(),
          tipo: 'egreso',
          itemTipo: itemTipoConsumo,
          itemId: itemIdConsumo,
          cantidad: cantidadConsumida,
          nota: notas,
          fecha,
          origen: 'formula',
          origenId: loteId,
        })
        if (vinculado) {
          productos = productos.map((p) =>
            p.id === vinculado.id ? { ...p, stock: p.stock - cantidadConsumida } : p,
          )
          insumos = espejarInsumoVinculado(vinculado.id, productos, insumos)
        } else {
          insumos = insumos.map((i) =>
            i.id === linea.insumoId ? { ...i, stock: i.stock - cantidadConsumida } : i,
          )
        }
      }

      nuevosMovimientos.push({
        id: uid(),
        tipo: 'ingreso',
        itemTipo: 'producto',
        itemId: formula.productoId,
        cantidad: cantidadRealProducida,
        nota: notas,
        fecha,
        origen: 'formula',
        origenId: loteId,
      })
      productos = productos.map((p) =>
        p.id === formula.productoId ? { ...p, stock: p.stock + cantidadRealProducida } : p,
      )
      // Fase 34+ (fix): espeja sobre el insumo vinculado del producto
      // terminado, si lo tiene -- misma garantía que el resto de las
      // acciones de stock, aunque no es un caso típico (un producto que
      // se fabrica por fórmula y además se usa como insumo de otra).
      insumos = espejarInsumoVinculado(formula.productoId, productos, insumos)

      return {
        ...state,
        productos,
        insumos,
        producciones: [...state.producciones, nuevaProduccion],
        movimientos: [...state.movimientos, ...nuevosMovimientos],
      }
    }

    // ── Movimientos ───────────────────────────────────────────────────────────
    case 'ADD_MOVIMIENTO': {
      const nuevo: MovimientoStock = { ...action.payload, id: uid() }
      return { ...state, movimientos: [...state.movimientos, nuevo] }
    }

    // ── Recepciones ───────────────────────────────────────────────────────────
    case 'ADD_RECEPCION': {
      const nueva: Recepcion = {
        ...action.payload,
        id: uid(),
        createdAt: todayISO(),
      }
      return { ...state, recepciones: [...state.recepciones, nueva] }
    }

    case 'CONFIRMAR_RECEPCION': {
      const recepcion = state.recepciones.find((r) => r.id === action.payload)
      if (!recepcion || recepcion.estado !== 'borrador') return state

      const recepcionConfirmada: Recepcion = { ...recepcion, estado: 'confirmada' }

      let productos = [...state.productos]
      let insumos = [...state.insumos]
      const nuevosMovimientos: MovimientoStock[] = []

      for (const linea of recepcion.lineas) {
        // Fase 34+ (fix): antes solo se redirigía al producto (y se
        // espejaba de vuelta) cuando la línea llegaba como 'insumo'. Si la
        // línea ya era 'producto' y ESE producto tenía un insumo espejo,
        // el espejo nunca se actualizaba -- quedaba desincronizado en
        // silencio (stock real en Producto, insumo espejo con el valor
        // viejo). Ahora se calcula el ítem efectivo primero y el espejo se
        // sincroniza siempre que se toque el lado producto, sin importar
        // desde qué lado entró la línea. El movimiento también se
        // registra con el ítem efectivo, para que el Kardex de una
        // existencia vinculada quede en un solo lugar.
        const vinculado =
          linea.itemTipo === 'insumo' ? productoVinculadoDe(linea.itemId, insumos, productos) : undefined
        const itemTipoEfectivo = vinculado ? 'producto' : linea.itemTipo
        const itemIdEfectivo = vinculado ? vinculado.id : linea.itemId

        nuevosMovimientos.push({
          id: uid(),
          tipo: 'ingreso',
          itemTipo: itemTipoEfectivo,
          itemId: itemIdEfectivo,
          varianteId: linea.varianteId,
          cantidad: linea.cantidad,
          costoUnitario: linea.costoUnitario,
          fecha: recepcion.fecha,
          origen: 'recepcion',
          origenId: recepcion.id,
          // Mismo patrón que costoUnitario: se copia el vencimiento/lote de
          // la línea al movimiento que genera, para que Control de Stock
          // pueda alertar "por vencer" sin volver a la recepción original.
          fechaVencimiento: linea.fechaVencimiento,
        })

        if (itemTipoEfectivo === 'producto') {
          productos = productos.map((p) => {
            if (p.id !== itemIdEfectivo) return p
            const nuevoCosto = linea.costoUnitario > 0 ? linea.costoUnitario : p.costo
            if (linea.varianteId) {
              const variantes = p.variantes.map((v) =>
                v.id === linea.varianteId
                  ? { ...v, stock: v.stock + linea.cantidad }
                  : v,
              )
              const stock = variantes.reduce((sum, v) => sum + v.stock, 0)
              return { ...p, variantes, stock, costo: nuevoCosto }
            }
            return { ...p, stock: p.stock + linea.cantidad, costo: nuevoCosto }
          })
          // Espejo sobre el insumo vinculado, si lo hay -- sin importar si
          // esta línea llegó como producto directamente o redirigida
          // desde un insumo vinculado.
          insumos = espejarInsumoVinculado(itemIdEfectivo, productos, insumos)
        } else {
          insumos = insumos.map((i) =>
            i.id === linea.itemId
              ? {
                  ...i,
                  stock: i.stock + linea.cantidad,
                  costo: linea.costoUnitario > 0 ? linea.costoUnitario : i.costo,
                }
              : i,
          )
        }
      }

      return {
        ...state,
        recepciones: state.recepciones.map((r) =>
          r.id === action.payload ? recepcionConfirmada : r,
        ),
        productos,
        insumos,
        movimientos: [...state.movimientos, ...nuevosMovimientos],
      }
    }

    case 'CANCELAR_RECEPCION':
      return {
        ...state,
        recepciones: state.recepciones.map((r) =>
          r.id === action.payload && r.estado === 'borrador'
            ? { ...r, estado: 'cancelada' as const }
            : r,
        ),
      }

    // ── Control ───────────────────────────────────────────────────────────────
    case 'ADD_REGLA_CONTROL': {
      const nueva: ReglaControl = {
        ...action.payload,
        id: uid(),
        createdAt: todayISO(),
      }
      return { ...state, reglasControl: [...state.reglasControl, nueva] }
    }

    case 'ADD_REGISTRO_CONTROL': {
      const nuevo: RegistroControl = { ...action.payload, id: uid() }
      return { ...state, registrosControl: [...state.registrosControl, nuevo] }
    }

    // ── Ajustar stock (manual) ────────────────────────────────────────────────
    case 'AJUSTAR_STOCK': {
      const { itemTipo, itemId, varianteId, cantidad, motivo, nota } = action.payload

      let productos = state.productos
      let insumos = state.insumos

      // Fase 34+ (fix): un insumo vinculado a un producto no tiene stock
      // propio -- el ajuste se redirige al producto (fuente única de
      // verdad) y después se espeja de vuelta sobre el insumo. Antes esto
      // solo pasaba cuando el ajuste llegaba con itemTipo:'insumo'; si
      // llegaba directamente como 'producto' (ej. ajustando desde la fila
      // Producto en Stock.tsx o desde Productos.tsx) y ese producto tenía
      // un insumo espejo, el espejo quedaba desactualizado en silencio.
      // Ahora el espejo se sincroniza siempre, sin importar el lado de
      // origen -- y el movimiento se guarda con el ítem efectivo, para
      // que el Kardex de una existencia vinculada no quede partido.
      const vinculado =
        itemTipo === 'insumo' ? productoVinculadoDe(itemId, insumos, productos) : undefined
      const itemTipoEfectivo = vinculado ? 'producto' : itemTipo
      const itemIdEfectivo = vinculado ? vinculado.id : itemId

      const movimiento: MovimientoStock = {
        id: uid(),
        tipo: 'ajuste',
        itemTipo: itemTipoEfectivo,
        itemId: itemIdEfectivo,
        varianteId,
        cantidad,
        motivo,
        nota,
        fecha: todayISO(),
        origen: 'ajuste_manual',
      }

      if (itemTipoEfectivo === 'producto') {
        productos = productos.map((p) => {
          if (p.id !== itemIdEfectivo) return p
          if (varianteId) {
            const variantes = p.variantes.map((v) =>
              v.id === varianteId ? { ...v, stock: v.stock + cantidad } : v,
            )
            const stock = variantes.reduce((sum, v) => sum + v.stock, 0)
            return { ...p, variantes, stock }
          }
          return { ...p, stock: p.stock + cantidad }
        })
        insumos = espejarInsumoVinculado(itemIdEfectivo, productos, insumos)
      } else {
        insumos = insumos.map((i) =>
          i.id === itemId ? { ...i, stock: i.stock + cantidad } : i,
        )
      }

      return {
        ...state,
        productos,
        insumos,
        movimientos: [...state.movimientos, movimiento],
      }
    }

    // ── Recibir stock (item individual) ───────────────────────────────────────
    case 'RECIBIR_STOCK': {
      const { itemTipo, itemId, varianteId, cantidad, costoUnitario, nota } = action.payload

      let productos = state.productos
      let insumos = state.insumos

      // Fase 34+ (fix): ver comentario en AJUSTAR_STOCK -- mismo criterio
      // de redirección a producto + espejo de vuelta sobre el insumo,
      // ahora también cuando el ítem llega directamente como 'producto'.
      const vinculado =
        itemTipo === 'insumo' ? productoVinculadoDe(itemId, insumos, productos) : undefined
      const itemTipoEfectivo = vinculado ? 'producto' : itemTipo
      const itemIdEfectivo = vinculado ? vinculado.id : itemId

      const movimiento: MovimientoStock = {
        id: uid(),
        tipo: 'ingreso',
        itemTipo: itemTipoEfectivo,
        itemId: itemIdEfectivo,
        varianteId,
        cantidad,
        costoUnitario,
        nota,
        fecha: todayISO(),
        origen: 'recepcion',
      }

      if (itemTipoEfectivo === 'producto') {
        productos = productos.map((p) => {
          if (p.id !== itemIdEfectivo) return p
          const costoUpdate =
            costoUnitario != null && costoUnitario > 0 ? { costo: costoUnitario } : {}
          if (varianteId) {
            const variantes = p.variantes.map((v) =>
              v.id === varianteId ? { ...v, stock: v.stock + cantidad } : v,
            )
            const stock = variantes.reduce((sum, v) => sum + v.stock, 0)
            return { ...p, variantes, stock, ...costoUpdate }
          }
          return { ...p, stock: p.stock + cantidad, ...costoUpdate }
        })
        insumos = espejarInsumoVinculado(itemIdEfectivo, productos, insumos)
      } else {
        insumos = insumos.map((i) =>
          i.id === itemId
            ? {
                ...i,
                stock: i.stock + cantidad,
                ...(costoUnitario != null && costoUnitario > 0
                  ? { costo: costoUnitario }
                  : {}),
              }
            : i,
        )
      }

      return {
        ...state,
        productos,
        insumos,
        movimientos: [...state.movimientos, movimiento],
      }
    }

    // ── Reset ─────────────────────────────────────────────────────────────────
    case 'RESET':
      // Nota: a diferencia de la version anterior, RESET ya NO borra datos
      // reales en Supabase (seria un borrado masivo irreversible). Solo
      // vuelve a mostrar el estado vacio de fabrica en memoria; para
      // recuperar los datos reales alcanza con recargar la pagina.
      return seedState

    default:
      return state
  }
}

// ─── Mapeo dominio -> filas de Supabase ───────────────────────

function productoToRow(p: Producto, clienteId: string) {
  return {
    id: p.id,
    cliente_id: clienteId,
    codigo: p.codigo || null,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio_venta: p.precioVenta,
    costo: p.costo,
    iva: p.iva,
    unidad_venta: p.unidadVenta,
    stock: p.stock,
    stock_minimo: p.stockMinimo,
    controla_stock: p.controlaStock,
    disponible: p.disponible,
    estado: p.estado,
    tiene_formula: p.tieneFormula,
    imagenes: p.imagenes,
    rubro_id: p.rubroId || null,
    sub_rubro_id: p.subRubroId || null,
    codigo_barras: p.codigoBarras || null,
    marca_id: p.marcaId || null,
    proveedor_id: p.proveedorId || null,
    tipo: p.tipo,
    plantilla_garantia_id: p.plantillaGarantiaId || null,
    dias_disponibles: p.diasDisponibles && p.diasDisponibles.length ? p.diasDisponibles : null,
    // Fase 27d: null = compartido entre todos los locales (default).
    punto_venta_id: p.puntoVentaId || null,
    // Fase 34+: ver comentario en types/index.ts (Producto.esInsumo).
    es_insumo: p.esInsumo ?? false,
    // Fase 40: ver comentario en types/index.ts (Producto.servicioAsociadoId).
    servicio_asociado_id: p.servicioAsociadoId || null,
    servicio_asociado_obligatorio: p.servicioAsociadoObligatorio ?? false,
    // Precio automático por margen (17/08) -- ver comentario en types/index.ts.
    margen_ganancia: p.margenGanancia ?? null,
  }
}

function marcaToRow(m: Marca, clienteId: string) {
  return { id: m.id, cliente_id: clienteId, nombre: m.nombre }
}

function listaPrecioToRow(l: ListaPrecio, clienteId: string) {
  return {
    id: l.id,
    cliente_id: clienteId,
    nombre: l.nombre,
    porcentaje_recargo: l.porcentajeRecargo,
  }
}

function productoPrecioToRow(pp: ProductoPrecio) {
  return {
    id: pp.id,
    producto_id: pp.productoId,
    lista_id: pp.listaId,
    precio: pp.precio,
  }
}

function plantillaGarantiaToRow(pg: PlantillaGarantia, clienteId: string) {
  return {
    id: pg.id,
    cliente_id: clienteId,
    nombre: pg.nombre,
    duracion_meses: pg.duracionMeses,
    cobertura: pg.cobertura || null,
  }
}

function comboToRow(c: Combo, clienteId: string) {
  return {
    id: c.id,
    cliente_id: clienteId,
    nombre: c.nombre,
    descripcion: c.descripcion || null,
    precio_venta: c.precioVenta,
    disponible: c.disponible,
    imagenes: c.imagenes ?? [],
    descuento_porcentaje: c.descuentoPorcentaje ?? 0,
    etiqueta: c.etiqueta?.trim() || null,
    // Fase 27d: null = compartido entre todos los locales (default).
    punto_venta_id: c.puntoVentaId || null,
  }
}

function comboComponenteFijoToRow(cf: ComboComponenteFijo, comboId: string) {
  return {
    id: cf.id,
    combo_id: comboId,
    producto_id: cf.productoId,
    cantidad: cf.cantidad,
  }
}

function comboComponenteEleccionToRow(ce: ComboComponenteEleccion, comboId: string) {
  return {
    id: ce.id,
    combo_id: comboId,
    rubro_id: ce.rubroId,
    cantidad: ce.cantidad,
  }
}

// Mismo patrón que syncProductoVariantes/formula_lineas: borra los hijos del
// combo y reinserta los actuales. El formulario de Combo siempre manda la
// lista completa de componentes (fijos y de elección), así que este
// delete+reinsert es seguro.
function syncComboComponentes(
  comboId: string,
  componentesFijos: ComboComponenteFijo[],
  componentesEleccion: ComboComponenteEleccion[],
) {
  supabase.from('combo_componentes_fijos').delete().eq('combo_id', comboId).then(() => {
    if (componentesFijos.length) {
      supabase
        .from('combo_componentes_fijos')
        .insert(componentesFijos.map((cf) => comboComponenteFijoToRow(cf, comboId)))
        .then(logErr('componentes fijos de combo'))
    }
  })
  supabase.from('combo_componentes_eleccion').delete().eq('combo_id', comboId).then(() => {
    if (componentesEleccion.length) {
      supabase
        .from('combo_componentes_eleccion')
        .insert(componentesEleccion.map((ce) => comboComponenteEleccionToRow(ce, comboId)))
        .then(logErr('componentes a elección de combo'))
    }
  })
}

function productoVarianteToRow(v: ProductoVariante, productoId: string, orden: number) {
  return {
    id: v.id,
    producto_id: productoId,
    color: v.color || null,
    talle: v.talle || null,
    codigo_barras: v.codigoBarras || null,
    stock: v.stock,
    orden,
  }
}

// Mismo patrón que syncVariantes en el store de Servicios: borra todas las
// variantes del producto y reinserta las actuales. Es seguro porque el
// formulario de Producto siempre manda el stock REAL de cada variante
// existente (nunca lo resetea a 0) -- ver comentario al inicio del archivo.
function syncProductoVariantes(productoId: string, variantes: ProductoVariante[]) {
  supabase.from('producto_variantes').delete().eq('producto_id', productoId).then(() => {
    if (variantes.length) {
      supabase
        .from('producto_variantes')
        .insert(variantes.map((v, idx) => productoVarianteToRow(v, productoId, idx)))
        .then(logErr('variantes de producto'))
    }
  })
}

function insumoToRow(i: Insumo, clienteId: string) {
  return {
    id: i.id,
    cliente_id: clienteId,
    nombre: i.nombre,
    rubro_id: i.rubroId || null,
    sub_rubro_id: i.subRubroId || null,
    unidad: i.unidad,
    stock: i.stock,
    stock_minimo: i.stockMinimo,
    costo: i.costo,
    es_comercializable: i.esComercializable,
    producto_vinculado_id: i.productoVinculadoId || null,
  }
}

// ─── Producto ↔ Insumo vinculado (Fase 34+) ─────────────────────────────────
// Un producto marcado `esInsumo` tiene un registro espejo en `insumos` (con
// `productoVinculadoId` apuntando a él) para poder elegirse en Formular
// Producto. El producto es la fuente única de verdad del stock/costo -- el
// insumo vinculado NUNCA se edita a mano, solo se espeja. Estos tres
// helpers centralizan esa relación para no duplicar la lógica en cada
// action que toca stock (Recepción, Ajuste, Producción).

/** Si `insumoId` corresponde a un insumo vinculado a un producto, devuelve
 * ese producto. undefined si el insumo no existe o no está vinculado. */
function productoVinculadoDe(
  insumoId: string,
  insumos: Insumo[],
  productos: Producto[],
): Producto | undefined {
  const insumo = insumos.find((i) => i.id === insumoId)
  if (!insumo?.productoVinculadoId) return undefined
  return productos.find((p) => p.id === insumo.productoVinculadoId)
}

/** Copia stock/costo del producto `productoId` sobre su insumo vinculado (si
 * tiene uno) dentro del array de insumos. No-op si no hay insumo vinculado. */
function espejarInsumoVinculado(
  productoId: string,
  productos: Producto[],
  insumos: Insumo[],
): Insumo[] {
  const producto = productos.find((p) => p.id === productoId)
  if (!producto) return insumos
  return insumos.map((i) =>
    i.productoVinculadoId === productoId
      ? { ...i, stock: producto.stock, costo: producto.costo }
      : i,
  )
}

/** Alta/edición de un producto: crea, actualiza o desvincula el insumo
 * espejo según `producto.esInsumo`. Devuelve el array de insumos ya
 * actualizado (no muta el original). Se usa desde ADD_PRODUCTO,
 * UPDATE_PRODUCTO y DELETE_PRODUCTO (con `producto.esInsumo = false` para
 * forzar la desvinculación). */
function sincronizarInsumoDeProducto(producto: Producto, insumos: Insumo[]): Insumo[] {
  const existente = insumos.find((i) => i.productoVinculadoId === producto.id)

  if (producto.esInsumo && !existente) {
    // Fase 34+ (fix): antes de crear un espejo nuevo, se busca un insumo
    // suelto (sin vínculo) con el mismo nombre -- evita el duplicado
    // clásico de "ya existía este insumo de una carga anterior a este
    // vínculo, ahora hay dos filas para la misma existencia". Si lo
    // encuentra, lo adopta como espejo en vez de crear una fila nueva
    // (conserva su id -- ver ProductoDialog, que avisa antes de tildar
    // "también es insumo" si detecta este caso).
    const nombreProducto = producto.nombre.trim().toLowerCase()
    const huerfano = insumos.find(
      (i) => !i.productoVinculadoId && i.nombre.trim().toLowerCase() === nombreProducto,
    )
    if (huerfano) {
      return insumos.map((i) =>
        i.id === huerfano.id
          ? {
              ...i,
              productoVinculadoId: producto.id,
              rubroId: producto.rubroId,
              subRubroId: producto.subRubroId,
              unidad: producto.unidadVenta,
              stockMinimo: producto.stockMinimo,
              costo: producto.costo,
              stock: producto.stock,
            }
          : i,
      )
    }
    const nuevo: Insumo = {
      id: uid(),
      nombre: producto.nombre,
      rubroId: producto.rubroId,
      subRubroId: producto.subRubroId,
      unidad: producto.unidadVenta,
      stock: producto.stock,
      stockMinimo: producto.stockMinimo,
      costo: producto.costo,
      esComercializable: true,
      productoVinculadoId: producto.id,
      createdAt: todayISO(),
    }
    return [...insumos, nuevo]
  }

  if (!producto.esInsumo && existente) {
    // No se borra -- puede estar referenciado por una Fórmula. Se
    // desvincula: queda como insumo independiente, deja de espejar.
    return insumos.map((i) =>
      i.id === existente.id ? { ...i, productoVinculadoId: undefined } : i,
    )
  }

  if (producto.esInsumo && existente) {
    // Sigue vinculado -- espeja los campos editables desde el formulario de
    // Producto. Stock/costo también, por si se editaron a mano en el
    // formulario (las mutaciones de stock en sí las espejan por separado
    // `espejarInsumoVinculado`, en las actions de Recepción/Ajuste/
    // Producción).
    return insumos.map((i) =>
      i.id === existente.id
        ? {
            ...i,
            nombre: producto.nombre,
            rubroId: producto.rubroId,
            subRubroId: producto.subRubroId,
            unidad: producto.unidadVenta,
            stockMinimo: producto.stockMinimo,
            costo: producto.costo,
            stock: producto.stock,
          }
        : i,
    )
  }

  return insumos
}

function rubroToRow(r: Rubro, clienteId: string) {
  return {
    id: r.id,
    cliente_id: clienteId,
    nombre: r.nombre,
    tipo: r.tipo,
    plantilla_garantia_id: r.plantillaGarantiaId || null,
  }
}

function subRubroToRow(sr: SubRubro) {
  return { id: sr.id, rubro_id: sr.rubroId, nombre: sr.nombre }
}

function formulaToRow(f: Formula, clienteId: string) {
  return {
    id: f.id,
    cliente_id: clienteId,
    producto_id: f.productoId,
    cantidad_producida: f.cantidadProducida,
    unidad_producida: f.unidadProducida,
    notas: f.notas,
    merma_porcentaje: f.mermaPorcentaje,
  }
}

function formulaLineaToRow(l: LineaFormula, formulaId: string) {
  return {
    id: l.id,
    formula_id: formulaId,
    tipo: l.tipo,
    insumo_id: l.insumoId || null,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    unidad: l.unidad,
    costo_unitario: l.costoUnitario,
    origen_modulo: l.origenModulo || null,
    origen_id: l.origenId || null,
  }
}

function produccionToRow(p: Produccion, clienteId: string) {
  return {
    id: p.id,
    cliente_id: clienteId,
    formula_id: p.formulaId,
    producto_id: p.productoId,
    factor: p.factor,
    cantidad_teorica: p.cantidadTeorica,
    cantidad_real_producida: p.cantidadRealProducida,
    fecha: p.fecha,
    notas: p.notas || null,
  }
}

function movimientoToRow(m: MovimientoStock, clienteId: string) {
  return {
    id: m.id,
    cliente_id: clienteId,
    tipo: m.tipo,
    item_tipo: m.itemTipo,
    item_id: m.itemId,
    variante_id: m.varianteId || null,
    cantidad: m.cantidad,
    motivo: m.motivo || null,
    nota: m.nota || null,
    costo_unitario: m.costoUnitario ?? null,
    fecha: m.fecha,
    origen: m.origen || null,
    origen_id: m.origenId || null,
    fecha_vencimiento: m.fechaVencimiento || null,
  }
}

function recepcionToRow(r: Recepcion, clienteId: string) {
  return {
    id: r.id,
    cliente_id: clienteId,
    fecha: r.fecha,
    proveedor: r.proveedor,
    numero_remito: r.numeroRemito,
    estado: r.estado,
    notas: r.notas,
  }
}

function recepcionLineaToRow(l: LineaRecepcion, recepcionId: string) {
  return {
    id: l.id,
    recepcion_id: recepcionId,
    item_tipo: l.itemTipo,
    item_id: l.itemId,
    variante_id: l.varianteId || null,
    cantidad: l.cantidad,
    costo_unitario: l.costoUnitario,
    fecha_vencimiento: l.fechaVencimiento || null,
  }
}

function reglaControlToRow(rc: ReglaControl, clienteId: string) {
  return {
    id: rc.id,
    cliente_id: clienteId,
    nombre: rc.nombre,
    rubro_id: rc.rubroId || null,
    frecuencia_dias: rc.frecuenciaDias,
  }
}

function registroControlToRow(reg: RegistroControl, clienteId: string) {
  return {
    id: reg.id,
    cliente_id: clienteId,
    regla_id: reg.reglaId,
    item_tipo: reg.itemTipo,
    item_id: reg.itemId,
    stock_sistema: reg.stockSistema,
    stock_contado: reg.stockContado,
    diferencia: reg.diferencia,
    fecha: reg.fecha,
  }
}

function logErr(label: string) {
  return ({ error }: { error: unknown }) => error && console.error(`Productos y Stock · error en ${label}:`, error)
}

/** Fase 34+: persiste en Supabase los insumos vinculados que
 * `sincronizarInsumoDeProducto` haya creado/editado/desvinculado en el
 * reducer (ADD_PRODUCTO/UPDATE_PRODUCTO/DELETE_PRODUCTO). Compara
 * `prevState.insumos` vs `nextState.insumos` fila por fila -- alcanza con
 * eso porque esas tres actions solo tocan, como mucho, el insumo vinculado
 * a UN producto por vez. */
function persistirInsumosVinculados(
  prevState: ProductosStockState,
  nextState: ProductosStockState,
  clienteId: string,
) {
  for (const i of nextState.insumos) {
    const prev = prevState.insumos.find((x) => x.id === i.id)
    if (!prev) {
      supabase.from('insumos').insert(insumoToRow(i, clienteId)).then(logErr('alta de insumo vinculado'))
    } else if (
      prev.nombre !== i.nombre ||
      prev.rubroId !== i.rubroId ||
      prev.subRubroId !== i.subRubroId ||
      prev.unidad !== i.unidad ||
      prev.stockMinimo !== i.stockMinimo ||
      prev.costo !== i.costo ||
      prev.stock !== i.stock ||
      prev.productoVinculadoId !== i.productoVinculadoId
    ) {
      supabase.from('insumos').update(insumoToRow(i, clienteId)).eq('id', i.id).then(logErr('sync de insumo vinculado'))
    }
  }
}

// ─── Sincronización con Supabase por acción ────────────────────

async function syncToSupabase(
  action: Action,
  prevState: ProductosStockState,
  nextState: ProductosStockState,
  clienteId: string,
) {
  switch (action.type) {
    case 'ADD_PRODUCTO': {
      const p = nextState.productos[nextState.productos.length - 1]
      supabase.from('productos').insert(productoToRow(p, clienteId)).then(logErr('alta de producto'))
      if (p.tipo === 'con_variantes' && p.variantes.length) {
        supabase
          .from('producto_variantes')
          .insert(p.variantes.map((v, idx) => productoVarianteToRow(v, p.id, idx)))
          .then(logErr('variantes de producto'))
      }
      persistirInsumosVinculados(prevState, nextState, clienteId)
      return
    }
    case 'UPDATE_PRODUCTO': {
      const p = action.payload
      supabase.from('productos').update(productoToRow(p, clienteId)).eq('id', p.id).then(logErr('edición de producto'))
      syncProductoVariantes(p.id, p.tipo === 'con_variantes' ? p.variantes : [])
      persistirInsumosVinculados(prevState, nextState, clienteId)
      return
    }
    case 'DELETE_PRODUCTO':
      // producto_variantes tiene ON DELETE CASCADE en la migración.
      supabase.from('productos').delete().eq('id', action.payload).then(logErr('borrado de producto'))
      // Fase 34+: si tenía un insumo vinculado, el reducer ya lo desvinculó
      // (no se borra -- puede estar usado en una Fórmula) -- se persiste acá.
      persistirInsumosVinculados(prevState, nextState, clienteId)
      return

    case 'ADD_INSUMO': {
      const i = nextState.insumos[nextState.insumos.length - 1]
      supabase.from('insumos').insert(insumoToRow(i, clienteId)).then(logErr('alta de insumo'))
      return
    }
    case 'UPDATE_INSUMO':
      supabase.from('insumos').update(insumoToRow(action.payload, clienteId)).eq('id', action.payload.id).then(logErr('edición de insumo'))
      return
    case 'DELETE_INSUMO':
      supabase.from('insumos').delete().eq('id', action.payload).then(logErr('borrado de insumo'))
      return

    case 'ADD_RUBRO': {
      const r = nextState.rubros[nextState.rubros.length - 1]
      supabase.from('rubros').insert(rubroToRow(r, clienteId)).then(logErr('alta de rubro'))
      return
    }
    case 'UPDATE_RUBRO':
      supabase.from('rubros').update(rubroToRow(action.payload, clienteId)).eq('id', action.payload.id).then(logErr('edición de rubro'))
      return
    case 'DELETE_RUBRO':
      // Primero las hijas (sub_rubros) para no violar la FK, después el rubro.
      supabase.from('sub_rubros').delete().eq('rubro_id', action.payload).then(() => {
        supabase.from('rubros').delete().eq('id', action.payload).then(logErr('borrado de rubro'))
      })
      return

    case 'ADD_SUBRUBRO': {
      const sr = nextState.subRubros[nextState.subRubros.length - 1]
      supabase.from('sub_rubros').insert(subRubroToRow(sr)).then(logErr('alta de sub-rubro'))
      return
    }
    case 'UPDATE_SUBRUBRO':
      supabase.from('sub_rubros').update(subRubroToRow(action.payload)).eq('id', action.payload.id).then(logErr('edición de sub-rubro'))
      return
    case 'DELETE_SUBRUBRO':
      supabase.from('sub_rubros').delete().eq('id', action.payload).then(logErr('borrado de sub-rubro'))
      return

    case 'ADD_MARCA': {
      const m = nextState.marcas[nextState.marcas.length - 1]
      supabase.from('marcas').insert(marcaToRow(m, clienteId)).then(logErr('alta de marca'))
      return
    }
    case 'UPDATE_MARCA':
      supabase.from('marcas').update(marcaToRow(action.payload, clienteId)).eq('id', action.payload.id).then(logErr('edición de marca'))
      return
    case 'DELETE_MARCA':
      supabase.from('marcas').delete().eq('id', action.payload).then(logErr('borrado de marca'))
      return

    case 'ADD_LISTA_PRECIO': {
      const l = nextState.listasPrecio[nextState.listasPrecio.length - 1]
      supabase.from('listas_precio').insert(listaPrecioToRow(l, clienteId)).then(logErr('alta de lista de precio'))
      return
    }
    case 'UPDATE_LISTA_PRECIO':
      supabase.from('listas_precio').update(listaPrecioToRow(action.payload, clienteId)).eq('id', action.payload.id).then(logErr('edición de lista de precio'))
      return
    case 'DELETE_LISTA_PRECIO':
      // producto_precios tiene ON DELETE CASCADE en la migración.
      supabase.from('listas_precio').delete().eq('id', action.payload).then(logErr('borrado de lista de precio'))
      return

    case 'SET_PRECIO_PRODUCTO': {
      const { productoId, listaId, precio } = action.payload
      const existente = prevState.productosPrecios.find(
        (pp) => pp.productoId === productoId && pp.listaId === listaId,
      )
      if (precio === null) {
        if (existente) {
          supabase.from('producto_precios').delete().eq('id', existente.id).then(logErr('borrado de precio de producto'))
        }
        return
      }
      if (existente) {
        supabase.from('producto_precios').update({ precio }).eq('id', existente.id).then(logErr('edición de precio de producto'))
      } else {
        const nuevo = nextState.productosPrecios.find(
          (pp) => pp.productoId === productoId && pp.listaId === listaId,
        )
        if (nuevo) {
          supabase.from('producto_precios').insert(productoPrecioToRow(nuevo)).then(logErr('alta de precio de producto'))
        }
      }
      return
    }

    case 'ADD_PLANTILLA_GARANTIA': {
      const pg = nextState.plantillasGarantia[nextState.plantillasGarantia.length - 1]
      supabase.from('plantillas_garantia').insert(plantillaGarantiaToRow(pg, clienteId)).then(logErr('alta de plantilla de garantía'))
      return
    }
    case 'UPDATE_PLANTILLA_GARANTIA':
      supabase.from('plantillas_garantia').update(plantillaGarantiaToRow(action.payload, clienteId)).eq('id', action.payload.id).then(logErr('edición de plantilla de garantía'))
      return
    case 'DELETE_PLANTILLA_GARANTIA':
      // rubros.plantilla_garantia_id y productos.plantilla_garantia_id tienen
      // "on delete set null" en la migración -- Supabase los limpia solo,
      // igual que el reducer hace en memoria.
      supabase.from('plantillas_garantia').delete().eq('id', action.payload).then(logErr('borrado de plantilla de garantía'))
      return

    case 'ADD_COMBO': {
      const c = nextState.combos[nextState.combos.length - 1]
      // Mismo fix que ADD_FORMULA/ADD_RECEPCION: los componentes se insertan
      // recién cuando el INSERT del combo confirmó, para que la política
      // RLS de combo_componentes_* encuentre la fila padre ya visible.
      supabase
        .from('combos')
        .insert(comboToRow(c, clienteId))
        .then((res) => {
          logErr('alta de combo')(res)
          if (!res.error) {
            if (c.componentesFijos.length) {
              supabase
                .from('combo_componentes_fijos')
                .insert(c.componentesFijos.map((cf) => comboComponenteFijoToRow(cf, c.id)))
                .then(logErr('componentes fijos de combo'))
            }
            if (c.componentesEleccion.length) {
              supabase
                .from('combo_componentes_eleccion')
                .insert(
                  c.componentesEleccion.map((ce) => comboComponenteEleccionToRow(ce, c.id)),
                )
                .then(logErr('componentes a elección de combo'))
            }
          }
        })
      return
    }
    case 'UPDATE_COMBO': {
      const c = action.payload
      supabase.from('combos').update(comboToRow(c, clienteId)).eq('id', c.id).then(logErr('edición de combo'))
      syncComboComponentes(c.id, c.componentesFijos, c.componentesEleccion)
      return
    }
    case 'DELETE_COMBO':
      // combo_componentes_fijos y combo_componentes_eleccion tienen ON
      // DELETE CASCADE en la migración.
      supabase.from('combos').delete().eq('id', action.payload).then(logErr('borrado de combo'))
      return

    case 'ADD_FORMULA': {
      const f = nextState.formulas[nextState.formulas.length - 1]
      // IMPORTANTE: el INSERT de las líneas se dispara recién DESPUÉS de que
      // el INSERT de la fórmula haya confirmado en Supabase (encadenado con
      // .then, no en paralelo). Antes ambos INSERT se disparaban al mismo
      // tiempo, y la política RLS de `formula_lineas` (que exige que exista
      // una fila en `formulas` con ese id) podía evaluarse antes de que la
      // fila padre estuviera confirmada, devolviendo 42501 (RLS) y perdiendo
      // las líneas en silencio.
      supabase
        .from('formulas')
        .insert(formulaToRow(f, clienteId))
        .then((res) => {
          logErr('alta de fórmula')(res)
          if (!res.error && f.lineas.length) {
            supabase.from('formula_lineas').insert(f.lineas.map((l) => formulaLineaToRow(l, f.id))).then(logErr('líneas de fórmula'))
          }
        })
      return
    }
    case 'UPDATE_FORMULA': {
      const f = action.payload
      supabase.from('formulas').update(formulaToRow(f, clienteId)).eq('id', f.id).then(logErr('edición de fórmula'))
      supabase.from('formula_lineas').delete().eq('formula_id', f.id).then(() => {
        if (f.lineas.length) {
          supabase.from('formula_lineas').insert(f.lineas.map((l) => formulaLineaToRow(l, f.id))).then(logErr('líneas de fórmula'))
        }
      })
      return
    }
    case 'DELETE_FORMULA':
      // formula_lineas tiene ON DELETE CASCADE en la migración.
      supabase.from('formulas').delete().eq('id', action.payload).then(logErr('borrado de fórmula'))
      return

    case 'REGISTRAR_PRODUCCION': {
      // Fase 9 (cierre): la fila de `producciones` es el registro real del
      // lote -- se inserta primero (igual que ADD_FORMULA/ADD_RECEPCION con
      // sus líneas) para que exista antes de que corra cualquier otra
      // política RLS que la referencie más adelante.
      const p = nextState.producciones[nextState.producciones.length - 1]
      if (p) {
        supabase.from('producciones').insert(produccionToRow(p, clienteId)).then(logErr('alta de producción'))
      }
      // Fase 27e-2: null en clientes de un solo local -- sin cambios para
      // ellos (ver src/lib/puntoVenta.ts).
      const puntoVentaIdProduccion = await resolverPuntoVentaId(clienteId)

      // Mismo patrón que CONFIRMAR_RECEPCION: los movimientos nuevos son
      // los que el reducer agregó al final del array.
      const nuevosMovimientos = nextState.movimientos.slice(prevState.movimientos.length)
      if (nuevosMovimientos.length) {
        supabase
          .from('movimientos_stock')
          .insert(nuevosMovimientos.map((m) => ({ ...movimientoToRow(m, clienteId), punto_venta_id: puntoVentaIdProduccion })))
          .then(logErr('movimientos de producción'))
      }

      for (const i of nextState.insumos) {
        const prev = prevState.insumos.find((x) => x.id === i.id)
        if (!prev || prev.stock === i.stock) continue
        if (puntoVentaIdProduccion) {
          ajustarStockPuntoVenta({
            clienteId,
            puntoVentaId: puntoVentaIdProduccion,
            itemTipo: 'insumo',
            itemId: i.id,
            delta: i.stock - prev.stock,
          }).then(logErr('stock de insumo tras producción'))
        } else {
          supabase.from('insumos').update({ stock: i.stock }).eq('id', i.id).then(logErr('stock de insumo tras producción'))
        }
      }
      for (const p of nextState.productos) {
        const prev = prevState.productos.find((x) => x.id === p.id)
        if (!prev || prev.stock === p.stock) continue
        if (puntoVentaIdProduccion) {
          // REGISTRAR_PRODUCCION solo afecta productos 'unico' (el producto
          // que arma la fórmula, sin desglose por variante) -- ver el
          // reducer más arriba.
          ajustarStockPuntoVenta({
            clienteId,
            puntoVentaId: puntoVentaIdProduccion,
            itemTipo: 'producto',
            itemId: p.id,
            delta: p.stock - prev.stock,
          }).then(logErr('stock de producto tras producción'))
        } else {
          supabase.from('productos').update({ stock: p.stock }).eq('id', p.id).then(logErr('stock de producto tras producción'))
        }
      }
      return
    }

    case 'ADD_MOVIMIENTO': {
      const m = nextState.movimientos[nextState.movimientos.length - 1]
      supabase.from('movimientos_stock').insert(movimientoToRow(m, clienteId)).then(logErr('alta de movimiento'))
      return
    }

    case 'ADD_RECEPCION': {
      const r = nextState.recepciones[nextState.recepciones.length - 1]
      // Mismo fix que ADD_FORMULA: las líneas se insertan recién cuando el
      // INSERT de la recepción confirmó, para que la política RLS de
      // `recepcion_lineas` encuentre la fila padre ya visible.
      supabase
        .from('recepciones')
        .insert(recepcionToRow(r, clienteId))
        .then((res) => {
          logErr('alta de recepción')(res)
          if (!res.error && r.lineas.length) {
            supabase.from('recepcion_lineas').insert(r.lineas.map((l) => recepcionLineaToRow(l, r.id))).then(logErr('líneas de recepción'))
          }
        })
      return
    }

    case 'CONFIRMAR_RECEPCION': {
      // Sin cambios reales si la recepción no estaba en borrador.
      if (nextState === prevState) return

      const recepcion = nextState.recepciones.find((r) => r.id === action.payload)
      if (recepcion) {
        supabase.from('recepciones').update({ estado: recepcion.estado }).eq('id', recepcion.id).then(logErr('confirmación de recepción'))
      }

      // Fase 27e-2: null en clientes de un solo local -- sin cambios para
      // ellos (ver src/lib/puntoVenta.ts).
      const puntoVentaIdRecepcion = await resolverPuntoVentaId(clienteId)

      // Movimientos nuevos: el reducer solo agrega al final.
      const nuevosMovimientos = nextState.movimientos.slice(prevState.movimientos.length)
      if (nuevosMovimientos.length) {
        supabase
          .from('movimientos_stock')
          .insert(nuevosMovimientos.map((m) => ({ ...movimientoToRow(m, clienteId), punto_venta_id: puntoVentaIdRecepcion })))
          .then(logErr('movimientos de recepción'))
      }

      // Productos/insumos cuyo stock o costo cambió.
      for (const p of nextState.productos) {
        const prev = prevState.productos.find((x) => x.id === p.id)
        if (!prev) continue

        if (p.variantes.length) {
          // Variantes cuyo stock cambió (Fase 2) -- el total del producto
          // padre (p.stock) es la suma de sus variantes, no se toca aparte.
          for (const v of p.variantes) {
            const prevV = prev.variantes.find((x) => x.id === v.id)
            if (!prevV || prevV.stock === v.stock) continue
            if (puntoVentaIdRecepcion) {
              ajustarStockPuntoVenta({
                clienteId,
                puntoVentaId: puntoVentaIdRecepcion,
                itemTipo: 'producto',
                itemId: p.id,
                varianteId: v.id,
                delta: v.stock - prevV.stock,
              }).then(logErr('stock de variante'))
            } else {
              supabase.from('producto_variantes').update({ stock: v.stock }).eq('id', v.id).then(logErr('stock de variante'))
            }
          }
          if (prev.costo !== p.costo) {
            supabase.from('productos').update({ costo: p.costo }).eq('id', p.id).then(logErr('costo de producto'))
          }
        } else if (prev.stock !== p.stock || prev.costo !== p.costo) {
          if (puntoVentaIdRecepcion) {
            if (prev.stock !== p.stock) {
              ajustarStockPuntoVenta({
                clienteId,
                puntoVentaId: puntoVentaIdRecepcion,
                itemTipo: 'producto',
                itemId: p.id,
                delta: p.stock - prev.stock,
              }).then(logErr('stock de producto'))
            }
            if (prev.costo !== p.costo) {
              supabase.from('productos').update({ costo: p.costo }).eq('id', p.id).then(logErr('costo de producto'))
            }
          } else {
            supabase.from('productos').update({ stock: p.stock, costo: p.costo }).eq('id', p.id).then(logErr('stock de producto'))
          }
        }
      }
      for (const i of nextState.insumos) {
        const prev = prevState.insumos.find((x) => x.id === i.id)
        if (!prev || (prev.stock === i.stock && prev.costo === i.costo)) continue
        if (puntoVentaIdRecepcion) {
          if (prev.stock !== i.stock) {
            ajustarStockPuntoVenta({
              clienteId,
              puntoVentaId: puntoVentaIdRecepcion,
              itemTipo: 'insumo',
              itemId: i.id,
              delta: i.stock - prev.stock,
            }).then(logErr('stock de insumo'))
          }
          if (prev.costo !== i.costo) {
            supabase.from('insumos').update({ costo: i.costo }).eq('id', i.id).then(logErr('costo de insumo'))
          }
        } else {
          supabase.from('insumos').update({ stock: i.stock, costo: i.costo }).eq('id', i.id).then(logErr('stock de insumo'))
        }
      }
      return
    }

    case 'CANCELAR_RECEPCION': {
      const recepcion = nextState.recepciones.find((r) => r.id === action.payload)
      const prevRecepcion = prevState.recepciones.find((r) => r.id === action.payload)
      if (recepcion && prevRecepcion && recepcion.estado !== prevRecepcion.estado) {
        supabase.from('recepciones').update({ estado: recepcion.estado }).eq('id', recepcion.id).then(logErr('cancelación de recepción'))
      }
      return
    }

    case 'ADD_REGLA_CONTROL': {
      const rc = nextState.reglasControl[nextState.reglasControl.length - 1]
      supabase.from('reglas_control').insert(reglaControlToRow(rc, clienteId)).then(logErr('alta de regla de control'))
      return
    }

    case 'ADD_REGISTRO_CONTROL': {
      const reg = nextState.registrosControl[nextState.registrosControl.length - 1]
      supabase.from('registros_control').insert(registroControlToRow(reg, clienteId)).then(logErr('alta de registro de control'))
      return
    }

    case 'AJUSTAR_STOCK':
    case 'RECIBIR_STOCK': {
      const m = nextState.movimientos[nextState.movimientos.length - 1]

      // Fase 27e-2: null en clientes de un solo local -- sin cambios para
      // ellos (ver src/lib/puntoVenta.ts).
      const puntoVentaIdAjuste = await resolverPuntoVentaId(clienteId)
      supabase
        .from('movimientos_stock')
        .insert({ ...movimientoToRow(m, clienteId), punto_venta_id: puntoVentaIdAjuste })
        .then(logErr('movimiento de stock'))

      const { itemTipo, itemId, cantidad } = action.payload
      const varianteId = 'varianteId' in action.payload ? action.payload.varianteId : undefined

      // Fase 34+: si el itemTipo pedido es 'insumo' pero ese insumo está
      // vinculado a un producto, el movimiento en realidad se aplicó sobre
      // el producto (ver reducer) -- acá se persiste con ese mismo criterio,
      // y el insumo vinculado se espeja aparte, siempre como columna plana
      // (nunca reparte stock por punto de venta: es un mirror, no un item
      // real).
      const insumoOriginal = itemTipo === 'insumo' ? nextState.insumos.find((x) => x.id === itemId) : undefined
      const itemTipoEfectivo = insumoOriginal?.productoVinculadoId ? 'producto' : itemTipo
      const itemIdEfectivo = insumoOriginal?.productoVinculadoId ?? itemId

      // AJUSTAR_STOCK/RECIBIR_STOCK aplican `cantidad` como delta directo
      // sobre el stock actual (ver el reducer más arriba: `stock + cantidad`).
      if (itemTipoEfectivo === 'producto') {
        const p = nextState.productos.find((x) => x.id === itemIdEfectivo)
        if (p) {
          const prev = prevState.productos.find((x) => x.id === itemIdEfectivo)
          if (puntoVentaIdAjuste) {
            if (cantidad) {
              ajustarStockPuntoVenta({
                clienteId,
                puntoVentaId: puntoVentaIdAjuste,
                itemTipo: 'producto',
                itemId: p.id,
                varianteId,
                delta: cantidad,
              }).then(logErr('stock de producto'))
            }
            if (!prev || prev.costo !== p.costo) {
              supabase.from('productos').update({ costo: p.costo }).eq('id', p.id).then(logErr('costo de producto'))
            }
          } else {
            supabase.from('productos').update({ stock: p.stock, costo: p.costo }).eq('id', p.id).then(logErr('stock de producto'))
            if (varianteId) {
              const v = p.variantes.find((x) => x.id === varianteId)
              if (v) supabase.from('producto_variantes').update({ stock: v.stock }).eq('id', v.id).then(logErr('stock de variante'))
            }
          }
          // Espejo sobre el insumo vinculado, si lo hay -- siempre columna
          // plana en `insumos`, nunca stock_por_punto_venta.
          const insumoVinculado = nextState.insumos.find((x) => x.productoVinculadoId === p.id)
          if (insumoVinculado) {
            supabase
              .from('insumos')
              .update({ stock: p.stock, costo: p.costo })
              .eq('id', insumoVinculado.id)
              .then(logErr('espejo de stock en insumo vinculado'))
          }
        }
      } else {
        const i = nextState.insumos.find((x) => x.id === itemId)
        if (i) {
          const prev = prevState.insumos.find((x) => x.id === itemId)
          if (puntoVentaIdAjuste) {
            if (cantidad) {
              ajustarStockPuntoVenta({
                clienteId,
                puntoVentaId: puntoVentaIdAjuste,
                itemTipo: 'insumo',
                itemId: i.id,
                delta: cantidad,
              }).then(logErr('stock de insumo'))
            }
            if (!prev || prev.costo !== i.costo) {
              supabase.from('insumos').update({ costo: i.costo }).eq('id', i.id).then(logErr('costo de insumo'))
            }
          } else {
            supabase.from('insumos').update({ stock: i.stock, costo: i.costo }).eq('id', i.id).then(logErr('stock de insumo'))
          }
        }
      }
      return
    }

    default:
      return
  }
}

// ─── Fetch inicial desde Supabase ──────────────────────────────

// Exportada para que pantallas que mutan stock por fuera del flujo
// dispatch+syncToSupabase (ej. Transferencias.tsx, que llama a la RPC
// `crear_transferencia` directo) puedan recargar el estado completo
// después de una escritura exitosa, sin duplicar la lógica de mapeo acá.
export async function fetchProductosStockState(): Promise<ProductosStockState> {
  const [
    productosRes,
    productoVariantesRes,
    insumosRes,
    rubrosRes,
    subRubrosRes,
    marcasRes,
    listasPrecioRes,
    productosPreciosRes,
    plantillasGarantiaRes,
    combosRes,
    comboComponentesFijosRes,
    comboComponentesEleccionRes,
    formulasRes,
    formulaLineasRes,
    produccionesRes,
    movimientosRes,
    recepcionesRes,
    recepcionLineasRes,
    transferenciasRes,
    transferenciaLineasRes,
    reglasControlRes,
    registrosControlRes,
  ] = await Promise.all([
    supabase.from('productos').select('*').order('created_at'),
    supabase.from('producto_variantes').select('*').order('orden'),
    supabase.from('insumos').select('*').order('created_at'),
    supabase.from('rubros').select('*').order('created_at'),
    supabase.from('sub_rubros').select('*').order('created_at'),
    supabase.from('marcas').select('*').order('nombre'),
    supabase.from('listas_precio').select('*').order('nombre'),
    supabase.from('producto_precios').select('*'),
    supabase.from('plantillas_garantia').select('*').order('nombre'),
    supabase.from('combos').select('*').order('created_at'),
    supabase.from('combo_componentes_fijos').select('*'),
    supabase.from('combo_componentes_eleccion').select('*'),
    supabase.from('formulas').select('*').order('created_at'),
    supabase.from('formula_lineas').select('*'),
    supabase.from('producciones').select('*').order('fecha'),
    supabase.from('movimientos_stock').select('*').order('fecha'),
    supabase.from('recepciones').select('*').order('created_at'),
    supabase.from('recepcion_lineas').select('*'),
    supabase.from('transferencias').select('*').order('created_at'),
    supabase.from('transferencia_lineas').select('*'),
    supabase.from('reglas_control').select('*').order('created_at'),
    supabase.from('registros_control').select('*').order('fecha'),
  ])

  const variantesByProducto = new Map<string, ProductoVariante[]>()
  for (const r of productoVariantesRes.data ?? []) {
    const arr = variantesByProducto.get(r.producto_id) ?? []
    arr.push({
      id: r.id,
      color: r.color ?? undefined,
      talle: r.talle ?? undefined,
      codigoBarras: r.codigo_barras ?? undefined,
      stock: Number(r.stock),
    })
    variantesByProducto.set(r.producto_id, arr)
  }

  const productos: Producto[] = (productosRes.data ?? []).map((r: any) => ({
    id: r.id,
    codigo: r.codigo ?? '',
    nombre: r.nombre,
    descripcion: r.descripcion ?? '',
    rubroId: r.rubro_id ?? '',
    subRubroId: r.sub_rubro_id ?? undefined,
    precioVenta: Number(r.precio_venta),
    costo: Number(r.costo),
    iva: Number(r.iva) as Producto['iva'],
    unidadVenta: r.unidad_venta,
    stock: Number(r.stock),
    stockMinimo: Number(r.stock_minimo),
    controlaStock: r.controla_stock,
    disponible: r.disponible,
    estado: r.estado,
    tieneFormula: r.tiene_formula,
    imagenes: r.imagenes ?? [],
    codigoBarras: r.codigo_barras ?? undefined,
    marcaId: r.marca_id ?? undefined,
    proveedorId: r.proveedor_id ?? undefined,
    tipo: (r.tipo as Producto['tipo']) ?? 'unico',
    variantes: variantesByProducto.get(r.id) ?? [],
    plantillaGarantiaId: r.plantilla_garantia_id ?? undefined,
    diasDisponibles: r.dias_disponibles ?? undefined,
    puntoVentaId: r.punto_venta_id ?? undefined,
    esInsumo: r.es_insumo ?? false,
    servicioAsociadoId: r.servicio_asociado_id ?? undefined,
    servicioAsociadoObligatorio: r.servicio_asociado_obligatorio ?? false,
    margenGanancia: r.margen_ganancia ?? undefined,
    createdAt: (r.created_at ?? '').slice(0, 10),
  }))

  const insumos: Insumo[] = (insumosRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    rubroId: r.rubro_id ?? '',
    subRubroId: r.sub_rubro_id ?? undefined,
    unidad: r.unidad,
    stock: Number(r.stock),
    stockMinimo: Number(r.stock_minimo),
    costo: Number(r.costo),
    esComercializable: r.es_comercializable,
    productoVinculadoId: r.producto_vinculado_id ?? undefined,
    createdAt: (r.created_at ?? '').slice(0, 10),
  }))

  const rubros: Rubro[] = (rubrosRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    tipo: r.tipo,
    plantillaGarantiaId: r.plantilla_garantia_id ?? undefined,
  }))

  const subRubros: SubRubro[] = (subRubrosRes.data ?? []).map((r: any) => ({
    id: r.id,
    rubroId: r.rubro_id,
    nombre: r.nombre,
  }))

  const marcas: Marca[] = (marcasRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
  }))

  const listasPrecio: ListaPrecio[] = (listasPrecioRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    porcentajeRecargo: Number(r.porcentaje_recargo),
  }))

  const productosPrecios: ProductoPrecio[] = (productosPreciosRes.data ?? []).map((r: any) => ({
    id: r.id,
    productoId: r.producto_id,
    listaId: r.lista_id,
    precio: Number(r.precio),
  }))

  const plantillasGarantia: PlantillaGarantia[] = (plantillasGarantiaRes.data ?? []).map(
    (r: any) => ({
      id: r.id,
      nombre: r.nombre,
      duracionMeses: Number(r.duracion_meses),
      cobertura: r.cobertura ?? '',
    }),
  )

  const componentesFijosByCombo = new Map<string, ComboComponenteFijo[]>()
  for (const r of comboComponentesFijosRes.data ?? []) {
    const arr = componentesFijosByCombo.get(r.combo_id) ?? []
    arr.push({
      id: r.id,
      productoId: r.producto_id,
      cantidad: Number(r.cantidad),
    })
    componentesFijosByCombo.set(r.combo_id, arr)
  }

  const componentesEleccionByCombo = new Map<string, ComboComponenteEleccion[]>()
  for (const r of comboComponentesEleccionRes.data ?? []) {
    const arr = componentesEleccionByCombo.get(r.combo_id) ?? []
    arr.push({
      id: r.id,
      rubroId: r.rubro_id,
      cantidad: Number(r.cantidad),
    })
    componentesEleccionByCombo.set(r.combo_id, arr)
  }

  const combos: Combo[] = (combosRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? '',
    precioVenta: Number(r.precio_venta),
    disponible: r.disponible,
    imagenes: r.imagenes ?? [],
    descuentoPorcentaje: Number(r.descuento_porcentaje ?? 0),
    etiqueta: r.etiqueta ?? undefined,
    puntoVentaId: r.punto_venta_id ?? undefined,
    componentesFijos: componentesFijosByCombo.get(r.id) ?? [],
    componentesEleccion: componentesEleccionByCombo.get(r.id) ?? [],
    createdAt: (r.created_at ?? '').slice(0, 10),
  }))

  const formulaLineasByFormula = new Map<string, LineaFormula[]>()
  for (const r of formulaLineasRes.data ?? []) {
    const arr = formulaLineasByFormula.get(r.formula_id) ?? []
    arr.push({
      id: r.id,
      tipo: r.tipo,
      insumoId: r.insumo_id ?? undefined,
      descripcion: r.descripcion,
      cantidad: Number(r.cantidad),
      unidad: r.unidad,
      costoUnitario: Number(r.costo_unitario),
      origenModulo: r.origen_modulo ?? undefined,
      origenId: r.origen_id ?? undefined,
    })
    formulaLineasByFormula.set(r.formula_id, arr)
  }

  const formulas: Formula[] = (formulasRes.data ?? []).map((r: any) => ({
    id: r.id,
    productoId: r.producto_id,
    cantidadProducida: Number(r.cantidad_producida),
    unidadProducida: r.unidad_producida,
    lineas: formulaLineasByFormula.get(r.id) ?? [],
    notas: r.notas ?? '',
    createdAt: (r.created_at ?? '').slice(0, 10),
    mermaPorcentaje: Number(r.merma_porcentaje ?? 0),
  }))

  const producciones: Produccion[] = (produccionesRes.data ?? []).map((r: any) => ({
    id: r.id,
    formulaId: r.formula_id,
    productoId: r.producto_id,
    factor: Number(r.factor),
    cantidadTeorica: Number(r.cantidad_teorica),
    cantidadRealProducida: Number(r.cantidad_real_producida),
    fecha: r.fecha,
    notas: r.notas ?? undefined,
    createdAt: (r.created_at ?? '').slice(0, 10),
  }))

  const movimientos: MovimientoStock[] = (movimientosRes.data ?? []).map((r: any) => ({
    id: r.id,
    tipo: r.tipo,
    itemTipo: r.item_tipo,
    itemId: r.item_id,
    varianteId: r.variante_id ?? undefined,
    cantidad: Number(r.cantidad),
    motivo: r.motivo ?? undefined,
    nota: r.nota ?? undefined,
    costoUnitario: r.costo_unitario != null ? Number(r.costo_unitario) : undefined,
    fecha: r.fecha,
    origen: r.origen ?? undefined,
    origenId: r.origen_id ?? undefined,
    fechaVencimiento: r.fecha_vencimiento ?? undefined,
  }))

  const recepcionLineasByRecepcion = new Map<string, LineaRecepcion[]>()
  for (const r of recepcionLineasRes.data ?? []) {
    const arr = recepcionLineasByRecepcion.get(r.recepcion_id) ?? []
    arr.push({
      id: r.id,
      itemTipo: r.item_tipo,
      itemId: r.item_id,
      varianteId: r.variante_id ?? undefined,
      cantidad: Number(r.cantidad),
      costoUnitario: Number(r.costo_unitario),
      fechaVencimiento: r.fecha_vencimiento ?? undefined,
    })
    recepcionLineasByRecepcion.set(r.recepcion_id, arr)
  }

  const recepciones: Recepcion[] = (recepcionesRes.data ?? []).map((r: any) => ({
    id: r.id,
    fecha: r.fecha,
    proveedor: r.proveedor ?? '',
    numeroRemito: r.numero_remito ?? '',
    estado: r.estado,
    lineas: recepcionLineasByRecepcion.get(r.id) ?? [],
    notas: r.notas ?? '',
    createdAt: (r.created_at ?? '').slice(0, 10),
  }))

  const transferenciaLineasByTransferencia = new Map<string, Transferencia['lineas']>()
  for (const r of transferenciaLineasRes.data ?? []) {
    const arr = transferenciaLineasByTransferencia.get(r.transferencia_id) ?? []
    arr.push({
      id: r.id,
      itemTipo: r.item_tipo,
      itemId: r.item_id,
      varianteId: r.variante_id ?? undefined,
      cantidad: Number(r.cantidad),
    })
    transferenciaLineasByTransferencia.set(r.transferencia_id, arr)
  }

  // Fase 27e-1: filas viejas (previas a esta fase, si existieran) pueden no
  // tener origen_punto_venta_id/destino_punto_venta_id cargados -- se
  // descartan acá (nunca movieron stock de verdad, ya que "Nueva
  // transferencia" estaba deshabilitado antes de esta fase).
  const transferencias: Transferencia[] = (transferenciasRes.data ?? [])
    .filter((r: any) => r.origen_punto_venta_id && r.destino_punto_venta_id)
    .map((r: any) => ({
      id: r.id,
      fecha: r.fecha,
      origenPuntoVentaId: r.origen_punto_venta_id,
      destinoPuntoVentaId: r.destino_punto_venta_id,
      estado: (r.estado ?? 'confirmada') as EstadoTransferencia,
      lineas: transferenciaLineasByTransferencia.get(r.id) ?? [],
      notas: r.notas ?? '',
      createdAt: (r.created_at ?? '').slice(0, 10),
    }))

  const reglasControl: ReglaControl[] = (reglasControlRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    rubroId: r.rubro_id ?? undefined,
    frecuenciaDias: r.frecuencia_dias,
    createdAt: (r.created_at ?? '').slice(0, 10),
  }))

  const registrosControl: RegistroControl[] = (registrosControlRes.data ?? []).map((r: any) => ({
    id: r.id,
    reglaId: r.regla_id,
    itemTipo: r.item_tipo,
    itemId: r.item_id,
    stockSistema: Number(r.stock_sistema),
    stockContado: Number(r.stock_contado),
    diferencia: Number(r.diferencia),
    fecha: r.fecha,
  }))

  return {
    productos,
    insumos,
    rubros,
    subRubros,
    marcas,
    listasPrecio,
    productosPrecios,
    plantillasGarantia,
    combos,
    formulas,
    producciones,
    movimientos,
    recepciones,
    transferencias,
    reglasControl,
    registrosControl,
  }
}

// ─── Context ───────────────────────────────────────────────────────────────────

interface ContextValue {
  state: ProductosStockState
  dispatch: React.Dispatch<Action>
}

const Ctx = createContext<ContextValue | null>(null)

// ─── Provider ──────────────────────────────────────────────────────────────────

export function ProductosStockProvider({ children }: { children: ReactNode }) {
  const { cliente } = useClienteActual()
  const [state, rawDispatch] = useReducer(reducer, seedState)

  useEffect(() => {
    let activo = true
    if (!cliente?.id) return
    fetchProductosStockState().then((data) => {
      if (activo) rawDispatch({ type: 'SET_STATE', payload: data })
    })
    return () => {
      activo = false
    }
  }, [cliente?.id])

  const dispatch = useMemo<React.Dispatch<Action>>(() => {
    return (action: Action) => {
      const prevState = state
      const nextState = reducer(prevState, action)
      rawDispatch(action)
      if (cliente?.id && action.type !== 'RESET') {
        syncToSupabase(action, prevState, nextState, cliente.id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cliente?.id])

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// ─── Hook base ─────────────────────────────────────────────────────────────────

export function useProductosStock() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProductosStock debe usarse dentro de ProductosStockProvider')
  return ctx
}

// ─── Hooks derivados (idénticos a la versión anterior) ────────────────────────

export function useProductosPorRubro(rubroId?: string) {
  const { state } = useProductosStock()
  return useMemo(
    () =>
      rubroId
        ? state.productos.filter((p) => p.rubroId === rubroId)
        : state.productos,
    [state.productos, rubroId],
  )
}

export function useInsumosPorRubro(rubroId?: string) {
  const { state } = useProductosStock()
  return useMemo(
    () =>
      rubroId
        ? state.insumos.filter((i) => i.rubroId === rubroId)
        : state.insumos,
    [state.insumos, rubroId],
  )
}

export function useMarcas() {
  const { state } = useProductosStock()
  return state.marcas
}

export function useListasPrecio() {
  const { state } = useProductosStock()
  return state.listasPrecio
}

/** Precio final de un producto para una lista de precio: usa el override
 * manual si existe (ProductoPrecio), si no lo calcula como
 * costo * (1 + %recargo / 100). No reemplaza producto.precioVenta -- ver
 * comentario de Fase 3 al inicio del archivo. */
export function calcularPrecioLista(
  producto: Producto,
  lista: ListaPrecio,
  productosPrecios: ProductoPrecio[],
): number {
  const override = productosPrecios.find(
    (pp) => pp.productoId === producto.id && pp.listaId === lista.id,
  )
  if (override) return override.precio
  return producto.costo * (1 + lista.porcentajeRecargo / 100)
}

export function usePlantillasGarantia() {
  const { state } = useProductosStock()
  return state.plantillasGarantia
}

/** Resuelve la plantilla de garantía efectiva de un producto: la propia si
 * tiene una asignada (override puntual), si no la del rubro (default), si
 * no ninguna (undefined -- el producto no tiene garantía). Lo va a usar
 * Ventas en la Fase 6 para activar la garantía al emitir la factura. */
export function resolverPlantillaGarantia(
  producto: Producto,
  rubros: Rubro[],
  plantillas: PlantillaGarantia[],
): PlantillaGarantia | undefined {
  const idEfectivo =
    producto.plantillaGarantiaId ??
    rubros.find((r) => r.id === producto.rubroId)?.plantillaGarantiaId
  if (!idEfectivo) return undefined
  return plantillas.find((pg) => pg.id === idEfectivo)
}

export function useCombos() {
  const { state } = useProductosStock()
  return state.combos
}

export function useSubRubrosDeRubro(rubroId?: string) {
  const { state } = useProductosStock()
  return useMemo(
    () => (rubroId ? state.subRubros.filter((sr) => sr.rubroId === rubroId) : []),
    [state.subRubros, rubroId],
  )
}

export function useStockBajo() {
  const { state } = useProductosStock()
  return useMemo(() => {
    const productos = state.productos.filter(
      (p) => p.controlaStock && p.stock <= p.stockMinimo,
    )
    const insumos = state.insumos.filter((i) => i.stock <= i.stockMinimo)
    return { productos, insumos }
  }, [state.productos, state.insumos])
}

export function useValorInventario() {
  const { state } = useProductosStock()
  return useMemo(() => {
    const productosVal = state.productos.reduce(
      (sum, p) => sum + p.stock * p.costo,
      0,
    )
    const insumosVal = state.insumos.reduce(
      (sum, i) => sum + i.stock * i.costo,
      0,
    )
    return {
      productos: productosVal,
      insumos: insumosVal,
      total: productosVal + insumosVal,
    }
  }, [state.productos, state.insumos])
}

export function useFormulaCosto(formulaId: string) {
  const { state } = useProductosStock()
  return useMemo(() => {
    const formula = state.formulas.find((f) => f.id === formulaId)
    if (!formula) return 0
    return formula.lineas.reduce(
      (sum, l) => sum + l.cantidad * l.costoUnitario,
      0,
    )
  }, [state.formulas, formulaId])
}

export function useCostoFormulado(productoId: string) {
  const { state } = useProductosStock()
  return useMemo(() => {
    const formula = state.formulas.find((f) => f.productoId === productoId)
    if (!formula) return null

    let insumos = 0
    let manoDeObra = 0
    let costosOperativos = 0

    for (const linea of formula.lineas) {
      const subtotal = linea.cantidad * linea.costoUnitario
      switch (linea.tipo) {
        case 'insumo':
          insumos += subtotal
          break
        case 'mano_de_obra':
          manoDeObra += subtotal
          break
        case 'costo_operativo':
          costosOperativos += subtotal
          break
      }
    }

    const total = insumos + manoDeObra + costosOperativos
    const costoUnitario =
      formula.cantidadProducida > 0 ? total / formula.cantidadProducida : total

    return { insumos, manoDeObra, costosOperativos, total, costoUnitario }
  }, [state.formulas, productoId])
}
