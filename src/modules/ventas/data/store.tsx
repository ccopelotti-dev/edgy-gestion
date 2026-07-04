// ============================================================
// Módulo Ventas — State Management
// Edgy Gestión · Context + useReducer + Supabase (antes localStorage)
//
// Mismo patrón que Tesorería/Compras: el reducer y la firma pública
// (VentasAction, useVentas, useVentasDispatch, hooks de dominio) son
// IDÉNTICOS a la versión anterior. El estado inicial se trae de
// Supabase y cada dispatch además persiste el registro resuelto
// (con `numero` ya asignado) en las tablas reales.
//
// "Consumidor Final" (CONSUMIDOR_FINAL_ID) es un cliente virtual que
// NO se persiste en Supabase (no existe como fila real) — se agrega
// siempre en memoria al leer el estado, igual que en el seed original.
// ============================================================

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useMemo,
  type ReactNode,
  type Dispatch,
} from 'react';

import type {
  VentasState,
  VentasConfig,
  CategoriaCliente,
  Cliente,
  Presupuesto,
  Orden,
  Comprobante,
  Cobro,
  TipoOrden,
  EstadoOrden,
  EstadoPresupuesto,
  EstadoComprobante,
  TipoComprobante,
  OrdenItem,
  ImputacionCobro,
  PresupuestoItem,
  ComprobanteItem,
} from '../types';

import { generarId, CONSUMIDOR_FINAL_ID, clienteConsumidorFinal } from '../types';
import { SEED_STATE } from './seed';
import { supabase } from '@/lib/supabase';
import { useClienteActual } from '@/hooks/useClienteActual';

// ─── Action Types (idénticos a la versión anterior) ───────────

type VentasAction =
  | { type: 'ADD_CATEGORIA'; payload: CategoriaCliente }
  | { type: 'UPDATE_CATEGORIA'; payload: CategoriaCliente }
  | { type: 'DELETE_CATEGORIA'; payload: { id: string } }
  | { type: 'ADD_CLIENTE'; payload: Cliente }
  | { type: 'UPDATE_CLIENTE'; payload: Cliente }
  | { type: 'TOGGLE_CLIENTE_ACTIVO'; payload: { id: string } }
  | { type: 'AJUSTAR_SALDO_CLIENTE'; payload: { clienteId: string; delta: number } }
  | { type: 'ADD_PRESUPUESTO'; payload: Omit<Presupuesto, 'numero'> }
  | { type: 'UPDATE_PRESUPUESTO'; payload: Presupuesto }
  | { type: 'CAMBIAR_ESTADO_PRESUPUESTO'; payload: { id: string; nuevoEstado: EstadoPresupuesto } }
  | { type: 'CONVERTIR_PRESUPUESTO_A_ORDEN'; payload: { presupuestoId: string; tipoOrden: TipoOrden } }
  | { type: 'ADD_ORDEN'; payload: Omit<Orden, 'numero'> }
  | { type: 'UPDATE_ORDEN'; payload: Orden }
  | { type: 'CAMBIAR_ESTADO_ORDEN'; payload: { id: string; nuevoEstado: EstadoOrden } }
  | { type: 'REGISTRAR_ENTREGA_PARCIAL'; payload: { ordenId: string; items: { id: string; cantidadEntregada: number }[] } }
  | { type: 'ADD_COMPROBANTE'; payload: Omit<Comprobante, 'numero'> }
  | { type: 'ANULAR_COMPROBANTE'; payload: { id: string } }
  | { type: 'ACTUALIZAR_COBRO_COMPROBANTE'; payload: { comprobanteId: string; montoCobrado: number } }
  | { type: 'ADD_COBRO'; payload: Omit<Cobro, 'numero'> }
  | { type: 'UPDATE_CONFIG'; payload: Partial<VentasConfig> }
  | { type: 'SET_STATE'; payload: VentasState };

// ─── Reducer (misma lógica exacta que la versión localStorage) ─

