// ============================================================
// Módulo Comandas y cocina — State Management
// Edgy Gestión · Context + useReducer + Supabase
//
// Este módulo escribe en dos tablas que no son suyas cuando cambia el
// ciclo de vida de una comanda: `mesas.estado` y `mesas.comanda_actual_id`
// (abrir comanda -> mesa ocupada; pasar a cobro -> mesa en cobro; cerrar
// o cancelar -> mesa libre otra vez). La política RLS de `mesas` ya
// contempla este caso (permiso de escritura de comandas-cocina, además
// del propio de mesas-salon) — ver 0018_gastronomico_nucleo.sql.
//
// CERRAR_COMANDA recibe `comprobanteId` ya resuelto: crear el
// Comprobante real de Ventas (con origenModulo:'comandas-cocina',
// origenId: comanda.id) pasa por el dispatch de Ventas, afuera de este
// store, antes de despachar CERRAR_COMANDA acá — mismo criterio que
// Ventas/Compras resolviendo `numero` antes de llegar al reducer.
//
// ASIGNAR_CLIENTE (Fase 7a): vincula la comanda a un cliente registrado
// de Ventas (clientes_venta), opcional. Sin esto, la comanda sigue
// facturando a "Consumidor Final" -- elegir un cliente habilita cobrar
// a cuenta corriente (ver cerrarComandaComoVenta.ts).
// ============================================================

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import type { ComandasCocinaState, Comanda, ComandaItem, EstadoCocina } from '../types'
import { seedState } from './seed'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import { nowISO } from '../lib/format'

function uid(): string {
  return crypto.randomUUID()
}

function recalcularTotales(items: ComandaItem[]) {
  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0)
  return { subtotal, total: subtotal }
}

type Action =
  | { type: 'ABRIR_COMANDA'; payload: { mesaId: string; turnoId: string; mozoUsuarioId?: string } }
  | {
      type: 'AGREGAR_ITEM'
      payload: {
        comandaId: string
        productoId?: string
        /** Fase 19.2: alternativa a productoId -- ver ComandaItem.comboId. */
        comboId?: string
        descripcion: string
        cantidad: number
        precioUnitario: number
        nota?: string
      }
    }
  | { type: 'ACTUALIZAR_CANTIDAD_ITEM'; payload: { comandaId: string; itemId: string; cantidad: number } }
  | { type: 'QUITAR_ITEM'; payload: { comandaId: string; itemId: string } }
  | { type: 'ACTUALIZAR_ESTADO_ITEM'; payload: { comandaId: string; itemId: string; estadoCocina: EstadoCocina } }
  | {
      type: 'ASIGNAR_CLIENTE'
      payload: { comandaId: string; clienteVentaId?: string; clienteVentaNombre?: string }
    }
  | { type: 'PASAR_A_COBRO'; payload: { comandaId: string } }
  | { type: 'CERRAR_COMANDA'; payload: { comandaId: string; comprobanteId?: string } }
  | { type: 'CANCELAR_COMANDA'; payload: { comandaId: string } }
  // Fase 13a: el traslado ya se persistió (mesa origen liberada, mesa
  // destino ocupada, comanda.mesa_id actualizado) vía el RPC
  // `trasladar_comanda` ANTES de despachar esto -- mismo criterio que
  // CERRAR_COMANDA con comprobanteId ya resuelto. Este action solo
  // actualiza el estado local, no dispara ningún sync adicional.
  | { type: 'TRASLADAR_COMANDA'; payload: { comandaId: string; mesaDestinoId: string } }
  | { type: 'SET_STATE'; payload: ComandasCocinaState }

