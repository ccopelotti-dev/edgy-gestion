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
  useRef,
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
  UnidadMedida,
  MotivoAjuste,
} from '../types'
import { convertirCantidad, unidadLabel, calcularCantidadesAMedida, type PanoParaCalculo } from '../types'
import { seedState } from './seed'
import { supabase } from '@/lib/supabase'
import { resolverPuntoVentaId, ajustarStockPuntoVenta, ajustarStockPlano } from '@/lib/puntoVenta'
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
  // Fase de estabilidad (17/08): a diferencia del resto de las acciones
  // (optimistas -- tocan el estado local YA y escriben a Supabase en
  // segundo plano sin esperar confirmación), estas dos se usan SOLO desde
  // las funciones exportadas crearProductoConfirmado/guardarFormulaConfirmada
  // más abajo, después de que Supabase ya confirmó que la escritura salió
  // bien. Por eso su caso en syncToSupabase es un no-op (return sin hacer
  // nada) -- no hay que volver a escribir algo que ya se escribió. Ver el
  // comentario grande antes de esas funciones para el motivo completo.
  | { type: 'CONFIRM_PRODUCTO'; payload: Producto }
  | { type: 'CONFIRM_FORMULA'; payload: Formula }
  // Fase siguiente (18/08): mismo criterio, ahora para Insumos -- ver
  // crearInsumoConfirmado/actualizarInsumoConfirmado/eliminarInsumoConfirmado.
  | { type: 'CONFIRM_INSUMO'; payload: Insumo }
  | { type: 'CONFIRM_DELETE_INSUMO'; payload: string }
  // Fase siguiente (Stock y Producción, 17/08 en adelante): un único action
  // "genérico" para todo lo que toca stock -- AJUSTAR_STOCK, RECIBIR_STOCK,
  // REGISTRAR_PRODUCCION, ADD_RECEPCION, CONFIRMAR_RECEPCION,
  // CANCELAR_RECEPCION y el ajuste que dispara Control de Stock -- en vez de
  // un CONFIRM_* por acción. Todas comparten la misma forma real: "acá está
  // el estado post-escritura, YA confirmado por Supabase, mergealo". Las
  // funciones ajustarStockConfirmado/recibirStockConfirmado/
  // registrarProduccionConfirmada/crearRecepcionConfirmada/
  // confirmarRecepcionConfirmada/cancelarRecepcionConfirmada/
  // registrarControlConfirmado (más abajo) arman el payload después de
  // escribir y confirmar en Supabase -- ver el comentario grande junto a
  // ResultadoGuardado.
  | {
      type: 'CONFIRM_STOCK_SYNC'
      payload: {
        productos?: Producto[]
        insumos?: Insumo[]
        movimientos?: MovimientoStock[]
        produccion?: Produccion
        recepcion?: Recepcion
        registroControl?: RegistroControl
      }
    }
  // Cierre de la fase (17/08, último sector de menor volumen): mismo
  // criterio confirmado, ahora para Rubros/SubRubros, Marcas, Listas de
  // precio (+ el precio por producto/lista) y Combos.
  | { type: 'CONFIRM_RUBRO'; payload: Rubro }
  | { type: 'CONFIRM_DELETE_RUBRO'; payload: string }
  | { type: 'CONFIRM_SUBRUBRO'; payload: SubRubro }
  | { type: 'CONFIRM_DELETE_SUBRUBRO'; payload: string }
  | { type: 'CONFIRM_MARCA'; payload: Marca }
  | { type: 'CONFIRM_LISTA_PRECIO'; payload: ListaPrecio }
  | { type: 'CONFIRM_DELETE_LISTA_PRECIO'; payload: string }
  | {
      type: 'CONFIRM_PRECIO_PRODUCTO'
      payload: { productoId: string; listaId: string; precio: number | null; id?: string }
    }
  | { type: 'CONFIRM_COMBO'; payload: Combo }
  | { type: 'CONFIRM_DELETE_COMBO'; payload: string }

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

    // ── Escrituras confirmadas (17/08) ──────────────────────────────────────────
    // Ver comentario junto al tipo Action y junto a
    // crearProductoConfirmado/guardarFormulaConfirmada más abajo. Estos dos
    // casos solo reflejan en el estado local algo que Supabase YA confirmó
    // -- por eso "upsert" (si el id no está, lo agrega; si está, lo
    // reemplaza) en vez de asumir que siempre es una fila nueva.
    case 'CONFIRM_PRODUCTO': {
      const p = action.payload
      const existe = state.productos.some((x) => x.id === p.id)
      return {
        ...state,
        productos: existe
          ? state.productos.map((x) => (x.id === p.id ? p : x))
          : [...state.productos, p],
        insumos: sincronizarInsumoDeProducto(p, state.insumos),
      }
    }
    case 'CONFIRM_FORMULA': {
      const f = action.payload
      const existe = state.formulas.some((x) => x.id === f.id)
      return {
        ...state,
        formulas: existe
          ? state.formulas.map((x) => (x.id === f.id ? f : x))
          : [...state.formulas, f],
      }
    }
    case 'CONFIRM_INSUMO': {
      const i = action.payload
      const existe = state.insumos.some((x) => x.id === i.id)
      return {
        ...state,
        insumos: existe
          ? state.insumos.map((x) => (x.id === i.id ? i : x))
          : [...state.insumos, i],
      }
    }
    case 'CONFIRM_DELETE_INSUMO':
      return {
        ...state,
        insumos: state.insumos.filter((i) => i.id !== action.payload),
      }

    case 'CONFIRM_STOCK_SYNC': {
      const { productos, insumos, movimientos, produccion, recepcion, registroControl } =
        action.payload
      return {
        ...state,
        productos:
          productos && productos.length
            ? state.productos.map((p) => productos.find((np) => np.id === p.id) ?? p)
            : state.productos,
        insumos:
          insumos && insumos.length
            ? state.insumos.map((i) => insumos.find((ni) => ni.id === i.id) ?? i)
            : state.insumos,
        movimientos:
          movimientos && movimientos.length ? [...state.movimientos, ...movimientos] : state.movimientos,
        producciones: produccion ? [...state.producciones, produccion] : state.producciones,
        recepciones: recepcion
          ? state.recepciones.some((r) => r.id === recepcion.id)
            ? state.recepciones.map((r) => (r.id === recepcion.id ? recepcion : r))
            : [...state.recepciones, recepcion]
          : state.recepciones,
        registrosControl: registroControl
          ? [...state.registrosControl, registroControl]
          : state.registrosControl,
      }
    }

    case 'CONFIRM_RUBRO': {
      const existe = state.rubros.some((r) => r.id === action.payload.id)
      return {
        ...state,
        rubros: existe
          ? state.rubros.map((r) => (r.id === action.payload.id ? action.payload : r))
          : [...state.rubros, action.payload],
      }
    }
    case 'CONFIRM_DELETE_RUBRO':
      return {
        ...state,
        rubros: state.rubros.filter((r) => r.id !== action.payload),
        subRubros: state.subRubros.filter((sr) => sr.rubroId !== action.payload),
      }
    case 'CONFIRM_SUBRUBRO': {
      const existe = state.subRubros.some((sr) => sr.id === action.payload.id)
      return {
        ...state,
        subRubros: existe
          ? state.subRubros.map((sr) => (sr.id === action.payload.id ? action.payload : sr))
          : [...state.subRubros, action.payload],
      }
    }
    case 'CONFIRM_DELETE_SUBRUBRO':
      return {
        ...state,
        subRubros: state.subRubros.filter((sr) => sr.id !== action.payload),
      }
    case 'CONFIRM_MARCA': {
      const existe = state.marcas.some((m) => m.id === action.payload.id)
      return {
        ...state,
        marcas: existe
          ? state.marcas.map((m) => (m.id === action.payload.id ? action.payload : m))
          : [...state.marcas, action.payload],
      }
    }
    case 'CONFIRM_LISTA_PRECIO': {
      const existe = state.listasPrecio.some((l) => l.id === action.payload.id)
      return {
        ...state,
        listasPrecio: existe
          ? state.listasPrecio.map((l) => (l.id === action.payload.id ? action.payload : l))
          : [...state.listasPrecio, action.payload],
      }
    }
    case 'CONFIRM_DELETE_LISTA_PRECIO':
      return {
        ...state,
        listasPrecio: state.listasPrecio.filter((l) => l.id !== action.payload),
        productosPrecios: state.productosPrecios.filter((pp) => pp.listaId !== action.payload),
      }
    case 'CONFIRM_PRECIO_PRODUCTO': {
      const { productoId, listaId, precio, id } = action.payload
      if (precio === null) {
        return {
          ...state,
          productosPrecios: state.productosPrecios.filter(
            (pp) => !(pp.productoId === productoId && pp.listaId === listaId),
          ),
        }
      }
      const existente = state.productosPrecios.find(
        (pp) => pp.productoId === productoId && pp.listaId === listaId,
      )
      if (existente) {
        return {
          ...state,
          productosPrecios: state.productosPrecios.map((pp) =>
            pp.id === existente.id ? { ...pp, precio } : pp,
          ),
        }
      }
      return {
        ...state,
        productosPrecios: [...state.productosPrecios, { id: id ?? uid(), productoId, listaId, precio }],
      }
    }
    case 'CONFIRM_COMBO': {
      const existe = state.combos.some((c) => c.id === action.payload.id)
      return {
        ...state,
        combos: existe
          ? state.combos.map((c) => (c.id === action.payload.id ? action.payload : c))
          : [...state.combos, action.payload],
      }
    }
    case 'CONFIRM_DELETE_COMBO':
      return {
        ...state,
        combos: state.combos.filter((c) => c.id !== action.payload),
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
    // Fase 41: ver comentario en types/index.ts (Producto.modalidadStock).
    modalidad_stock: p.modalidadStock ?? 'deposito',
    // Fase 41.7: ver comentario en types/index.ts (Producto.anchoRollo).
    ancho_rollo: p.anchoRollo ?? null,
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
    ancho_rollo: i.anchoRollo ?? null,
    proveedor_id: i.proveedorId || null,
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
              anchoRollo: producto.anchoRollo,
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
      anchoRollo: producto.anchoRollo,
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
            anchoRollo: producto.anchoRollo,
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
    aplicar_merma_costo: f.aplicarMermaCosto,
    unidad_secundaria: f.unidadSecundaria || null,
    equivalencia_secundaria: f.equivalenciaSecundaria || null,
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
    // Fase 41: ver comentario en types/index.ts (LineaFormula.fuenteDimension).
    fuente_dimension: l.fuenteDimension || null,
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
    // Fase 41: ver comentario en types/index.ts (Produccion.fichaItemId).
    ficha_item_id: p.fichaItemId || null,
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

    // No-op a propósito: CONFIRM_PRODUCTO/CONFIRM_FORMULA se disparan
    // DESPUÉS de que crearProductoConfirmado/guardarFormulaConfirmada ya
    // escribieron y confirmaron en Supabase -- volver a escribir acá
    // sería redundante (en el mejor caso) o pisaría datos con una versión
    // vieja del payload (en el peor). Solo actualizan el estado local.
    case 'CONFIRM_PRODUCTO':
      persistirInsumosVinculados(prevState, nextState, clienteId)
      return
    case 'CONFIRM_FORMULA':
      return
    case 'CONFIRM_INSUMO':
    case 'CONFIRM_DELETE_INSUMO':
      return
    case 'CONFIRM_STOCK_SYNC':
    case 'CONFIRM_RUBRO':
    case 'CONFIRM_DELETE_RUBRO':
    case 'CONFIRM_SUBRUBRO':
    case 'CONFIRM_DELETE_SUBRUBRO':
    case 'CONFIRM_MARCA':
    case 'CONFIRM_LISTA_PRECIO':
    case 'CONFIRM_DELETE_LISTA_PRECIO':
    case 'CONFIRM_PRECIO_PRODUCTO':
    case 'CONFIRM_COMBO':
    case 'CONFIRM_DELETE_COMBO':
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
    modalidadStock: (r.modalidad_stock as Producto['modalidadStock']) ?? 'deposito',
    anchoRollo: r.ancho_rollo != null ? Number(r.ancho_rollo) : undefined,
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
    anchoRollo: r.ancho_rollo != null ? Number(r.ancho_rollo) : undefined,
    proveedorId: r.proveedor_id ?? undefined,
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
      fuenteDimension: (r.fuente_dimension as LineaFormula['fuenteDimension']) ?? undefined,
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
    aplicarMermaCosto: Boolean(r.aplicar_merma_costo ?? false),
    unidadSecundaria: r.unidad_secundaria ?? null,
    equivalenciaSecundaria: r.equivalencia_secundaria === null || r.equivalencia_secundaria === undefined
      ? null
      : Number(r.equivalencia_secundaria),
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
    fichaItemId: r.ficha_item_id ?? undefined,
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

// ─── Escrituras confirmadas ─────────────────────────────────────────────────
// Todo el resto de este store usa el patrón optimista: dispatch() actualiza
// el estado local YA y dispara el INSERT/UPDATE a Supabase en segundo plano
// sin esperar la respuesta (ver syncToSupabase) -- si esa escritura falla,
// el error queda solo en la consola del navegador y el estado local nunca
// se corrige, así que la pantalla sigue mostrando algo que en realidad
// nunca se guardó. Confirmado con logs reales de Supabase (17/08): así
// desaparecieron dos productos de prueba de Carlos, y así una Fórmula
// completa (con costo y precio ya calculados) se perdió en silencio.
//
// Estas funciones se usan en los puntos que ya se migraron a este patrón:
// Producto y Fórmula (17/08, donde se originó el problema) e Insumos
// (18/08, fase siguiente -- ver comentario junto a crearInsumoConfirmado
// más abajo). Escriben a Supabase primero, ESPERAN la respuesta, y
// devuelven { ok:false, error } si algo falla -- recién si { ok:true }, el
// componente que llama refleja el cambio en el estado local (con acciones
// CONFIRM_* que no vuelven a escribir nada, ver el reducer y
// syncToSupabase más arriba).
//
// Esto NO es una reescritura del store entero -- el resto de las +40
// acciones que quedan (Rubros, Combos, Recepción, Ajustes de stock,
// Producción, etc.) sigue siendo optimista. Se va extendiendo pantalla por
// pantalla, en orden de riesgo real, no de una sola vez.

export type ResultadoGuardado<T> = { ok: true; data: T } | { ok: false; error: string }

export async function crearProductoConfirmado(
  data: Omit<Producto, 'id' | 'createdAt'>,
  clienteId: string,
): Promise<ResultadoGuardado<Producto>> {
  const nuevo: Producto = { ...data, id: uid(), createdAt: todayISO() }
  const { error } = await supabase.from('productos').insert(productoToRow(nuevo, clienteId))
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: nuevo }
}