function ventasReducer(state: VentasState, action: VentasAction): VentasState {
  const now = new Date().toISOString();

  switch (action.type) {
    case 'SET_STATE':
      return action.payload;

    case 'ADD_CATEGORIA':
      return { ...state, categorias: [...state.categorias, action.payload] };

    case 'UPDATE_CATEGORIA':
      return { ...state, categorias: state.categorias.map((c) => (c.id === action.payload.id ? action.payload : c)) };

    case 'DELETE_CATEGORIA':
      return {
        ...state,
        categorias: state.categorias.filter((c) => c.id !== action.payload.id),
        clientes: state.clientes.map((cl) =>
          cl.categoriaId === action.payload.id ? { ...cl, categoriaId: undefined, updatedAt: now } : cl,
        ),
      };

    case 'ADD_CLIENTE':
      return { ...state, clientes: [...state.clientes, action.payload] };

    case 'UPDATE_CLIENTE':
      return { ...state, clientes: state.clientes.map((c) => (c.id === action.payload.id ? action.payload : c)) };

    case 'TOGGLE_CLIENTE_ACTIVO':
      return {
        ...state,
        clientes: state.clientes.map((c) => (c.id === action.payload.id ? { ...c, activo: !c.activo, updatedAt: now } : c)),
      };

    case 'AJUSTAR_SALDO_CLIENTE':
      return {
        ...state,
        clientes: state.clientes.map((c) =>
          c.id === action.payload.clienteId
            ? { ...c, saldoCuentaCorriente: c.saldoCuentaCorriente + action.payload.delta, updatedAt: now }
            : c,
        ),
      };

    case 'ADD_PRESUPUESTO': {
      const numero = state.nextNumeroPresupuesto;
      const presupuesto: Presupuesto = { ...action.payload, numero } as Presupuesto;
      return { ...state, presupuestos: [...state.presupuestos, presupuesto], nextNumeroPresupuesto: numero + 1 };
    }

    case 'UPDATE_PRESUPUESTO':
      return { ...state, presupuestos: state.presupuestos.map((p) => (p.id === action.payload.id ? action.payload : p)) };

    case 'CAMBIAR_ESTADO_PRESUPUESTO':
      return {
        ...state,
        presupuestos: state.presupuestos.map((p) =>
          p.id === action.payload.id ? { ...p, estado: action.payload.nuevoEstado, updatedAt: now } : p,
        ),
      };

    case 'CONVERTIR_PRESUPUESTO_A_ORDEN': {
      const { presupuestoId, tipoOrden } = action.payload;
      const presupuesto = state.presupuestos.find((p) => p.id === presupuestoId);
      if (!presupuesto) return state;

      const ordenId = generarId();
      const numeroOrden = state.nextNumeroOrden[tipoOrden];

      const ordenItems: OrdenItem[] = presupuesto.items.map((item) => ({
        id: generarId(),
        productoId: item.productoId,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        descuento: item.descuento,
        subtotal: item.subtotal,
        cantidadEntregada: 0,
      }));

      const nuevaOrden: Orden = {
        id: ordenId,
        numero: numeroOrden,
        tipo: tipoOrden,
        clienteId: presupuesto.clienteId,
        presupuestoId,
        fecha: new Date().toISOString().split('T')[0],
        estado: 'pendiente',
        items: ordenItems,
        subtotal: presupuesto.subtotal,
        descuentoGeneral: presupuesto.descuentoGeneral,
        total: presupuesto.total,
        comprobanteIds: [],
        createdAt: now,
        updatedAt: now,
      };

      return {
        ...state,
        presupuestos: state.presupuestos.map((p) =>
          p.id === presupuestoId ? { ...p, estado: 'aprobado' as const, ordenId, updatedAt: now } : p,
        ),
        ordenes: [...state.ordenes, nuevaOrden],
        nextNumeroOrden: { ...state.nextNumeroOrden, [tipoOrden]: numeroOrden + 1 },
      };
    }

    case 'ADD_ORDEN': {
      const tipo = action.payload.tipo;
      const numero = state.nextNumeroOrden[tipo];
      const orden: Orden = { ...action.payload, numero } as Orden;
      return { ...state, ordenes: [...state.ordenes, orden], nextNumeroOrden: { ...state.nextNumeroOrden, [tipo]: numero + 1 } };
    }

    case 'UPDATE_ORDEN':
      return { ...state, ordenes: state.ordenes.map((o) => (o.id === action.payload.id ? action.payload : o)) };

    case 'CAMBIAR_ESTADO_ORDEN':
      return {
        ...state,
        ordenes: state.ordenes.map((o) =>
          o.id === action.payload.id
            ? {
                ...o,
                estado: action.payload.nuevoEstado,
                fechaCompletada: action.payload.nuevoEstado === 'entregado' ? now : o.fechaCompletada,
                updatedAt: now,
              }
            : o,
        ),
      };

    case 'REGISTRAR_ENTREGA_PARCIAL': {
      const { ordenId, items: entregas } = action.payload;
      const entregaMap = new Map(entregas.map((e) => [e.id, e.cantidadEntregada]));

      return {
        ...state,
        ordenes: state.ordenes.map((o) => {
          if (o.id !== ordenId) return o;
          const updatedItems = o.items.map((item) => {
            const nuevaCantidad = entregaMap.get(item.id);
            return nuevaCantidad !== undefined ? { ...item, cantidadEntregada: nuevaCantidad } : item;
          });
          const todosEntregados = updatedItems.every((i) => i.cantidadEntregada >= i.cantidad);
          const algunoEntregado = updatedItems.some((i) => i.cantidadEntregada > 0);
          let nuevoEstado: EstadoOrden = o.estado;
          if (todosEntregados) nuevoEstado = 'entregado';
          else if (algunoEntregado) nuevoEstado = 'entregado_parcial';
          return {
            ...o,
            items: updatedItems,
            estado: nuevoEstado,
            fechaCompletada: todosEntregados ? now : o.fechaCompletada,
            updatedAt: now,
          };
        }),
      };
    }

    case 'ADD_COMPROBANTE': {
      const tipo = action.payload.tipo;
      const numero = state.nextNumeroComprobante[tipo];
      const comprobante: Comprobante = { ...action.payload, numero } as Comprobante;

      let clientesDelta: { clienteId: string; delta: number } | null = null;
      if (tipo === 'factura' && comprobante.medioPago === 'cuenta_corriente') {
        clientesDelta = { clienteId: comprobante.clienteId, delta: comprobante.total };
      }
      if (tipo === 'nota_credito') {
        clientesDelta = { clienteId: comprobante.clienteId, delta: -comprobante.total };
      }

      let ordenes = state.ordenes;
      if (comprobante.ordenId) {
        ordenes = ordenes.map((o) =>
          o.id === comprobante.ordenId ? { ...o, comprobanteIds: [...o.comprobanteIds, comprobante.id], updatedAt: now } : o,
        );
      }

      return {
        ...state,
        comprobantes: [...state.comprobantes, comprobante],
        nextNumeroComprobante: { ...state.nextNumeroComprobante, [tipo]: numero + 1 },
        ordenes,
        clientes: clientesDelta
          ? state.clientes.map((c) =>
              c.id === clientesDelta!.clienteId
                ? { ...c, saldoCuentaCorriente: c.saldoCuentaCorriente + clientesDelta!.delta, updatedAt: now }
                : c,
            )
          : state.clientes,
      };
    }

    case 'ANULAR_COMPROBANTE': {
      const comprobante = state.comprobantes.find((c) => c.id === action.payload.id);
      if (!comprobante || comprobante.estado === 'anulado') return state;

      let clientesDelta: { clienteId: string; delta: number } | null = null;
      if (comprobante.medioPago === 'cuenta_corriente') {
        if (comprobante.tipo === 'factura') {
          clientesDelta = { clienteId: comprobante.clienteId, delta: -(comprobante.total - comprobante.montoCobrado) };
        } else if (comprobante.tipo === 'nota_credito') {
          clientesDelta = { clienteId: comprobante.clienteId, delta: comprobante.total };
        }
      }

      return {
        ...state,
        comprobantes: state.comprobantes.map((c) =>
          c.id === action.payload.id ? { ...c, estado: 'anulado' as EstadoComprobante, updatedAt: now } : c,
        ),
        clientes: clientesDelta
          ? state.clientes.map((c) =>
              c.id === clientesDelta!.clienteId
                ? { ...c, saldoCuentaCorriente: c.saldoCuentaCorriente + clientesDelta!.delta, updatedAt: now }
                : c,
            )
          : state.clientes,
      };
    }

    case 'ACTUALIZAR_COBRO_COMPROBANTE': {
      const { comprobanteId, montoCobrado } = action.payload;
      return {
        ...state,
        comprobantes: state.comprobantes.map((c) => {
          if (c.id !== comprobanteId) return c;
          const saldoPendiente = c.total - montoCobrado;
          let estado: EstadoComprobante = c.estado;
          if (c.estado !== 'anulado') {
            if (saldoPendiente <= 0) estado = 'cobrado';
            else if (montoCobrado > 0) estado = 'cobrado_parcial';
            else estado = 'emitido';
          }
          return { ...c, montoCobrado, saldoPendiente: Math.max(0, saldoPendiente), estado, updatedAt: now };
        }),
      };
    }

    case 'ADD_COBRO': {
      const numero = state.nextNumeroCobro;
      const cobro: Cobro = { ...action.payload, numero } as Cobro;

      let comprobantes = [...state.comprobantes];
      for (const imp of cobro.imputaciones) {
        comprobantes = comprobantes.map((c) => {
          if (c.id !== imp.comprobanteId) return c;
          const nuevoMontoCobrado = c.montoCobrado + imp.montoImputado;
          const nuevoSaldoPendiente = c.total - nuevoMontoCobrado;
          let estado: EstadoComprobante = c.estado;
          if (c.estado !== 'anulado') {
            if (nuevoSaldoPendiente <= 0) estado = 'cobrado';
            else if (nuevoMontoCobrado > 0) estado = 'cobrado_parcial';
          }
          return { ...c, montoCobrado: nuevoMontoCobrado, saldoPendiente: Math.max(0, nuevoSaldoPendiente), estado, updatedAt: now };
        });
      }

      const clientes = state.clientes.map((c) =>
        c.id === cobro.clienteId ? { ...c, saldoCuentaCorriente: c.saldoCuentaCorriente - cobro.monto, updatedAt: now } : c,
      );

      return { ...state, cobros: [...state.cobros, cobro], nextNumeroCobro: numero + 1, comprobantes, clientes };
    }

    case 'UPDATE_CONFIG':
      return { ...state, config: { ...state.config, ...action.payload } };

    default:
      return state;
  }
}

