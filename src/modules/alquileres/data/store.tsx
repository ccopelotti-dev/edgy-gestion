// ============================================================
// Módulo Alquileres — State Management
// Edgy Gestión · Context + useReducer + Supabase
//
// Mismo patrón que Servicios/Productos y Stock: reducer que actualiza el
// estado local al toque (UI optimista) y en paralelo dispara la
// sincronización contra Supabase (edgy_gestion.alquileres_*, ver
// migración 0148_fase82b_esquema_alquileres.sql). `monto_total` de un
// Pago es una columna GENERADA en la base -- nunca se manda en un
// insert/update, se recalcula localmente solo para que la UI muestre
// algo razonable antes de la próxima recarga.
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
  AlquileresState,
  Propietario,
  Propiedad,
  Unidad,
  Inquilino,
  Garante,
  Pago,
  DatosBancariosPago,
} from '../types'
import { seedState } from './seed'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import { todayISO } from '../lib/format'

function uid(): string {
  return crypto.randomUUID()
}

// ─── Acciones ───────────────────────────────────────────────

type Action =
  | { type: 'ADD_PROPIETARIO'; payload: Omit<Propietario, 'id' | 'createdAt'> }
  | { type: 'UPDATE_PROPIETARIO'; payload: Propietario }
  | { type: 'DELETE_PROPIETARIO'; payload: string }
  | { type: 'ADD_PROPIEDAD'; payload: Omit<Propiedad, 'id' | 'createdAt'> }
  | { type: 'UPDATE_PROPIEDAD'; payload: Propiedad }
  | { type: 'DELETE_PROPIEDAD'; payload: string }
  | { type: 'ADD_UNIDAD'; payload: Omit<Unidad, 'id' | 'createdAt'> }
  | { type: 'UPDATE_UNIDAD'; payload: Unidad }
  | { type: 'DELETE_UNIDAD'; payload: string }
  | { type: 'ADD_INQUILINO'; payload: Omit<Inquilino, 'id' | 'createdAt'> }
  | { type: 'UPDATE_INQUILINO'; payload: Inquilino }
  | { type: 'DELETE_INQUILINO'; payload: string }
  | { type: 'ADD_PAGO'; payload: Omit<Pago, 'id' | 'createdAt' | 'montoTotal'> }
  | { type: 'UPDATE_PAGO'; payload: Omit<Pago, 'montoTotal'> }
  | { type: 'DELETE_PAGO'; payload: string }
  | { type: 'RESET' }
  | { type: 'SET_STATE'; payload: AlquileresState }

function sumaPago(p: { montoAlquiler: number; montoTasas: number; montoExpensas: number; montoOtros: number }) {
  return p.montoAlquiler + p.montoTasas + p.montoExpensas + p.montoOtros
}

// ─── Reducer ────────────────────────────────────────────────

