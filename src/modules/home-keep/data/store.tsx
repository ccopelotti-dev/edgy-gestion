// ============================================================
// Módulo Home Keep — State Management
// Edgy Gestión · Context + useReducer + Supabase
//
// Clon recortado de compras/data/store.tsx: mismo patrón (Context +
// reducer + sync a Supabase por acción), pero sin Cotizaciones, sin
// Órdenes de Compra y sin nada de stock/recepción (Home Keep no tiene
// catálogo de productos/insumos). Las funciones de Tesorería
// (registrarMovimientoTesoreria, emitirChequeProveedor,
// listarCuentasBancarias) se reutilizan tal cual las usa Compras.
//
// Tablas propias (ver migración de Home Keep): proveedores_hogar,
// comprobantes_hogar, comprobante_hogar_items, pagos_hogar,
// pago_hogar_imputaciones.
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
  HomeKeepState,
  HomeKeepConfig,
  Proveedor,
  Comprobante,
  Pago,
  LineaPago,
  EstadoComprobante,
  TipoComprobante,
  ItemComprobante,
} from '../types';

import { generarId } from '../types';
import { SEED_STATE } from './seed';
import { supabase } from '@/lib/supabase';
import { useClienteActual } from '@/hooks/useClienteActual';
import { registrarMovimientoTesoreria, emitirChequeProveedor } from '@/lib/tesoreriaSync';

// ─── Action Types ──────────────────────────────────────────────

type HomeKeepAction =
  | { type: 'ADD_PROVEEDOR'; payload: Proveedor }
  | { type: 'UPDATE_PROVEEDOR'; payload: Proveedor }
  | { type: 'TOGGLE_PROVEEDOR_ACTIVO'; payload: { id: string } }
  | { type: 'AJUSTAR_SALDO_PROVEEDOR'; payload: { proveedorId: string; delta: number } }
  | { type: 'ADD_COMPROBANTE'; payload: Omit<Comprobante, 'numero'> }
  | { type: 'ANULAR_COMPROBANTE'; payload: { id: string } }
  | { type: 'ACTUALIZAR_PAGO_COMPROBANTE'; payload: { comprobanteId: string; montoPagado: number } }
  | { type: 'ADD_PAGO'; payload: Omit<Pago, 'numero'> }
  | { type: 'CONFIRMAR_PAGO'; payload: { id: string; lineasPago: LineaPago[]; fecha: string } }
  | { type: 'ANULAR_PAGO'; payload: { id: string } }
  | { type: 'UPDATE_CONFIG'; payload: Partial<HomeKeepConfig> }
  | { type: 'SET_STATE'; payload: HomeKeepState };

// ─── Reducer ───────────────────────────────────────────────────

