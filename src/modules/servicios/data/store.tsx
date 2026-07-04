// ============================================================
// Módulo Servicios — State Management
// Edgy Gestión · Context + useReducer + Supabase (antes localStorage)
//
// Mismo patrón que Productos y Stock: reducer original sin tocar
// (uid() ahora genera UUIDs reales), sincronizado contra Supabase
// comparando estado antes/después. Acá las tablas servicios,
// servicio_variantes, rubros_servicio y sub_rubros_servicio YA
// EXISTÍAN en Supabase (verificado por consulta directa) — nunca
// se habían usado porque el store seguía en localStorage.
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
  ServiciosState,
  Servicio,
  VarianteServicio,
  RubroServicio,
  SubRubroServicio,
} from '../types'
import { seedState } from './seed'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'

// ─── Helpers de id ──────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID()
}

// ─── Acciones (idénticas a la versión anterior) ────────────

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
  | { type: 'SET_STATE'; payload: ServiciosState }

// ─── Reducer (copia EXACTA del original, más SET_STATE) ────

function reducer(state: ServiciosState, action: Action): ServiciosState {
  switch (action.type) {
    case 'SET_STATE':
      return action.payload

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
      // Igual que en Productos y Stock: ya NO borra datos reales en
      // Supabase. Solo vuelve al estado vacío de fábrica en memoria.
      return seedState

    default:
      return state
  }
}

// ─── Mapeo dominio -> filas de Supabase ───────────────────────

function servicioToRow(s: Servicio, clienteId: string) {
  return {
    id: s.id,
    cliente_id: clienteId,
    titulo: s.titulo,
    descripcion: s.descripcion,
    rubro_id: s.rubroId,
    sub_rubro_id: s.subRubroId || null,
    tipo: s.tipo,
    estado: s.estado,
    imagen_url: s.imagenUrl || null,
    modalidad_precio: s.modalidadPrecio || null,
    precio: s.precio ?? null,
    duracion_estimada_min: s.duracionEstimadaMin ?? null,
  }
}

function varianteToRow(v: VarianteServicio, servicioId: string, orden: number) {
  return {
    id: v.id,
    servicio_id: servicioId,
    nombre: v.nombre,
    modalidad_precio: v.modalidadPrecio,
    precio: v.precio ?? null,
    duracion_estimada_min: v.duracionEstimadaMin ?? null,
    orden,
  }
}

function rubroServicioToRow(r: RubroServicio, clienteId: string) {
  return { id: r.id, cliente_id: clienteId, nombre: r.nombre }
}

function subRubroServicioToRow(sr: SubRubroServicio) {
  return { id: sr.id, rubro_id: sr.rubroId, nombre: sr.nombre }
}

function logErr(label: string) {
  return ({ error }: { error: unknown }) => error && console.error(`Servicios · error en ${label}:`, error)
}

function syncVariantes(servicioId: string, variantes: VarianteServicio[]) {
  supabase.from('servicio_variantes').delete().eq('servicio_id', servicioId).then(() => {
    if (variantes.length) {
      supabase
        .from('servicio_variantes')
        .insert(variantes.map((v, idx) => varianteToRow(v, servicioId, idx)))
        .then(logErr('variantes de servicio'))
    }
  })
}

// ─── Sincronización con Supabase por acción ────────────────────