function reducer(state: AlquileresState, action: Action): AlquileresState {
  switch (action.type) {
    case 'SET_STATE':
      return action.payload

    // ── Propietarios ──────────────────────────────────────────
    case 'ADD_PROPIETARIO': {
      const nuevo: Propietario = { ...action.payload, id: uid(), createdAt: todayISO() }
      return { ...state, propietarios: [...state.propietarios, nuevo] }
    }
    case 'UPDATE_PROPIETARIO':
      return {
        ...state,
        propietarios: state.propietarios.map((p) => (p.id === action.payload.id ? action.payload : p)),
      }
    case 'DELETE_PROPIETARIO':
      return { ...state, propietarios: state.propietarios.filter((p) => p.id !== action.payload) }

    // ── Propiedades ───────────────────────────────────────────
    case 'ADD_PROPIEDAD': {
      const nueva: Propiedad = { ...action.payload, id: uid(), createdAt: todayISO() }
      return { ...state, propiedades: [...state.propiedades, nueva] }
    }
    case 'UPDATE_PROPIEDAD':
      return {
        ...state,
        propiedades: state.propiedades.map((p) => (p.id === action.payload.id ? action.payload : p)),
      }
    case 'DELETE_PROPIEDAD':
      return {
        ...state,
        propiedades: state.propiedades.filter((p) => p.id !== action.payload),
        // La base cascadea unidades al borrar una propiedad (ver
        // alquileres_unidades_propiedad_id_fkey ON DELETE CASCADE) -- se
        // refleja igual acá para que la UI no quede desincronizada.
        unidades: state.unidades.filter((u) => u.propiedadId !== action.payload),
      }

    // ── Unidades ──────────────────────────────────────────────
    case 'ADD_UNIDAD': {
      const nueva: Unidad = { ...action.payload, id: uid(), createdAt: todayISO() }
      return { ...state, unidades: [...state.unidades, nueva] }
    }
    case 'UPDATE_UNIDAD':
      return {
        ...state,
        unidades: state.unidades.map((u) => (u.id === action.payload.id ? action.payload : u)),
      }
    case 'DELETE_UNIDAD':
      return { ...state, unidades: state.unidades.filter((u) => u.id !== action.payload) }

    // ── Inquilinos ──────────────────────────────────────────────
    case 'ADD_INQUILINO': {
      const nuevo: Inquilino = { ...action.payload, id: uid(), createdAt: todayISO() }
      return { ...state, inquilinos: [...state.inquilinos, nuevo] }
    }
    case 'UPDATE_INQUILINO':
      return {
        ...state,
        inquilinos: state.inquilinos.map((i) => (i.id === action.payload.id ? action.payload : i)),
      }
    case 'DELETE_INQUILINO':
      return { ...state, inquilinos: state.inquilinos.filter((i) => i.id !== action.payload) }

    // ── Pagos ─────────────────────────────────────────────────
    case 'ADD_PAGO': {
      const nuevo: Pago = { ...action.payload, id: uid(), createdAt: todayISO(), montoTotal: sumaPago(action.payload) }
      return { ...state, pagos: [...state.pagos, nuevo] }
    }
    case 'UPDATE_PAGO': {
      const actualizado: Pago = { ...action.payload, montoTotal: sumaPago(action.payload) }
      return { ...state, pagos: state.pagos.map((p) => (p.id === actualizado.id ? actualizado : p)) }
    }
    case 'DELETE_PAGO':
      return { ...state, pagos: state.pagos.filter((p) => p.id !== action.payload) }

    case 'RESET':
      // Igual que en Servicios/Productos y Stock: NO borra datos reales
      // en Supabase, solo vuelve al estado vacío de fábrica en memoria
      // (la próxima carga lo vuelve a traer de la base).
      return seedState

    default:
      return state
  }
}

// ─── Mapeo dominio -> filas de Supabase ───────────────────────

function propietarioToRow(p: Propietario, clienteId: string) {
  return {
    id: p.id,
    cliente_id: clienteId,
    nombre_completo: p.nombreCompleto,
    documento: p.documento,
    telefono: p.telefono,
    email: p.email || null,
    direccion: p.direccion || null,
    comision_porcentaje: p.comisionPorcentaje,
    firma_path: p.firmaPath || null,
  }
}

function propiedadToRow(p: Propiedad, clienteId: string) {
  return {
    id: p.id,
    cliente_id: clienteId,
    propietario_id: p.propietarioId,
    nombre: p.nombre,
    direccion: p.direccion || null,
  }
}

function unidadToRow(u: Unidad, clienteId: string) {
  return {
    id: u.id,
    cliente_id: clienteId,
    propiedad_id: u.propiedadId,
    nombre: u.nombre,
    tipo: u.tipo,
    ambientes: u.ambientes ?? null,
    superficie_m2: u.superficieM2 ?? null,
    extras: u.extras || null,
    estado: u.estado,
  }
}

