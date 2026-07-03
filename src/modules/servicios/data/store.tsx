import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import type {
  ServiciosState,
  Servicio,
  RubroServicio,
  SubRubroServicio,
} from '../types'
import { seedState } from './seed'

// ─── Constantes ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'edgy-servicios-v1'

// ─── Helpers ───────────────────────────────────────────────────────────────────

let _seq = 0
function uid(): string {
  return `${Date.now()}-${++_seq}-${Math.random().toString(36).slice(2, 7)}`
}

// ─── Acciones ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'ADD_SERVICIO'; payload: Omit<Servicio, 'id' | 'createdAt'> }
  | { type: 'UPDATE_SERVICIO'; payload: Servicio }
  | { type: 'DELETE_SERVICIO'; payload: string }
  | { type: 'ADD_RUBRO'; payload: Omit<RubroServicio, 'id'> }
  | { type: 'UPDATE_RUBRO'; payload: RubroServicio }
  | { type: 'DELETE_RUBRO'; payload: string }
  | { type: 'ADD_SUBRUBRO'; payload: Omit<SubRubroServicio, 'id'> }
  | { type: 'UPDATE_SUBRUBRO'; payload: SubRubroServicio }
  | { type: 'DELETE_SUBRUBRO'; payload: string }
  | { type: 'RESET' }

// ─── Reducer ───────────────────────────────────────────────────────────────────

function reducer(state: ServiciosState, action: Action): ServiciosState {
  switch (action.type) {
    // ── Servicios ──────────────────────────────────────────────────────────────
    case 'ADD_SERVICIO': {
      const nuevo: Servicio = {
        ...action.payload,
        id: uid(),
        createdAt: new Date().toISOString().slice(0, 10),
      }
      return { ...state, servicios: [...state.servicios, nuevo] }
    }
    case 'UPDATE_SERVICIO':
      return {
        ...state,
        servicios: state.servicios.map((s) =>
          s.id === action.payload.id ? action.payload : s,
        ),
      }
    case 'DELETE_SERVICIO':
      return {
        ...state,
        servicios: state.servicios.filter((s) => s.id !== action.payload),
      }

    // ── Rubros y Sub-rubros ───────────────────────────────────────────────────
    case 'ADD_RUBRO': {
      const nuevo: RubroServicio = { ...action.payload, id: uid() }
      return { ...state, rubros: [...state.rubros, nuevo] }
    }
    case 'UPDATE_RUBRO':
      return {
        ...state,
        rubros: state.rubros.map((r) => (r.id === action.payload.id ? action.payload : r)),
      }
    case 'DELETE_RUBRO':
      // Igual que en Productos y Stock: al borrar un rubro se borran también
      // sus sub-rubros. Los servicios que ya lo tenían asignado quedan con un
      // rubroId que ya no existe -- la UI lo muestra como "Rubro eliminado".
      return {
        ...state,
        rubros: state.rubros.filter((r) => r.id !== action.payload),
        subRubros: state.subRubros.filter((sr) => sr.rubroId !== action.payload),
      }
    case 'ADD_SUBRUBRO': {
      const nuevo: SubRubroServicio = { ...action.payload, id: uid() }
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

    // ── Reset ─────────────────────────────────────────────────────────────────
    case 'RESET':
      localStorage.removeItem(STORAGE_KEY)
      return seedState

    default:
      return state
  }
}

// ─── Inicialización ────────────────────────────────────────────────────────────

function init(): ServiciosState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ServiciosState
      if (parsed.servicios && parsed.rubros && parsed.subRubros) {
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
  state: ServiciosState
  dispatch: React.Dispatch<Action>
}

const Ctx = createContext<ContextValue | null>(null)

// ─── Provider ──────────────────────────────────────────────────────────────────

export function ServiciosProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// ─── Hook base ─────────────────────────────────────────────────────────────────

export function useServicios() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useServicios debe usarse dentro de ServiciosProvider')
  return ctx
}

// ─── Hooks derivados ───────────────────────────────────────────────────────────

export function useServiciosPorRubro(rubroId?: string) {
  const { state } = useServicios()
  return useMemo(
    () =>
      rubroId ? state.servicios.filter((s) => s.rubroId === rubroId) : state.servicios,
    [state.servicios, rubroId],
  )
}

export function useSubRubrosDeRubro(rubroId?: string) {
  const { state } = useServicios()
  return useMemo(
    () => (rubroId ? state.subRubros.filter((sr) => sr.rubroId === rubroId) : []),
    [state.subRubros, rubroId],
  )
}

/** Precio "desde" para mostrar en listados: precio directo si es único, o el
 * menor precio entre las variantes con precio cargado (ignora "a convenir"). */
export function precioDesde(servicio: Servicio): number | null {
  if (servicio.tipo === 'unico') {
    return servicio.modalidadPrecio !== 'a_convenir' && servicio.precio != null
      ? servicio.precio
      : null
  }
  const precios = servicio.variantes
    .filter((v) => v.modalidadPrecio !== 'a_convenir' && v.precio != null)
    .map((v) => v.precio as number)
  return precios.length > 0 ? Math.min(...precios) : null
}