function homeKeepReducer(state: HomeKeepState, action: HomeKeepAction): HomeKeepState {
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

    case 'ADD_COMPROBANTE': {
      const tipo = action.payload.tipo;
      const numero = state.nextNumeroComprobante[tipo];
      const comprobante: Comprobante = { ...action.payload, numero } as Comprobante;

      // Misma lógica que Compras: la deuda real hacia el proveedor la
      // define `saldoPendiente` de la factura, no el `medioPago` declarado.
      let proveedoresDelta: { proveedorId: string; delta: number } | null = null;
      if (tipo === 'factura' && comprobante.saldoPendiente > 0) {
        proveedoresDelta = { proveedorId: comprobante.proveedorId, delta: comprobante.saldoPendiente };
      }
      if (tipo === 'nota_credito') {
        proveedoresDelta = { proveedorId: comprobante.proveedorId, delta: -comprobante.total };
      }

      return {
        ...state,
        comprobantes: [...state.comprobantes, comprobante],
        nextNumeroComprobante: { ...state.nextNumeroComprobante, [tipo]: numero + 1 },
        proveedores: proveedoresDelta
          ? state.proveedores.map((p) =>
              p.id === proveedoresDelta!.proveedorId
                ? { ...p, saldoCuentaCorriente: p.saldoCuentaCorriente + proveedoresDelta!.delta, updatedAt: now }
                : p,
            )
          : state.proveedores,
      };
    }

    case 'ANULAR_COMPROBANTE': {
      const comprobante = state.comprobantes.find((c) => c.id === action.payload.id);
      if (!comprobante || comprobante.estado === 'anulado') return state;

      let proveedoresDelta: { proveedorId: string; delta: number } | null = null;
      if (comprobante.tipo === 'factura' && comprobante.saldoPendiente > 0) {
        proveedoresDelta = { proveedorId: comprobante.proveedorId, delta: -comprobante.saldoPendiente };
      } else if (comprobante.tipo === 'nota_credito') {
        proveedoresDelta = { proveedorId: comprobante.proveedorId, delta: comprobante.total };
      }

      return {
        ...state,
        comprobantes: state.comprobantes.map((c) =>
          c.id === action.payload.id ? { ...c, estado: 'anulado' as EstadoComprobante, updatedAt: now } : c,
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

    case 'ACTUALIZAR_PAGO_COMPROBANTE': {
      const { comprobanteId, montoPagado } = action.payload;
      return {
        ...state,
        comprobantes: state.comprobantes.map((c) => {
          if (c.id !== comprobanteId) return c;
          const saldoPendiente = c.total - montoPagado;
          let estado: EstadoComprobante = c.estado;
          if (c.estado !== 'anulado') {
            // Tolerancia de 1 centavo -- mismo criterio que Compras/Ventas.
            if (saldoPendiente <= 0.01) estado = 'pagado';
            else if (montoPagado > 0) estado = 'pagado_parcial';
            else estado = 'pendiente';
          }
          return { ...c, montoPagado, saldoPendiente: Math.max(0, saldoPendiente), estado, updatedAt: now };
        }),
      };
    }

    case 'ADD_PAGO': {
      // Solo arma el Pago (estado 'pendiente') -- NO toca todavía
      // comprobantes ni saldo del proveedor. Eso se difiere a
      // CONFIRMAR_PAGO, que es cuando el dinero realmente sale.
      const numero = state.nextNumeroPago;
      const pago: Pago = { ...action.payload, numero } as Pago;
      return { ...state, pagos: [...state.pagos, pago], nextNumeroPago: numero + 1 };
    }

    case 'CONFIRMAR_PAGO': {
      const pagoActual = state.pagos.find((p) => p.id === action.payload.id);
      if (!pagoActual || pagoActual.estado !== 'pendiente') return state;

      const pago: Pago = {
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
          let estado: EstadoComprobante = c.estado;
          if (c.estado !== 'anulado') {
            if (nuevoSaldoPendiente <= 0.01) estado = 'pagado';
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
      // Solo se puede anular un Pago que todavía no se confirmó -- no
      // comprometió nada (ni comprobantes, ni saldo, ni Tesorería).
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
    nombre_fantasia: p.nombreFantasia ?? null,
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

function itemComprobanteToRow(item: ItemComprobante, comprobanteId: string) {
  return {
    id: item.id,
    comprobante_id: comprobanteId,
    categoria_gasto_id: item.categoriaGastoId ?? null,
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

function comprobanteToRow(c: Comprobante, clienteId: string) {
  return {
    id: c.id,
    cliente_id: clienteId,
    tipo: c.tipo,
    numero: c.numero,
    proveedor_id: c.proveedorId,
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
    numero_comprobante_proveedor: c.numeroComprobanteProveedor ?? null,
    notas: c.notas ?? null,
  };
}

function pagoToRow(p: Pago, clienteId: string) {
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
  return ({ error }: { error: unknown }) => error && console.error(`Home Keep · error en ${label}:`, error);
}

// ─── Sincronización con Supabase por acción ───────────────────
// Recibe el estado YA actualizado (nextState) para poder leer los
// registros resueltos (con `numero` asignado por el reducer).

function syncToSupabase(action: HomeKeepAction, nextState: HomeKeepState, clienteId: string) {
  switch (action.type) {
    case 'ADD_PROVEEDOR':
      supabase.from('proveedores_hogar').insert(proveedorToRow(action.payload, clienteId)).then(logErr('alta de proveedor'));
      return;

    case 'UPDATE_PROVEEDOR':
      supabase.from('proveedores_hogar').update(proveedorToRow(action.payload, clienteId)).eq('id', action.payload.id).then(logErr('edición de proveedor'));
      return;

    case 'TOGGLE_PROVEEDOR_ACTIVO': {
      const p = nextState.proveedores.find((x) => x.id === action.payload.id);
      if (p) supabase.from('proveedores_hogar').update({ activo: p.activo }).eq('id', p.id).then(logErr('activar/desactivar proveedor'));
      return;
    }

    case 'AJUSTAR_SALDO_PROVEEDOR': {
      const p = nextState.proveedores.find((x) => x.id === action.payload.proveedorId);
      if (p) supabase.from('proveedores_hogar').update({ saldo_cuenta_corriente: p.saldoCuentaCorriente }).eq('id', p.id).then(logErr('ajuste de saldo proveedor'));
      return;
    }

    case 'ADD_COMPROBANTE': {
      const c = nextState.comprobantes.find((x) => x.id === action.payload.id);
      if (!c) return;
      // IMPORTANTE: el INSERT de los items se dispara recién DESPUÉS de que
      // el INSERT del comprobante haya confirmado en Supabase (encadenado
      // con .then, no en paralelo) -- misma prevención de carrera RLS que
      // en Compras.
      supabase
        .from('comprobantes_hogar')
        .insert(comprobanteToRow(c, clienteId))
        .then((res) => {
          logErr('alta de comprobante')(res);
          if (!res.error && c.items.length) {
            supabase.from('comprobante_hogar_items').insert(c.items.map((i) => itemComprobanteToRow(i, c.id))).then(logErr('items de comprobante'));
          }
        });
      const proveedor = nextState.proveedores.find((p) => p.id === c.proveedorId);
      if (proveedor) supabase.from('proveedores_hogar').update({ saldo_cuenta_corriente: proveedor.saldoCuentaCorriente }).eq('id', proveedor.id).then(logErr('saldo proveedor tras comprobante'));
      // Si el comprobante se pagó al instante con un medio que no es cuenta
      // corriente, reflejar el movimiento de dinero real en Tesorería.
      if (c.medioPago !== 'cuenta_corriente' && c.montoPagado > 0) {
        registrarMovimientoTesoreria({
          clienteId,
          tipo: 'egreso',
          medioPago: c.medioPago,
          monto: c.montoPagado,
          concepto: `Comprobante N.º ${c.numero} — ${proveedor?.nombre ?? 'Proveedor'}`,
          categoria: 'Pago a proveedores',
          fecha: c.fecha,
          // Home Keep comparte el mismo circuito de Tesorería que Compras
          // (registrarMovimientoTesoreria no tiene un origen propio para
          // Home Keep todavía) -- ver nota de diseño en el reporte final.
          origenModulo: 'compras',
        });
      }
      return;
    }

    case 'ANULAR_COMPROBANTE': {
      const c = nextState.comprobantes.find((x) => x.id === action.payload.id);
      if (!c) return;
      supabase.from('comprobantes_hogar').update({ estado: c.estado }).eq('id', c.id).then(logErr('anulación de comprobante'));
      const proveedor = nextState.proveedores.find((p) => p.id === c.proveedorId);
      if (proveedor) supabase.from('proveedores_hogar').update({ saldo_cuenta_corriente: proveedor.saldoCuentaCorriente }).eq('id', proveedor.id).then(logErr('saldo proveedor tras anulación'));
      return;
    }

    case 'ACTUALIZAR_PAGO_COMPROBANTE': {
      const c = nextState.comprobantes.find((x) => x.id === action.payload.comprobanteId);
      if (!c) return;
      supabase
        .from('comprobantes_hogar')
        .update({ monto_pagado: c.montoPagado, saldo_pendiente: c.saldoPendiente, estado: c.estado })
        .eq('id', c.id)
        .then(logErr('actualización de pago de comprobante'));
      return;
    }

    case 'ADD_PAGO': {
      // Solo arma el Pago (estado 'pendiente') -- todavía no toca
      // comprobantes, proveedor ni Tesorería. Eso ocurre en CONFIRMAR_PAGO.
      const pago = nextState.pagos.find((x) => x.id === action.payload.id);
      if (!pago) return;
      supabase
        .from('pagos_hogar')
        .insert(pagoToRow(pago, clienteId))
        .then((res) => {
          logErr('alta de pago')(res);
          if (!res.error && pago.imputaciones.length) {
            supabase
              .from('pago_hogar_imputaciones')
              .insert(pago.imputaciones.map((imp) => ({ id: generarId(), pago_id: pago.id, comprobante_id: imp.comprobanteId, monto_imputado: imp.montoImputado })))
              .then(logErr('imputaciones de pago'));
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
        .from('pagos_hogar')
        .update({
          estado: pago.estado,
          lineas_pago: pago.lineasPago,
          fecha_confirmacion: pago.fechaConfirmacion ?? null,
        })
        .eq('id', pago.id)
        .then(logErr('confirmación de pago'));

      for (const imp of pago.imputaciones) {
        const c = nextState.comprobantes.find((x) => x.id === imp.comprobanteId);
        if (c) {
          supabase
            .from('comprobantes_hogar')
            .update({ monto_pagado: c.montoPagado, saldo_pendiente: c.saldoPendiente, estado: c.estado })
            .eq('id', c.id)
            .then(logErr('comprobante actualizado por confirmación de pago'));
        }
      }
      const proveedor = nextState.proveedores.find((p) => p.id === pago.proveedorId);
      if (proveedor) supabase.from('proveedores_hogar').update({ saldo_cuenta_corriente: proveedor.saldoCuentaCorriente }).eq('id', proveedor.id).then(logErr('saldo proveedor tras confirmación de pago'));

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
              notas: `Pago N.º ${pago.numero}`,
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
      supabase.from('pagos_hogar').update({ estado: pago.estado }).eq('id', pago.id).then(logErr('anulación de pago'));
      return;
    }

    default:
      return;
  }
}

// ─── Fetch inicial desde Supabase ──────────────────────────────

function itemComprobanteFromRow(r: any): ItemComprobante {
  return {
    id: r.id,
    categoriaGastoId: r.categoria_gasto_id ?? undefined,
    unidad: r.unidad ?? undefined,
    descripcion: r.descripcion,
    cantidad: Number(r.cantidad),
    precioUnitario: Number(r.precio_unitario),
    descuento: Number(r.descuento),
    subtotal: Number(r.subtotal),
    alicuotaIva: Number(r.alicuota_iva),
    montoIva: Number(r.monto_iva),
  };
}

async function fetchHomeKeepState(): Promise<HomeKeepState> {
  const [proveedoresRes, comprobantesRes, compItemsRes, pagosRes, impRes] = await Promise.all([
    supabase.from('proveedores_hogar').select('*').order('created_at'),
    supabase.from('comprobantes_hogar').select('*').order('numero'),
    supabase.from('comprobante_hogar_items').select('*'),
    supabase.from('pagos_hogar').select('*').order('numero'),
    supabase.from('pago_hogar_imputaciones').select('*'),
  ]);

  const proveedores: Proveedor[] = (proveedoresRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    nombreFantasia: r.nombre_fantasia ?? undefined,
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

  const compItemsByComp = new Map<string, ItemComprobante[]>();
  for (const r of compItemsRes.data ?? []) {
    const arr = compItemsByComp.get(r.comprobante_id) ?? [];
    arr.push(itemComprobanteFromRow(r));
    compItemsByComp.set(r.comprobante_id, arr);
  }

  const comprobantesRaw = comprobantesRes.data ?? [];
  const comprobantes: Comprobante[] = comprobantesRaw.map((r: any) => ({
    id: r.id,
    tipo: r.tipo,
    numero: r.numero,
    proveedorId: r.proveedor_id,
    fecha: r.fecha,
    fechaVencimiento: r.fecha_vencimiento ?? undefined,
    items: compItemsByComp.get(r.id) ?? [],
    subtotal: Number(r.subtotal),
    montoIva: Number(r.monto_iva),
    otrosImpuestos: (r.otros_impuestos ?? []) as Comprobante['otrosImpuestos'],
    total: Number(r.total),
    estado: r.estado,
    medioPago: r.medio_pago,
    montoPagado: Number(r.monto_pagado),
    saldoPendiente: Number(r.saldo_pendiente),
    numeroComprobanteProveedor: r.numero_comprobante_proveedor ?? undefined,
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

  const pagos: Pago[] = (pagosRes.data ?? []).map((r: any) => ({
    id: r.id,
    numero: r.numero,
    proveedorId: r.proveedor_id,
    fecha: r.fecha,
    estado: (r.estado ?? 'pagada') as Pago['estado'],
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
  const nextNumeroComprobante: Record<TipoComprobante, number> = {
    factura: maxNumero(comprobantes.filter((c) => c.tipo === 'factura')) + 1,
    nota_credito: maxNumero(comprobantes.filter((c) => c.tipo === 'nota_credito')) + 1,
    nota_debito: maxNumero(comprobantes.filter((c) => c.tipo === 'nota_debito')) + 1,
  };

  return {
    proveedores,
    comprobantes,
    pagos,
    nextNumeroComprobante,
    nextNumeroPago: maxNumero(pagos) + 1,
    config: SEED_STATE.config,
  };
}

// ─── Context ─────────────────────────────────────────────────

const HomeKeepContext = createContext<HomeKeepState | null>(null);
const HomeKeepDispatchContext = createContext<Dispatch<HomeKeepAction> | null>(null);

const emptyState: HomeKeepState = {
  proveedores: [],
  comprobantes: [],
  pagos: [],
  nextNumeroComprobante: { factura: 1, nota_credito: 1, nota_debito: 1 },
  nextNumeroPago: 1,
  config: SEED_STATE.config,
};

export function HomeKeepProvider({ children }: { children: ReactNode }) {
  const { cliente } = useClienteActual();
  const [state, rawDispatch] = useReducer(homeKeepReducer, emptyState);

  useEffect(() => {
    let activo = true;
    if (!cliente?.id) return;
    fetchHomeKeepState().then((data) => {
      if (activo) rawDispatch({ type: 'SET_STATE', payload: data });
    });
    return () => {
      activo = false;
    };
  }, [cliente?.id]);

  const dispatch = useMemo<Dispatch<HomeKeepAction>>(() => {
    return (action: HomeKeepAction) => {
      const nextState = homeKeepReducer(state, action);
      rawDispatch(action);
      if (cliente?.id) syncToSupabase(action, nextState, cliente.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cliente?.id]);

  return (
    <HomeKeepContext.Provider value={state}>
      <HomeKeepDispatchContext.Provider value={dispatch}>{children}</HomeKeepDispatchContext.Provider>
    </HomeKeepContext.Provider>
  );
}

// ─── Hooks base ────────────────────────────────────────────────

export function useHomeKeep(): HomeKeepState {
  const ctx = useContext(HomeKeepContext);
  if (!ctx) throw new Error('useHomeKeep debe usarse dentro de <HomeKeepProvider>');
  return ctx;
}

export function useHomeKeepDispatch(): Dispatch<HomeKeepAction> {
  const ctx = useContext(HomeKeepDispatchContext);
  if (!ctx) throw new Error('useHomeKeepDispatch debe usarse dentro de <HomeKeepProvider>');
  return ctx;
}

export function useProveedores(): Proveedor[] {
  const { proveedores } = useHomeKeep();
  return proveedores;
}

export function useProveedor(id: string): Proveedor | undefined {
  const { proveedores } = useHomeKeep();
  return useMemo(() => proveedores.find((p) => p.id === id), [proveedores, id]);
}

interface FiltroComprobantes {
  tipo?: TipoComprobante;
  estado?: EstadoComprobante;
  proveedorId?: string;
}

export function useComprobantes(filtro?: FiltroComprobantes): Comprobante[] {
  const { comprobantes } = useHomeKeep();
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

export function usePagos(proveedorId?: string): Pago[] {
  const { pagos } = useHomeKeep();
  return useMemo(() => {
    if (!proveedorId) return pagos;
    return pagos.filter((p) => p.proveedorId === proveedorId);
  }, [pagos, proveedorId]);
}

interface DashboardHomeKeepStats {
  gastosDelMes: number;
  pendientePago: number;
  proveedoresActivos: number;
  topProveedores: { proveedorId: string; nombre: string; total: number }[];
}

export function useDashboardHomeKeep(): DashboardHomeKeepStats {
  const { comprobantes, proveedores } = useHomeKeep();
  return useMemo(() => {
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const facturas = comprobantes.filter((c) => c.tipo === 'factura' && c.estado !== 'anulado');
    const facturasMes = facturas.filter((c) => new Date(c.fecha) >= inicioMes);
    const gastosDelMes = facturasMes.reduce((sum, c) => sum + c.total, 0);
    const pendientePago = comprobantes
      .filter((c) => c.estado === 'pendiente' || c.estado === 'pagado_parcial')
      .reduce((sum, c) => sum + c.saldoPendiente, 0);
    const proveedoresActivos = proveedores.filter((p) => p.activo).length;
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

    return { gastosDelMes, pendientePago, proveedoresActivos, topProveedores };
  }, [comprobantes, proveedores]);
}

export type { HomeKeepAction };
