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
  Insumo,
  Rubro,
  SubRubro,
  Formula,
  MovimientoStock,
  Recepcion,
  Transferencia,
  ReglaControl,
  RegistroControl,
  LineaRecepcion,
} from '../types'
import { seedState } from './seed'

// ─── Constantes ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'edgy-productos-stock-v1'

// ─── Helpers ───────────────────────────────────────────────────────────────────

let _seq = 0
function uid(): string {
  return `${Date.now()}-${++_seq}-${Math.random().toString(36).slice(2, 7)}`
}

// ─── Acciones ──────────────────────────────────────────────────────────────────

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
  | { type: 'ADD_FORMULA'; payload: Omit<Formula, 'id' | 'createdAt'> }
  | { type: 'UPDATE_FORMULA'; payload: Formula }
  | { type: 'DELETE_FORMULA'; payload: string }
  | { type: 'ADD_MOVIMIENTO'; payload: Omit<MovimientoStock, 'id'> }
  | { type: 'ADD_RECEPCION'; payload: Omit<Recepcion, 'id' | 'createdAt'> }
  | { type: 'CONFIRMAR_RECEPCION'; payload: string }
  | { type: 'CANCELAR_RECEPCION'; payload: string }
  | { type: 'ADD_TRANSFERENCIA'; payload: Omit<Transferencia, 'id' | 'createdAt'> }
  | { type: 'ADD_REGLA_CONTROL'; payload: Omit<ReglaControl, 'id' | 'createdAt'> }
  | { type: 'ADD_REGISTRO_CONTROL'; payload: Omit<RegistroControl, 'id'> }
  | {
      type: 'AJUSTAR_STOCK'
      payload: {
        itemTipo: 'producto' | 'insumo'
        itemId: string
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
        cantidad: number
        costoUnitario?: number
        nota?: string
      }
    }
  | { type: 'RESET' }

// ─── Reducer ───────────────────────────────────────────────────────────────────