export async function actualizarProductoConfirmado(
  p: Producto,
  clienteId: string,
): Promise<ResultadoGuardado<Producto>> {
  const { data, error } = await supabase
    .from('productos')
    .update(productoToRow(p, clienteId))
    .eq('id', p.id)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        'No se encontró este producto en la base -- puede que nunca se haya guardado. Probá crearlo de nuevo.',
    }
  }
  return { ok: true, data: p }
}

// Insumos (Fase siguiente, 18/08 -- mismo criterio que Producto/Fórmula
// arriba, ahora extendido a Insumos porque es el segundo punto de mayor
// riesgo: 899 insumos, la mayoría cargados por SQL directo, y son
// justo lo que alimenta las Fórmulas.
//
// El borrado de insumo tenía el mismo problema de fondo pero al revés:
// `insumo_id` tiene FK "NO ACTION" desde formula_lineas, comprobante_compra_items,
// cotizacion_compra_items y orden_compra_items -- si el insumo está en uso
// en cualquiera de esas, el DELETE en Supabase rechaza con 23503 (foreign
// key violation). El dispatch optimista viejo (DELETE_INSUMO) ya sacaba el
// insumo de la lista ANTES de intentar el borrado real, así que un rechazo
// se veía en pantalla como "borrado con éxito" cuando en realidad seguía
// completo en la base -- un "borrado fantasma", el espejo del "guardado
// fantasma" que ya resolvimos. eliminarInsumoConfirmado espera la
// confirmación real y traduce el 23503 a un mensaje que tiene sentido.
export async function crearInsumoConfirmado(
  data: Omit<Insumo, 'id' | 'createdAt'>,
  clienteId: string,
): Promise<ResultadoGuardado<Insumo>> {
  const nuevo: Insumo = { ...data, id: uid(), createdAt: todayISO() }
  const { error } = await supabase.from('insumos').insert(insumoToRow(nuevo, clienteId))
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: nuevo }
}

export async function actualizarInsumoConfirmado(
  i: Insumo,
  clienteId: string,
): Promise<ResultadoGuardado<Insumo>> {
  const { data, error } = await supabase
    .from('insumos')
    .update(insumoToRow(i, clienteId))
    .eq('id', i.id)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        'No se encontró este insumo en la base -- puede que nunca se haya guardado. Probá crearlo de nuevo.',
    }
  }
  return { ok: true, data: i }
}