// ─── Mapeo dominio -> filas de Supabase ───────────────────────

function categoriaToRow(c: CategoriaCliente, clienteId: string) {
  return {
    id: c.id,
    cliente_id: clienteId,
    nombre: c.nombre,
    descuento_default: c.descuentoDefault,
    lista_precio_id: c.listaPrecioId ?? null,
    color: c.color ?? null,
  };
}

function clienteVentaToRow(c: Cliente, clienteId: string) {
  return {
    id: c.id,
    cliente_id: clienteId,
    nombre: c.nombre,
    tipo_documento: c.tipoDocumento,
    documento: c.documento,
    condicion_iva: c.condicionIva,
    email: c.email ?? null,
    telefono: c.telefono ?? null,
    direccion: c.direccion ?? null,
    localidad: c.localidad ?? null,
    provincia: c.provincia ?? null,
    categoria_id: c.categoriaId ?? null,
    limite_credito: c.limiteCredito,
    saldo_cuenta_corriente: c.saldoCuentaCorriente,
    notas: c.notas ?? null,
    activo: c.activo,
    metadatos: c.metadatos ?? null,
  };
}

function presupuestoItemToRow(item: PresupuestoItem, presupuestoId: string) {
  return {
    id: item.id,
    presupuesto_id: presupuestoId,
    producto_id: item.productoId ?? null,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precio_unitario: item.precioUnitario,
    descuento: item.descuento,
    subtotal: item.subtotal,
  };
}

function presupuestoToRow(p: Presupuesto, clienteId: string) {
  return {
    id: p.id,
    cliente_id: clienteId,
    numero: p.numero,
    cliente_venta_id: p.clienteId,
    fecha: p.fecha,
    validez_dias: p.validezDias,
    fecha_vencimiento: p.fechaVencimiento,
    estado: p.estado,
    subtotal: p.subtotal,
    descuento_general: p.descuentoGeneral,
    total: p.total,
    notas: p.notas ?? null,
    condiciones: p.condiciones ?? null,
    orden_id: p.ordenId ?? null,
  };
}

function ordenItemToRow(item: OrdenItem, ordenId: string) {
  return {
    id: item.id,
    orden_id: ordenId,
    producto_id: item.productoId ?? null,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precio_unitario: item.precioUnitario,
    descuento: item.descuento,
    subtotal: item.subtotal,
    cantidad_entregada: item.cantidadEntregada,
  };
}