function reducer(state: ComandasCocinaState, action: Action): ComandasCocinaState {
  switch (action.type) {
    case 'SET_STATE':
      return action.payload

    case 'ABRIR_COMANDA': {
      const nueva: Comanda = {
        id: uid(),
        mesaId: action.payload.mesaId,
        turnoId: action.payload.turnoId,
        mozoUsuarioId: action.payload.mozoUsuarioId,
        estado: 'abierta',
        fechaApertura: nowISO(),
        subtotal: 0,
        total: 0,
        items: [],
      }
      return { ...state, comandas: [...state.comandas, nueva] }
    }

    case 'AGREGAR_ITEM': {
      const { comandaId, productoId, comboId, descripcion, cantidad, precioUnitario, nota } = action.payload
      const nuevoItem: ComandaItem = {
        id: uid(),
        comandaId,
        productoId,
        comboId,
        descripcion,
        cantidad,
        precioUnitario,
        subtotal: cantidad * precioUnitario,
        estadoCocina: 'pendiente',
        nota,
      }
      return {
        ...state,
        comandas: state.comandas.map((c) => {
          if (c.id !== comandaId) return c
          const items = [...c.items, nuevoItem]
          return { ...c, items, ...recalcularTotales(items) }
        }),
      }
    }

    case 'ACTUALIZAR_CANTIDAD_ITEM': {
      const { comandaId, itemId, cantidad } = action.payload
      return {
        ...state,
        comandas: state.comandas.map((c) => {
          if (c.id !== comandaId) return c
          const items = c.items.map((i) =>
            i.id === itemId ? { ...i, cantidad, subtotal: cantidad * i.precioUnitario } : i,
          )
          return { ...c, items, ...recalcularTotales(items) }
        }),
      }
    }

    case 'QUITAR_ITEM': {
      const { comandaId, itemId } = action.payload
      return {
        ...state,
        comandas: state.comandas.map((c) => {
          if (c.id !== comandaId) return c
          const items = c.items.filter((i) => i.id !== itemId)
          return { ...c, items, ...recalcularTotales(items) }
        }),
      }
    }

    case 'ACTUALIZAR_ESTADO_ITEM': {
      const { comandaId, itemId, estadoCocina } = action.payload
      return {
        ...state,
        comandas: state.comandas.map((c) =>
          c.id !== comandaId
            ? c
            : { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, estadoCocina } : i)) },
        ),
      }
    }

    case 'ASIGNAR_CLIENTE': {
      const { comandaId, clienteVentaId, clienteVentaNombre } = action.payload
      return {
        ...state,
        comandas: state.comandas.map((c) =>
          c.id === comandaId ? { ...c, clienteVentaId, clienteVentaNombre } : c,
        ),
      }
    }

    case 'PASAR_A_COBRO':
      return {
        ...state,
        comandas: state.comandas.map((c) =>
          c.id === action.payload.comandaId ? { ...c, estado: 'cobro' as const } : c,
        ),
      }

    case 'CERRAR_COMANDA':
      return {
        ...state,
        comandas: state.comandas.map((c) =>
          c.id === action.payload.comandaId
            ? { ...c, estado: 'cerrada' as const, fechaCierre: nowISO(), comprobanteId: action.payload.comprobanteId }
            : c,
        ),
      }

    case 'CANCELAR_COMANDA':
      return {
        ...state,
        comandas: state.comandas.map((c) =>
          c.id === action.payload.comandaId ? { ...c, estado: 'cancelada' as const, fechaCierre: nowISO() } : c,
        ),
      }

    case 'TRASLADAR_COMANDA':
      return {
        ...state,
        comandas: state.comandas.map((c) =>
          c.id === action.payload.comandaId ? { ...c, mesaId: action.payload.mesaDestinoId } : c,
        ),
      }

    default:
      return state
  }
}

// ─── Mapeo dominio -> filas de Supabase ───────────────────────

function comandaToRow(c: Comanda, clienteId: string) {
  return {
    id: c.id,
    cliente_id: clienteId,
    mesa_id: c.mesaId,
    turno_id: c.turnoId,
    mozo_usuario_id: c.mozoUsuarioId ?? null,
    cliente_venta_id: c.clienteVentaId ?? null,
    estado: c.estado,
    fecha_apertura: c.fechaApertura,
    fecha_cierre: c.fechaCierre ?? null,
    subtotal: c.subtotal,
    total: c.total,
    comprobante_id: c.comprobanteId ?? null,
    notas: c.notas ?? null,
  }
}

function itemToRow(i: ComandaItem) {
  return {
    id: i.id,
    comanda_id: i.comandaId,
    producto_id: i.productoId ?? null,
    combo_id: i.comboId ?? null,
    descripcion: i.descripcion,
    cantidad: i.cantidad,
    precio_unitario: i.precioUnitario,
    subtotal: i.subtotal,
    estado_cocina: i.estadoCocina,
    nota: i.nota ?? null,
  }
}