export async function eliminarInsumoConfirmado(id: string): Promise<ResultadoGuardado<null>> {
  const { error } = await supabase.from('insumos').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') {
      return {
        ok: false,
        error:
          'Este insumo está en uso (en una fórmula, un comprobante o una orden de compra) y no se puede eliminar. Si ya no lo necesitás, quitalo primero de donde se usa.',
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, data: null }
}

export async function guardarFormulaConfirmada(
  args: {
    /** Si viene, se hace UPDATE de esa fórmula existente; si no, se crea una nueva. */
    id?: string
    productoId: string
    cantidadProducida: number
    unidadProducida: UnidadMedida
    lineas: LineaFormula[]
    notas: string
    mermaPorcentaje: number
    aplicarMermaCosto: boolean
    unidadSecundaria?: UnidadMedida | null
    equivalenciaSecundaria?: number | null
    /** Solo relevante al actualizar -- se preserva la fecha de creación original. */
    createdAt?: string
  },
  clienteId: string,
): Promise<ResultadoGuardado<Formula>> {
  const esNueva = !args.id
  const formula: Formula = {
    id: args.id ?? uid(),
    productoId: args.productoId,
    cantidadProducida: args.cantidadProducida,
    unidadProducida: args.unidadProducida,
    lineas: args.lineas,
    notas: args.notas,
    mermaPorcentaje: args.mermaPorcentaje,
    aplicarMermaCosto: args.aplicarMermaCosto,
    unidadSecundaria: args.unidadSecundaria ?? null,
    equivalenciaSecundaria: args.equivalenciaSecundaria ?? null,
    createdAt: args.createdAt ?? todayISO(),
  }

  if (esNueva) {
    const { error } = await supabase.from('formulas').insert(formulaToRow(formula, clienteId))
    if (error) return { ok: false, error: error.message }
  } else {
    const { data, error } = await supabase
      .from('formulas')
      .update(formulaToRow(formula, clienteId))
      .eq('id', formula.id)
      .select('id')
    if (error) return { ok: false, error: error.message }
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: 'No se encontró esta fórmula en la base -- puede que nunca se haya guardado.',
      }
    }
    const { error: delErr } = await supabase.from('formula_lineas').delete().eq('formula_id', formula.id)
    if (delErr) return { ok: false, error: delErr.message }
  }

  if (formula.lineas.length) {
    const { error: lineasErr } = await supabase
      .from('formula_lineas')
      .insert(formula.lineas.map((l) => formulaLineaToRow(l, formula.id)))
    if (lineasErr) return { ok: false, error: lineasErr.message }
  }

  return { ok: true, data: formula }
}

// ─── Stock y Producción (rediseño, fase siguiente a #410/#411) ─────────────
// Mismo criterio confirmado de arriba, ahora para AJUSTAR_STOCK/RECIBIR_
// STOCK/REGISTRAR_PRODUCCION/Recepción/Control de stock -- el grupo que
// quedaba con más riesgo real: son escrituras encadenadas (stock + costo +
// movimiento de Kardex, a veces sobre varias líneas), y para clientes de un
// solo local el ajuste de stock viejo era un read-modify-write NO atómico
// en el cliente (leer stock actual, sumar en JS, mandar el valor absoluto)
// -- dos ajustes casi simultáneos podían pisarse. `aplicarAjusteAtomico`
// reemplaza eso por un delta atómico en la base (RPC `ajustar_stock_plano`
// para un solo local, `ajustar_stock_punto_venta` para multi-sucursal,
// mismo patrón que ya usaba Fase 27e-2) y encadena costo + espejo sobre el
// insumo vinculado, todo esperado y confirmado antes de tocar el estado
// local. Igual que con Insumos: si algo a mitad de camino falla, el error
// vuelve tal cual al componente que llamó, con el mensaje más específico
// posible sobre qué SÍ se llegó a guardar (no hay "todo o nada" real acá
// porque no es una única transacción de base -- pero tampoco hay más
// fallos silenciosos: cada paso se espera y cualquier error se reporta).