function ordenToRow(o: Orden, clienteId: string) {
  return {
    id: o.id,
    cliente_id: clienteId,
    numero: o.numero,
    tipo: o.tipo,
    cliente_venta_id: o.clienteId,
    presupuesto_id: o.presupuestoId ?? null,
    fecha: o.fecha,
    fecha_entrega: o.fechaEntrega ?? null,
    fecha_completada: o.fechaCompletada ?? null,
    estado: o.estado,
    subtotal: o.subtotal,
    descuento_general: o.descuentoGeneral,
    total: o.total,
    notas: o.notas ?? null,
    origen_modulo: o.origenModulo ?? null,
    origen_id: o.origenId ?? null,
    origen_canal: o.origenCanal ?? null,
    origen_externo_id: o.origenExternoId ?? null,
  };
}

function comprobanteItemToRow(item: ComprobanteItem, comprobanteId: string) {
  return {
    id: item.id,
    comprobante_id: comprobanteId,
    producto_id: item.productoId ?? null,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precio_unitario: item.precioUnitario,
    descuento: item.descuento,
    alicuota_iva: item.alicuotaIva,
    subtotal: item.subtotal,
    monto_iva: item.montoIva,
  };
}

function comprobanteToRow(c: Comprobante, clienteId: string) {
  return {
    id: c.id,
    cliente_id: clienteId,
    tipo: c.tipo,
    modo_emision: c.modoEmision,
    numero: c.numero,
    cliente_venta_id: c.clienteId,
    orden_id: c.ordenId ?? null,
    fecha: c.fecha,
    subtotal: c.subtotal,
    descuento_general: c.descuentoGeneral,
    monto_iva: c.montoIva,
    total: c.total,
    estado: c.estado,
    medio_pago: c.medioPago,
    monto_cobrado: c.montoCobrado,
    saldo_pendiente: c.saldoPendiente,
    afip: c.afip ?? null,
    notas: c.notas ?? null,
    origen_modulo: c.origenModulo ?? null,
    origen_id: c.origenId ?? null,
  };
}

function cobroToRow(c: Cobro, clienteId: string) {
  return {
    id: c.id,
    cliente_id: clienteId,
    numero: c.numero,
    cliente_venta_id: c.clienteId,
    fecha: c.fecha,
    monto: c.monto,
    medio_pago: c.medioPago,
    notas: c.notas ?? null,
  };
}

function logErr(label: string) {
  return ({ error }: { error: unknown }) => error && console.error(`Ventas · error en ${label}:`, error);
}

function esClienteReal(clienteVentaId: string) {
  return clienteVentaId !== CONSUMIDOR_FINAL_ID;
}

// ─── Sincronización con Supabase por acción ────────────────────