function logErr(label: string) {
  return ({ error }: { error: unknown }) => error && console.error(`Comandas y cocina · error en ${label}:`, error)
}

// Cambia el estado visual de la mesa cuando cambia el ciclo de vida de
// su comanda — escribe directo en la tabla `mesas`, que no es de este
// módulo (ver nota de RLS arriba).
function actualizarEstadoMesa(mesaId: string, estado: string, comandaActualId: string | null) {
  supabase.from('mesas').update({ estado, comanda_actual_id: comandaActualId }).eq('id', mesaId).then(logErr('actualizar estado de mesa'))
}

function syncToSupabase(action: Action, nextState: ComandasCocinaState, clienteId: string) {
  switch (action.type) {
    case 'ABRIR_COMANDA': {
      const c = nextState.comandas[nextState.comandas.length - 1]
      supabase.from('comandas').insert(comandaToRow(c, clienteId)).then(logErr('apertura de comanda'))
      actualizarEstadoMesa(c.mesaId, 'ocupada', c.id)
      return
    }

    case 'AGREGAR_ITEM': {
      const c = nextState.comandas.find((x) => x.id === action.payload.comandaId)
      if (!c) return
      const item = c.items[c.items.length - 1]
      supabase.from('comanda_items').insert(itemToRow(item)).then(logErr('alta de ítem'))
      supabase.from('comandas').update({ subtotal: c.subtotal, total: c.total }).eq('id', c.id).then(logErr('actualizar total de comanda'))
      return
    }

    case 'ACTUALIZAR_CANTIDAD_ITEM': {
      const c = nextState.comandas.find((x) => x.id === action.payload.comandaId)
      if (!c) return
      const item = c.items.find((i) => i.id === action.payload.itemId)
      if (item) supabase.from('comanda_items').update({ cantidad: item.cantidad, subtotal: item.subtotal }).eq('id', item.id).then(logErr('editar cantidad de ítem'))
      supabase.from('comandas').update({ subtotal: c.subtotal, total: c.total }).eq('id', c.id).then(logErr('actualizar total de comanda'))
      return
    }

    case 'QUITAR_ITEM': {
      const c = nextState.comandas.find((x) => x.id === action.payload.comandaId)
      supabase.from('comanda_items').delete().eq('id', action.payload.itemId).then(logErr('borrado de ítem'))
      if (c) supabase.from('comandas').update({ subtotal: c.subtotal, total: c.total }).eq('id', c.id).then(logErr('actualizar total de comanda'))
      return
    }

    case 'ACTUALIZAR_ESTADO_ITEM':
      supabase.from('comanda_items').update({ estado_cocina: action.payload.estadoCocina }).eq('id', action.payload.itemId).then(logErr('estado de cocina de ítem'))
      return

    case 'ASIGNAR_CLIENTE':
      supabase
        .from('comandas')
        .update({ cliente_venta_id: action.payload.clienteVentaId ?? null })
        .eq('id', action.payload.comandaId)
        .then(logErr('asignar cliente a comanda'))
      return

    case 'PASAR_A_COBRO': {
      const c = nextState.comandas.find((x) => x.id === action.payload.comandaId)
      if (!c) return
      supabase.from('comandas').update({ estado: c.estado }).eq('id', c.id).then(logErr('pasar comanda a cobro'))
      actualizarEstadoMesa(c.mesaId, 'cobro', c.id)
      return
    }

    case 'CERRAR_COMANDA': {
      const c = nextState.comandas.find((x) => x.id === action.payload.comandaId)
      if (!c) return
      supabase
        .from('comandas')
        .update({ estado: c.estado, fecha_cierre: c.fechaCierre, comprobante_id: c.comprobanteId ?? null })
        .eq('id', c.id)
        .then(logErr('cierre de comanda'))
      actualizarEstadoMesa(c.mesaId, 'libre', null)
      return
    }

    case 'CANCELAR_COMANDA': {
      const c = nextState.comandas.find((x) => x.id === action.payload.comandaId)
      if (!c) return
      supabase.from('comandas').update({ estado: c.estado, fecha_cierre: c.fechaCierre }).eq('id', c.id).then(logErr('cancelación de comanda'))
      actualizarEstadoMesa(c.mesaId, 'libre', null)
      return
    }

    // TRASLADAR_COMANDA: ya se persistió por completo (mesas origen y
    // destino + comanda.mesa_id) vía el RPC `trasladar_comanda`, llamado
    // desde la UI antes de despachar este action -- acá no hay nada
    // más que sincronizar.
    case 'TRASLADAR_COMANDA':
      return

    default:
      return
  }
}

