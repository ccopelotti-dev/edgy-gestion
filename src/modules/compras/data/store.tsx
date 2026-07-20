// ============================================================
// Módulo Compras — State Management
// Edgy Gestión · Context + useReducer + Supabase (antes localStorage)
//
// El reducer y la firma pública (ComprasAction, useCompras,
// useComprasDispatch, y todos los hooks de dominio) son IDÉNTICOS
// a la versión anterior — ningún diálogo ni página cambia una sola
// línea. Lo único nuevo es: (1) el estado inicial se trae de
// Supabase en vez de localStorage, y (2) cada dispatch además
// persiste el registro resuelto (ya con `numero` asignado) en las
// tablas reales.
//
// Importante: los ids de proveedores/cotizaciones/OC/comprobantes/
// pagos/items ya vienen resueltos por el llamador vía generarId()
// (ver types/index.ts) ANTES de llegar acá. Para que estos ids sean
// compatibles con las columnas uuid de Supabase, generarId() se
// actualizó para devolver crypto.randomUUID() (ver diff en types).
// ============================================================

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type Dispatch,
} from 'react';

import type {
  ComprasState,
  ComprasConfig,
  Proveedor,
  PedidoCotizacion,
  OrdenCompra,
  ComprobanteCompra,
  PagoCompra,
  LineaPago,
  EstadoCotizacion,
  EstadoOrdenCompra,
  EstadoComprobanteCompra,
  TipoComprobanteCompra,
  ItemCompra,
  ItemComprobanteCompra,
} from '../types';

import { generarId } from '../types';
import { SEED_STATE } from './seed';
import { supabase } from '@/lib/supabase';
import { useClienteActual } from '@/hooks/useClienteActual';
import { registrarMovimientoTesoreria, emitirChequeProveedor } from '@/lib/tesoreriaSync';
import { todayISO } from '../lib/format';

// ─── Action Types (idénticos a la versión anterior) ───────────

type ComprasAction =
  | { type: 'ADD_PROVEEDOR'; payload: Proveedor }
  | { type: 'UPDATE_PROVEEDOR'; payload: Proveedor }
  | { type: 'TOGGLE_PROVEEDOR_ACTIVO'; payload: { id: string } }
  | { type: 'AJUSTAR_SALDO_PROVEEDOR'; payload: { proveedorId: string; delta: number } }
  | { type: 'ADD_COTIZACION'; payload: Omit<PedidoCotizacion, 'numero'> }
  | { type: 'UPDATE_COTIZACION'; payload: PedidoCotizacion }
  | { type: 'CAMBIAR_ESTADO_COTIZACION'; payload: { id: string; nuevoEstado: EstadoCotizacion } }
  | { type: 'CONVERTIR_COTIZACION_A_OC'; payload: { cotizacionId: string } }
  | { type: 'ADD_ORDEN_COMPRA'; payload: Omit<OrdenCompra, 'numero'> }
  | { type: 'UPDATE_ORDEN_COMPRA'; payload: OrdenCompra }
  | { type: 'CAMBIAR_ESTADO_OC'; payload: { id: string; nuevoEstado: EstadoOrdenCompra } }
  | { type: 'ADD_COMPROBANTE_COMPRA'; payload: Omit<ComprobanteCompra, 'numero'> }
  | { type: 'ANULAR_COMPROBANTE_COMPRA'; payload: { id: string } }
  | { type: 'MARCAR_STOCK_ACTUALIZADO'; payload: { comprobanteId: string; recepcionId: string } }
  | { type: 'ACTUALIZAR_PAGO_COMPROBANTE'; payload: { comprobanteId: string; montoPagado: number } }
  | { type: 'ADD_PAGO'; payload: Omit<PagoCompra, 'numero'> }
  | { type: 'CONFIRMAR_PAGO'; payload: { id: string; lineasPago: LineaPago[]; fecha: string } }
  | { type: 'ANULAR_PAGO'; payload: { id: string } }
  | { type: 'UPDATE_CONFIG'; payload: Partial<ComprasConfig> }
  | { type: 'SET_STATE'; payload: ComprasState };

// ─── Reducer (misma lógica exacta que la versión localStorage) ─