async function fetchProductosPorId(ids: string[]): Promise<Producto[]> {
  const uniqueIds = Array.from(new Set(ids))
  if (!uniqueIds.length) return []
  const [productosRes, variantesRes] = await Promise.all([
    supabase.from('productos').select('*').in('id', uniqueIds),
    supabase.from('producto_variantes').select('*').in('producto_id', uniqueIds).order('orden'),
  ])
  const variantesByProducto = new Map<string, ProductoVariante[]>()
  for (const r of variantesRes.data ?? []) {
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
  return (productosRes.data ?? []).map((r: any) => ({
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
    modalidadStock: (r.modalidad_stock as Producto['modalidadStock']) ?? 'deposito',
    anchoRollo: r.ancho_rollo != null ? Number(r.ancho_rollo) : undefined,
    createdAt: (r.created_at ?? '').slice(0, 10),
  }))
}

async function fetchInsumosPorId(ids: string[]): Promise<Insumo[]> {
  const uniqueIds = Array.from(new Set(ids))
  if (!uniqueIds.length) return []
  const { data } = await supabase.from('insumos').select('*').in('id', uniqueIds)
  return (data ?? []).map((r: any) => ({
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
    anchoRollo: r.ancho_rollo != null ? Number(r.ancho_rollo) : undefined,
    proveedorId: r.proveedor_id ?? undefined,
    createdAt: (r.created_at ?? '').slice(0, 10),
  }))
}

type ResultadoAjusteAtomico = ResultadoGuardado<{
  itemTipoEfectivo: 'producto' | 'insumo'
  itemIdEfectivo: string
  puntoVentaId: string | null
  /** Insumos vinculados que se espejaron como consecuencia (0 o 1, casi
   * siempre -- ver comentario en espejarInsumoVinculado). */
  insumosVinculadosIds: string[]
}>

/** Aplica UN delta de stock (+costo opcional) de forma atómica, con la
 * misma redirección "insumo vinculado -> producto" y el mismo espejo de
 * vuelta que ya usaba el reducer optimista -- pero acá cada paso se espera
 * y se confirma contra Supabase antes de seguir. No inserta el movimiento
 * de Kardex (eso lo arma cada función de arriba, porque a veces conviene
 * insertar varios movimientos juntos en una sola llamada). */
async function aplicarAjusteAtomico(params: {
  itemTipo: 'producto' | 'insumo'
  itemId: string
  varianteId?: string
  delta: number
  costoUnitario?: number
  clienteId: string
}): Promise<ResultadoAjusteAtomico> {
  const { itemTipo, itemId, varianteId, delta, costoUnitario, clienteId } = params

  let itemTipoEfectivo: 'producto' | 'insumo' = itemTipo
  let itemIdEfectivo = itemId

  if (itemTipo === 'insumo') {
    const { data: insumoRow, error: errBuscar } = await supabase
      .from('insumos')
      .select('id, producto_vinculado_id')
      .eq('id', itemId)
      .maybeSingle()
    if (errBuscar) return { ok: false, error: `No se pudo verificar el insumo: ${errBuscar.message}` }
    if (!insumoRow) return { ok: false, error: 'El insumo no existe o fue eliminado -- recargá la página.' }
    if (insumoRow.producto_vinculado_id) {
      itemTipoEfectivo = 'producto'
      itemIdEfectivo = insumoRow.producto_vinculado_id
    }
  }

  const puntoVentaId = await resolverPuntoVentaId(clienteId)

  if (delta !== 0) {
    const { error: errAjuste } = puntoVentaId
      ? await ajustarStockPuntoVenta({
          clienteId,
          puntoVentaId,
          itemTipo: itemTipoEfectivo,
          itemId: itemIdEfectivo,
          varianteId,
          delta,
        })
      : await ajustarStockPlano({
          itemTipo: itemTipoEfectivo,
          itemId: itemIdEfectivo,
          varianteId,
          delta,
        })
    if (errAjuste) return { ok: false, error: `No se pudo actualizar el stock: ${errAjuste.message}` }
  }

  if (costoUnitario != null && costoUnitario > 0) {
    const tabla = itemTipoEfectivo === 'producto' ? 'productos' : 'insumos'
    const { data: filaCosto, error: errCosto } = await supabase
      .from(tabla)
      .update({ costo: costoUnitario })
      .eq('id', itemIdEfectivo)
      .select('id')
    if (errCosto) {
      return { ok: false, error: `El stock se actualizó, pero no se pudo guardar el costo: ${errCosto.message}` }
    }
    if (!filaCosto || filaCosto.length === 0) {
      return { ok: false, error: 'El stock se actualizó, pero no se encontró el ítem para guardar el costo.' }
    }
  }

  let insumosVinculadosIds: string[] = []
  if (itemTipoEfectivo === 'producto') {
    const { data: productoRow, error: errProd } = await supabase
      .from('productos')
      .select('stock, costo')
      .eq('id', itemIdEfectivo)
      .maybeSingle()
    if (errProd) {
      return {
        ok: false,
        error: `El stock se actualizó, pero no se pudo leer el producto para espejar el insumo vinculado: ${errProd.message}`,
      }
    }
    if (productoRow) {
      const { data: espejados, error: errEspejo } = await supabase
        .from('insumos')
        .update({ stock: productoRow.stock, costo: productoRow.costo })
        .eq('producto_vinculado_id', itemIdEfectivo)
        .select('id')
      if (errEspejo) {
        return {
          ok: false,
          error: `El stock se actualizó, pero no se pudo espejar sobre el insumo vinculado: ${errEspejo.message}`,
        }
      }
      insumosVinculadosIds = (espejados ?? []).map((r) => r.id as string)
    }
  }

  return { ok: true, data: { itemTipoEfectivo, itemIdEfectivo, puntoVentaId, insumosVinculadosIds } }
}

async function moverStockConfirmado(
  params: {
    itemTipo: 'producto' | 'insumo'
    itemId: string
    varianteId?: string
    cantidad: number
    tipo: 'ajuste' | 'ingreso'
    origen: 'ajuste_manual' | 'recepcion'
    motivo?: MotivoAjuste
    costoUnitario?: number
    nota?: string
  },
  clienteId: string,
): Promise<ResultadoGuardado<{ productos: Producto[]; insumos: Insumo[]; movimientos: MovimientoStock[] }>> {
  const { itemTipo, itemId, varianteId, cantidad, tipo, origen, motivo, costoUnitario, nota } = params

  const ajuste = await aplicarAjusteAtomico({
    itemTipo,
    itemId,
    varianteId,
    delta: cantidad,
    costoUnitario,
    clienteId,
  })
  if (!ajuste.ok) return ajuste

  const { itemTipoEfectivo, itemIdEfectivo, puntoVentaId, insumosVinculadosIds } = ajuste.data

  const movimiento: MovimientoStock = {
    id: uid(),
    tipo,
    itemTipo: itemTipoEfectivo,
    itemId: itemIdEfectivo,
    varianteId,
    cantidad,
    motivo,
    nota,
    costoUnitario,
    fecha: todayISO(),
    origen,
  }
  const { error: errMov } = await supabase
    .from('movimientos_stock')
    .insert({ ...movimientoToRow(movimiento, clienteId), punto_venta_id: puntoVentaId })
  if (errMov) {
    return {
      ok: false,
      error: `El stock se actualizó, pero no se pudo registrar el movimiento en el Kardex: ${errMov.message}. Revisá Movimientos -- el historial puede haber quedado incompleto.`,
    }
  }

  const productoIds = itemTipoEfectivo === 'producto' ? [itemIdEfectivo] : []
  const insumoIds = itemTipoEfectivo === 'insumo' ? [itemIdEfectivo, ...insumosVinculadosIds] : insumosVinculadosIds

  const [productos, insumos] = await Promise.all([
    fetchProductosPorId(productoIds),
    fetchInsumosPorId(insumoIds),
  ])

  return { ok: true, data: { productos, insumos, movimientos: [movimiento] } }
}

/** Reemplaza AJUSTAR_STOCK (ajuste manual, ej. conteo físico/merma/rotura). */
export async function ajustarStockConfirmado(
  params: {
    itemTipo: 'producto' | 'insumo'
    itemId: string
    varianteId?: string
    cantidad: number
    motivo: MotivoAjuste
    nota?: string
  },
  clienteId: string,
): Promise<ResultadoGuardado<{ productos: Producto[]; insumos: Insumo[]; movimientos: MovimientoStock[] }>> {
  return moverStockConfirmado({ ...params, tipo: 'ajuste', origen: 'ajuste_manual' }, clienteId)
}

/** Reemplaza RECIBIR_STOCK (ingreso de mercadería individual, con costo opcional). */
export async function recibirStockConfirmado(
  params: {
    itemTipo: 'producto' | 'insumo'
    itemId: string
    varianteId?: string
    cantidad: number
    costoUnitario?: number
    nota?: string
  },
  clienteId: string,
): Promise<ResultadoGuardado<{ productos: Producto[]; insumos: Insumo[]; movimientos: MovimientoStock[] }>> {
  return moverStockConfirmado({ ...params, tipo: 'ingreso', origen: 'recepcion' }, clienteId)
}

/** Reemplaza REGISTRAR_PRODUCCION -- ejecuta una Fórmula como un lote real:
 * descuenta cada insumo consumido (uno por uno, atómico) y suma el stock
 * del producto terminado. `formula` viene del estado local (ya cargado en
 * Produccion.tsx) porque sus líneas no cambian entre que se lee y se
 * ejecuta el lote -- evita una vuelta extra a la base solo para releerla. */
export async function registrarProduccionConfirmada(
  params: {
    formulaId: string
    factor: number
    cantidadRealProducida: number
    fecha: string
    notas?: string
    /** Fase 41: si se pasa, esta producción es "a medida" -- ata el lote a
     * un ítem puntual de Ficha de medida. Las cantidades de cada línea
     * salen de sus paños (m2/ml/unidad, ver calcularCantidadesAMedida) en
     * vez de `factor`, y el lote NO suma stock genérico del producto
     * terminado (ver Producto.modalidadStock en types/index.ts).
     *
     * `cantidadItem` (Fase 41.6, cierre de gap pedido por Carlos): el
     * campo Cantidad del ítem de la ficha -- ej. "2" si son dos cortinas
     * idénticas con estos mismos paños. Antes se ignoraba acá (solo
     * multiplicaba el precio en el Presupuesto, nunca el consumo real de
     * insumos), lo que dejaba el stock corto si se cargaba más de 1. */
    fichaItem?: { id: string; panos: PanoParaCalculo[]; cantidadItem?: number }
  },
  formula: Formula,
  clienteId: string,
): Promise<ResultadoGuardado<{
  produccion: Produccion
  productos: Producto[]
  insumos: Insumo[]
  movimientos: MovimientoStock[]
}>> {
  const { formulaId, factor, cantidadRealProducida, fecha, notas, fichaItem } = params

  const esAMedida = Boolean(fichaItem)
  let cantidadesAMedida: Map<string, number> | null = null
  if (fichaItem) {
    const calculo = calcularCantidadesAMedida(formula.lineas, fichaItem.panos)
    if (!calculo.ok) return { ok: false, error: calculo.error }
    cantidadesAMedida = calculo.cantidades
  }
  // Modo a medida: no existe "el doble de este pedido" -- el factor de
  // lote solo tiene sentido para fabricación a stock genérico.
  const factorEfectivo = esAMedida ? 1 : factor
  // Fase 41.6: multiplicador real de "cuántas veces se repite este mismo
  // paño" en modo a medida (Cantidad del ítem de la ficha). 1 en modo
  // depósito -- ahí el escalado ya lo cubre `factor`.
  const multiplicadorCantidadItem = esAMedida ? fichaItem?.cantidadItem || 1 : 1

  const loteId = uid()
  const nuevaProduccion: Produccion = {
    id: loteId,
    formulaId,
    productoId: formula.productoId,
    factor: factorEfectivo,
    cantidadTeorica: formula.cantidadProducida * factorEfectivo,
    cantidadRealProducida,
    fecha,
    notas,
    createdAt: todayISO(),
    fichaItemId: fichaItem?.id,
  }

  const { error: errProduccion } = await supabase
    .from('producciones')
    .insert(produccionToRow(nuevaProduccion, clienteId))
  if (errProduccion) {
    return { ok: false, error: `No se pudo registrar el lote de producción: ${errProduccion.message}` }
  }

  const movimientos: MovimientoStock[] = []
  const productoIdsAfectados = new Set<string>()
  const insumoIdsAfectados = new Set<string>()
  let puntoVentaId: string | null = null

  // La unidad de cada línea de fórmula es independiente de la unidad nativa
  // del insumo (ej. una receta puede cargarse "en gramos" para precisión
  // aunque el insumo se compre y stockee "por kg"). Sin convertir acá, se
  // descontaría del stock real la cantidad cruda de la línea en la unidad
  // equivocada (bug real: 800 "gramo" descontando 800 kg de stock). Se
  // traen las unidades nativas de los insumos de la fórmula en un solo
  // batch antes del loop.
  const insumoIdsFormula = formula.lineas
    .filter((l) => l.tipo === 'insumo' && l.insumoId)
    .map((l) => l.insumoId as string)
  const unidadesNativas = new Map<string, UnidadMedida>()
  // Fase 41.7: ancho de rollo por insumo -- habilita convertir metro↔m2
  // para telas (ver comentario de convertirCantidad en types/index.ts).
  const anchosRollo = new Map<string, number | undefined>()
  if (insumoIdsFormula.length > 0) {
    const { data: insumosRows, error: errInsumos } = await supabase
      .from('insumos')
      .select('id, unidad, ancho_rollo')
      .in('id', insumoIdsFormula)
    if (errInsumos) {
      return { ok: false, error: `No se pudieron verificar las unidades de los insumos: ${errInsumos.message}` }
    }
    for (const r of insumosRows ?? []) {
      unidadesNativas.set(r.id, r.unidad as UnidadMedida)
      anchosRollo.set(r.id, r.ancho_rollo != null ? Number(r.ancho_rollo) : undefined)
    }
  }

  for (const linea of formula.lineas) {
    if (linea.tipo !== 'insumo' || !linea.insumoId) continue

    // Modo a medida: la cantidad "cruda" de la línea sale de los paños del
    // pedido (m2/ml/unidad), no del número tipeado en la fórmula -- ver
    // calcularCantidadesAMedida. Modo depósito: sigue siendo el número
    // tipeado tal cual, sin cambios de comportamiento.
    const cantidadBase = cantidadesAMedida ? cantidadesAMedida.get(linea.id) ?? 0 : linea.cantidad

    const unidadNativa = unidadesNativas.get(linea.insumoId)
    const cantidadConvertida = unidadNativa
      ? convertirCantidad(cantidadBase, linea.unidad, unidadNativa, anchosRollo.get(linea.insumoId))
      : cantidadBase
    if (cantidadConvertida === null) {
      return {
        ok: false,
        error: `La línea "${linea.descripcion}" está cargada en ${unidadLabel(linea.unidad)}, una unidad incompatible con la del insumo (${unidadLabel(unidadNativa!)}). Corregí la unidad de esa línea en la fórmula antes de producir.`,
      }
    }
    const cantidadConsumida = cantidadConvertida * factorEfectivo * multiplicadorCantidadItem

    const ajuste = await aplicarAjusteAtomico({
      itemTipo: 'insumo',
      itemId: linea.insumoId,
      delta: -cantidadConsumida,
      clienteId,
    })
    if (!ajuste.ok) {
      return {
        ok: false,
        error: `El lote quedó registrado, pero falló el descuento de un insumo de la fórmula: ${ajuste.error}. Revisá el stock manualmente antes de seguir produciendo -- puede haber quedado a mitad de camino.`,
      }
    }

    const { itemTipoEfectivo, itemIdEfectivo, insumosVinculadosIds } = ajuste.data
    puntoVentaId = ajuste.data.puntoVentaId
    if (itemTipoEfectivo === 'producto') productoIdsAfectados.add(itemIdEfectivo)
    else insumoIdsAfectados.add(itemIdEfectivo)
    insumosVinculadosIds.forEach((id) => insumoIdsAfectados.add(id))

    movimientos.push({
      id: uid(),
      tipo: 'egreso',
      itemTipo: itemTipoEfectivo,
      itemId: itemIdEfectivo,
      cantidad: cantidadConsumida,
      nota: notas,
      fecha,
      origen: 'formula',
      origenId: loteId,
    })
  }

  // Modo a medida: el lote NO es stock genérico -- no se le suma nada al
  // Producto.stock (quedaría disponible para vendérselo a otro cliente, que
  // es exactamente lo que no queremos) ni se registra un "ingreso" en el
  // Kardex de depósito. El registro de `producciones` con fichaItemId ya es
  // la trazabilidad real de este lote: quedó producido e imputado al
  // pedido hasta que se facture el presupuesto vinculado a la ficha.
  if (!esAMedida) {
    const ajusteProducto = await aplicarAjusteAtomico({
      itemTipo: 'producto',
      itemId: formula.productoId,
      delta: cantidadRealProducida,
      clienteId,
    })
    if (!ajusteProducto.ok) {
      return {
        ok: false,
        error: `El lote se registró y se descontaron los insumos, pero falló sumar el stock del producto terminado: ${ajusteProducto.error}. Revisá el stock manualmente.`,
      }
    }
    productoIdsAfectados.add(ajusteProducto.data.itemIdEfectivo)
    ajusteProducto.data.insumosVinculadosIds.forEach((id) => insumoIdsAfectados.add(id))
    puntoVentaId = ajusteProducto.data.puntoVentaId

    movimientos.push({
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
  }

  // A medida con fórmula sin líneas de insumo (ej. solo mano de obra) no
  // deja movimiento alguno -- insert([]) no tiene sentido, se salta.
  if (movimientos.length > 0) {
    const { error: errMovs } = await supabase
      .from('movimientos_stock')
      .insert(movimientos.map((m) => ({ ...movimientoToRow(m, clienteId), punto_venta_id: puntoVentaId })))
    if (errMovs) {
      return {
        ok: false,
        error: `El lote se registró y el stock se actualizó, pero no se pudieron guardar los movimientos del Kardex: ${errMovs.message}. El historial puede quedar incompleto.`,
      }
    }
  }

  const [productos, insumos] = await Promise.all([
    fetchProductosPorId([...productoIdsAfectados]),
    fetchInsumosPorId([...insumoIdsAfectados]),
  ])

  // Fase 41.3: si este lote cierra el último ítem a medida pendiente de una
  // Orden compuesta 100% por ítems a medida (sin mezcla con stock
  // genérico), avanza el estado de esa Orden a 'terminado' -- así el
  // vendedor no tiene que ir a Órdenes a mano después de producir. Ver
  // intentarCerrarOrdenAMedida más abajo para el criterio exacto.
  if (fichaItem) {
    await intentarCerrarOrdenAMedida(fichaItem.id, clienteId)
  }

  return { ok: true, data: { produccion: nuevaProduccion, productos, insumos, movimientos } }
}

/**
 * Fase 41.3 (pedido de Carlos, "unificar el proceso"): auto-avanza el
 * estado de una Orden a 'terminado' cuando termina de producirse su
 * último ítem a medida pendiente -- pero SOLO si la Orden está compuesta
 * enteramente por ítems a medida (todos sus orden_venta_items vienen de
 * la misma Ficha). Si mezcla con productos de catálogo genérico, no se
 * toca nada y sigue el control manual de siempre en Órdenes: producir la
 * cortina no significa que el resto de la orden esté listo para entregar.
 *
 * Este código solo se ejecuta desde el flujo de "producción a medida"
 * (fichaItem presente), que a su vez solo existe si el tenant tiene
 * Fichas de medida activo -- no es una regla de Punto Tex hardcodeada,
 * es una regla del patrón "a medida" en general, y no toca la lógica de
 * "Facturar" (sigue siendo estado === 'terminado' || 'entregado_parcial'
 * para todos los rubros).
 *
 * Best-effort: no aborta la producción ya confirmada si algo acá falla
 * (el lote y el descuento de stock ya quedaron guardados) -- solo se
 * pierde el auto-avance y queda el camino manual de siempre.
 */
async function intentarCerrarOrdenAMedida(fichaItemId: string, clienteId: string): Promise<void> {
  try {
    const { data: itemRow } = await supabase
      .from('ficha_medida_items')
      .select('id, ficha_id')
      .eq('id', fichaItemId)
      .single()
    if (!itemRow) return

    const { data: fichaRow } = await supabase
      .from('fichas_medida')
      .select('id, presupuesto_id')
      .eq('id', itemRow.ficha_id)
      .single()
    if (!fichaRow?.presupuesto_id) return

    // Todos los ítems de la ficha (no solo los vinculados a producto) --
    // hace falta el total para confirmar que NINGUNO quedó como texto
    // libre (sin producto_id), que es justo el caso mixto que no se debe
    // auto-cerrar.
    const { data: todosItemsFicha } = await supabase
      .from('ficha_medida_items')
      .select('id, producto_id')
      .eq('ficha_id', fichaRow.id)
    if (!todosItemsFicha || todosItemsFicha.length === 0) return

    const itemsAMedida = todosItemsFicha.filter((i: any) => i.producto_id)
    if (itemsAMedida.length === 0) return
    if (itemsAMedida.length !== todosItemsFicha.length) return // hay ítems de texto libre mezclados -> no autocerrar

    const itemIds = itemsAMedida.map((i: any) => i.id as string)
    const { data: producidosRows } = await supabase
      .from('producciones')
      .select('ficha_item_id')
      .in('ficha_item_id', itemIds)
    const producidos = new Set((producidosRows ?? []).map((p: any) => p.ficha_item_id as string))
    const todosProducidos = itemsAMedida.every((i: any) => producidos.has(i.id))
    if (!todosProducidos) return

    const { data: ordenRow } = await supabase
      .from('ordenes_venta')
      .select('id, estado')
      .eq('presupuesto_id', fichaRow.presupuesto_id)
      .eq('cliente_id', clienteId)
      .maybeSingle()
    if (!ordenRow) return
    if (['terminado', 'entregado_parcial', 'entregado', 'cancelado'].includes(ordenRow.estado)) return

    // presupuesto_items/orden_venta_items NO llevan producto_id en los
    // ítems a medida (a propósito, ver comentario al tope de
    // generarPresupuesto.ts -- si lo llevaran, "Facturar directamente"
    // intentaría descontar stock genérico que en modo 'a_medida' nunca se
    // tocó). Por eso acá se compara por CANTIDAD de líneas en vez de por
    // id: ficha.items -> presupuesto.items -> orden.items se mapean
    // siempre 1 a 1 (generarPresupuesto.ts / CONVERTIR_PRESUPUESTO_A_ORDEN),
    // así que si el conteo de la orden coincide con el conteo de la ficha
    // (que ya se confirmó arriba que es 100% a medida), es la misma orden.
    const { count: cantidadItemsOrden } = await supabase
      .from('orden_venta_items')
      .select('id', { count: 'exact', head: true })
      .eq('orden_id', ordenRow.id)
    if (cantidadItemsOrden !== todosItemsFicha.length) return

    await supabase.from('ordenes_venta').update({ estado: 'terminado' }).eq('id', ordenRow.id)
  } catch {
    // best-effort -- ver comentario de la función
  }
}

// ─── Producción a medida (Fase 41) ───────────────────────────────────────────
// Lee directo de las tablas del módulo Fichas de medida (que no tiene
// Context/reducer propio, mismo motivo por el que generarPresupuesto.ts
// habla directo con Supabase) para armar la lista de "pedidos a medida
// pendientes de producir" que usa Producción.tsx. No hay una columna de
// estado propia: el pendiente/producido/cerrado se DERIVA en cada consulta
// de datos que ya son la fuente de verdad (ver comentario de la migración
// fase41_cortinas_a_medida) para que nunca se pueda desincronizar.
export interface PedidoAMedidaPendiente {
  itemId: string
  fichaId: string
  productoId: string
  clienteVentaId: string
  clienteNombre: string
  descripcion: string
  cantidadItem: number
  fechaPedido: string
  fechaEntrega?: string
  panos: PanoParaCalculo[]
}

export async function fetchPedidosAMedidaPendientes(
  clienteId: string,
): Promise<PedidoAMedidaPendiente[]> {
  const { data: fichasRows, error: errFichas } = await supabase
    .from('fichas_medida')
    .select('id, presupuesto_id, cliente_venta_id, fecha_pedido, fecha_entrega')
    .eq('cliente_id', clienteId)
  if (errFichas || !fichasRows || fichasRows.length === 0) return []

  const fichaIds = fichasRows.map((f) => f.id)

  const { data: itemsRows, error: errItems } = await supabase
    .from('ficha_medida_items')
    .select('id, ficha_id, producto_id, producto, cantidad')
    .in('ficha_id', fichaIds)
    .not('producto_id', 'is', null)
  if (errItems || !itemsRows || itemsRows.length === 0) return []

  const itemIds = itemsRows.map((i) => i.id)

  const [{ data: produccionesRows }, { data: panosRows }] = await Promise.all([
    supabase.from('producciones').select('ficha_item_id').in('ficha_item_id', itemIds),
    supabase.from('ficha_medida_panos').select('item_id, ancho, alto').in('item_id', itemIds),
  ])
  const yaProducidos = new Set((produccionesRows ?? []).map((p: any) => p.ficha_item_id))

  const presupuestoIds = Array.from(
    new Set(fichasRows.map((f) => f.presupuesto_id).filter((id): id is string => Boolean(id))),
  )
  const presupuestosPorId = new Map<string, string>()
  if (presupuestoIds.length > 0) {
    const { data: presRows } = await supabase
      .from('presupuestos')
      .select('id, estado')
      .in('id', presupuestoIds)
    for (const p of presRows ?? []) presupuestosPorId.set(p.id, p.estado)
  }

  const clienteVentaIds = Array.from(new Set(fichasRows.map((f) => f.cliente_venta_id)))
  const { data: clientesRows } =
    clienteVentaIds.length > 0
      ? await supabase.from('clientes_venta').select('id, nombre').in('id', clienteVentaIds)
      : { data: [] as { id: string; nombre: string }[] }
  const nombreClientePorId = new Map((clientesRows ?? []).map((c: any) => [c.id, c.nombre as string]))

  const panosPorItem = new Map<string, PanoParaCalculo[]>()
  for (const p of panosRows ?? []) {
    const arr = panosPorItem.get((p as any).item_id) ?? []
    arr.push({
      ancho: (p as any).ancho != null ? Number((p as any).ancho) : null,
      alto: (p as any).alto != null ? Number((p as any).alto) : null,
    })
    panosPorItem.set((p as any).item_id, arr)
  }

  const fichaPorId = new Map(fichasRows.map((f) => [f.id, f]))

  const pendientes: PedidoAMedidaPendiente[] = []
  for (const item of itemsRows as any[]) {
    if (yaProducidos.has(item.id)) continue
    const ficha = fichaPorId.get(item.ficha_id)
    if (!ficha) continue
    const estadoPresupuesto = ficha.presupuesto_id
      ? presupuestosPorId.get(ficha.presupuesto_id)
      : undefined
    // Solo se produce después de aprobado (mismo criterio que la seña,
    // Fase 41.2: primero se aprueba, después se puede avanzar). Esta
    // condición estaba invertida -- excluía justo el caso 'aprobado', que
    // es el único momento en que el pedido debería aparecer acá para
    // producir. Presupuesto no tiene un estado "facturado" propio (eso
    // vive en Comprobantes/Orden); "cerrado" en la práctica ya lo cubre
    // yaProducidos.has(item.id) de la línea de arriba.
    if (estadoPresupuesto !== 'aprobado') continue

    pendientes.push({
      itemId: item.id,
      fichaId: item.ficha_id,
      productoId: item.producto_id,
      clienteVentaId: ficha.cliente_venta_id,
      clienteNombre: nombreClientePorId.get(ficha.cliente_venta_id) ?? '(cliente eliminado)',
      descripcion: item.producto,
      cantidadItem: Number(item.cantidad),
      fechaPedido: ficha.fecha_pedido,
      fechaEntrega: ficha.fecha_entrega ?? undefined,
      panos: panosPorItem.get(item.id) ?? [],
    })
  }
  return pendientes
}

/** Reemplaza ADD_RECEPCION -- crea la recepción en borrador (sin tocar stock
 * todavía, igual que antes: el stock se aplica recién al Confirmar). */
export async function crearRecepcionConfirmada(
  data: {
    fecha: string
    proveedor: string
    numeroRemito: string
    lineas: LineaRecepcion[]
    notas: string
  },
  clienteId: string,
): Promise<ResultadoGuardado<Recepcion>> {
  const nueva: Recepcion = {
    ...data,
    id: uid(),
    estado: 'borrador',
    createdAt: todayISO(),
  }
  const { error: errRecepcion } = await supabase
    .from('recepciones')
    .insert(recepcionToRow(nueva, clienteId))
  if (errRecepcion) return { ok: false, error: `No se pudo crear la recepción: ${errRecepcion.message}` }

  if (nueva.lineas.length) {
    const { error: errLineas } = await supabase
      .from('recepcion_lineas')
      .insert(nueva.lineas.map((l) => recepcionLineaToRow(l, nueva.id)))
    if (errLineas) {
      return {
        ok: false,
        error: `La recepción se creó, pero no se pudieron guardar sus líneas: ${errLineas.message}. Borrala (queda como borrador vacío) y volvé a cargarla.`,
      }
    }
  }
  return { ok: true, data: nueva }
}

/** Reemplaza CONFIRMAR_RECEPCION -- aplica cada línea como un ingreso
 * atómico de stock (con su costo) y solo cambia el estado a 'confirmada' si
 * TODAS las líneas se aplicaron. El UPDATE del estado lleva
 * `.eq('estado','borrador')` + chequeo de fila afectada, para no confirmar
 * dos veces la misma recepción si dos personas la tocan casi a la vez. */
export async function confirmarRecepcionConfirmada(
  recepcion: Recepcion,
  clienteId: string,
): Promise<ResultadoGuardado<{
  recepcion: Recepcion
  productos: Producto[]
  insumos: Insumo[]
  movimientos: MovimientoStock[]
}>> {
  if (recepcion.estado !== 'borrador') {
    return {
      ok: false,
      error: 'Esta recepción ya no está en borrador -- puede que ya se haya confirmado o cancelado. Recargá la página.',
    }
  }

  const { data: filaEstado, error: errEstado } = await supabase
    .from('recepciones')
    .update({ estado: 'confirmada' })
    .eq('id', recepcion.id)
    .eq('estado', 'borrador')
    .select('id')
  if (errEstado) return { ok: false, error: `No se pudo confirmar la recepción: ${errEstado.message}` }
  if (!filaEstado || filaEstado.length === 0) {
    return {
      ok: false,
      error: 'Esta recepción ya no está en borrador -- puede que ya se haya confirmado o cancelado. Recargá la página.',
    }
  }

  const movimientos: MovimientoStock[] = []
  const productoIdsAfectados = new Set<string>()
  const insumoIdsAfectados = new Set<string>()
  let puntoVentaId: string | null = null

  for (const linea of recepcion.lineas) {
    const ajuste = await aplicarAjusteAtomico({
      itemTipo: linea.itemTipo,
      itemId: linea.itemId,
      varianteId: linea.varianteId,
      delta: linea.cantidad,
      costoUnitario: linea.costoUnitario,
      clienteId,
    })
    if (!ajuste.ok) {
      return {
        ok: false,
        error: `La recepción quedó marcada como confirmada, pero falló aplicar una de sus líneas: ${ajuste.error}. Puede haber quedado parcialmente aplicada -- revisá el stock y los movimientos antes de seguir.`,
      }
    }
    const { itemTipoEfectivo, itemIdEfectivo, insumosVinculadosIds } = ajuste.data
    puntoVentaId = ajuste.data.puntoVentaId
    if (itemTipoEfectivo === 'producto') productoIdsAfectados.add(itemIdEfectivo)
    else insumoIdsAfectados.add(itemIdEfectivo)
    insumosVinculadosIds.forEach((id) => insumoIdsAfectados.add(id))

    movimientos.push({
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
      fechaVencimiento: linea.fechaVencimiento,
    })
  }

  if (movimientos.length) {
    const { error: errMovs } = await supabase
      .from('movimientos_stock')
      .insert(movimientos.map((m) => ({ ...movimientoToRow(m, clienteId), punto_venta_id: puntoVentaId })))
    if (errMovs) {
      return {
        ok: false,
        error: `La recepción se confirmó y el stock se actualizó, pero no se pudieron guardar los movimientos del Kardex: ${errMovs.message}. El historial puede quedar incompleto.`,
      }
    }
  }

  const [productos, insumos] = await Promise.all([
    fetchProductosPorId([...productoIdsAfectados]),
    fetchInsumosPorId([...insumoIdsAfectados]),
  ])

  return {
    ok: true,
    data: { recepcion: { ...recepcion, estado: 'confirmada' }, productos, insumos, movimientos },
  }
}

/** Reemplaza CANCELAR_RECEPCION -- no toca stock (una recepción en borrador
 * nunca llegó a aplicarlo), solo cambia el estado. Mismo guardrail
 * `.eq('estado','borrador')` que confirmarRecepcionConfirmada. */
export async function cancelarRecepcionConfirmada(
  recepcion: Recepcion,
): Promise<ResultadoGuardado<Recepcion>> {
  if (recepcion.estado !== 'borrador') {
    return { ok: false, error: 'Esta recepción ya no está en borrador.' }
  }
  const { data, error } = await supabase
    .from('recepciones')
    .update({ estado: 'cancelada' })
    .eq('id', recepcion.id)
    .eq('estado', 'borrador')
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: 'Esta recepción ya no está en borrador -- puede que ya haya sido confirmada o cancelada.',
    }
  }
  return { ok: true, data: { ...recepcion, estado: 'cancelada' } }
}

/** Reemplaza ADD_REGISTRO_CONTROL -- Control de Stock dispara esta acción
 * y, si el conteo físico difiere del sistema, encadena ajustarStockConfirmado
 * (ver ControlStock.tsx). Se mantienen separadas porque el registro de
 * auditoría tiene sentido guardarlo aunque la diferencia sea 0. */
export async function registrarControlConfirmado(
  data: {
    reglaId: string
    itemTipo: 'producto' | 'insumo'
    itemId: string
    stockSistema: number
    stockContado: number
    diferencia: number
    fecha: string
  },
  clienteId: string,
): Promise<ResultadoGuardado<RegistroControl>> {
  const nuevo: RegistroControl = { ...data, id: uid() }
  const { error } = await supabase.from('registros_control').insert(registroControlToRow(nuevo, clienteId))
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: nuevo }
}