// ─── Fetch inicial desde Supabase ──────────────────────────────

async function fetchComandasCocinaState(): Promise<ComandasCocinaState> {
  // Solo trae comandas activas (abierta/cobro) + las últimas cerradas
  // recientes no hace falta acá: el módulo vive de lo operativo del
  // momento. El historial completo, si hace falta, se consulta desde
  // Reportes como el resto de los movimientos.
  const [comandasRes, itemsRes] = await Promise.all([
    supabase
      .from('comandas')
      .select('*, clientes_venta(nombre)')
      .in('estado', ['abierta', 'cobro'])
      .order('fecha_apertura'),
    supabase.from('comanda_items').select('*'),
  ])

  const itemsPorComanda = new Map<string, ComandaItem[]>()
  for (const r of itemsRes.data ?? []) {
    const arr = itemsPorComanda.get(r.comanda_id) ?? []
    arr.push({
      id: r.id,
      comandaId: r.comanda_id,
      productoId: r.producto_id ?? undefined,
      comboId: r.combo_id ?? undefined,
      descripcion: r.descripcion,
      cantidad: Number(r.cantidad),
      precioUnitario: Number(r.precio_unitario),
      subtotal: Number(r.subtotal),
      estadoCocina: r.estado_cocina,
      nota: r.nota ?? undefined,
    })
    itemsPorComanda.set(r.comanda_id, arr)
  }

  const comandas: Comanda[] = (comandasRes.data ?? []).map((r: any) => ({
    id: r.id,
    mesaId: r.mesa_id,
    turnoId: r.turno_id,
    mozoUsuarioId: r.mozo_usuario_id ?? undefined,
    clienteVentaId: r.cliente_venta_id ?? undefined,
    clienteVentaNombre: r.clientes_venta?.nombre ?? undefined,
    estado: r.estado,
    fechaApertura: r.fecha_apertura,
    fechaCierre: r.fecha_cierre ?? undefined,
    subtotal: Number(r.subtotal),
    total: Number(r.total),
    comprobanteId: r.comprobante_id ?? undefined,
    notas: r.notas ?? undefined,
    items: itemsPorComanda.get(r.id) ?? [],
  }))

  return { comandas }
}

// ─── Context ───────────────────────────────────────────────────

interface ContextValue {
  state: ComandasCocinaState
  dispatch: React.Dispatch<Action>
}

const Ctx = createContext<ContextValue | null>(null)

export function ComandasCocinaProvider({ children }: { children: ReactNode }) {
  const { cliente } = useClienteActual()
  const [state, rawDispatch] = useReducer(reducer, seedState)

  useEffect(() => {
    let activo = true
    if (!cliente?.id) return
    fetchComandasCocinaState().then((data) => {
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

export function useComandasCocina() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useComandasCocina debe usarse dentro de ComandasCocinaProvider')
  return ctx
}

export function useComandaDeMesa(mesaId: string): Comanda | undefined {
  const { state } = useComandasCocina()
  return useMemo(
    () => state.comandas.find((c) => c.mesaId === mesaId && (c.estado === 'abierta' || c.estado === 'cobro')),
    [state.comandas, mesaId],
  )
}

/** Todos los ítems pendientes/en preparación de todas las comandas abiertas, para la vista Cocina (KDS). */
export function useItemsCocina() {
  const { state } = useComandasCocina()
  return useMemo(() => {
    const items: (ComandaItem & { mesaId: string; comandaId: string })[] = []
    for (const c of state.comandas) {
      if (c.estado !== 'abierta') continue
      for (const i of c.items) {
        if (i.estadoCocina === 'pendiente' || i.estadoCocina === 'en_preparacion') {
          items.push({ ...i, mesaId: c.mesaId, comandaId: c.id })
        }
      }
    }
    return items
  }, [state.comandas])
}

export type { Action as ComandasCocinaAction }