function comprasReducer(state: ComprasState, action: ComprasAction): ComprasState {
  const now = new Date().toISOString();

  switch (action.type) {
    case 'SET_STATE':
      return action.payload;

    case 'ADD_PROVEEDOR':
      return { ...state, proveedores: [...state.proveedores, action.payload] };

    case 'UPDATE_PROVEEDOR':
      return {
        ...state,
        proveedores: state.proveedores.map((p) => (p.id === action.payload.id ? action.payload : p)),
      };

    case 'TOGGLE_PROVEEDOR_ACTIVO':
      return {
        ...state,
        proveedores: state.proveedores.map((p) =>
          p.id === action.payload.id ? { ...p, activo: !p.activo, updatedAt: now } : p,
        ),
      };

    case 'AJUSTAR_SALDO_PROVEEDOR':
      return {
        ...state,
        proveedores: state.proveedores.map((p) =>
          p.id === action.payload.proveedorId
            ? { ...p, saldoCuentaCorriente: p.saldoCuentaCorriente + action.payload.delta, updatedAt: now }
            : p,
        ),
      };

    case 'ADD_COTIZACION': {
      const numero = state.nextNumeroCotizacion;
      const cotizacion: PedidoCotizacion = { ...action.payload, numero } as PedidoCotizacion;
      return { ...state, cotizaciones: [...state.cotizaciones, cotizacion], nextNumeroCotizacion: numero + 1 };
    }

    case 'UPDATE_COTIZACION':
      return {
        ...state,
        cotizaciones: state.cotizaciones.map((c) => (c.id === action.payload.id ? action.payload : c)),
      };

    case 'CAMBIAR_ESTADO_COTIZACION':
      return {
        ...state,
        cotizaciones: state.cotizaciones.map((c) =>
          c.id === action.payload.id ? { ...c, estado: action.payload.nuevoEstado, updatedAt: now } : c,
        ),
      };

    case 'CONVERTIR_COTIZACION_A_OC': {
      const { cotizacionId } = action.payload;
      const cotizacion = state.cotizaciones.find((c) => c.id === cotizacionId);
      if (!cotizacion) return state;

      const ordenId = generarId();
      const numeroOC = state.nextNumeroOrdenCompra;

      const ocItems: ItemCompra[] = cotizacion.items.map((item) => ({
        id: generarId(),
        productoId: item.productoId,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        descuento: item.descuento,
        subtotal: item.subtotal,
      }));

      const nuevaOC: OrdenCompra = {
        id: ordenId,
        numero: numeroOC,
        proveedorId: cotizacion.proveedorId,
        cotizacionId,
        // ANTES: `new Date().toISOString().split('T')[0]` -- da la fecha en
        // UTC. Como Argentina es UTC-3, pasadas las 21 hs (hora local) una
        // OC generada al convertir una cotización quedaba fechada para el
        // día siguiente. Se usa todayISO() (componentes locales del Date).
        fecha: todayISO(),
        estado: 'pendiente',
        items: ocItems,
        subtotal: cotizacion.subtotal,
        total: cotizacion.total,
        comprobanteIds: [],
        createdAt: now,
        updatedAt: now,
      };

      return {
        ...state,
        cotizaciones: state.cotizaciones.map((c) =>
          c.id === cotizacionId ? { ...c, estado: 'aprobado' as const, ordenCompraId: ordenId, updatedAt: now } : c,
        ),
        ordenesCompra: [...state.ordenesCompra, nuevaOC],
        nextNumeroOrdenCompra: numeroOC + 1,
      };
    }

    case 'ADD_ORDEN_COMPRA': {
      const numero = state.nextNumeroOrdenCompra;
      const orden: OrdenCompra = { ...action.payload, numero } as OrdenCompra;
      return { ...state, ordenesCompra: [...state.ordenesCompra, orden], nextNumeroOrdenCompra: numero + 1 };
    }

    case 'UPDATE_ORDEN_COMPRA':
      return {
        ...state,
        ordenesCompra: state.ordenesCompra.map((o) => (o.id === action.payload.id ? action.payload : o)),
      };

    case 'CAMBIAR_ESTADO_OC':
      return {
        ...state,
        ordenesCompra: state.ordenesCompra.map((o) =>
          o.id === action.payload.id ? { ...o, estado: action.payload.nuevoEstado, updatedAt: now } : o,
        ),
      };

    case 'ADD_COMPROBANTE_COMPRA': {
      const tipo = action.payload.tipo;
      const numero = state.nextNumeroComprobante[tipo];
      const comprobante: ComprobanteCompra = { ...action.payload, numero } as ComprobanteCompra;

      let proveedoresDelta: { proveedorId: string; delta: number } | null = null;
      if (tipo === 'factura' && comprobante.medioPago === 'cuenta_corriente') {
        proveedoresDelta = { proveedorId: comprobante.proveedorId, delta: comprobante.total };
      }
      if (tipo === 'nota_credito') {
        proveedoresDelta = { proveedorId: comprobante.proveedorId, delta: -comprobante.total };
      }

      let ordenesCompra = state.ordenesCompra;
      if (comprobante.ordenCompraId) {
        ordenesCompra = ordenesCompra.map((o) =>
          o.id === comprobante.ordenCompraId
            ? { ...o, comprobanteIds: [...o.comprobanteIds, comprobante.id], updatedAt: now }
            : o,
        );
      }

      return {
        ...state,
        comprobantes: [...state.comprobantes, comprobante],
        nextNumeroComprobante: { ...state.nextNumeroComprobante, [tipo]: numero + 1 },
        ordenesCompra,
        proveedores: proveedoresDelta
          ? state.proveedores.map((p) =>
              p.id === proveedoresDelta!.proveedorId
                ? { ...p, saldoCuentaCorriente: p.saldoCuentaCorriente + proveedoresDelta!.delta, updatedAt: now }
                : p,
            )
          : state.proveedores,
      };
    }

    case 'ANULAR_COMPROBANTE_COMPRA': {
      const comprobante = state.comprobantes.find((c) => c.id === action.payload.id);
      if (!comprobante || comprobante.estado === 'anulado') return state;

      let proveedoresDelta: { proveedorId: string; delta: number } | null = null;
      if (comprobante.medioPago === 'cuenta_corriente') {
        if (comprobante.tipo === 'factura') {
          proveedoresDelta = { proveedorId: comprobante.proveedorId, delta: -(comprobante.total - comprobante.montoPagado) };
        } else if (comprobante.tipo === 'nota_credito') {
          proveedoresDelta = { proveedorId: comprobante.proveedorId, delta: comprobante.total };
        }
      }

      return {
        ...state,
        comprobantes: state.comprobantes.map((c) =>
          c.id === action.payload.id ? { ...c, estado: 'anulado' as EstadoComprobanteCompra, updatedAt: now } : c,
        ),
        proveedores: proveedoresDelta
          ? state.proveedores.map((p) =>
              p.id === proveedoresDelta!.proveedorId
                ? { ...p, saldoCuentaCorriente: p.saldoCuentaCorriente + proveedoresDelta!.delta, updatedAt: now }
                : p,
            )
          : state.proveedores,
      };
    }

    case 'MARCAR_STOCK_ACTUALIZADO': {
      const { comprobanteId, recepcionId } = action.payload;
      return {
        ...state,
        comprobantes: state.comprobantes.map((c) =>
          c.id === comprobanteId ? { ...c, stockActualizado: true, recepcionId, updatedAt: now } : c,
        ),
      };
    }

    case 'ACTUALIZAR_PAGO_COMPROBANTE': {
      const { comprobanteId, montoPagado } = action.payload;
      return {
        ...state,
        comprobantes: state.comprobantes.map((c) => {
          if (c.id !== comprobanteId) return c;
          const saldoPendiente = c.total - montoPagado;
          let estado: EstadoComprobanteCompra = c.estado;
          if (c.estado !== 'anulado') {
            if (saldoPendiente <= 0) estado = 'pagado';
            else if (montoPagado > 0) estado = 'pagado_parcial';
            else estado = 'pendiente';
          }
          return { ...c, montoPagado, saldoPendiente: Math.max(0, saldoPendiente), estado, updatedAt: now };
        }),
      };
    }

    case 'ADD_PAGO': {
      // Solo arma la Orden de Pago (estado 'pendiente' u opcionalmente ya
      // 'pagada' si el llamador la confirma al toque) -- NO toca todavía
      // comprobantes ni saldo del proveedor. Eso se difiere a
      // CONFIRMAR_PAGO, que es cuando el dinero realmente sale (ver Fase 22,
      // Orden de Pago).
      const numero = state.nextNumeroPago;
      const pago: PagoCompra = { ...action.payload, numero } as PagoCompra;
      return { ...state, pagos: [...state.pagos, pago], nextNumeroPago: numero + 1 };
    }

    case 'CONFIRMAR_PAGO': {
      const pagoActual = state.pagos.find((p) => p.id === action.payload.id);
      if (!pagoActual || pagoActual.estado !== 'pendiente') return state;

      const pago: PagoCompra = {
        ...pagoActual,
        estado: 'pagada',
        lineasPago: action.payload.lineasPago,
        fechaConfirmacion: action.payload.fecha,
        updatedAt: now,
      };

      let comprobantes = [...state.comprobantes];
      for (const imp of pago.imputaciones) {
        comprobantes = comprobantes.map((c) => {
          if (c.id !== imp.comprobanteId) return c;
          const nuevoMontoPagado = c.montoPagado + imp.montoImputado;
          const nuevoSaldoPendiente = c.total - nuevoMontoPagado;
          let estado: EstadoComprobanteCompra = c.estado;
          if (c.estado !== 'anulado') {
            if (nuevoSaldoPendiente <= 0) estado = 'pagado';
            else if (nuevoMontoPagado > 0) estado = 'pagado_parcial';
          }
          return { ...c, montoPagado: nuevoMontoPagado, saldoPendiente: Math.max(0, nuevoSaldoPendiente), estado, updatedAt: now };
        });
      }

      const proveedores = state.proveedores.map((p) =>
        p.id === pago.proveedorId ? { ...p, saldoCuentaCorriente: p.saldoCuentaCorriente - pago.monto, updatedAt: now } : p,
      );

      return {
        ...state,
        pagos: state.pagos.map((p) => (p.id === pago.id ? pago : p)),
        comprobantes,
        proveedores,
      };
    }

    case 'ANULAR_PAGO': {
      // Solo se puede anular una Orden de Pago que todavía no se confirmó
      // -- no comprometió nada (ni comprobantes, ni saldo, ni Tesorería), así
      // que anularla es un simple cambio de estado. Una orden ya 'pagada'
      // no se anula desde acá (requeriría revertir movimientos bancarios y
      // cheques reales).
      return {
        ...state,
        pagos: state.pagos.map((p) => (p.id === action.payload.id && p.estado === 'pendiente' ? { ...p, estado: 'anulada', updatedAt: now } : p)),
      };
    }

    case 'UPDATE_CONFIG':
      return { ...state, config: { ...state.config, ...action.payload } };

    default:
      return state;
  }
}

