// ============================================================
// Módulo Caja por turno — State Management
// Edgy Gestión · Context + useReducer + Supabase
//
// Mismo patrón que el resto: Provider envuelve un reducer chico, cada
// dispatch persiste en Supabase. Solo hay un turno "abierto" por vez
// por cliente (lo garantiza la UI, no una constraint de base — abrir
// un turno nuevo estando uno abierto no debería ofrecerse en pantalla).
//
// El arqueo (diferencia) NO se calcula acá adentro: cerrar un turno
// requiere sumar los movimientos de efectivo en Tesorería durante ese
// turno, que es una consulta async a otra tabla. Esa cuenta la hace la
// página de Caja-turno ANTES de despachar CERRAR_TURNO, y llega ya
// resuelta en el payload — mismo criterio que usan Ventas/Compras al
// resolver `numero` antes de llegar al reducer.
// ============================================================

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import type { CajaTurnoState, TurnoCaja } from '../types'
import { seedState } from './seed'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import { nowISO } from '../lib/format'

function uid(): string {
  return crypto.randomUUID()
}

type Action =
  | { type: 'ABRIR_TURNO'; payload: { montoApertura: number; usuarioAperturaId?: string; notas?: string } }
  | {
      type: 'CERRAR_TURNO'
      payload: {
        turnoId: string
        montoCierreDeclarado: number
        montoEsperado: number
        diferencia: number
        usuarioCierreId?: string
        notas?: string
      }
    }
  | { type: 'SET_STATE'; payload: CajaTurnoState }

function reducer(state: CajaTurnoState, action: Action): CajaTurnoState {
  switch (action.type) {
    case 'SET_STATE':
      return action.payload

    case 'ABRIR_TURNO': {
      const nuevo: TurnoCaja = {
        id: uid(),
        usuarioAperturaId: action.payload.usuarioAperturaId,
        fechaApertura: nowISO(),
        montoApertura: action.payload.montoApertura,
        estado: 'abierto',
        notas: action.payload.notas,
      }
      return { ...state, turnos: [...state.turnos, nuevo] }
    }

    case 'CERRAR_TURNO': {
      const { turnoId, montoCierreDeclarado, montoEsperado, diferencia, usuarioCierreId, notas } = action.payload
      return {
        ...state,
        turnos: state.turnos.map((t) =>
          t.id === turnoId
            ? {
                ...t,
                estado: 'cerrado' as const,
                fechaCierre: nowISO(),
                montoCierreDeclarado,
                montoEsperado,
                diferencia,
                usuarioCierreId,
                notas: notas ?? t.notas,
              }
            : t,
        ),
      }
    }

    default:
      return state
  }
}

// ─── Mapeo dominio -> filas de Supabase ───────────────────────

function turnoToRow(t: TurnoCaja, clienteId: string) {
  return {
    id: t.id,
    cliente_id: clienteId,
    usuario_apertura_id: t.usuarioAperturaId ?? null,
    fecha_apertura: t.fechaApertura,
    monto_apertura: t.montoApertura,
    usuario_cierre_id: t.usuarioCierreId ?? null,
    fecha_cierre: t.fechaCierre ?? null,
    monto_cierre_declarado: t.montoCierreDeclarado ?? null,
    monto_esperado: t.montoEsperado ?? null,
    diferencia: t.diferencia ?? null,
    estado: t.estado,
    notas: t.notas ?? null,
  }
}

function logErr(label: string) {
  return ({ error }: { error: unknown }) => error && console.error(`Caja por turno · error en ${label}:`, error)
}

function syncToSupabase(action: Action, nextState: CajaTurnoState, clienteId: string) {
  switch (action.type) {
    case 'ABRIR_TURNO': {
      const t = nextState.turnos[nextState.turnos.length - 1]
      supabase.from('turnos_caja').insert(turnoToRow(t, clienteId)).then(logErr('apertura de turno'))
      return
    }
    case 'CERRAR_TURNO': {
      const t = nextState.turnos.find((x) => x.id === action.payload.turnoId)
      if (!t) return
      supabase
        .from('turnos_caja')
        .update({
          estado: t.estado,
          fecha_cierre: t.fechaCierre,
          monto_cierre_declarado: t.montoCierreDeclarado,
          monto_esperado: t.montoEsperado,
          diferencia: t.diferencia,
          usuario_cierre_id: t.usuarioCierreId ?? null,
          notas: t.notas ?? null,
        })
        .eq('id', t.id)
        .then(logErr('cierre de turno'))
      return
    }
    default:
      return
  }
}

// ─── Fetch inicial desde Supabase ──────────────────────────────

async function fetchCajaTurnoState(): Promise<CajaTurnoState> {
  const { data } = await supabase
    .from('turnos_caja')
    .select('*, usuario_apertura:usuarios_cliente!turnos_caja_usuario_apertura_id_fkey(nombre,email), usuario_cierre:usuarios_cliente!turnos_caja_usuario_cierre_id_fkey(nombre,email)')
    .order('fecha_apertura', { ascending: false })

  const turnos: TurnoCaja[] = (data ?? []).map((r: any) => ({
    id: r.id,
    usuarioAperturaId: r.usuario_apertura_id ?? undefined,
    usuarioAperturaNombre: r.usuario_apertura?.nombre ?? r.usuario_apertura?.email ?? undefined,
    fechaApertura: r.fecha_apertura,
    montoApertura: Number(r.monto_apertura),
    usuarioCierreId: r.usuario_cierre_id ?? undefined,
    usuarioCierreNombre: r.usuario_cierre?.nombre ?? r.usuario_cierre?.email ?? undefined,
    fechaCierre: r.fecha_cierre ?? undefined,
    montoCierreDeclarado: r.monto_cierre_declarado != null ? Number(r.monto_cierre_declarado) : undefined,
    montoEsperado: r.monto_esperado != null ? Number(r.monto_esperado) : undefined,
    diferencia: r.diferencia != null ? Number(r.diferencia) : undefined,
    estado: r.estado,
    notas: r.notas ?? undefined,
  }))

  return { turnos }
}

// ─── Context ───────────────────────────────────────────────────

interface ContextValue {
  state: CajaTurnoState
  dispatch: React.Dispatch<Action>
}

const Ctx = createContext<ContextValue | null>(null)

export function CajaTurnoProvider({ children }: { children: ReactNode }) {
  const { cliente } = useClienteActual()
  const [state, rawDispatch] = useReducer(reducer, seedState)

  useEffect(() => {
    let activo = true
    if (!cliente?.id) return
    fetchCajaTurnoState().then((data) => {
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

export function useCajaTurno() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCajaTurno debe usarse dentro de CajaTurnoProvider')
  return ctx
}

/** El turno abierto ahora mismo, si hay uno. Solo puede haber uno por vez. */
export function useTurnoAbierto(): TurnoCaja | undefined {
  const { state } = useCajaTurno()
  return useMemo(() => state.turnos.find((t) => t.estado === 'abierto'), [state.turnos])
}

export function useHistorialTurnos(): TurnoCaja[] {
  const { state } = useCajaTurno()
  return state.turnos
}

export type { Action as CajaTurnoAction }