function syncToSupabase(action: VentasAction, nextState: VentasState, clienteId: string) {
  switch (action.type) {
    case 'ADD_CATEGORIA':
      supabase.from('categorias_cliente_venta').insert(categoriaToRow(action.payload, clienteId)).then(logErr('alta de categoría'));
      return;

    case 'UPDATE_CATEGORIA':
      supabase.from('categorias_cliente_venta').update(categoriaToRow(action.payload, clienteId)).eq('id', action.payload.id).then(logErr('edición de categoría'));
      return;

    case 'DELETE_CATEGORIA':
      supabase.from('categorias_cliente_venta').delete().eq('id', action.payload.id).then(logErr('borrado de categoría'));
      return;

    case 'ADD_CLIENTE':
      if (!esClienteReal(action.payload.id)) return;
      supabase.from('clientes_venta').insert(clienteVentaToRow(action.payload, clienteId)).then(logErr('alta de cliente'));
      return;

    case 'UPDATE_CLIENTE':
      if (!esClienteReal(action.payload.id)) return;
      supabase.from('clientes_venta').update(clienteVentaToRow(action.payload, clienteId)).eq('id', action.payload.id).then(logErr('edición de cliente'));
      return;

    case 'TOGGLE_CLIENTE_ACTIVO': {
      if (!esClienteReal(action.payload.id)) return;
      const c = nextState.clientes.find((x) => x.id === action.payload.id);
      if (c) supabase.from('clientes_venta').update({ activo: c.activo }).eq('id', c.id).then(logErr('activar/desactivar cliente'));
      return;
    }

    case 'AJUSTAR_SALDO_CLIENTE': {
      if (!esClienteReal(action.payload.clienteId)) return;
      const c = nextState.clientes.find((x) => x.id === action.payload.clienteId);
      if (c) supabase.from('clientes_venta').update({ saldo_cuenta_corriente: c.saldoCuentaCorriente }).eq('id', c.id).then(logErr('ajuste de saldo cliente'));
      return;
    }

    case 'ADD_PRESUPUESTO': {
      const p = nextState.presupuestos.find((x) => x.id === action.payload.id);
      if (!p) return;
      supabase.from('presupuestos').insert(presupuestoToRow(p, clienteId)).then(logErr('alta de presupuesto'));
      if (p.items.length) supabase.from('presupuesto_items').insert(p.items.map((i) => presupuestoItemToRow(i, p.id))).then(logErr('items de presupuesto'));
      return;
    }

    case 'UPDATE_PRESUPUESTO': {
      const p = action.payload;
      supabase.from('presupuestos').update(presupuestoToRow(p, clienteId)).eq('id', p.id).then(logErr('edición de presupuesto'));
      supabase.from('presupuesto_items').delete().eq('presupuesto_id', p.id).then(() => {
        if (p.items.length) supabase.from('presupuesto_items').insert(p.items.map((i) => presupuestoItemToRow(i, p.id))).then(logErr('items de presupuesto'));
      });
      return;
    }

    case 'CAMBIAR_ESTADO_PRESUPUESTO':
      supabase.from('presupuestos').update({ estado: action.payload.nuevoEstado }).eq('id', action.payload.id).then(logErr('cambio de estado de presupuesto'));
      return;

    case 'CONVERTIR_PRESUPUESTO_A_ORDEN': {
      const pres = nextState.presupuestos.find((x) => x.id === action.payload.presupuestoId);
      const orden = nextState.ordenes.find((o) => o.presupuestoId === action.payload.presupuestoId);
      if (pres) supabase.from('presupuestos').update({ estado: pres.estado, orden_id: pres.ordenId ?? null }).eq('id', pres.id).then(logErr('presupuesto aprobado'));
      if (orden) {
        supabase.from('ordenes_venta').insert(ordenToRow(orden, clienteId)).then(logErr('alta de orden (desde presupuesto)'));
        if (orden.items.length) supabase.from('orden_venta_items').insert(orden.items.map((i) => ordenItemToRow(i, orden.id))).then(logErr('items de orden'));
      }
      return;
    }

    case 'ADD_ORDEN': {
      const o = nextState.ordenes.find((x) => x.id === action.payload.id);
      if (!o) return;
      supabase.from('ordenes_venta').insert(ordenToRow(o, clienteId)).then(logErr('alta de orden'));
      if (o.items.length) supabase.from('orden_venta_items').insert(o.items.map((i) => ordenItemToRow(i, o.id))).then(logErr('items de orden'));
      return;
    }

    case 'UPDATE_ORDEN': {
      const o = action.payload;
      supabase.from('ordenes_venta').update(ordenToRow(o, clienteId)).eq('id', o.id).then(logErr('edición de orden'));
      supabase.from('orden_venta_items').delete().eq('orden_id', o.id).then(() => {
        if (o.items.length) supabase.from('orden_venta_items').insert(o.items.map((i) => ordenItemToRow(i, o.id))).then(logErr('items de orden'));
      });
      return;
    }

    case 'CAMBIAR_ESTADO_ORDEN': {
      const o = nextState.ordenes.find((x) => x.id === action.payload.id);
      if (o) supabase.from('ordenes_venta').update({ estado: o.estado, fecha_completada: o.fechaCompletada ?? null }).eq('id', o.id).then(logErr('cambio de estado de orden'));
      return;
    }

    case 'REGISTRAR_ENTREGA_PARCIAL': {
      const o = nextState.ordenes.find((x) => x.id === action.payload.ordenId);
      if (!o) return;
      supabase.from('ordenes_venta').update({ estado: o.estado, fecha_completada: o.fechaCompletada ?? null }).eq('id', o.id).then(logErr('entrega de orden'));
      for (const item of o.items) {
        supabase.from('orden_venta_items').update({ cantidad_entregada: item.cantidadEntregada }).eq('id', item.id).then(logErr('entrega de item de orden'));
      }
      return;
    }

    case 'ADD_COMPROBANTE': {
      const c = nextState.comprobantes.find((x) => x.id === action.payload.id);
      if (!c) return;
      supabase.from('comprobantes_venta').insert(comprobanteToRow(c, clienteId)).then(logErr('alta de comprobante'));
      if (c.items.length) supabase.from('comprobante_venta_items').insert(c.items.map((i) => comprobanteItemToRow(i, c.id))).then(logErr('items de comprobante'));
      if (esClienteReal(c.clienteId)) {
        const cli = nextState.clientes.find((x) => x.id === c.clienteId);
        if (cli) supabase.from('clientes_venta').update({ saldo_cuenta_corriente: cli.saldoCuentaCorriente }).eq('id', cli.id).then(logErr('saldo cliente tras comprobante'));
      }
      return;
    }

    case 'ANULAR_COMPROBANTE': {
      const c = nextState.comprobantes.find((x) => x.id === action.payload.id);
      if (!c) return;
      supabase.from('comprobantes_venta').update({ estado: c.estado }).eq('id', c.id).then(logErr('anulación de comprobante'));
      if (esClienteReal(c.clienteId)) {
        const cli = nextState.clientes.find((x) => x.id === c.clienteId);
        if (cli) supabase.from('clientes_venta').update({ saldo_cuenta_corriente: cli.saldoCuentaCorriente }).eq('id', cli.id).then(logErr('saldo cliente tras anulación'));
      }
      return;
    }

    case 'ACTUALIZAR_COBRO_COMPROBANTE': {
      const c = nextState.comprobantes.find((x) => x.id === action.payload.comprobanteId);
      if (!c) return;
      supabase
        .from('comprobantes_venta')
        .update({ monto_cobrado: c.montoCobrado, saldo_pendiente: c.saldoPendiente, estado: c.estado })
        .eq('id', c.id)
        .then(logErr('actualización de cobro'));
      return;
    }

    case 'ADD_COBRO': {
      const cobro = nextState.cobros.find((x) => x.id === action.payload.id);
      if (!cobro) return;
      supabase.from('cobros').insert(cobroToRow(cobro, clienteId)).then(logErr('alta de cobro'));
      if (cobro.imputaciones.length) {
        supabase
          .from('cobro_imputaciones')
          .insert(cobro.imputaciones.map((imp: ImputacionCobro) => ({ id: generarId(), cobro_id: cobro.id, comprobante_id: imp.comprobanteId, monto_imputado: imp.montoImputado })))
          .then(logErr('imputaciones de cobro'));
      }
      for (const imp of cobro.imputaciones) {
        const c = nextState.comprobantes.find((x) => x.id === imp.comprobanteId);
        if (c) {
          supabase
            .from('comprobantes_venta')
            .update({ monto_cobrado: c.montoCobrado, saldo_pendiente: c.saldoPendiente, estado: c.estado })
            .eq('id', c.id)
            .then(logErr('comprobante actualizado por cobro'));
        }
      }
      if (esClienteReal(cobro.clienteId)) {
        const cli = nextState.clientes.find((x) => x.id === cobro.clienteId);
        if (cli) supabase.from('clientes_venta').update({ saldo_cuenta_corriente: cli.saldoCuentaCorriente }).eq('id', cli.id).then(logErr('saldo cliente tras cobro'));
      }
      return;
    }

    default:
      return;
  }
}