// ─── Cierre de fase: Rubros/SubRubros, Marcas, Listas de precio, Combos ────
// Último sector -- el de menor volumen real (rubros=9, sub_rubros=35,
// marcas=8, listas_precio=3, combos=1 en la cuenta hecha al arrancar esta
// fase). Mismo criterio que todo lo de arriba: escribir primero, esperar
// confirmación, y solo tocar el estado local si Supabase confirmó.

export async function crearRubroConfirmado(
  data: Omit<Rubro, 'id'>,
  clienteId: string,
): Promise<ResultadoGuardado<Rubro>> {
  const nuevo: Rubro = { ...data, id: uid() }
  const { error } = await supabase.from('rubros').insert(rubroToRow(nuevo, clienteId))
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: nuevo }
}

export async function actualizarRubroConfirmado(
  r: Rubro,
  clienteId: string,
): Promise<ResultadoGuardado<Rubro>> {
  const { data, error } = await supabase
    .from('rubros')
    .update(rubroToRow(r, clienteId))
    .eq('id', r.id)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: 'No se encontró este rubro en la base -- puede que nunca se haya guardado.' }
  }
  return { ok: true, data: r }
}

/** El borrado sigue el mismo orden que ya usaba syncToSupabase (sub-rubros
 * primero, después el rubro), pero ahora esperado: si el rubro está en uso
 * (productos, insumos, o `combo_componentes_eleccion` -- ver migración
 * 0027, FK sin cascade) el DELETE real rechaza con 23503 y acá se traduce
 * a un mensaje claro, en vez del "borrado fantasma" que tenían Insumos
 * antes de la fase anterior. */