// ─── Mapeo dominio -> filas de Supabase ───────────────────────

function proveedorToRow(p: Proveedor, clienteId: string) {
  return {
    id: p.id,
    cliente_id: clienteId,
    nombre: p.nombre,
    cuit: p.cuit || null,
    condicion_iva: p.condicionIva,
    email: p.email ?? null,
    telefono: p.telefono ?? null,
    direccion: p.direccion ?? null,
    localidad: p.localidad ?? null,
    provincia: p.provincia ?? null,
    contacto: p.contacto ?? null,
    rubro: p.rubro ?? null,
    notas: p.notas ?? null,
    saldo_cuenta_corriente: p.saldoCuentaCorriente,
    activo: p.activo,
  };
}

function itemToRow(item: ItemCompra, fkColumn: string, fkValue: string) {
  return {
    id: item.id,
    [fkColumn]: fkValue,
    producto_id: item.productoId ?? null,
    insumo_id: item.insumoId ?? null,
    unidad: item.unidad ?? null,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precio_unitario: item.precioUnitario,
    descuento: item.descuento,
    subtotal: item.subtotal,
    alicuota_iva: item.alicuotaIva ?? null,
    monto_iva: item.montoIva ?? null,
  };
}

function itemComprobanteToRow(item: ItemComprobanteCompra, comprobanteId: string) {
  return {
    id: item.id,
    comprobante_id: comprobanteId,
    producto_id: item.productoId ?? null,
    insumo_id: item.insumoId ?? null,
    unidad: item.unidad ?? null,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precio_unitario: item.precioUnitario,
    descuento: item.descuento,
    alicuota_iva: item.alicuotaIva,
    subtotal: item.subtotal,
    monto_iva: item.montoIva,
  };
}

function cotizacionToRow(c: PedidoCotizacion, clienteId: string) {
  return {
    id: c.id,
    cliente_id: clienteId,
    numero: c.numero,
    proveedor_id: c.proveedorId,
    fecha: c.fecha,
    validez_dias: c.validezDias,
    fecha_vencimiento: c.fechaVencimiento,
    estado: c.estado,
    subtotal: c.subtotal,
    total: c.total,
    notas: c.notas ?? null,
    orden_compra_id: c.ordenCompraId ?? null,
  };
}

function ordenCompraToRow(o: OrdenCompra, clienteId: string) {
  return {
    id: o.id,
    cliente_id: clienteId,
    numero: o.numero,
    proveedor_id: o.proveedorId,
    cotizacion_id: o.cotizacionId ?? null,
    fecha: o.fecha,
    fecha_entrega: o.fechaEntrega ?? null,
    estado: o.estado,
    subtotal: o.subtotal,
    monto_iva: o.montoIva ?? null,
    otros_impuestos: o.otrosImpuestos ?? [],
    total: o.total,
    notas: o.notas ?? null,
  };
}