function syncToSupabase(action: Action, nextState: ServiciosState, clienteId: string) {
  switch (action.type) {
    case 'ADD_SERVICIO': {
      const s = nextState.servicios[nextState.servicios.length - 1]
      supabase.from('servicios').insert(servicioToRow(s, clienteId)).then(logErr('alta de servicio'))
      if (s.tipo === 'con_variantes' && s.variantes.length) {
        supabase
          .from('servicio_variantes')
          .insert(s.variantes.map((v, idx) => varianteToRow(v, s.id, idx)))
          .then(logErr('variantes de servicio'))
      }
      return
    }
    case 'UPDATE_SERVICIO': {
      const s = action.payload
      supabase.from('servicios').update(servicioToRow(s, clienteId)).eq('id', s.id).then(logErr('edición de servicio'))
      syncVariantes(s.id, s.tipo === 'con_variantes' ? s.variantes : [])
      return
    }
    case 'DELETE_SERVICIO':
      supabase.from('servicio_variantes').delete().eq('servicio_id', action.payload).then(() => {
        supabase.from('servicios').delete().eq('id', action.payload).then(logErr('borrado de servicio'))
      })
      return

    case 'ADD_RUBRO': {
      const r = nextState.rubros[nextState.rubros.length - 1]
      supabase.from('rubros_servicio').insert(rubroServicioToRow(r, clienteId)).then(logErr('alta de rubro'))
      return
    }
    case 'UPDATE_RUBRO':
      supabase.from('rubros_servicio').update(rubroServicioToRow(action.payload, clienteId)).eq('id', action.payload.id).then(logErr('edición de rubro'))
      return
    case 'DELETE_RUBRO':
      supabase.from('sub_rubros_servicio').delete().eq('rubro_id', action.payload).then(() => {
        supabase.from('rubros_servicio').delete().eq('id', action.payload).then(logErr('borrado de rubro'))
      })
      return

    case 'ADD_SUBRUBRO': {
      const sr = nextState.subRubros[nextState.subRubros.length - 1]
      supabase.from('sub_rubros_servicio').insert(subRubroServicioToRow(sr)).then(logErr('alta de sub-rubro'))
      return
    }
    case 'UPDATE_SUBRUBRO':
      supabase.from('sub_rubros_servicio').update(subRubroServicioToRow(action.payload)).eq('id', action.payload.id).then(logErr('edición de sub-rubro'))
      return
    case 'DELETE_SUBRUBRO':
      supabase.from('sub_rubros_servicio').delete().eq('id', action.payload).then(logErr('borrado de sub-rubro'))
      return

    default:
      return
  }
}

// ─── Fetch inicial desde Supabase ──────────────────────────────

async function fetchServiciosState(): Promise<ServiciosState> {
  const [serviciosRes, variantesRes, rubrosRes, subRubrosRes] = await Promise.all([
    supabase.from('servicios').select('*').order('created_at'),
    supabase.from('servicio_variantes').select('*').order('orden'),
    supabase.from('rubros_servicio').select('*').order('created_at'),
    supabase.from('sub_rubros_servicio').select('*').order('created_at'),
  ])

  const variantesByServicio = new Map<string, VarianteServicio[]>()
  for (const r of variantesRes.data ?? []) {
    const arr = variantesByServicio.get(r.servicio_id) ?? []
    arr.push({
      id: r.id,
      nombre: r.nombre,
      modalidadPrecio: r.modalidad_precio,
      precio: r.precio != null ? Number(r.precio) : undefined,
      duracionEstimadaMin: r.duracion_estimada_min ?? undefined,
    })
    variantesByServicio.set(r.servicio_id, arr)
  }

  const servicios: Servicio[] = (serviciosRes.data ?? []).map((r: any) => ({
    id: r.id,
    titulo: r.titulo,
    descripcion: r.descripcion ?? '',
    rubroId: r.rubro_id,
    subRubroId: r.sub_rubro_id ?? undefined,
    tipo: r.tipo,
    estado: r.estado,
    imagenUrl: r.imagen_url ?? undefined,
    modalidadPrecio: r.modalidad_precio ?? undefined,
    precio: r.precio != null ? Number(r.precio) : undefined,
    duracionEstimadaMin: r.duracion_estimada_min ?? undefined,
    variantes: variantesByServicio.get(r.id) ?? [],
    createdAt: (r.created_at ?? '').slice(0, 10),
  }))

  const rubros: RubroServicio[] = (rubrosRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
  }))

  const subRubros: SubRubroServicio[] = (subRubrosRes.data ?? []).map((r: any) => ({
    id: r.id,
    rubroId: r.rubro_id,
    nombre: r.nombre,
  }))

  return { servicios, rubros, subRubros }
}

// ─── Context ───────────────────────────────────────────────────────────────────

interface ContextValue {
  state: ServiciosState
  dispatch: React.Dispatch<Action>
}

const Ctx = createContext<ContextValue | null>(null)

// ─── Provider ──────────────────────────────────────────────────────────────────

export function ServiciosProvider({ children }: { children: ReactNode }) {
  const { cliente } = useClienteActual()
  const [state, rawDispatch] = useReducer(reducer, seedState)

  useEffect(() => {
    let activo = true
    if (!cliente?.id) return
    fetchServiciosState().then((data) => {
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
      if (cliente?.id && action.type !== 'RESET') {
        syncToSupabase(action, nextState, cliente.id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cliente?.id])

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// ─── Hook base ─────────────────────────────────────────────────────────────────

export function useServicios() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useServicios debe usarse dentro de ServiciosProvider')
  return ctx
}

// ─── Hooks derivados (idénticos a la versión anterior) ────────────────────────

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