export async function eliminarRubroConfirmado(id: string): Promise<ResultadoGuardado<null>> {
  const { error: errSub } = await supabase.from('sub_rubros').delete().eq('rubro_id', id)
  if (errSub) return { ok: false, error: `No se pudieron borrar los sub-rubros asociados: ${errSub.message}` }
  const { error } = await supabase.from('rubros').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') {
      return {
        ok: false,
        error:
          'Los sub-rubros se borraron, pero este rubro está en uso (en productos, insumos o un combo) y no se pudo eliminar. Reasigná esos ítems a otro rubro y volvé a intentar.',
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, data: null }
}

export async function crearSubRubroConfirmado(
  data: Omit<SubRubro, 'id'>,
): Promise<ResultadoGuardado<SubRubro>> {
  const nuevo: SubRubro = { ...data, id: uid() }
  const { error } = await supabase.from('sub_rubros').insert(subRubroToRow(nuevo))
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: nuevo }
}

export async function actualizarSubRubroConfirmado(
  sr: SubRubro,
): Promise<ResultadoGuardado<SubRubro>> {
  const { data, error } = await supabase
    .from('sub_rubros')
    .update(subRubroToRow(sr))
    .eq('id', sr.id)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: 'No se encontró este sub-rubro en la base -- puede que nunca se haya guardado.' }
  }
  return { ok: true, data: sr }
}