// ─── Fetch inicial desde Supabase ──────────────────────────────

function presupuestoItemFromRow(r: any): PresupuestoItem {
  return {
    id: r.id,
    productoId: r.producto_id,
    descripcion: r.descripcion,
    cantidad: Number(r.cantidad),
    precioUnitario: Number(r.precio_unitario),
    descuento: Number(r.descuento),
    subtotal: Number(r.subtotal),
  };
}

function ordenItemFromRow(r: any): OrdenItem {
  return {
    id: r.id,
    productoId: r.producto_id ?? undefined,
    descripcion: r.descripcion,
    cantidad: Number(r.cantidad),
    precioUnitario: Number(r.precio_unitario),
    descuento: Number(r.descuento),
    subtotal: Number(r.subtotal),
    cantidadEntregada: Number(r.cantidad_entregada),
  };
}

function comprobanteItemFromRow(r: any): ComprobanteItem {
  return {
    id: r.id,
    productoId: r.producto_id ?? undefined,
    descripcion: r.descripcion,
    cantidad: Number(r.cantidad),
    precioUnitario: Number(r.precio_unitario),
    descuento: Number(r.descuento),
    alicuotaIva: Number(r.alicuota_iva),
    subtotal: Number(r.subtotal),
    montoIva: Number(r.monto_iva),
  };
}