function comprobanteToRow(c: ComprobanteCompra, clienteId: string) {
  return {
    id: c.id,
    cliente_id: clienteId,
    tipo: c.tipo,
    numero: c.numero,
    proveedor_id: c.proveedorId,
    orden_compra_id: c.ordenCompraId ?? null,
    fecha: c.fecha,
    fecha_vencimiento: c.fechaVencimiento ?? null,
    subtotal: c.subtotal,
    monto_iva: c.montoIva,
    otros_impuestos: c.otrosImpuestos ?? [],
    total: c.total,
    estado: c.estado,
    medio_pago: c.medioPago,
    monto_pagado: c.montoPagado,
    saldo_pendiente: c.saldoPendiente,
    control_remision: c.controlRemision,
    numero_remito: c.numeroRemito ?? null,
    numero_comprobante_proveedor: c.numeroComprobanteProveedor ?? null,
    stock_actualizado: c.stockActualizado,
    recepcion_id: c.recepcionId ?? null,
    notas: c.notas ?? null,
  };
}

function pagoToRow(p: PagoCompra, clienteId: string) {
  return {
    id: p.id,
    cliente_id: clienteId,
    numero: p.numero,
    proveedor_id: p.proveedorId,
    fecha: p.fecha,
    estado: p.estado,
    monto: p.monto,
    medio_pago: p.medioPago,
    lineas_pago: p.lineasPago,
    fecha_confirmacion: p.fechaConfirmacion ?? null,
    notas: p.notas ?? null,
  };
}

function logErr(label: string) {
  return ({ error }: { error: unknown }) => error && console.error(`Compras · error en ${label}:`, error);
}

// ─── Sincronización con Supabase por acción ───────────────────
// Recibe el estado YA actualizado (nextState) para poder leer los
// registros resueltos (con `numero` asignado por el reducer).