export async function eliminarSubRubroConfirmado(id: string): Promise<ResultadoGuardado<null>> {
  const { error } = await supabase.from('sub_rubros').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') {
      return {
        ok: false,
        error: 'Este sub-rubro está en uso y no se puede eliminar. Reasigná esos ítems a otro sub-rubro primero.',
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, data: null }
}

/** Único punto real de escritura de Marca hoy (alta rápida inline desde
 * ProductoDialog -- no hay pantalla propia de Marcas todavía, ver
 * FormularProducto.tsx/Productos.tsx). Antes dependía de que ADD_MARCA
 * fuera optimista para auto-seleccionar la marca recién creada por nombre
 * (matching contra el array `marcas` del store) -- acá se devuelve la marca
 * ya confirmada directo, sin ese paso intermedio frágil. */
export async function crearMarcaConfirmado(
  nombre: string,
  clienteId: string,
): Promise<ResultadoGuardado<Marca>> {
  const nueva: Marca = { id: uid(), nombre }
  const { error } = await supabase.from('marcas').insert(marcaToRow(nueva, clienteId))
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Ya existe una marca con ese nombre.' }
    return { ok: false, error: error.message }
  }
  return { ok: true, data: nueva }
}

export async function crearListaPrecioConfirmada(
  data: Omit<ListaPrecio, 'id'>,
  clienteId: string,
): Promise<ResultadoGuardado<ListaPrecio>> {
  const nueva: ListaPrecio = { ...data, id: uid() }
  const { error } = await supabase.from('listas_precio').insert(listaPrecioToRow(nueva, clienteId))
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Ya existe una lista de precio con ese nombre.' }
    return { ok: false, error: error.message }
  }
  return { ok: true, data: nueva }
}