async function fetchVentasState(): Promise<VentasState> {
  const [
    categoriasRes,
    clientesRes,
    presupuestosRes,
    presItemsRes,
    ordenesRes,
    ordenItemsRes,
    comprobantesRes,
    compItemsRes,
    cobrosRes,
    impRes,
  ] = await Promise.all([
    supabase.from('categorias_cliente_venta').select('*').order('created_at'),
    supabase.from('clientes_venta').select('*').order('created_at'),
    supabase.from('presupuestos').select('*').order('numero'),
    supabase.from('presupuesto_items').select('*'),
    supabase.from('ordenes_venta').select('*').order('numero'),
    supabase.from('orden_venta_items').select('*'),
    supabase.from('comprobantes_venta').select('*').order('numero'),
    supabase.from('comprobante_venta_items').select('*'),
    supabase.from('cobros').select('*').order('numero'),
    supabase.from('cobro_imputaciones').select('*'),
  ]);

  const categorias: CategoriaCliente[] = (categoriasRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    descuentoDefault: Number(r.descuento_default),
    listaPrecioId: r.lista_precio_id ?? undefined,
    color: r.color ?? undefined,
    createdAt: r.created_at,
  }));

  const clientesReales: Cliente[] = (clientesRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    tipoDocumento: r.tipo_documento,
    documento: r.documento,
    condicionIva: r.condicion_iva,
    email: r.email ?? undefined,
    telefono: r.telefono ?? undefined,
    direccion: r.direccion ?? undefined,
    localidad: r.localidad ?? undefined,
    provincia: r.provincia ?? undefined,
    categoriaId: r.categoria_id ?? undefined,
    limiteCredito: Number(r.limite_credito),
    saldoCuentaCorriente: Number(r.saldo_cuenta_corriente),
    notas: r.notas ?? undefined,
    activo: r.activo,
    metadatos: r.metadatos ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  // "Consumidor Final" es virtual: nunca se persiste, siempre se agrega en memoria.
  const clientes: Cliente[] = [clienteConsumidorFinal, ...clientesReales];

  const presItemsByPres = new Map<string, PresupuestoItem[]>();
  for (const r of presItemsRes.data ?? []) {
    const arr = presItemsByPres.get(r.presupuesto_id) ?? [];
    arr.push(presupuestoItemFromRow(r));
    presItemsByPres.set(r.presupuesto_id, arr);
  }

  const presupuestos: Presupuesto[] = (presupuestosRes.data ?? []).map((r: any) => ({
    id: r.id,
    numero: r.numero,
    clienteId: r.cliente_venta_id,
    fecha: r.fecha,
    validezDias: r.validez_dias,
    fechaVencimiento: r.fecha_vencimiento,
    estado: r.estado,
    items: presItemsByPres.get(r.id) ?? [],
    subtotal: Number(r.subtotal),
    descuentoGeneral: Number(r.descuento_general),
    total: Number(r.total),
    notas: r.notas ?? undefined,
    condiciones: r.condiciones ?? undefined,
    ordenId: r.orden_id ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const ordenItemsByOrden = new Map<string, OrdenItem[]>();
  for (const r of ordenItemsRes.data ?? []) {
    const arr = ordenItemsByOrden.get(r.orden_id) ?? [];
    arr.push(ordenItemFromRow(r));
    ordenItemsByOrden.set(r.orden_id, arr);
  }

  const comprobantesRaw = comprobantesRes.data ?? [];
  const comprobanteIdsPorOrden = new Map<string, string[]>();
  for (const r of comprobantesRaw) {
    if (!r.orden_id) continue;
    const arr = comprobanteIdsPorOrden.get(r.orden_id) ?? [];
    arr.push(r.id);
    comprobanteIdsPorOrden.set(r.orden_id, arr);
  }

  const ordenes: Orden[] = (ordenesRes.data ?? []).map((r: any) => ({
    id: r.id,
    numero: r.numero,
    tipo: r.tipo,
    clienteId: r.cliente_venta_id,
    presupuestoId: r.presupuesto_id ?? undefined,
    fecha: r.fecha,
    fechaEntrega: r.fecha_entrega ?? undefined,
    fechaCompletada: r.fecha_completada ?? undefined,
    estado: r.estado,
    items: ordenItemsByOrden.get(r.id) ?? [],
    subtotal: Number(r.subtotal),
    descuentoGeneral: Number(r.descuento_general),
    total: Number(r.total),
    notas: r.notas ?? undefined,
    origenModulo: r.origen_modulo ?? undefined,
    origenId: r.origen_id ?? undefined,
    origenCanal: r.origen_canal ?? undefined,
    origenExternoId: r.origen_externo_id ?? undefined,
    comprobanteIds: comprobanteIdsPorOrden.get(r.id) ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const compItemsByComp = new Map<string, ComprobanteItem[]>();
  for (const r of compItemsRes.data ?? []) {
    const arr = compItemsByComp.get(r.comprobante_id) ?? [];
    arr.push(comprobanteItemFromRow(r));
    compItemsByComp.set(r.comprobante_id, arr);
  }

  const comprobantes: Comprobante[] = comprobantesRaw.map((r: any) => ({
    id: r.id,
    tipo: r.tipo,
    modoEmision: r.modo_emision,
    numero: r.numero,
    clienteId: r.cliente_venta_id,
    ordenId: r.orden_id ?? undefined,
    fecha: r.fecha,
    items: compItemsByComp.get(r.id) ?? [],
    subtotal: Number(r.subtotal),
    descuentoGeneral: Number(r.descuento_general),
    montoIva: Number(r.monto_iva),
    total: Number(r.total),
    estado: r.estado,
    medioPago: r.medio_pago,
    montoCobrado: Number(r.monto_cobrado),
    saldoPendiente: Number(r.saldo_pendiente),
    afip: r.afip ?? undefined,
    notas: r.notas ?? undefined,
    origenModulo: r.origen_modulo ?? undefined,
    origenId: r.origen_id ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const impByCobro = new Map<string, ImputacionCobro[]>();
  for (const r of impRes.data ?? []) {
    const arr = impByCobro.get(r.cobro_id) ?? [];
    arr.push({ comprobanteId: r.comprobante_id, montoImputado: Number(r.monto_imputado) });
    impByCobro.set(r.cobro_id, arr);
  }

  const cobros: Cobro[] = (cobrosRes.data ?? []).map((r: any) => ({
    id: r.id,
    numero: r.numero,
    clienteId: r.cliente_venta_id,
    fecha: r.fecha,
    monto: Number(r.monto),
    medioPago: r.medio_pago,
    imputaciones: impByCobro.get(r.id) ?? [],
    notas: r.notas ?? undefined,
    createdAt: r.created_at,
  }));

  const maxNumero = (arr: { numero: number }[]) => arr.reduce((max, x) => Math.max(max, x.numero), 0);
  const nextNumeroOrden: Record<TipoOrden, number> = {
    pedido: maxNumero(ordenes.filter((o) => o.tipo === 'pedido')) + 1,
    produccion: maxNumero(ordenes.filter((o) => o.tipo === 'produccion')) + 1,
    servicio: maxNumero(ordenes.filter((o) => o.tipo === 'servicio')) + 1,
  };
  const nextNumeroComprobante: Record<TipoComprobante, number> = {
    factura: maxNumero(comprobantes.filter((c) => c.tipo === 'factura')) + 1,
    recibo: maxNumero(comprobantes.filter((c) => c.tipo === 'recibo')) + 1,
    nota_credito: maxNumero(comprobantes.filter((c) => c.tipo === 'nota_credito')) + 1,
    nota_debito: maxNumero(comprobantes.filter((c) => c.tipo === 'nota_debito')) + 1,
  };

  return {
    categorias,
    clientes,
    presupuestos,
    ordenes,
    comprobantes,
    cobros,
    nextNumeroPresupuesto: maxNumero(presupuestos) + 1,
    nextNumeroOrden,
    nextNumeroComprobante,
    nextNumeroCobro: maxNumero(cobros) + 1,
    config: SEED_STATE.config,
  };
}

// ─── Context ─────────────────────────────────────────────────

const VentasContext = createContext<VentasState | null>(null);
const VentasDispatchContext = createContext<Dispatch<VentasAction> | null>(null);

const emptyState: VentasState = {
  categorias: [],
  clientes: [clienteConsumidorFinal],
  presupuestos: [],
  ordenes: [],
  comprobantes: [],
  cobros: [],
  nextNumeroPresupuesto: 1,
  nextNumeroOrden: { pedido: 1, produccion: 1, servicio: 1 },
  nextNumeroComprobante: { factura: 1, recibo: 1, nota_credito: 1, nota_debito: 1 },
  nextNumeroCobro: 1,
  config: SEED_STATE.config,
};

export function VentasProvider({ children }: { children: ReactNode }) {
  const { cliente } = useClienteActual();
  const [state, rawDispatch] = useReducer(ventasReducer, emptyState);

  useEffect(() => {
    let activo = true;
    if (!cliente?.id) return;
    fetchVentasState().then((data) => {
      if (activo) rawDispatch({ type: 'SET_STATE', payload: data });
    });
    return () => {
      activo = false;
    };
  }, [cliente?.id]);

  const dispatch = useMemo<Dispatch<VentasAction>>(() => {
    return (action: VentasAction) => {
      const nextState = ventasReducer(state, action);
      rawDispatch(action);
      if (cliente?.id) syncToSupabase(action, nextState, cliente.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cliente?.id]);

  return (
    <VentasContext.Provider value={state}>
      <VentasDispatchContext.Provider value={dispatch}>{children}</VentasDispatchContext.Provider>
    </VentasContext.Provider>
  );
}

// ─── Hooks base (idénticos a la versión anterior) ─────────────

export function useVentas(): VentasState {
  const ctx = useContext(VentasContext);
  if (!ctx) throw new Error('useVentas debe usarse dentro de <VentasProvider>');
  return ctx;
}

export function useVentasDispatch(): Dispatch<VentasAction> {
  const ctx = useContext(VentasDispatchContext);
  if (!ctx) throw new Error('useVentasDispatch debe usarse dentro de <VentasProvider>');
  return ctx;
}

export function useClientes(): Cliente[] {
  const { clientes } = useVentas();
  return clientes;
}

export function useCliente(id: string): Cliente | undefined {
  const { clientes } = useVentas();
  return useMemo(() => clientes.find((c) => c.id === id), [clientes, id]);
}

interface FiltroPresupuestos {
  estado?: EstadoPresupuesto;
  clienteId?: string;
}

export function usePresupuestos(filtro?: FiltroPresupuestos): Presupuesto[] {
  const { presupuestos } = useVentas();
  return useMemo(() => {
    if (!filtro) return presupuestos;
    return presupuestos.filter((p) => {
      if (filtro.estado && p.estado !== filtro.estado) return false;
      if (filtro.clienteId && p.clienteId !== filtro.clienteId) return false;
      return true;
    });
  }, [presupuestos, filtro?.estado, filtro?.clienteId]);
}

interface FiltroOrdenes {
  tipo?: TipoOrden;
  estado?: EstadoOrden;
  clienteId?: string;
}

export function useOrdenes(filtro?: FiltroOrdenes): Orden[] {
  const { ordenes } = useVentas();
  return useMemo(() => {
    if (!filtro) return ordenes;
    return ordenes.filter((o) => {
      if (filtro.tipo && o.tipo !== filtro.tipo) return false;
      if (filtro.estado && o.estado !== filtro.estado) return false;
      if (filtro.clienteId && o.clienteId !== filtro.clienteId) return false;
      return true;
    });
  }, [ordenes, filtro?.tipo, filtro?.estado, filtro?.clienteId]);
}

interface FiltroComprobantes {
  tipo?: TipoComprobante;
  estado?: EstadoComprobante;
  clienteId?: string;
}

export function useComprobantes(filtro?: FiltroComprobantes): Comprobante[] {
  const { comprobantes } = useVentas();
  return useMemo(() => {
    if (!filtro) return comprobantes;
    return comprobantes.filter((c) => {
      if (filtro.tipo && c.tipo !== filtro.tipo) return false;
      if (filtro.estado && c.estado !== filtro.estado) return false;
      if (filtro.clienteId && c.clienteId !== filtro.clienteId) return false;
      return true;
    });
  }, [comprobantes, filtro?.tipo, filtro?.estado, filtro?.clienteId]);
}

export function useCobros(clienteId?: string): Cobro[] {
  const { cobros } = useVentas();
  return useMemo(() => {
    if (!clienteId) return cobros;
    return cobros.filter((c) => c.clienteId === clienteId);
  }, [cobros, clienteId]);
}

interface DashboardStats {
  ventasDelMes: number;
  ventasSemana: number;
  ventasHoy: number;
  pendienteCobro: number;
  unidadesVendidas: number;
  topClientes: { clienteId: string; nombre: string; total: number }[];
  topProductos: { descripcion: string; cantidad: number; total: number }[];
}

export function useDashboardStats(): DashboardStats {
  const { comprobantes, clientes } = useVentas();

  return useMemo(() => {
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const hace7Dias = new Date(ahora);
    hace7Dias.setDate(hace7Dias.getDate() - 7);
    const hoyStr = ahora.toISOString().split('T')[0];

    const facturas = comprobantes.filter((c) => c.tipo === 'factura' && c.estado !== 'anulado');
    const facturasMes = facturas.filter((c) => new Date(c.fecha) >= inicioMes);
    const facturasSemana = facturas.filter((c) => new Date(c.fecha) >= hace7Dias);
    const facturasHoy = facturas.filter((c) => c.fecha === hoyStr);

    const ventasDelMes = facturasMes.reduce((sum, c) => sum + c.total, 0);
    const ventasSemana = facturasSemana.reduce((sum, c) => sum + c.total, 0);
    const ventasHoy = facturasHoy.reduce((sum, c) => sum + c.total, 0);

    const pendienteCobro = comprobantes
      .filter((c) => c.estado === 'emitido' || c.estado === 'cobrado_parcial')
      .reduce((sum, c) => sum + c.saldoPendiente, 0);

    const unidadesVendidas = facturasMes.reduce((sum, c) => sum + c.items.reduce((s, item) => s + item.cantidad, 0), 0);

    const clienteTotals = new Map<string, number>();
    for (const f of facturasMes) {
      clienteTotals.set(f.clienteId, (clienteTotals.get(f.clienteId) || 0) + f.total);
    }
    const topClientes = Array.from(clienteTotals.entries())
      .map(([clienteId, total]) => {
        const cliente = clientes.find((c) => c.id === clienteId);
        return { clienteId, nombre: cliente?.nombre ?? 'Desconocido', total };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const productoMap = new Map<string, { cantidad: number; total: number }>();
    for (const f of facturasMes) {
      for (const item of f.items) {
        const key = item.descripcion;
        const prev = productoMap.get(key) || { cantidad: 0, total: 0 };
        productoMap.set(key, { cantidad: prev.cantidad + item.cantidad, total: prev.total + item.subtotal });
      }
    }
    const topProductos = Array.from(productoMap.entries())
      .map(([descripcion, { cantidad, total }]) => ({ descripcion, cantidad, total }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);

    return { ventasDelMes, ventasSemana, ventasHoy, pendienteCobro, unidadesVendidas, topClientes, topProductos };
  }, [comprobantes, clientes]);
}

export type { VentasAction };