function inquilinoToRow(i: Inquilino, clienteId: string) {
  return {
    id: i.id,
    cliente_id: clienteId,
    unidad_id: i.unidadId,
    nombre: i.nombre,
    apellido: i.apellido,
    documento: i.documento || null,
    direccion: i.direccion || null,
    ciudad: i.ciudad || null,
    provincia: i.provincia || null,
    codigo_postal: i.codigoPostal || null,
    telefono: i.telefono || null,
    email: i.email || null,
    monto_alquiler: i.montoAlquiler,
    inicio_contrato: i.inicioContrato || null,
    fin_contrato: i.finContrato || null,
    monto_deposito: i.montoDeposito,
    frecuencia_ajuste: i.frecuenciaAjuste || null,
    garantes: i.garantes ?? [],
    notas: i.notas || null,
  }
}

function pagoToRow(p: Omit<Pago, 'montoTotal'>, clienteId: string) {
  // OJO: monto_total NO va acá -- es columna generada en la base.
  return {
    id: p.id,
    cliente_id: clienteId,
    inquilino_id: p.inquilinoId,
    unidad_id: p.unidadId || null,
    propietario_id: p.propietarioId || null,
    fecha: p.fecha,
    concepto: p.concepto || null,
    forma_pago: p.formaPago || null,
    monto_alquiler: p.montoAlquiler,
    monto_tasas: p.montoTasas,
    monto_expensas: p.montoExpensas,
    monto_otros: p.montoOtros,
    comision_porcentaje_aplicado: p.comisionPorcentajeAplicado ?? null,
    comision_admin: p.comisionAdmin ?? null,
    saldo_propietario: p.saldoPropietario ?? null,
    periodo_fechas: p.periodoFechas ?? [],
    datos_bancarios: p.datosBancarios ?? null,
    comprobante_path: p.comprobantePath || null,
    numero_recibo: p.numeroRecibo || null,
    firmado_por: p.firmadoPor || null,
    notas: p.notas || null,
  }
}

function logErr(label: string) {
  return ({ error }: { error: unknown }) => error && console.error(`Alquileres · error en ${label}:`, error)
}

// ─── Sincronización con Supabase por acción ────────────────────

function syncToSupabase(action: Action, nextState: AlquileresState, clienteId: string) {
  switch (action.type) {
    case 'ADD_PROPIETARIO': {
      const p = nextState.propietarios[nextState.propietarios.length - 1]
      supabase.from('alquileres_propietarios').insert(propietarioToRow(p, clienteId)).then(logErr('alta de propietario'))
      return
    }
    case 'UPDATE_PROPIETARIO':
      supabase
        .from('alquileres_propietarios')
        .update(propietarioToRow(action.payload, clienteId))
        .eq('id', action.payload.id)
        .then(logErr('edición de propietario'))
      return
    case 'DELETE_PROPIETARIO':
      supabase.from('alquileres_propietarios').delete().eq('id', action.payload).then(logErr('borrado de propietario'))
      return

    case 'ADD_PROPIEDAD': {
      const p = nextState.propiedades[nextState.propiedades.length - 1]
      supabase.from('alquileres_propiedades').insert(propiedadToRow(p, clienteId)).then(logErr('alta de propiedad'))
      return
    }
    case 'UPDATE_PROPIEDAD':
      supabase
        .from('alquileres_propiedades')
        .update(propiedadToRow(action.payload, clienteId))
        .eq('id', action.payload.id)
        .then(logErr('edición de propiedad'))
      return
    case 'DELETE_PROPIEDAD':
      supabase.from('alquileres_propiedades').delete().eq('id', action.payload).then(logErr('borrado de propiedad'))
      return

    case 'ADD_UNIDAD': {
      const u = nextState.unidades[nextState.unidades.length - 1]
      supabase.from('alquileres_unidades').insert(unidadToRow(u, clienteId)).then(logErr('alta de unidad'))
      return
    }
    case 'UPDATE_UNIDAD':
      supabase
        .from('alquileres_unidades')
        .update(unidadToRow(action.payload, clienteId))
        .eq('id', action.payload.id)
        .then(logErr('edición de unidad'))
      return
    case 'DELETE_UNIDAD':
      supabase.from('alquileres_unidades').delete().eq('id', action.payload).then(logErr('borrado de unidad'))
      return

    case 'ADD_INQUILINO': {
      const i = nextState.inquilinos[nextState.inquilinos.length - 1]
      supabase.from('alquileres_inquilinos').insert(inquilinoToRow(i, clienteId)).then(logErr('alta de inquilino'))
      return
    }
    case 'UPDATE_INQUILINO':
      supabase
        .from('alquileres_inquilinos')
        .update(inquilinoToRow(action.payload, clienteId))
        .eq('id', action.payload.id)
        .then(logErr('edición de inquilino'))
      return
    case 'DELETE_INQUILINO':
      supabase.from('alquileres_inquilinos').delete().eq('id', action.payload).then(logErr('borrado de inquilino'))
      return

    case 'ADD_PAGO': {
      const p = nextState.pagos[nextState.pagos.length - 1]
      supabase.from('alquileres_pagos').insert(pagoToRow(p, clienteId)).then(logErr('alta de pago'))
      return
    }
    case 'UPDATE_PAGO':
      supabase
        .from('alquileres_pagos')
        .update(pagoToRow(action.payload, clienteId))
        .eq('id', action.payload.id)
        .then(logErr('edición de pago'))
      return
    case 'DELETE_PAGO':
      supabase.from('alquileres_pagos').delete().eq('id', action.payload).then(logErr('borrado de pago'))
      return

    default:
      return
  }
}

