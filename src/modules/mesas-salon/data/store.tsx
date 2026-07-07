// ============================================================
// Módulo Mesas y Salón — State Management
// Edgy Gestión · Context + useReducer + Supabase
//
// CREAR_MESAS_MASIVO reproduce el wizard de Frambuesa ("Armá tu salón
// en 10 segundos": nombre de sector + cantidad de mesas + sillas por
// mesa, crea todas las mesas de una), autoposicionando en grilla para
// que la vista Plano tenga algo razonable desde el vamos aunque nadie
// haya arrastrado nada todavía.
// ============================================================

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import type { MesasSalonState, Sector, Mesa, EstadoMesa } from '../types'
import { seedState } from './seed'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'

function uid(): string {
  return crypto.randomUUID()
}

// Grilla por defecto al crear mesas masivamente: 6 por fila, separadas
// 110px — es solo el punto de partida del Plano, se puede reacomodar
// arrastrando cada mesa después.
const COLUMNAS_GRILLA = 6
const ESPACIADO = 110

type Action =
  // El id lo resuelve quien despacha (mismo criterio que Ventas/Compras
  // con `generarId()`), no el reducer — así una pantalla puede crear el
  // sector y encadenar en el mismo gesto un CREAR_MESAS_MASIVO para ese
  // sectorId sin tener que esperar un roundtrip o adivinar el id.
  | { type: 'ADD_SECTOR'; payload: { id: string; nombre: string } }
  | { type: 'RENOMBRAR_SECTOR'; payload: { id: string; nombre: string } }
  | { type: 'DELETE_SECTOR'; payload: string }
  | { type: 'CREAR_MESAS_MASIVO'; payload: { sectorId: string; cantidad: number; capacidad: number; offset: number } }
  | { type: 'MOVER_MESA'; payload: { id: string; posX: number; posY: number } }
  | { type: 'ACTUALIZAR_MESA'; payload: { id: string; numero?: number; capacidad?: number } }
  | { type: 'CAMBIAR_ESTADO_MESA'; payload: { id: string; estado: EstadoMesa; comandaActualId?: string } }
  | { type: 'DELETE_MESA'; payload: string }
  | { type: 'SET_STATE'; payload: MesasSalonState }

function reducer(state: MesasSalonState, action: Action): MesasSalonState {
  switch (action.type) {
    case 'SET_STATE':
      return action.payload

    case 'ADD_SECTOR': {
      const nuevo: Sector = {
        id: action.payload.id,
        nombre: action.payload.nombre,
        orden: state.sectores.length,
      }
      return { ...state, sectores: [...state.sectores, nuevo] }
    }

    case 'RENOMBRAR_SECTOR':
      return {
        ...state,
        sectores: state.sectores.map((s) =>
          s.id === action.payload.id ? { ...s, nombre: action.payload.nombre } : s,
        ),
      }

    case 'DELETE_SECTOR':
      return {
        ...state,
        sectores: state.sectores.filter((s) => s.id !== action.payload),
        mesas: state.mesas.filter((m) => m.sectorId !== action.payload),
      }

    case 'CREAR_MESAS_MASIVO': {
      const { sectorId, cantidad, capacidad, offset } = action.payload
      const nuevas: Mesa[] = Array.from({ length: cantidad }, (_, i) => {
        const posicion = offset + i
        return {
          id: uid(),
          sectorId,
          numero: posicion + 1,
          capacidad,
          posX: (posicion % COLUMNAS_GRILLA) * ESPACIADO,
          posY: Math.floor(posicion / COLUMNAS_GRILLA) * ESPACIADO,
          estado: 'libre' as const,
        }
      })
      return { ...state, mesas: [...state.mesas, ...nuevas] }
    }

    case 'MOVER_MESA':
      return {
        ...state,
        mesas: state.mesas.map((m) =>
          m.id === action.payload.id
            ? { ...m, posX: action.payload.posX, posY: action.payload.posY }
            : m,
        ),
      }

    case 'ACTUALIZAR_MESA':
      return {
        ...state,
        mesas: state.mesas.map((m) =>
          m.id === action.payload.id
            ? {
                ...m,
                numero: action.payload.numero ?? m.numero,
                capacidad: action.payload.capacidad ?? m.capacidad,
              }
            : m,
        ),
      }

    case 'CAMBIAR_ESTADO_MESA':
      return {
        ...state,
        mesas: state.mesas.map((m) =>
          m.id === action.payload.id
            ? { ...m, estado: action.payload.estado, comandaActualId: action.payload.comandaActualId }
            : m,
        ),
      }

    case 'DELETE_MESA':
      return { ...state, mesas: state.mesas.filter((m) => m.id !== action.payload) }

    default:
      return state
  }
}

// ─── Mapeo dominio -> filas de Supabase ───────────────────────

function sectorToRow(s: Sector, clienteId: string) {
  return { id: s.id, cliente_id: clienteId, nombre: s.nombre, orden: s.orden }
}