function reducer(state: ProductosStockState, action: Action): ProductosStockState {
  switch (action.type) {
    // ── Productos ──────────────────────────────────────────────────────────────
    case 'ADD_PRODUCTO': {
      const nuevo: Producto = {
        ...action.payload,
        id: uid(),
        createdAt: new Date().toISOString().slice(0, 10),
      }
      return { ...state, productos: [...state.productos, nuevo] }
    }
    case 'UPDATE_PRODUCTO':
      return {
        ...state,
        productos: state.productos.map((p) =>
          p.id === action.payload.id ? action.payload : p,
        ),
      }
    case 'DELETE_PRODUCTO':
      return {
        ...state,
        productos: state.productos.filter((p) => p.id !== action.payload),
      }

    // ── Insumos ───────────────────────────────────────────────────────────────
    case 'ADD_INSUMO': {
      const nuevo: Insumo = {
        ...action.payload,
        id: uid(),
        createdAt: new Date().toISOString().slice(0, 10),
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
      // Al borrar un rubro se borran tambien sus sub-rubros (no tiene sentido
      // un sub-rubro huerfano). Los productos/insumos que ya lo tenian
      // asignado quedan con un rubroId que ya no existe -- la UI lo muestra
      // como "Rubro eliminado" en vez de romper.
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

    // ── Fórmulas ──────────────────────────────────────────────────────────────
    case 'ADD_FORMULA': {
      const nueva: Formula = {
        ...action.payload,
        id: uid(),
        createdAt: new Date().toISOString().slice(0, 10),
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
        createdAt: new Date().toISOString().slice(0, 10),
      }
      return { ...state, recepciones: [...state.recepciones, nueva] }
    }

    case 'CONFIRMAR_RECEPCION': {
      const recepcion = state.recepciones.find((r) => r.id === action.payload)
      if (!recepcion || recepcion.estado !== 'borrador') return state

      const recepcionConfirmada: Recepcion = { ...recepcion, estado: 'confirmada' }

      // Clonar arrays mutables
      let productos = [...state.productos]
      let insumos = [...state.insumos]
      const nuevosMovimientos: MovimientoStock[] = []

      for (const linea of recepcion.lineas) {
        // Crear movimiento de ingreso
        nuevosMovimientos.push({
          id: uid(),
          tipo: 'ingreso',
          itemTipo: linea.itemTipo,
          itemId: linea.itemId,
          cantidad: linea.cantidad,
          costoUnitario: linea.costoUnitario,
          fecha: recepcion.fecha,
          origen: 'recepcion',
          origenId: recepcion.id,
        })

        // Actualizar stock y costo del item
        if (linea.itemTipo === 'producto') {
          productos = productos.map((p) =>
            p.id === linea.itemId
              ? {
                  ...p,
                  stock: p.stock + linea.cantidad,
                  costo: linea.costoUnitario > 0 ? linea.costoUnitario : p.costo,
                }
              : p,
          )
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

    // ── Transferencias ────────────────────────────────────────────────────────
    case 'ADD_TRANSFERENCIA': {
      const nueva: Transferencia = {
        ...action.payload,
        id: uid(),
        createdAt: new Date().toISOString().slice(0, 10),
      }
      return { ...state, transferencias: [...state.transferencias, nueva] }
    }

    // ── Control ───────────────────────────────────────────────────────────────
    case 'ADD_REGLA_CONTROL': {
      const nueva: ReglaControl = {
        ...action.payload,
        id: uid(),
        createdAt: new Date().toISOString().slice(0, 10),
      }
      return { ...state, reglasControl: [...state.reglasControl, nueva] }
    }

    case 'ADD_REGISTRO_CONTROL': {
      const nuevo: RegistroControl = { ...action.payload, id: uid() }
      return { ...state, registrosControl: [...state.registrosControl, nuevo] }
    }

    // ── Ajustar stock (manual) ────────────────────────────────────────────────
    case 'AJUSTAR_STOCK': {
      const { itemTipo, itemId, cantidad, motivo, nota } = action.payload

      const movimiento: MovimientoStock = {
        id: uid(),
        tipo: 'ajuste',
        itemTipo,
        itemId,
        cantidad,
        motivo,
        nota,
        fecha: new Date().toISOString().slice(0, 10),
        origen: 'ajuste_manual',
      }

      let productos = state.productos
      let insumos = state.insumos

      if (itemTipo === 'producto') {
        productos = productos.map((p) =>
          p.id === itemId ? { ...p, stock: p.stock + cantidad } : p,
        )
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
      const { itemTipo, itemId, cantidad, costoUnitario, nota } = action.payload

      const movimiento: MovimientoStock = {
        id: uid(),
        tipo: 'ingreso',
        itemTipo,
        itemId,
        cantidad,
        costoUnitario,
        nota,
        fecha: new Date().toISOString().slice(0, 10),
        origen: 'recepcion',
      }

      let productos = state.productos
      let insumos = state.insumos

      if (itemTipo === 'producto') {
        productos = productos.map((p) =>
          p.id === itemId
            ? {
                ...p,
                stock: p.stock + cantidad,
                ...(costoUnitario != null && costoUnitario > 0
                  ? { costo: costoUnitario }
                  : {}),
              }
            : p,
        )
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
      localStorage.removeItem(STORAGE_KEY)
      return seedState

    default:
      return state
  }
}

// ─── Inicialización ────────────────────────────────────────────────────────────

function init(): ProductosStockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ProductosStockState
      // Validar que tenga las claves esperadas
      if (parsed.productos && parsed.insumos && parsed.rubros) {
        return parsed
      }
    }
  } catch {
    // corrupto → fallback
  }
  return seedState
}

// ─── Context ───────────────────────────────────────────────────────────────────

interface ContextValue {
  state: ProductosStockState
  dispatch: React.Dispatch<Action>
}

const Ctx = createContext<ContextValue | null>(null)

// ─── Provider ──────────────────────────────────────────────────────────────────

export function ProductosStockProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// ─── Hook base ─────────────────────────────────────────────────────────────────

export function useProductosStock() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProductosStock debe usarse dentro de ProductosStockProvider')
  return ctx
}

// ─── Hooks derivados ───────────────────────────────────────────────────────────

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