function syncToSupabase(action: ComprasAction, nextState: ComprasState, clienteId: string) {
  switch (action.type) {
    case 'ADD_PROVEEDOR':
      supabase.from('proveedores').insert(proveedorToRow(action.payload, clienteId)).then(logErr('alta de proveedor'));
      return;

    case 'UPDATE_PROVEEDOR':
      supabase.from('proveedores').update(proveedorToRow(action.payload, clienteId)).eq('id', action.payload.id).then(logErr('edición de proveedor'));
      return;

    case 'TOGGLE_PROVEEDOR_ACTIVO': {
      const p = nextState.proveedores.find((x) => x.id === action.payload.id);
      if (p) supabase.from('proveedores').update({ activo: p.activo }).eq('id', p.id).then(logErr('activar/desactivar proveedor'));
      return;
    }

    case 'AJUSTAR_SALDO_PROVEEDOR': {
      const p = nextState.proveedores.find((x) => x.id === action.payload.proveedorId);
      if (p) supabase.from('proveedores').update({ saldo_cuenta_corriente: p.saldoCuentaCorriente }).eq('id', p.id).then(logErr('ajuste de saldo proveedor'));
      return;
    }

    case 'ADD_COTIZACION': {
      const c = nextState.cotizaciones.find((x) => x.id === action.payload.id);
      if (!c) return;
      // IMPORTANTE: el INSERT de los items se dispara recién DESPUÉS de que
      // el INSERT de la cotización haya confirmado en Supabase (encadenado
      // con .then, no en paralelo). Antes ambos INSERT se disparaban al
      // mismo tiempo, y la política RLS de `cotizacion_compra_items` (que
      // exige que exista una fila en `cotizaciones_compra` con ese id)
      // podía evaluarse antes de que la fila padre estuviera confirmada,
      // devolviendo 42501 (RLS) y perdiendo los items en silencio.
      supabase
        .from('cotizaciones_compra')
        .insert(cotizacionToRow(c, clienteId))
        .then((res) => {
          logErr('alta de cotización')(res);
          if (!res.error && c.items.length) {
            supabase.from('cotizacion_compra_items').insert(c.items.map((i) => itemToRow(i, 'cotizacion_id', c.id))).then(logErr('items de cotización'));
          }
        });
      return;
    }

    case 'UPDATE_COTIZACION': {
      const c = action.payload;
      supabase.from('cotizaciones_compra').update(cotizacionToRow(c, clienteId)).eq('id', c.id).then(logErr('edición de cotización'));
      supabase.from('cotizacion_compra_items').delete().eq('cotizacion_id', c.id).then(() => {
        if (c.items.length) supabase.from('cotizacion_compra_items').insert(c.items.map((i) => itemToRow(i, 'cotizacion_id', c.id))).then(logErr('items de cotización'));
      });
      return;
    }

    case 'CAMBIAR_ESTADO_COTIZACION':
      supabase.from('cotizaciones_compra').update({ estado: action.payload.nuevoEstado }).eq('id', action.payload.id).then(logErr('cambio de estado de cotización'));
      return;

    case 'CONVERTIR_COTIZACION_A_OC': {
      const cot = nextState.cotizaciones.find((x) => x.id === action.payload.cotizacionId);
      const oc = nextState.ordenesCompra.find((o) => o.cotizacionId === action.payload.cotizacionId);
      if (cot) {
        supabase.from('cotizaciones_compra').update({ estado: cot.estado, orden_compra_id: cot.ordenCompraId ?? null }).eq('id', cot.id).then(logErr('cotización aprobada'));
      }
      if (oc) {
        // Mismo fix: encadenar el INSERT de items después del INSERT de la
        // orden de compra para evitar la carrera RLS.
        supabase
          .from('ordenes_compra')
          .insert(ordenCompraToRow(oc, clienteId))
          .then((res) => {
            logErr('alta de orden de compra (desde cotización)')(res);
            if (!res.error && oc.items.length) {
              supabase.from('orden_compra_items').insert(oc.items.map((i) => itemToRow(i, 'orden_compra_id', oc.id))).then(logErr('items de orden de compra'));
            }
          });
      }
      return;
    }

    case 'ADD_ORDEN_COMPRA': {
      const o = nextState.ordenesCompra.find((x) => x.id === action.payload.id);
      if (!o) return;
      supabase
        .from('ordenes_compra')
        .insert(ordenCompraToRow(o, clienteId))
        .then((res) => {
          logErr('alta de orden de compra')(res);
          if (!res.error && o.items.length) {
            supabase.from('orden_compra_items').insert(o.items.map((i) => itemToRow(i, 'orden_compra_id', o.id))).then(logErr('items de orden de compra'));
          }
        });
      return;
    }

    case 'UPDATE_ORDEN_COMPRA': {
      const o = action.payload;
      supabase.from('ordenes_compra').update(ordenCompraToRow(o, clienteId)).eq('id', o.id).then(logErr('edición de orden de compra'));
      supabase.from('orden_compra_items').delete().eq('orden_compra_id', o.id).then(() => {
        if (o.items.length) supabase.from('orden_compra_items').insert(o.items.map((i) => itemToRow(i, 'orden_compra_id', o.id))).then(logErr('items de orden de compra'));
      });
      return;
    }

    case 'CAMBIAR_ESTADO_OC':
      supabase.from('ordenes_compra').update({ estado: action.payload.nuevoEstado }).eq('id', action.payload.id).then(logErr('cambio de estado de OC'));
      return;

    case 'ADD_COMPROBANTE_COMPRA': {
      const c = nextState.comprobantes.find((x) => x.id === action.payload.id);
      if (!c) return;
      // Mismo fix: los items del comprobante de compra se insertan recién
      // cuando el INSERT del comprobante confirmó, para que la política
      // RLS de `comprobante_compra_items` encuentre la fila padre ya
      // visible. El resto (saldo del proveedor, espejo en Tesorería) no
      // depende de esta fila para su propia política RLS.
      supabase
        .from('comprobantes_compra')
        .insert(comprobanteToRow(c, clienteId))
        .then((res) => {
          logErr('alta de comprobante de compra')(res);
          if (!res.error && c.items.length) {
            supabase.from('comprobante_compra_items').insert(c.items.map((i) => itemComprobanteToRow(i, c.id))).then(logErr('items de comprobante de compra'));
          }
        });
      const proveedor = nextState.proveedores.find((p) => p.id === c.proveedorId);
      if (proveedor) supabase.from('proveedores').update({ saldo_cuenta_corriente: proveedor.saldoCuentaCorriente }).eq('id', proveedor.id).then(logErr('saldo proveedor tras comprobante'));
      // Si el comprobante se pagó al instante con un medio que no es cuenta
      // corriente, reflejar el movimiento de dinero real en Tesorería.
      if (c.medioPago !== 'cuenta_corriente' && c.montoPagado > 0) {
        registrarMovimientoTesoreria({
          clienteId,
          tipo: 'egreso',
          medioPago: c.medioPago,
          monto: c.montoPagado,
          concepto: `Factura compra N.º ${c.numero} — ${proveedor?.nombre ?? 'Proveedor'}`,
          categoria: 'Pago a proveedores',
          fecha: c.fecha,
          origenModulo: 'compras',
        });
      }
      return;
    }

    case 'ANULAR_COMPROBANTE_COMPRA': {
      const c = nextState.comprobantes.find((x) => x.id === action.payload.id);
      if (!c) return;
      supabase.from('comprobantes_compra').update({ estado: c.estado }).eq('id', c.id).then(logErr('anulación de comprobante'));
      const proveedor = nextState.proveedores.find((p) => p.id === c.proveedorId);
      if (proveedor) supabase.from('proveedores').update({ saldo_cuenta_corriente: proveedor.saldoCuentaCorriente }).eq('id', proveedor.id).then(logErr('saldo proveedor tras anulación'));
      return;
    }

    case 'MARCAR_STOCK_ACTUALIZADO': {
      const c = nextState.comprobantes.find((x) => x.id === action.payload.comprobanteId);
      if (!c) return;
      supabase
        .from('comprobantes_compra')
        .update({ stock_actualizado: c.stockActualizado, recepcion_id: c.recepcionId ?? null })
        .eq('id', c.id)
        .then(logErr('actualización de stock de comprobante'));
      return;
    }

    case 'ACTUALIZAR_PAGO_COMPROBANTE': {
      const c = nextState.comprobantes.find((x) => x.id === action.payload.comprobanteId);
      if (!c) return;
      supabase
        .from('comprobantes_compra')
        .update({ monto_pagado: c.montoPagado, saldo_pendiente: c.saldoPendiente, estado: c.estado })
        .eq('id', c.id)
        .then(logErr('actualización de pago de comprobante'));
      return;
    }

    case 'ADD_PAGO': {
      // Solo arma la Orden de Pago (estado 'pendiente') -- todavía no toca
      // comprobantes, proveedor ni Tesorería. Eso ocurre en CONFIRMAR_PAGO.
      const pago = nextState.pagos.find((x) => x.id === action.payload.id);
      if (!pago) return;
      // Mismo fix: las imputaciones referencian al pago por id, así que se
      // encadenan después de que el INSERT del pago haya confirmado.
      supabase
        .from('pagos_compra')
        .insert(pagoToRow(pago, clienteId))
        .then((res) => {
          logErr('alta de orden de pago')(res);
          if (!res.error && pago.imputaciones.length) {
            supabase
              .from('pago_compra_imputaciones')
              .insert(pago.imputaciones.map((imp) => ({ id: generarId(), pago_id: pago.id, comprobante_id: imp.comprobanteId, monto_imputado: imp.montoImputado })))
              .then(logErr('imputaciones de orden de pago'));
          }
        });
      return;
    }

    case 'CONFIRMAR_PAGO': {
      // Acá sí sale la plata de verdad: se actualiza el pago (estado +
      // líneas de pago ya resueltas con cuenta/cheque real), los
      // comprobantes imputados, el saldo del proveedor, y se refleja cada
      // línea en Tesorería (transferencia/efectivo -> movimiento bancario
      // en la cuenta elegida; cheque -> cheque emitido real).
      const pago = nextState.pagos.find((x) => x.id === action.payload.id);
      if (!pago) return;

      supabase
        .from('pagos_compra')
        .update({
          estado: pago.estado,
          lineas_pago: pago.lineasPago,
          fecha_confirmacion: pago.fechaConfirmacion ?? null,
        })
        .eq('id', pago.id)
        .then(logErr('confirmación de orden de pago'));

      for (const imp of pago.imputaciones) {
        const c = nextState.comprobantes.find((x) => x.id === imp.comprobanteId);
        if (c) {
          supabase
            .from('comprobantes_compra')
            .update({ monto_pagado: c.montoPagado, saldo_pendiente: c.saldoPendiente, estado: c.estado })
            .eq('id', c.id)
            .then(logErr('comprobante actualizado por confirmación de pago'));
        }
      }
      const proveedor = nextState.proveedores.find((p) => p.id === pago.proveedorId);
      if (proveedor) supabase.from('proveedores').update({ saldo_cuenta_corriente: proveedor.saldoCuentaCorriente }).eq('id', proveedor.id).then(logErr('saldo proveedor tras confirmación de pago'));

      for (const linea of pago.lineasPago) {
        if (linea.medioPago === 'cheque') {
          if (linea.chequeId && linea.cuentaBancariaId) {
            emitirChequeProveedor({
              id: linea.chequeId,
              clienteId,
              numero: linea.chequeNumero ?? '',
              banco: linea.chequeBanco ?? '',
              beneficiario: proveedor?.nombre ?? 'Proveedor',
              fechaEmision: pago.fechaConfirmacion ?? pago.fecha,
              fechaPago: linea.chequeFechaPago ?? pago.fecha,
              monto: linea.monto,
              cuentaOrigenId: linea.cuentaBancariaId,
              notas: `Orden de Pago N.º ${pago.numero}`,
              origenId: pago.id,
            });
          }
          continue;
        }
        // Un pago siempre representa dinero real saliendo (salvo cuenta
        // corriente, que es solo un asiento contable).
        if (linea.medioPago !== 'cuenta_corriente') {
          registrarMovimientoTesoreria({
            clienteId,
            tipo: 'egreso',
            medioPago: linea.medioPago,
            monto: linea.monto,
            concepto: `Pago N.º ${pago.numero} — ${proveedor?.nombre ?? 'Proveedor'}`,
            categoria: 'Pago a proveedores',
            fecha: pago.fechaConfirmacion ?? pago.fecha,
            origenModulo: 'compras',
            cuentaBancariaId: linea.cuentaBancariaId,
            origenId: pago.id,
          });
        }
      }
      return;
    }

    case 'ANULAR_PAGO': {
      const pago = nextState.pagos.find((x) => x.id === action.payload.id);
      if (!pago) return;
      supabase.from('pagos_compra').update({ estado: pago.estado }).eq('id', pago.id).then(logErr('anulación de orden de pago'));
      return;
    }

    default:
      return;
  }
}