// ─── Fetch inicial desde Supabase ──────────────────────────────

async function fetchAlquileresState(): Promise<AlquileresState> {
  const [propietariosRes, propiedadesRes, unidadesRes, inquilinosRes, pagosRes] = await Promise.all([
    supabase.from('alquileres_propietarios').select('*').order('nombre_completo'),
    supabase.from('alquileres_propiedades').select('*').order('nombre'),
    supabase.from('alquileres_unidades').select('*').order('nombre'),
    supabase.from('alquileres_inquilinos').select('*').order('apellido'),
    supabase.from('alquileres_pagos').select('*').order('fecha', { ascending: false }),
  ])

  const propietarios: Propietario[] = (propietariosRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombreCompleto: r.nombre_completo,
    documento: r.documento,
    telefono: r.telefono,
    email: r.email ?? undefined,
    direccion: r.direccion ?? undefined,
    comisionPorcentaje: Number(r.comision_porcentaje),
    firmaPath: r.firma_path ?? undefined,
    createdAt: (r.created_at ?? '').slice(0, 10),
  }))

  const propiedades: Propiedad[] = (propiedadesRes.data ?? []).map((r: any) => ({
    id: r.id,
    propietarioId: r.propietario_id,
    nombre: r.nombre,
    direccion: r.direccion ?? undefined,
    createdAt: (r.created_at ?? '').slice(0, 10),
  }))

  const unidades: Unidad[] = (unidadesRes.data ?? []).map((r: any) => ({
    id: r.id,
    propiedadId: r.propiedad_id,
    nombre: r.nombre,
    tipo: r.tipo,
    ambientes: r.ambientes ?? undefined,
    superficieM2: r.superficie_m2 != null ? Number(r.superficie_m2) : undefined,
    extras: r.extras ?? undefined,
    estado: r.estado,
    createdAt: (r.created_at ?? '').slice(0, 10),
  }))

  const inquilinos: Inquilino[] = (inquilinosRes.data ?? []).map((r: any) => ({
    id: r.id,
    unidadId: r.unidad_id,
    nombre: r.nombre,
    apellido: r.apellido,
    documento: r.documento ?? undefined,
    direccion: r.direccion ?? undefined,
    ciudad: r.ciudad ?? undefined,
    provincia: r.provincia ?? undefined,
    codigoPostal: r.codigo_postal ?? undefined,
    telefono: r.telefono ?? undefined,
    email: r.email ?? undefined,
    montoAlquiler: Number(r.monto_alquiler),
    inicioContrato: r.inicio_contrato ?? undefined,
    finContrato: r.fin_contrato ?? undefined,
    montoDeposito: Number(r.monto_deposito),
    frecuenciaAjuste: r.frecuencia_ajuste ?? undefined,
    garantes: (r.garantes ?? []) as Garante[],
    notas: r.notas ?? undefined,
    createdAt: (r.created_at ?? '').slice(0, 10),
  }))

  const pagos: Pago[] = (pagosRes.data ?? []).map((r: any) => ({
    id: r.id,
    inquilinoId: r.inquilino_id,
    unidadId: r.unidad_id ?? undefined,
    propietarioId: r.propietario_id ?? undefined,
    fecha: r.fecha,
    concepto: r.concepto ?? undefined,
    formaPago: r.forma_pago ?? undefined,
    montoAlquiler: Number(r.monto_alquiler),
    montoTasas: Number(r.monto_tasas),
    montoExpensas: Number(r.monto_expensas),
    montoOtros: Number(r.monto_otros),
    montoTotal: Number(r.monto_total),
    comisionPorcentajeAplicado: r.comision_porcentaje_aplicado != null ? Number(r.comision_porcentaje_aplicado) : undefined,
    comisionAdmin: r.comision_admin != null ? Number(r.comision_admin) : undefined,
    saldoPropietario: r.saldo_propietario != null ? Number(r.saldo_propietario) : undefined,
    periodoFechas: (r.periodo_fechas ?? []) as string[],
    datosBancarios: (r.datos_bancarios ?? undefined) as DatosBancariosPago | undefined,
    comprobantePath: r.comprobante_path ?? undefined,
    numeroRecibo: r.numero_recibo ?? undefined,
    firmadoPor: r.firmado_por ?? undefined,
    notas: r.notas ?? undefined,
    createdAt: (r.created_at ?? '').slice(0, 10),
  }))

  return { propietarios, propiedades, unidades, inquilinos, pagos }
}