export async function actualizarListaPrecioConfirmada(
  l: ListaPrecio,
  clienteId: string,
): Promise<ResultadoGuardado<ListaPrecio>> {
  const { data, error } = await supabase
    .from('listas_precio')
    .update(listaPrecioToRow(l, clienteId))
    .eq('id', l.id)
    .select('id')
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Ya existe una lista de precio con ese nombre.' }
    return { ok: false, error: error.message }
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: 'No se encontró esta lista de precio en la base -- puede que nunca se haya guardado.',
    }
  }
  return { ok: true, data: l }
}

/** `producto_precios` tiene ON DELETE CASCADE sobre `lista_id` (migración
 * 0025) -- no hace falta borrar los overrides a mano antes. */
export async function eliminarListaPrecioConfirmada(id: string): Promise<ResultadoGuardado<null>> {
  const { error } = await supabase.from('listas_precio').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: null }
}

/** Reemplaza SET_PRECIO_PRODUCTO. A diferencia del resto, este es un
 * guardado por-celda (onBlur de cada fila en ListasPrecio.tsx), muy
 * frecuente -- por eso usa upsert con onConflict en vez de decidir
 * insert-vs-update en el cliente (evita una condición de carrera si el
 * usuario tipea rápido en dos celdas y ambos blur casi simultáneos
 * intentan crear el mismo (producto_id, lista_id); el `unique` real de la
 * tabla lo protegería igual, pero el upsert lo resuelve directamente en
 * vez de devolver un 23505 al usuario). */
export async function fijarPrecioProductoConfirmado(params: {
  productoId: string
  listaId: string
  precio: number | null
}): Promise<ResultadoGuardado<{ productoId: string; listaId: string; precio: number | null; id?: string }>> {
  const { productoId, listaId, precio } = params

  if (precio === null) {
    const { error } = await supabase
      .from('producto_precios')
      .delete()
      .eq('producto_id', productoId)
      .eq('lista_id', listaId)
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: { productoId, listaId, precio: null } }
  }

  const { data, error } = await supabase
    .from('producto_precios')
    .upsert({ producto_id: productoId, lista_id: listaId, precio }, { onConflict: 'producto_id,lista_id' })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: { productoId, listaId, precio, id: data?.id as string | undefined } }
}

/** Reemplaza ADD_COMBO. Mismo orden estricto padre→hijos que ya usaba
 * syncToSupabase (ver comentario histórico junto a ADD_COMBO más arriba):
 * los componentes recién se insertan después de que el INSERT del combo
 * confirmó, porque la política RLS de combo_componentes_* depende de que
 * el combo padre ya sea visible. */
export async function crearComboConfirmado(
  data: Omit<Combo, 'id' | 'createdAt'>,
  clienteId: string,
): Promise<ResultadoGuardado<Combo>> {
  const nuevo: Combo = { ...data, id: uid(), createdAt: todayISO() }

  const { error: errCombo } = await supabase.from('combos').insert(comboToRow(nuevo, clienteId))
  if (errCombo) {
    if (errCombo.code === '23505') return { ok: false, error: 'Ya existe un combo con ese nombre.' }
    return { ok: false, error: errCombo.message }
  }

  if (nuevo.componentesFijos.length) {
    const { error } = await supabase
      .from('combo_componentes_fijos')
      .insert(nuevo.componentesFijos.map((cf) => comboComponenteFijoToRow(cf, nuevo.id)))
    if (error) {
      return {
        ok: false,
        error: `El combo se creó, pero fallaron sus componentes fijos: ${error.message}. Editalo para volver a guardarlos.`,
      }
    }
  }
  if (nuevo.componentesEleccion.length) {
    const { error } = await supabase
      .from('combo_componentes_eleccion')
      .insert(nuevo.componentesEleccion.map((ce) => comboComponenteEleccionToRow(ce, nuevo.id)))
    if (error) {
      return {
        ok: false,
        error: `El combo se creó, pero fallaron sus componentes a elección: ${error.message}. Editalo para volver a guardarlos.`,
      }
    }
  }

  return { ok: true, data: nuevo }
}

/** Reemplaza UPDATE_COMBO. Mismo criterio delete+reinsert de ambas tablas
 * hijas que ya usaba syncComboComponentes -- seguro porque el diálogo
 * siempre manda la lista completa de componentes, nunca un delta. */
export async function actualizarComboConfirmado(
  c: Combo,
  clienteId: string,
): Promise<ResultadoGuardado<Combo>> {
  const { data, error: errCombo } = await supabase
    .from('combos')
    .update(comboToRow(c, clienteId))
    .eq('id', c.id)
    .select('id')
  if (errCombo) {
    if (errCombo.code === '23505') return { ok: false, error: 'Ya existe un combo con ese nombre.' }
    return { ok: false, error: errCombo.message }
  }
  if (!data || data.length === 0) {
    return { ok: false, error: 'No se encontró este combo en la base -- puede que nunca se haya guardado.' }
  }

  const { error: errDelFijos } = await supabase
    .from('combo_componentes_fijos')
    .delete()
    .eq('combo_id', c.id)
  if (errDelFijos) {
    return {
      ok: false,
      error: `El combo se actualizó, pero no se pudieron reemplazar sus componentes fijos: ${errDelFijos.message}`,
    }
  }
  if (c.componentesFijos.length) {
    const { error } = await supabase
      .from('combo_componentes_fijos')
      .insert(c.componentesFijos.map((cf) => comboComponenteFijoToRow(cf, c.id)))
    if (error) {
      return {
        ok: false,
        error: `El combo se actualizó, pero fallaron sus componentes fijos: ${error.message}. Volvé a guardar.`,
      }
    }
  }

  const { error: errDelEleccion } = await supabase
    .from('combo_componentes_eleccion')
    .delete()
    .eq('combo_id', c.id)
  if (errDelEleccion) {
    return {
      ok: false,
      error: `El combo se actualizó, pero no se pudieron reemplazar sus componentes a elección: ${errDelEleccion.message}`,
    }
  }
  if (c.componentesEleccion.length) {
    const { error } = await supabase
      .from('combo_componentes_eleccion')
      .insert(c.componentesEleccion.map((ce) => comboComponenteEleccionToRow(ce, c.id)))
    if (error) {
      return {
        ok: false,
        error: `El combo se actualizó, pero fallaron sus componentes a elección: ${error.message}. Volvé a guardar.`,
      }
    }
  }

  return { ok: true, data: c }
}

/** combo_componentes_fijos y combo_componentes_eleccion tienen ON DELETE
 * CASCADE (migración 0027) -- no hace falta borrar los hijos a mano. */
export async function eliminarComboConfirmado(id: string): Promise<ResultadoGuardado<null>> {
  const { error } = await supabase.from('combos').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: null }
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

  // Fix (17/08): `dispatch` estaba memoizado con `state` como dependencia,
  // así que dos llamadas a dispatch() seguidas dentro del mismo handler
  // sincrónico (ej. handleSave en Formular Producto, que hace ADD_FORMULA
  // y después UPDATE_PRODUCTO) usaban el MISMO `state` capturado -- React
  // recién actualiza `state` en el próximo render, no entre esas dos
  // llamadas. La segunda quedaba calculando prevState/nextState contra una
  // versión vieja del estado, sin la fórmula que la primera acababa de
  // agregar. `stateRef` se actualiza al toque en cada dispatch, así que la
  // segunda llamada siempre ve lo que hizo la primera.
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

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
      const prevState = stateRef.current
      const nextState = reducer(prevState, action)
      stateRef.current = nextState
      rawDispatch(action)
      if (cliente?.id && action.type !== 'RESET') {
        syncToSupabase(action, prevState, nextState, cliente.id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente?.id])

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
    // Fase 43o: si la fórmula tildó "aplicar merma al costo", el costo se
    // reparte entre la cantidad REAL vendible después de la pérdida de
    // proceso (ej. peso de curado de un salame), no la cantidad nominal
    // cargada en la receta -- ver comentario largo en Formula.aplicarMermaCosto.
    const cantidadEfectiva =
      formula.aplicarMermaCosto && formula.mermaPorcentaje > 0
        ? formula.cantidadProducida * (1 - formula.mermaPorcentaje / 100)
        : formula.cantidadProducida
    const costoUnitario = cantidadEfectiva > 0 ? total / cantidadEfectiva : total

    return { insumos, manoDeObra, costosOperativos, total, costoUnitario }
  }, [state.formulas, productoId])
}