// ─── Fetch inicial desde Supabase ──────────────────────────────

function itemFromRow(r: any): ItemCompra {
  return {
    id: r.id,
    productoId: r.producto_id ?? undefined,
    insumoId: r.insumo_id ?? undefined,
    unidad: r.unidad ?? undefined,
    descripcion: r.descripcion,
    cantidad: Number(r.cantidad),
    precioUnitario: Number(r.precio_unitario),
    descuento: Number(r.descuento),
    subtotal: Number(r.subtotal),
    alicuotaIva: r.alicuota_iva != null ? Number(r.alicuota_iva) : undefined,
    montoIva: r.monto_iva != null ? Number(r.monto_iva) : undefined,
  };
}

function itemComprobanteFromRow(r: any): ItemComprobanteCompra {
  return { ...itemFromRow(r), alicuotaIva: Number(r.alicuota_iva), montoIva: Number(r.monto_iva) };
}

async function fetchComprasState(): Promise<ComprasState> {
  const [proveedoresRes, cotizacionesRes, cotItemsRes, ordenesRes, ocItemsRes, comprobantesRes, compItemsRes, pagosRes, impRes] =
    await Promise.all([
      supabase.from('proveedores').select('*').order('created_at'),
      supabase.from('cotizaciones_compra').select('*').order('numero'),
      supabase.from('cotizacion_compra_items').select('*'),
      supabase.from('ordenes_compra').select('*').order('numero'),
      supabase.from('orden_compra_items').select('*'),
      supabase.from('comprobantes_compra').select('*').order('numero'),
      supabase.from('comprobante_compra_items').select('*'),
      supabase.from('pagos_compra').select('*').order('numero'),
      supabase.from('pago_compra_imputaciones').select('*'),
    ]);

  const proveedores: Proveedor[] = (proveedoresRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    cuit: r.cuit ?? '',
    condicionIva: r.condicion_iva,
    email: r.email ?? undefined,
    telefono: r.telefono ?? undefined,
    direccion: r.direccion ?? undefined,
    localidad: r.localidad ?? undefined,
    provincia: r.provincia ?? undefined,
    contacto: r.contacto ?? undefined,
    rubro: r.rubro ?? undefined,
    notas: r.notas ?? undefined,
    saldoCuentaCorriente: Number(r.saldo_cuenta_corriente),
    activo: r.activo,
    createdAt: r.created_at,
    updatedAt: r.created_at,
  }));

  const cotItemsByCot = new Map<string, ItemCompra[]>();
  for (const r of cotItemsRes.data ?? []) {
    const arr = cotItemsByCot.get(r.cotizacion_id) ?? [];
    arr.push(itemFromRow(r));
    cotItemsByCot.set(r.cotizacion_id, arr);
  }

  const cotizaciones: PedidoCotizacion[] = (cotizacionesRes.data ?? []).map((r: any) => ({
    id: r.id,
    numero: r.numero,
    proveedorId: r.proveedor_id,
    fecha: r.fecha,
    validezDias: r.validez_dias,
    fechaVencimiento: r.fecha_vencimiento,
    estado: r.estado,
    items: cotItemsByCot.get(r.id) ?? [],
    subtotal: Number(r.subtotal),
    total: Number(r.total),
    notas: r.notas ?? undefined,
    ordenCompraId: r.orden_compra_id ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const ocItemsByOc = new Map<string, ItemCompra[]>();
  for (const r of ocItemsRes.data ?? []) {
    const arr = ocItemsByOc.get(r.orden_compra_id) ?? [];
    arr.push(itemFromRow(r));
    ocItemsByOc.set(r.orden_compra_id, arr);
  }

  const comprobantesRaw = comprobantesRes.data ?? [];
  const comprobanteIdsPorOc = new Map<string, string[]>();
  for (const r of comprobantesRaw) {
    if (!r.orden_compra_id) continue;
    const arr = comprobanteIdsPorOc.get(r.orden_compra_id) ?? [];
    arr.push(r.id);
    comprobanteIdsPorOc.set(r.orden_compra_id, arr);
  }

  const ordenesCompra: OrdenCompra[] = (ordenesRes.data ?? []).map((r: any) => ({
    id: r.id,
    numero: r.numero,
    proveedorId: r.proveedor_id,
    cotizacionId: r.cotizacion_id ?? undefined,
    fecha: r.fecha,
    fechaEntrega: r.fecha_entrega ?? undefined,
    estado: r.estado,
    items: ocItemsByOc.get(r.id) ?? [],
    subtotal: Number(r.subtotal),
    montoIva: r.monto_iva != null ? Number(r.monto_iva) : undefined,
    otrosImpuestos: (r.otros_impuestos ?? []) as OrdenCompra['otrosImpuestos'],
    total: Number(r.total),
    notas: r.notas ?? undefined,
    comprobanteIds: comprobanteIdsPorOc.get(r.id) ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const compItemsByComp = new Map<string, ItemComprobanteCompra[]>();
  for (const r of compItemsRes.data ?? []) {
    const arr = compItemsByComp.get(r.comprobante_id) ?? [];
    arr.push(itemComprobanteFromRow(r));
    compItemsByComp.set(r.comprobante_id, arr);
  }

  const comprobantes: ComprobanteCompra[] = comprobantesRaw.map((r: any) => ({
    id: r.id,
    tipo: r.tipo,
    numero: r.numero,
    proveedorId: r.proveedor_id,
    ordenCompraId: r.orden_compra_id ?? undefined,
    fecha: r.fecha,
    fechaVencimiento: r.fecha_vencimiento ?? undefined,
    items: compItemsByComp.get(r.id) ?? [],
    subtotal: Number(r.subtotal),
    montoIva: Number(r.monto_iva),
    otrosImpuestos: (r.otros_impuestos ?? []) as ComprobanteCompra['otrosImpuestos'],
    total: Number(r.total),
    estado: r.estado,
    medioPago: r.medio_pago,
    montoPagado: Number(r.monto_pagado),
    saldoPendiente: Number(r.saldo_pendiente),
    controlRemision: r.control_remision ?? 'no',
    numeroRemito: r.numero_remito ?? undefined,
    numeroComprobanteProveedor: r.numero_comprobante_proveedor ?? undefined,
    stockActualizado: r.stock_actualizado ?? false,
    recepcionId: r.recepcion_id ?? undefined,
    notas: r.notas ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const impByPago = new Map<string, { comprobanteId: string; montoImputado: number }[]>();
  for (const r of impRes.data ?? []) {
    const arr = impByPago.get(r.pago_id) ?? [];
    arr.push({ comprobanteId: r.comprobante_id, montoImputado: Number(r.monto_imputado) });
    impByPago.set(r.pago_id, arr);
  }

  const pagos: PagoCompra[] = (pagosRes.data ?? []).map((r: any) => ({
    id: r.id,
    numero: r.numero,
    proveedorId: r.proveedor_id,
    fecha: r.fecha,
    estado: (r.estado ?? 'pagada') as PagoCompra['estado'],
    monto: Number(r.monto),
    medioPago: r.medio_pago,
    imputaciones: impByPago.get(r.id) ?? [],
    lineasPago: (r.lineas_pago ?? []) as LineaPago[],
    fechaConfirmacion: r.fecha_confirmacion ?? undefined,
    notas: r.notas ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
  }));

  const maxNumero = (arr: { numero: number }[]) => arr.reduce((max, x) => Math.max(max, x.numero), 0);
  const nextNumeroComprobante: Record<TipoComprobanteCompra, number> = {
    factura: maxNumero(comprobantes.filter((c) => c.tipo === 'factura')) + 1,
    nota_credito: maxNumero(comprobantes.filter((c) => c.tipo === 'nota_credito')) + 1,
    nota_debito: maxNumero(comprobantes.filter((c) => c.tipo === 'nota_debito')) + 1,
  };

  return {
    proveedores,
    cotizaciones,
    ordenesCompra,
    comprobantes,
    pagos,
    nextNumeroCotizacion: maxNumero(cotizaciones) + 1,
    nextNumeroOrdenCompra: maxNumero(ordenesCompra) + 1,
    nextNumeroComprobante,
    nextNumeroPago: maxNumero(pagos) + 1,
    config: SEED_STATE.config,
  };
}

// ─── Context ─────────────────────────────────────────────────

const ComprasContext = createContext<ComprasState | null>(null);
const ComprasDispatchContext = createContext<Dispatch<ComprasAction> | null>(null);

const emptyState: ComprasState = {
  proveedores: [],
  cotizaciones: [],
  ordenesCompra: [],
  comprobantes: [],
  pagos: [],
  nextNumeroCotizacion: 1,
  nextNumeroOrdenCompra: 1,
  nextNumeroComprobante: { factura: 1, nota_credito: 1, nota_debito: 1 },
  nextNumeroPago: 1,
  config: SEED_STATE.config,
};

export function ComprasProvider({ children }: { children: ReactNode }) {
  const { cliente } = useClienteActual();
  const [state, rawDispatch] = useReducer(comprasReducer, emptyState);

  useEffect(() => {
    let activo = true;
    if (!cliente?.id) return;
    fetchComprasState().then((data) => {
      if (activo) rawDispatch({ type: 'SET_STATE', payload: data });
    });
    return () => {
      activo = false;
    };
  }, [cliente?.id]);

  const dispatch = useMemo<Dispatch<ComprasAction>>(() => {
    return (action: ComprasAction) => {
      const nextState = comprasReducer(state, action);
      rawDispatch(action);
      if (cliente?.id) syncToSupabase(action, nextState, cliente.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cliente?.id]);

  return (
    <ComprasContext.Provider value={state}>
      <ComprasDispatchContext.Provider value={dispatch}>{children}</ComprasDispatchContext.Provider>
    </ComprasContext.Provider>
  );
}

// ─── Hooks base (idénticos a la versión anterior) ─────────────

export function useCompras(): ComprasState {
  const ctx = useContext(ComprasContext);
  if (!ctx) throw new Error('useCompras debe usarse dentro de <ComprasProvider>');
  return ctx;
}

export function useComprasDispatch(): Dispatch<ComprasAction> {
  const ctx = useContext(ComprasDispatchContext);
  if (!ctx) throw new Error('useComprasDispatch debe usarse dentro de <ComprasProvider>');
  return ctx;
}

export function useProveedores(): Proveedor[] {
  const { proveedores } = useCompras();
  return proveedores;
}

export function useProveedor(id: string): Proveedor | undefined {
  const { proveedores } = useCompras();
  return useMemo(() => proveedores.find((p) => p.id === id), [proveedores, id]);
}

interface FiltroCotizaciones {
  estado?: EstadoCotizacion;
  proveedorId?: string;
}

export function useCotizaciones(filtro?: FiltroCotizaciones): PedidoCotizacion[] {
  const { cotizaciones } = useCompras();
  return useMemo(() => {
    if (!filtro) return cotizaciones;
    return cotizaciones.filter((c) => {
      if (filtro.estado && c.estado !== filtro.estado) return false;
      if (filtro.proveedorId && c.proveedorId !== filtro.proveedorId) return false;
      return true;
    });
  }, [cotizaciones, filtro?.estado, filtro?.proveedorId]);
}

interface FiltroOrdenesCompra {
  estado?: EstadoOrdenCompra;
  proveedorId?: string;
}

export function useOrdenesCompra(filtro?: FiltroOrdenesCompra): OrdenCompra[] {
  const { ordenesCompra } = useCompras();
  return useMemo(() => {
    if (!filtro) return ordenesCompra;
    return ordenesCompra.filter((o) => {
      if (filtro.estado && o.estado !== filtro.estado) return false;
      if (filtro.proveedorId && o.proveedorId !== filtro.proveedorId) return false;
      return true;
    });
  }, [ordenesCompra, filtro?.estado, filtro?.proveedorId]);
}

interface FiltroComprobantesCompra {
  tipo?: TipoComprobanteCompra;
  estado?: EstadoComprobanteCompra;
  proveedorId?: string;
}

export function useComprobantesCompra(filtro?: FiltroComprobantesCompra): ComprobanteCompra[] {
  const { comprobantes } = useCompras();
  return useMemo(() => {
    if (!filtro) return comprobantes;
    return comprobantes.filter((c) => {
      if (filtro.tipo && c.tipo !== filtro.tipo) return false;
      if (filtro.estado && c.estado !== filtro.estado) return false;
      if (filtro.proveedorId && c.proveedorId !== filtro.proveedorId) return false;
      return true;
    });
  }, [comprobantes, filtro?.tipo, filtro?.estado, filtro?.proveedorId]);
}

export function usePagos(proveedorId?: string): PagoCompra[] {
  const { pagos } = useCompras();
  return useMemo(() => {
    if (!proveedorId) return pagos;
    return pagos.filter((p) => p.proveedorId === proveedorId);
  }, [pagos, proveedorId]);
}

interface DashboardComprasStats {
  comprasDelMes: number;
  pendientePago: number;
  proveedoresActivos: number;
  ordenesAbiertas: number;
  topProveedores: { proveedorId: string; nombre: string; total: number }[];
}

export function useDashboardCompras(): DashboardComprasStats {
  const { comprobantes, proveedores, ordenesCompra } = useCompras();
  return useMemo(() => {
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const facturas = comprobantes.filter((c) => c.tipo === 'factura' && c.estado !== 'anulado');
    const facturasMes = facturas.filter((c) => new Date(c.fecha) >= inicioMes);
    const comprasDelMes = facturasMes.reduce((sum, c) => sum + c.total, 0);
    const pendientePago = comprobantes
      .filter((c) => c.estado === 'pendiente' || c.estado === 'pagado_parcial')
      .reduce((sum, c) => sum + c.saldoPendiente, 0);
    const proveedoresActivos = proveedores.filter((p) => p.activo).length;
    const ordenesAbiertas = ordenesCompra.filter((o) => o.estado === 'pendiente' || o.estado === 'parcial').length;
    const proveedorTotals = new Map<string, number>();
    for (const f of facturasMes) {
      proveedorTotals.set(f.proveedorId, (proveedorTotals.get(f.proveedorId) || 0) + f.total);
    }
    const topProveedores = Array.from(proveedorTotals.entries())
      .map(([proveedorId, total]) => {
        const proveedor = proveedores.find((p) => p.id === proveedorId);
        return { proveedorId, nombre: proveedor?.nombre ?? 'Desconocido', total };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return { comprasDelMes, pendientePago, proveedoresActivos, ordenesAbiertas, topProveedores };
  }, [comprobantes, proveedores, ordenesCompra]);
}

export type { ComprasAction };