// ─── Context ───────────────────────────────────────────────────

interface ContextValue {
  state: AlquileresState
  dispatch: React.Dispatch<Action>
}

const Ctx = createContext<ContextValue | null>(null)

// ─── Provider ────────────────────────────────────────────────

export function AlquileresProvider({ children }: { children: ReactNode }) {
  const { cliente } = useClienteActual()
  const [state, rawDispatch] = useReducer(reducer, seedState)

  useEffect(() => {
    let activo = true
    if (!cliente?.id) return
    fetchAlquileresState().then((data) => {
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

// ─── Hook base ───────────────────────────────────────────────

export function useAlquileres() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAlquileres debe usarse dentro de AlquileresProvider')
  return ctx
}

// ─── Hooks derivados ─────────────────────────────────────────

export function useUnidadesDePropiedad(propiedadId?: string) {
  const { state } = useAlquileres()
  return useMemo(
    () => (propiedadId ? state.unidades.filter((u) => u.propiedadId === propiedadId) : state.unidades),
    [state.unidades, propiedadId],
  )
}

export function usePropiedadesDePropietario(propietarioId?: string) {
  const { state } = useAlquileres()
  return useMemo(
    () => (propietarioId ? state.propiedades.filter((p) => p.propietarioId === propietarioId) : state.propiedades),
    [state.propiedades, propietarioId],
  )
}

/** Inquilino activo de una unidad (asume un contrato vigente por unidad --
 * si hubiera historial de contratos vencidos, es el último cargado). */
export function useInquilinoDeUnidad(unidadId: string) {
  const { state } = useAlquileres()
  return useMemo(() => state.inquilinos.find((i) => i.unidadId === unidadId), [state.inquilinos, unidadId])
}