function mesaToRow(m: Mesa, clienteId: string) {
  return {
    id: m.id,
    cliente_id: clienteId,
    sector_id: m.sectorId,
    numero: m.numero,
    capacidad: m.capacidad,
    pos_x: m.posX,
    pos_y: m.posY,
    estado: m.estado,
    comanda_actual_id: m.comandaActualId ?? null,
  }
}

function logErr(label: string) {
  return ({ error }: { error: unknown }) => error && console.error(`Mesas y Salón · error en ${label}:`, error)
}

function syncToSupabase(action: Action, nextState: MesasSalonState, clienteId: string) {
  switch (action.type) {
    case 'ADD_SECTOR': {
      const s = nextState.sectores[nextState.sectores.length - 1]
      supabase.from('sectores').insert(sectorToRow(s, clienteId)).then(logErr('alta de sector'))
      return
    }
    case 'RENOMBRAR_SECTOR':
      supabase.from('sectores').update({ nombre: action.payload.nombre }).eq('id', action.payload.id).then(logErr('renombrar sector'))
      return
    case 'DELETE_SECTOR':
      // Primero las mesas del sector para no violar la FK, después el sector.
      supabase.from('mesas').delete().eq('sector_id', action.payload).then(() => {
        supabase.from('sectores').delete().eq('id', action.payload).then(logErr('borrado de sector'))
      })
      return

    case 'CREAR_MESAS_MASIVO': {
      const { cantidad } = action.payload
      const nuevas = nextState.mesas.slice(-cantidad)
      supabase.from('mesas').insert(nuevas.map((m) => mesaToRow(m, clienteId))).then(logErr('alta masiva de mesas'))
      return
    }

    case 'MOVER_MESA':
      supabase
        .from('mesas')
        .update({ pos_x: action.payload.posX, pos_y: action.payload.posY })
        .eq('id', action.payload.id)
        .then(logErr('mover mesa'))
      return

    case 'ACTUALIZAR_MESA': {
      const m = nextState.mesas.find((x) => x.id === action.payload.id)
      if (m) supabase.from('mesas').update({ numero: m.numero, capacidad: m.capacidad }).eq('id', m.id).then(logErr('editar mesa'))
      return
    }

    case 'CAMBIAR_ESTADO_MESA':
      supabase
        .from('mesas')
        .update({ estado: action.payload.estado, comanda_actual_id: action.payload.comandaActualId ?? null })
        .eq('id', action.payload.id)
        .then(logErr('cambio de estado de mesa'))
      return

    case 'DELETE_MESA':
      supabase.from('mesas').delete().eq('id', action.payload).then(logErr('borrado de mesa'))
      return

    default:
      return
  }
}

// ─── Fetch inicial desde Supabase ──────────────────────────────

async function fetchMesasSalonState(): Promise<MesasSalonState> {
  const [sectoresRes, mesasRes] = await Promise.all([
    supabase.from('sectores').select('*').order('orden'),
    supabase.from('mesas').select('*').order('numero'),
  ])

  const sectores: Sector[] = (sectoresRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    orden: r.orden,
  }))

  const mesas: Mesa[] = (mesasRes.data ?? []).map((r: any) => ({
    id: r.id,
    sectorId: r.sector_id,
    numero: r.numero,
    capacidad: r.capacidad,
    posX: Number(r.pos_x),
    posY: Number(r.pos_y),
    estado: r.estado,
    comandaActualId: r.comanda_actual_id ?? undefined,
  }))

  return { sectores, mesas }
}

// ─── Context ───────────────────────────────────────────────────

interface ContextValue {
  state: MesasSalonState
  dispatch: React.Dispatch<Action>
}

const Ctx = createContext<ContextValue | null>(null)

export function MesasSalonProvider({ children }: { children: ReactNode }) {
  const { cliente } = useClienteActual()
  const [state, rawDispatch] = useReducer(reducer, seedState)

  useEffect(() => {
    let activo = true
    if (!cliente?.id) return
    fetchMesasSalonState().then((data) => {
      if (activo) rawDispatch({ type: 'SET_STATE', payload: data })
    })
    return () => {
      activo = false
    }
  }, [cliente?.id])

  const dispatch = useMemo<React.Dispatch<Action>>(() => {
    return (action: Action) => {
      const nextState = reducer(state, action)
      rawDispatch(action)
      if (cliente?.id) syncToSupabase(action, nextState, cliente.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cliente?.id])

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useMesasSalon() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useMesasSalon debe usarse dentro de MesasSalonProvider')
  return ctx
}

export function useSectoresConMesas() {
  const { state } = useMesasSalon()
  return useMemo(
    () =>
      state.sectores.map((sector) => ({
        sector,
        mesas: state.mesas.filter((m) => m.sectorId === sector.id),
      })),
    [state.sectores, state.mesas],
  )
}

export function useResumenEstados() {
  const { state } = useMesasSalon()
  return useMemo(() => {
    const resumen = { libre: 0, ocupada: 0, cobro: 0, reservada: 0 }
    for (const m of state.mesas) resumen[m.estado]++
    return resumen
  }, [state.mesas])
}

export type { Action as MesasSalonAction }
