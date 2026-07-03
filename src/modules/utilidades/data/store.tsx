import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import type { UtilidadesState, SeguimientoHoras, EntradaHoras } from '../types'
import { seedState } from './seed'

// Solo Tracking de horas usa este store local -- Explorador de archivos e
// Importación masiva son Supabase-backed desde el día uno (ver
// data/useArchivos.ts y data/useImportaciones.ts), no localStorage.

const STORAGE_KEY = 'edgy-utilidades-v1'

let _seq = 0
function uid(): string {
  return `${Date.now()}-${++_seq}-${Math.random().toString(36).slice(2, 7)}`
}

type Action =
  | { type: 'ADD_SEGUIMIENTO'; payload: Omit<SeguimientoHoras, 'id' | 'createdAt'> }
  | { type: 'DELETE_SEGUIMIENTO'; payload: string }
  | { type: 'ADD_ENTRADA'; payload: Omit<EntradaHoras, 'id'> }
  | { type: 'DELETE_ENTRADA'; payload: string }
  | { type: 'RESET' }

function reducer(state: UtilidadesState, action: Action): UtilidadesState {
  switch (action.type) {
    case 'ADD_SEGUIMIENTO': {
      const nuevo: SeguimientoHoras = {
        ...action.payload,
        id: uid(),
        createdAt: new Date().toISOString().slice(0, 10),
      }
      return { ...state, seguimientos: [...state.seguimientos, nuevo] }
    }
    case 'DELETE_SEGUIMIENTO':
      return {
        ...state,
        seguimientos: state.seguimientos.filter((s) => s.id !== action.payload),
        // Las entradas de un seguimiento borrado no tienen sentido sueltas.
        entradas: state.entradas.filter((e) => e.seguimientoId !== action.payload),
      }
    case 'ADD_ENTRADA': {
      const nueva: EntradaHoras = { ...action.payload, id: uid() }
      return { ...state, entradas: [...state.entradas, nueva] }
    }
    case 'DELETE_ENTRADA':
      return { ...state, entradas: state.entradas.filter((e) => e.id !== action.payload) }
    case 'RESET':
      localStorage.removeItem(STORAGE_KEY)
      return seedState
    default:
      return state
  }
}

function init(): UtilidadesState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as UtilidadesState
      if (parsed.seguimientos && parsed.entradas) return parsed
    }
  } catch {
    // corrupto -> fallback
  }
  return seedState
}

interface ContextValue {
  state: UtilidadesState
  dispatch: React.Dispatch<Action>
}

const Ctx = createContext<ContextValue | null>(null)

export function UtilidadesProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useUtilidades() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useUtilidades debe usarse dentro de UtilidadesProvider')
  return ctx
}

export function useEntradasDeSeguimiento(seguimientoId: string) {
  const { state } = useUtilidades()
  return useMemo(
    () => state.entradas.filter((e) => e.seguimientoId === seguimientoId).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [state.entradas, seguimientoId],
  )
}

export function useTotalHoras(seguimientoId: string): number {
  const entradas = useEntradasDeSeguimiento(seguimientoId)
  return useMemo(() => entradas.reduce((sum, e) => sum + e.horas, 0), [entradas])
}
