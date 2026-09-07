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
  Ingreso,
  TarjetaCredito,
  ResumenTarjeta,
  ConsumoTarjeta,
  EstadoResumenTarjeta,
  CategoriaGasto,
  Vehiculo,
  Inmueble,
  ServicioHogar,
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
  // Fase 70 -- Ingresos y Tarjetas de crédito.
  | { type: 'ADD_INGRESO'; payload: Ingreso }
  | { type: 'DELETE_INGRESO'; payload: { id: string } }
  | { type: 'ADD_TARJETA'; payload: TarjetaCredito }
  | { type: 'UPDATE_TARJETA'; payload: TarjetaCredito }
  | { type: 'TOGGLE_TARJETA_ACTIVA'; payload: { id: string } }
  | { type: 'ADD_RESUMEN_TARJETA'; payload: ResumenTarjeta }
  | { type: 'PAGAR_RESUMEN_TARJETA'; payload: { resumenId: string; monto: number; fecha: string; medioPago: LineaPago['medioPago']; cuentaBancariaId?: string } }
  // Fase 72 -- consumos "abiertos" (día a día, sin resumen todavía).
  | { type: 'ADD_CONSUMO_ABIERTO'; payload: ConsumoTarjeta }
  | { type: 'DELETE_CONSUMO_ABIERTO'; payload: { id: string } }
  // Fase 74 -- Vehículos, Inmuebles y Servicios (pagos de servicios continuos).
  | { type: 'ADD_VEHICULO'; payload: Vehiculo }
  | { type: 'UPDATE_VEHICULO'; payload: Vehiculo }
  | { type: 'TOGGLE_VEHICULO_ACTIVO'; payload: { id: string } }
  | { type: 'ADD_INMUEBLE'; payload: Inmueble }
  | { type: 'UPDATE_INMUEBLE'; payload: Inmueble }
  | { type: 'TOGGLE_INMUEBLE_ACTIVO'; payload: { id: string } }
  | { type: 'ADD_SERVICIO_HOGAR'; payload: ServicioHogar }
  | { type: 'UPDATE_SERVICIO_HOGAR'; payload: ServicioHogar }
  | { type: 'TOGGLE_SERVICIO_HOGAR_ACTIVO'; payload: { id: string } }
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

    // ─── Fase 70: Ingresos ────────────────────────────────────
    case 'ADD_INGRESO':
      return { ...state, ingresos: [...state.ingresos, action.payload] };

    case 'DELETE_INGRESO':
      return { ...state, ingresos: state.ingresos.filter((i) => i.id !== action.payload.id) };

    // ─── Fase 70: Tarjetas de crédito ─────────────────────────
    case 'ADD_TARJETA':
      return { ...state, tarjetas: [...state.tarjetas, action.payload] };

    case 'UPDATE_TARJETA':
      return { ...state, tarjetas: state.tarjetas.map((t) => (t.id === action.payload.id ? action.payload : t)) };

    case 'TOGGLE_TARJETA_ACTIVA':
      return {
        ...state,
        tarjetas: state.tarjetas.map((t) =>
          t.id === action.payload.id ? { ...t, activa: !t.activa, updatedAt: now } : t,
        ),
      };

    case 'ADD_RESUMEN_TARJETA': {
      // Fase 72: si algún consumo del resumen reusa el id de un consumo
      // "abierto" (prellenado desde ResumenTarjetaDialog, ver
      // TarjetasCredito.tsx), ese abierto queda facturado -- se saca de
      // la lista de abiertos para no contarlo dos veces.
      const idsFacturados = new Set(action.payload.consumos.map((c) => c.id));
      return {
        ...state,
        resumenesTarjeta: [...state.resumenesTarjeta, action.payload],
        consumosAbiertos: state.consumosAbiertos.filter((c) => !idsFacturados.has(c.id)),
      };
    }

    case 'ADD_CONSUMO_ABIERTO':
      return { ...state, consumosAbiertos: [...state.consumosAbiertos, action.payload] };

    case 'DELETE_CONSUMO_ABIERTO':
      return { ...state, consumosAbiertos: state.consumosAbiertos.filter((c) => c.id !== action.payload.id) };

    // ─── Fase 74: Vehículos ────────────────────────────────────
    case 'ADD_VEHICULO':
      return { ...state, vehiculos: [...state.vehiculos, action.payload] };

    case 'UPDATE_VEHICULO':
      return { ...state, vehiculos: state.vehiculos.map((v) => (v.id === action.payload.id ? action.payload : v)) };

    case 'TOGGLE_VEHICULO_ACTIVO':
      return {
        ...state,
        vehiculos: state.vehiculos.map((v) =>
          v.id === action.payload.id ? { ...v, activo: !v.activo, updatedAt: now } : v,
        ),
      };

    // ─── Fase 74: Inmuebles ────────────────────────────────────
    case 'ADD_INMUEBLE':
      return { ...state, inmuebles: [...state.inmuebles, action.payload] };

    case 'UPDATE_INMUEBLE':
      return { ...state, inmuebles: state.inmuebles.map((i) => (i.id === action.payload.id ? action.payload : i)) };

    case 'TOGGLE_INMUEBLE_ACTIVO':
      return {
        ...state,
        inmuebles: state.inmuebles.map((i) =>
          i.id === action.payload.id ? { ...i, activo: !i.activo, updatedAt: now } : i,
        ),
      };

    // ─── Fase 74: Servicios (obligaciones recurrentes) ─────────
    case 'ADD_SERVICIO_HOGAR':
      return { ...state, serviciosHogar: [...state.serviciosHogar, action.payload] };

    case 'UPDATE_SERVICIO_HOGAR':
      return { ...state, serviciosHogar: state.serviciosHogar.map((s) => (s.id === action.payload.id ? action.payload : s)) };

    case 'TOGGLE_SERVICIO_HOGAR_ACTIVO':
      return {
        ...state,
        serviciosHogar: state.serviciosHogar.map((s) =>
          s.id === action.payload.id ? { ...s, activo: !s.activo, updatedAt: now } : s,
        ),
      };

    case 'PAGAR_RESUMEN_TARJETA': {
      const resumen = state.resumenesTarjeta.find((r) => r.id === action.payload.resumenId);
      if (!resumen) return state;
      const nuevoMontoPagado = resumen.montoPagado + action.payload.monto;
      const nuevoSaldo = Math.max(0, resumen.total - nuevoMontoPagado);
      const estado: EstadoResumenTarjeta = nuevoSaldo <= 0.01 ? 'pagado' : nuevoMontoPagado > 0 ? 'pagado_parcial' : 'pendiente';
      return {
        ...state,
        resumenesTarjeta: state.resumenesTarjeta.map((r) =>
          r.id === resumen.id
            ? { ...r, montoPagado: nuevoMontoPagado, saldoPendiente: nuevoSaldo, estado, updatedAt: now }
            : r,
        ),
      };
    }

    default:
      return state;
  }
}

// ─── Fase 70 -- matcheo de cuotas contra resúmenes anteriores ─────
// Cuando se carga un resumen nuevo con un consumo "cuota 3/12" hay que
// encontrar la fila de la cuota 2/12 de la MISMA compra (en un resumen
// anterior, misma tarjeta) para heredar su `compraId` y así poder ver
// todas las cuotas de una compra agrupadas. Mismo criterio de similitud
// de texto que matchearItemsFacturaConOc en
// netlify/functions/_lib/agenteComprobanteCompra.js (Fase 69b) --
// duplicado acá a propósito porque ese archivo corre en Node/Netlify y
// éste en el browser, no hay un módulo compartido entre ambos hoy.

const PALABRAS_FILLER_CUOTA = new Set(['de', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'del', 'al', 'en', 'con']);

function normalizarTextoCuota(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !PALABRAS_FILLER_CUOTA.has(t));
}

function scoreDescripcionCuota(a: string, b: string): number {
  const tokensA = normalizarTextoCuota(a);
  const tokensB = normalizarTextoCuota(b);
  if (!tokensA.length || !tokensB.length) return 0;
  const setB = new Set(tokensB);
  const comunes = tokensA.filter((t) => setB.has(t)).length;
  return comunes / Math.min(tokensA.length, tokensB.length);
}

const UMBRAL_MATCH_CUOTA = 0.5;

/** Para cada consumo nuevo con cuotasTotales > 1, busca en TODOS los
 * consumos ya cargados de la misma tarjeta uno que sea "la cuota
 * anterior" de la misma compra (cuotaActual - 1, mismas cuotasTotales,
 * descripción parecida) y le copia el compraId. Si no encuentra nada,
 * genera un compraId nuevo (primera cuota vista de esa compra). Nunca
 * pisa un compraId ya asignado a mano.
 */
export function encadenarCuotasTarjeta(
  tarjetaId: string,
  consumosNuevos: ConsumoTarjeta[],
  resumenesExistentes: ResumenTarjeta[],
): ConsumoTarjeta[] {
  const consumosPrevios = resumenesExistentes
    .filter((r) => r.tarjetaId === tarjetaId)
    .flatMap((r) => r.consumos);

  return consumosNuevos.map((c) => {
    if (c.compraId || c.cuotasTotales <= 1) return c;
    let mejor: ConsumoTarjeta | null = null;
    let mejorScore = 0;
    for (const prev of consumosPrevios) {
      if (prev.cuotasTotales !== c.cuotasTotales) continue;
      if (prev.cuotaActual !== c.cuotaActual - 1) continue;
      const score = scoreDescripcionCuota(c.descripcion, prev.descripcion);
      if (score > mejorScore) {
        mejorScore = score;
        mejor = prev;
      }
    }
    if (mejor && mejorScore >= UMBRAL_MATCH_CUOTA && mejor.compraId) {
      return { ...c, compraId: mejor.compraId };
    }
    return { ...c, compraId: c.compraId ?? generarId() };
  });
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
    ingresos_brutos: p.ingresosBrutos ?? null,
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
    servicio_hogar_id: c.servicioHogarId ?? null,
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

function ingresoToRow(i: Ingreso, clienteId: string) {
  return {
    id: i.id,
    cliente_id: clienteId,
    fecha: i.fecha,
    tipo: i.tipo,
    origen: i.origen ?? null,
    usuario_cliente_id: i.usuarioClienteId ?? null,
    concepto: i.concepto ?? null,
    monto: i.monto,
    medio_pago: i.medioPago ?? null,
    recurrente: i.recurrente,
    dia_mes_recurrente: i.diaMesRecurrente ?? null,
    movimiento_caja_id: i.movimientoCajaId ?? null,
    notas: i.notas ?? null,
  };
}

function tarjetaToRow(t: TarjetaCredito, clienteId: string) {
  return {
    id: t.id,
    cliente_id: clienteId,
    nombre: t.nombre,
    banco: t.banco ?? null,
    titular: t.titular ?? null,
    usuario_cliente_id: t.usuarioClienteId ?? null,
    ultimos_digitos: t.ultimosDigitos ?? null,
    dia_cierre: t.diaCierre ?? null,
    dia_vencimiento: t.diaVencimiento ?? null,
    limite: t.limite ?? null,
    activa: t.activa,
  };
}

function resumenTarjetaToRow(r: ResumenTarjeta, clienteId: string) {
  return {
    id: r.id,
    cliente_id: clienteId,
    tarjeta_id: r.tarjetaId,
    periodo: r.periodo,
    fecha_cierre: r.fechaCierre ?? null,
    fecha_vencimiento: r.fechaVencimiento ?? null,
    total: r.total,
    pago_minimo: r.pagoMinimo ?? null,
    estado: r.estado,
    monto_pagado: r.montoPagado,
    saldo_pendiente: r.saldoPendiente,
    notas: r.notas ?? null,
  };
}

function consumoTarjetaToRow(c: ConsumoTarjeta, clienteId: string, tarjetaId: string, resumenId: string | null) {
  return {
    id: c.id,
    cliente_id: clienteId,
    resumen_id: resumenId,
    tarjeta_id: tarjetaId,
    descripcion: c.descripcion,
    fecha_consumo: c.fechaConsumo ?? null,
    monto: c.monto,
    cuota_actual: c.cuotaActual,
    cuotas_totales: c.cuotasTotales,
    compra_id: c.compraId ?? null,
    categoria_gasto_id: c.categoriaGastoId ?? null,
    reintegro_concepto: c.reintegroConcepto ?? null,
    reintegro_monto: c.reintegroMonto ?? null,
  };
}

// Fase 72: si un consumo (de resumen o abierto) trae un reintegro
// esperado, genera su fila en creditos_pendientes -- mismo mecanismo que
// ya existía para líneas de pago (Fase 67), visible en Tesorería >
// Créditos y Reintegros. `modulo: 'home_keep_tarjeta'` distingue que acá
// pago_id apunta a un consumo, no a un pago.
function crearCreditoPorConsumo(c: ConsumoTarjeta, clienteId: string) {
  if (!c.reintegroMonto || c.reintegroMonto <= 0) return;
  supabase
    .from('creditos_pendientes')
    .insert({
      cliente_id: clienteId,
      modulo: 'home_keep_tarjeta',
      pago_id: c.id,
      concepto: c.reintegroConcepto?.trim() || `Reintegro — ${c.descripcion}`,
      monto_esperado: c.reintegroMonto,
      estado: 'pendiente',
    })
    .then(logErr('alta de crédito pendiente por consumo de tarjeta'));
}

function vehiculoToRow(v: Vehiculo, clienteId: string) {
  return {
    id: v.id,
    cliente_id: clienteId,
    usuario_cliente_id: v.usuarioClienteId ?? null,
    patente: v.patente ?? null,
    marca: v.marca ?? null,
    modelo: v.modelo ?? null,
    anio: v.anio ?? null,
    notas: v.notas ?? null,
    activo: v.activo,
  };
}

function inmuebleToRow(i: Inmueble, clienteId: string) {
  return {
    id: i.id,
    cliente_id: clienteId,
    usuario_cliente_id: i.usuarioClienteId ?? null,
    nombre: i.nombre,
    direccion: i.direccion ?? null,
    partida_inmobiliaria: i.partidaInmobiliaria ?? null,
    notas: i.notas ?? null,
    activo: i.activo,
  };
}

function servicioHogarToRow(s: ServicioHogar, clienteId: string) {
  return {
    id: s.id,
    cliente_id: clienteId,
    nombre: s.nombre,
    categoria_gasto_id: s.categoriaGastoId ?? null,
    proveedor_id: s.proveedorId ?? null,
    tipo_vinculo: s.tipoVinculo,
    vehiculo_id: s.vehiculoId ?? null,
    inmueble_id: s.inmuebleId ?? null,
    usuario_cliente_id: s.usuarioClienteId ?? null,
    periodicidad: s.periodicidad,
    dia_vencimiento_aproximado: s.diaVencimientoAproximado ?? null,
    monto_estimado: s.montoEstimado ?? null,
    activo: s.activo,
    notas: s.notas ?? null,
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

    // ─── Fase 70: Ingresos ────────────────────────────────────
    case 'ADD_INGRESO': {
      const i = nextState.ingresos.find((x) => x.id === action.payload.id);
      if (!i) return;
      supabase.from('ingresos_hogar').insert(ingresoToRow(i, clienteId)).then((res) => {
        logErr('alta de ingreso')(res);
      });
      // Doble registro (a pedido de Carlos): un aporte del negocio sale
      // de la Charcutería de verdad -- se refleja como egreso real en su
      // Tesorería, con el mismo medio de pago declarado acá.
      if (i.tipo === 'aporte_negocio' && i.medioPago && i.medioPago !== 'cuenta_corriente') {
        registrarMovimientoTesoreria({
          clienteId,
          tipo: 'egreso',
          medioPago: i.medioPago,
          monto: i.monto,
          concepto: `Aporte a Hogar${i.concepto ? ` — ${i.concepto}` : ''}`,
          categoria: 'Aportes al hogar',
          fecha: i.fecha,
          // Home Keep comparte el mismo circuito de Tesorería que Compras
          // (mismo shim que el resto de este archivo).
          origenModulo: 'compras',
          origenId: i.id,
        });
      }
      return;
    }

    case 'DELETE_INGRESO':
      supabase.from('ingresos_hogar').delete().eq('id', action.payload.id).then(logErr('borrado de ingreso'));
      return;

    // ─── Fase 70: Tarjetas de crédito ─────────────────────────
    case 'ADD_TARJETA':
      supabase.from('tarjetas_credito_hogar').insert(tarjetaToRow(action.payload, clienteId)).then(logErr('alta de tarjeta'));
      return;

    case 'UPDATE_TARJETA':
      supabase.from('tarjetas_credito_hogar').update(tarjetaToRow(action.payload, clienteId)).eq('id', action.payload.id).then(logErr('edición de tarjeta'));
      return;

    case 'TOGGLE_TARJETA_ACTIVA': {
      const t = nextState.tarjetas.find((x) => x.id === action.payload.id);
      if (t) supabase.from('tarjetas_credito_hogar').update({ activa: t.activa }).eq('id', t.id).then(logErr('activar/desactivar tarjeta'));
      return;
    }

    case 'ADD_RESUMEN_TARJETA': {
      const r = nextState.resumenesTarjeta.find((x) => x.id === action.payload.id);
      if (!r) return;
      supabase
        .from('resumenes_tarjeta_hogar')
        .insert(resumenTarjetaToRow(r, clienteId))
        .then((res) => {
          logErr('alta de resumen de tarjeta')(res);
          if (!res.error && r.consumos.length) {
            // Fase 72: upsert en vez de insert -- si el consumo ya existía
            // "abierto" (mismo id, prellenado desde TarjetasCredito.tsx),
            // esto lo actualiza en el lugar (le fija resumen_id) en vez de
            // duplicarlo.
            supabase
              .from('consumos_tarjeta_hogar')
              .upsert(r.consumos.map((c) => consumoTarjetaToRow(c, clienteId, r.tarjetaId, r.id)))
              .then(logErr('consumos de resumen de tarjeta'));
            r.consumos.forEach((c) => crearCreditoPorConsumo(c, clienteId));
          }
        });
      return;
    }

    // ─── Fase 72: consumos "abiertos" (día a día) ─────────────
    case 'ADD_CONSUMO_ABIERTO': {
      const c = action.payload;
      supabase
        .from('consumos_tarjeta_hogar')
        .insert(consumoTarjetaToRow(c, clienteId, c.tarjetaId, null))
        .then(logErr('alta de consumo abierto de tarjeta'));
      crearCreditoPorConsumo(c, clienteId);
      return;
    }

    case 'DELETE_CONSUMO_ABIERTO':
      supabase.from('consumos_tarjeta_hogar').delete().eq('id', action.payload.id).then(logErr('borrado de consumo abierto de tarjeta'));
      return;

    // ─── Fase 74: Vehículos ────────────────────────────────────
    case 'ADD_VEHICULO':
      supabase.from('vehiculos_hogar').insert(vehiculoToRow(action.payload, clienteId)).then(logErr('alta de vehículo'));
      return;

    case 'UPDATE_VEHICULO':
      supabase.from('vehiculos_hogar').update(vehiculoToRow(action.payload, clienteId)).eq('id', action.payload.id).then(logErr('edición de vehículo'));
      return;

    case 'TOGGLE_VEHICULO_ACTIVO': {
      const v = nextState.vehiculos.find((x) => x.id === action.payload.id);
      if (v) supabase.from('vehiculos_hogar').update({ activo: v.activo }).eq('id', v.id).then(logErr('activar/desactivar vehículo'));
      return;
    }

    // ─── Fase 74: Inmuebles ────────────────────────────────────
    case 'ADD_INMUEBLE':
      supabase.from('inmuebles_hogar').insert(inmuebleToRow(action.payload, clienteId)).then(logErr('alta de inmueble'));
      return;

    case 'UPDATE_INMUEBLE':
      supabase.from('inmuebles_hogar').update(inmuebleToRow(action.payload, clienteId)).eq('id', action.payload.id).then(logErr('edición de inmueble'));
      return;

    case 'TOGGLE_INMUEBLE_ACTIVO': {
      const i = nextState.inmuebles.find((x) => x.id === action.payload.id);
      if (i) supabase.from('inmuebles_hogar').update({ activo: i.activo }).eq('id', i.id).then(logErr('activar/desactivar inmueble'));
      return;
    }

    // ─── Fase 74: Servicios (obligaciones recurrentes) ─────────
    case 'ADD_SERVICIO_HOGAR':
      supabase.from('servicios_hogar').insert(servicioHogarToRow(action.payload, clienteId)).then(logErr('alta de servicio'));
      return;

    case 'UPDATE_SERVICIO_HOGAR':
      supabase.from('servicios_hogar').update(servicioHogarToRow(action.payload, clienteId)).eq('id', action.payload.id).then(logErr('edición de servicio'));
      return;

    case 'TOGGLE_SERVICIO_HOGAR_ACTIVO': {
      const s = nextState.serviciosHogar.find((x) => x.id === action.payload.id);
      if (s) supabase.from('servicios_hogar').update({ activo: s.activo }).eq('id', s.id).then(logErr('activar/desactivar servicio'));
      return;
    }

    case 'PAGAR_RESUMEN_TARJETA': {
      const r = nextState.resumenesTarjeta.find((x) => x.id === action.payload.resumenId);
      if (!r) return;
      const tarjeta = nextState.tarjetas.find((t) => t.id === r.tarjetaId);
      supabase
        .from('resumenes_tarjeta_hogar')
        .update({ monto_pagado: r.montoPagado, saldo_pendiente: r.saldoPendiente, estado: r.estado })
        .eq('id', r.id)
        .then(logErr('pago de resumen de tarjeta'));
      if (action.payload.medioPago !== 'cuenta_corriente') {
        registrarMovimientoTesoreria({
          clienteId,
          tipo: 'egreso',
          medioPago: action.payload.medioPago,
          monto: action.payload.monto,
          concepto: `Resumen ${tarjeta?.nombre ?? 'tarjeta'} — ${r.periodo}`,
          categoria: 'Tarjeta de crédito',
          fecha: action.payload.fecha,
          origenModulo: 'compras',
          cuentaBancariaId: action.payload.cuentaBancariaId,
          origenId: r.id,
        });
      }
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
  const [proveedoresRes, comprobantesRes, compItemsRes, pagosRes, impRes, ingresosRes, tarjetasRes, resumenesRes, consumosRes, categoriasRes, vehiculosRes, inmueblesRes, serviciosRes] = await Promise.all([
    supabase.from('proveedores_hogar').select('*').order('created_at'),
    supabase.from('comprobantes_hogar').select('*').order('numero'),
    supabase.from('comprobante_hogar_items').select('*'),
    supabase.from('pagos_hogar').select('*').order('numero'),
    supabase.from('pago_hogar_imputaciones').select('*'),
    supabase.from('ingresos_hogar').select('*').order('fecha'),
    supabase.from('tarjetas_credito_hogar').select('*').order('created_at'),
    supabase.from('resumenes_tarjeta_hogar').select('*').order('periodo'),
    supabase.from('consumos_tarjeta_hogar').select('*'),
    // Fase 70g: categorías de gasto personal, para el desglose del Dashboard.
    supabase.from('categorias_gasto').select('id, nombre').order('nombre'),
    // Fase 74: vehículos, inmuebles y servicios (pagos de servicios continuos).
    supabase.from('vehiculos_hogar').select('*').order('created_at'),
    supabase.from('inmuebles_hogar').select('*').order('created_at'),
    supabase.from('servicios_hogar').select('*').order('created_at'),
  ]);

  const categoriasGasto: CategoriaGasto[] = (categoriasRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
  }));

  const proveedores: Proveedor[] = (proveedoresRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    nombreFantasia: r.nombre_fantasia ?? undefined,
    cuit: r.cuit ?? '',
    condicionIva: r.condicion_iva,
    ingresosBrutos: r.ingresos_brutos ?? undefined,
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
    servicioHogarId: r.servicio_hogar_id ?? undefined,
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

  const ingresos: Ingreso[] = (ingresosRes.data ?? []).map((r: any) => ({
    id: r.id,
    fecha: r.fecha,
    tipo: r.tipo,
    origen: r.origen ?? undefined,
    usuarioClienteId: r.usuario_cliente_id ?? undefined,
    concepto: r.concepto ?? undefined,
    monto: Number(r.monto),
    medioPago: r.medio_pago ?? undefined,
    recurrente: r.recurrente,
    diaMesRecurrente: r.dia_mes_recurrente ?? undefined,
    movimientoCajaId: r.movimiento_caja_id ?? undefined,
    notas: r.notas ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const tarjetas: TarjetaCredito[] = (tarjetasRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    banco: r.banco ?? undefined,
    titular: r.titular ?? undefined,
    usuarioClienteId: r.usuario_cliente_id ?? undefined,
    ultimosDigitos: r.ultimos_digitos ?? undefined,
    diaCierre: r.dia_cierre ?? undefined,
    diaVencimiento: r.dia_vencimiento ?? undefined,
    limite: r.limite != null ? Number(r.limite) : undefined,
    activa: r.activa,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  // Fase 72: un consumo con resumen_id null es "abierto" (todavía sin
  // facturar en ningún resumen mensual) -- se separa aparte en vez de
  // agruparse por resumen.
  const consumosByResumen = new Map<string, ConsumoTarjeta[]>();
  const consumosAbiertos: ConsumoTarjeta[] = [];
  for (const r of consumosRes.data ?? []) {
    const consumo: ConsumoTarjeta = {
      id: r.id,
      tarjetaId: r.tarjeta_id,
      resumenId: r.resumen_id ?? undefined,
      descripcion: r.descripcion,
      fechaConsumo: r.fecha_consumo ?? undefined,
      monto: Number(r.monto),
      cuotaActual: r.cuota_actual,
      cuotasTotales: r.cuotas_totales,
      compraId: r.compra_id ?? undefined,
      categoriaGastoId: r.categoria_gasto_id ?? undefined,
      reintegroConcepto: r.reintegro_concepto ?? undefined,
      reintegroMonto: r.reintegro_monto != null ? Number(r.reintegro_monto) : undefined,
    };
    if (!r.resumen_id) {
      consumosAbiertos.push(consumo);
      continue;
    }
    const arr = consumosByResumen.get(r.resumen_id) ?? [];
    arr.push(consumo);
    consumosByResumen.set(r.resumen_id, arr);
  }

  const resumenesTarjeta: ResumenTarjeta[] = (resumenesRes.data ?? []).map((r: any) => ({
    id: r.id,
    tarjetaId: r.tarjeta_id,
    periodo: r.periodo,
    fechaCierre: r.fecha_cierre ?? undefined,
    fechaVencimiento: r.fecha_vencimiento ?? undefined,
    total: Number(r.total),
    pagoMinimo: r.pago_minimo != null ? Number(r.pago_minimo) : undefined,
    estado: r.estado,
    montoPagado: Number(r.monto_pagado),
    saldoPendiente: Number(r.saldo_pendiente),
    consumos: consumosByResumen.get(r.id) ?? [],
    notas: r.notas ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const vehiculos: Vehiculo[] = (vehiculosRes.data ?? []).map((r: any) => ({
    id: r.id,
    usuarioClienteId: r.usuario_cliente_id ?? undefined,
    patente: r.patente ?? undefined,
    marca: r.marca ?? undefined,
    modelo: r.modelo ?? undefined,
    anio: r.anio ?? undefined,
    notas: r.notas ?? undefined,
    activo: r.activo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const inmuebles: Inmueble[] = (inmueblesRes.data ?? []).map((r: any) => ({
    id: r.id,
    usuarioClienteId: r.usuario_cliente_id ?? undefined,
    nombre: r.nombre,
    direccion: r.direccion ?? undefined,
    partidaInmobiliaria: r.partida_inmobiliaria ?? undefined,
    notas: r.notas ?? undefined,
    activo: r.activo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const serviciosHogar: ServicioHogar[] = (serviciosRes.data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    categoriaGastoId: r.categoria_gasto_id ?? undefined,
    proveedorId: r.proveedor_id ?? undefined,
    tipoVinculo: r.tipo_vinculo,
    vehiculoId: r.vehiculo_id ?? undefined,
    inmuebleId: r.inmueble_id ?? undefined,
    usuarioClienteId: r.usuario_cliente_id ?? undefined,
    periodicidad: r.periodicidad,
    diaVencimientoAproximado: r.dia_vencimiento_aproximado ?? undefined,
    montoEstimado: r.monto_estimado != null ? Number(r.monto_estimado) : undefined,
    activo: r.activo,
    notas: r.notas ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return {
    proveedores,
    comprobantes,
    pagos,
    ingresos,
    tarjetas,
    resumenesTarjeta,
    consumosAbiertos,
    categoriasGasto,
    vehiculos,
    inmuebles,
    serviciosHogar,
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
  ingresos: [],
  tarjetas: [],
  resumenesTarjeta: [],
  consumosAbiertos: [],
  categoriasGasto: [],
  vehiculos: [],
  inmuebles: [],
  serviciosHogar: [],
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
  /** Fase 70g: desglose de gastos del mes por categoría de gasto personal
   * (agrupado por ítem, no por comprobante -- ver ItemComprobante.categoriaGastoId).
   * Los ítems sin categoría asignada se agrupan bajo categoriaId null,
   * "Sin categorizar", para que sea visible cuánto falta clasificar. */
  topCategorias: { categoriaId: string | null; nombre: string; total: number }[];
}

export function useDashboardHomeKeep(): DashboardHomeKeepStats {
  const { comprobantes, proveedores, categoriasGasto } = useHomeKeep();
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

    const categoriaTotals = new Map<string, number>();
    const SIN_CATEGORIZAR = '__sin_categorizar__';
    for (const f of facturasMes) {
      for (const item of f.items) {
        const clave = item.categoriaGastoId ?? SIN_CATEGORIZAR;
        const totalItem = item.subtotal + item.montoIva;
        categoriaTotals.set(clave, (categoriaTotals.get(clave) || 0) + totalItem);
      }
    }
    const topCategorias = Array.from(categoriaTotals.entries())
      .map(([clave, total]) => {
        if (clave === SIN_CATEGORIZAR) {
          return { categoriaId: null, nombre: 'Sin categorizar', total };
        }
        const categoria = categoriasGasto.find((c) => c.id === clave);
        return { categoriaId: clave, nombre: categoria?.nombre ?? 'Desconocida', total };
      })
      .sort((a, b) => b.total - a.total);

    return { gastosDelMes, pendientePago, proveedoresActivos, topProveedores, topCategorias };
  }, [comprobantes, proveedores, categoriasGasto]);
}

export function useCategoriasGasto(): CategoriaGasto[] {
  const { categoriasGasto } = useHomeKeep();
  return categoriasGasto;
}

// ─── Fase 70: Ingresos y Tarjetas ──────────────────────────────

export function useIngresos(): Ingreso[] {
  const { ingresos } = useHomeKeep();
  return ingresos;
}

export function useTarjetas(): TarjetaCredito[] {
  const { tarjetas } = useHomeKeep();
  return tarjetas;
}

export function useResumenesTarjeta(tarjetaId?: string): ResumenTarjeta[] {
  const { resumenesTarjeta } = useHomeKeep();
  return useMemo(() => {
    if (!tarjetaId) return resumenesTarjeta;
    return resumenesTarjeta.filter((r) => r.tarjetaId === tarjetaId);
  }, [resumenesTarjeta, tarjetaId]);
}

/** Fase 72: consumos cargados el día a día que todavía no aparecieron en
 * ningún resumen mensual (ver ConsumoTarjeta.resumenId). */
export function useConsumosAbiertos(tarjetaId?: string): ConsumoTarjeta[] {
  const { consumosAbiertos } = useHomeKeep();
  return useMemo(() => {
    if (!tarjetaId) return consumosAbiertos;
    return consumosAbiertos.filter((c) => c.tarjetaId === tarjetaId);
  }, [consumosAbiertos, tarjetaId]);
}

export interface CupoTarjeta {
  limite?: number;
  /** Suma de saldoPendiente de todos los resúmenes no pagados. */
  deudaFacturada: number;
  /** Suma de los consumos abiertos (cargados pero sin facturar todavía). */
  consumidoAbierto: number;
  /** límite - deudaFacturada - consumidoAbierto -- undefined si la
   * tarjeta no tiene límite cargado (no hay con qué calcularlo). */
  disponible?: number;
}

/** Fase 72: cupo disponible de UNA tarjeta -- mismo criterio que la
 * cuenta corriente de un proveedor (Compras): límite menos lo que ya se
 * debe. Acá "lo que se debe" suma dos cosas: los resúmenes ya cerrados y
 * todavía no pagados del todo, más los consumos sueltos del día a día
 * que ya se hicieron pero todavía no aparecieron en ningún resumen.
 */
export function useCupoDisponible(tarjetaId: string): CupoTarjeta {
  const { tarjetas, resumenesTarjeta, consumosAbiertos } = useHomeKeep();
  return useMemo(() => {
    const tarjeta = tarjetas.find((t) => t.id === tarjetaId);
    const deudaFacturada = resumenesTarjeta
      .filter((r) => r.tarjetaId === tarjetaId && r.estado !== 'pagado')
      .reduce((sum, r) => sum + r.saldoPendiente, 0);
    const consumidoAbierto = consumosAbiertos
      .filter((c) => c.tarjetaId === tarjetaId)
      .reduce((sum, c) => sum + c.monto, 0);
    const limite = tarjeta?.limite;
    return {
      limite,
      deudaFacturada,
      consumidoAbierto,
      disponible: limite != null ? limite - deudaFacturada - consumidoAbierto : undefined,
    };
  }, [tarjetas, resumenesTarjeta, consumosAbiertos, tarjetaId]);
}

export interface PuntoGastoAcumulado {
  fecha: string;
  gastoDelDia: number;
  acumulado: number;
}

/** Fase 72: curva de gasto acumulado día a día del período todavía
 * abierto de una tarjeta (para el "informe vivo" del mes) -- solo mira
 * los consumos sueltos (sin resumen), porque una vez que el resumen
 * cierra ese gasto pasa a ser historia, no algo que siga acumulando. */
export function useGastoAcumuladoAbierto(tarjetaId: string): PuntoGastoAcumulado[] {
  const consumos = useConsumosAbiertos(tarjetaId);
  return useMemo(() => {
    const porDia = new Map<string, number>();
    for (const c of consumos) {
      const fecha = c.fechaConsumo ?? 'sin-fecha';
      porDia.set(fecha, (porDia.get(fecha) ?? 0) + c.monto);
    }
    const dias = Array.from(porDia.keys())
      .filter((f) => f !== 'sin-fecha')
      .sort();
    let acumulado = 0;
    return dias.map((fecha) => {
      const gastoDelDia = porDia.get(fecha) ?? 0;
      acumulado += gastoDelDia;
      return { fecha, gastoDelDia, acumulado };
    });
  }, [consumos]);
}

interface SaldoHogar {
  totalIngresos: number;
  totalEgresos: number;
  saldoDisponible: number;
}

/** Saldo "de bolsillo" del hogar: todo lo que entró (Ingresos) menos
 * todo lo que salió por Comprobantes (Compras/servicios pagados) y
 * Pagos confirmados -- NO incluye resúmenes de tarjeta todavía
 * pendientes de pago (esos son deuda futura, no salida de caja hoy). */
export function useSaldoHogar(): SaldoHogar {
  const { ingresos, comprobantes } = useHomeKeep();
  return useMemo(() => {
    const totalIngresos = ingresos.reduce((sum, i) => sum + i.monto, 0);
    // comprobante.montoPagado ya acumula TODO lo pagado de esa factura,
    // sea que se pagó al instante (ADD_COMPROBANTE) o después a través de
    // un Pago (CONFIRMAR_PAGO actualiza montoPagado de cada comprobante
    // imputado) -- sumar además pago.monto duplicaría esa misma plata.
    const totalEgresos = comprobantes.filter((c) => c.estado !== 'anulado').reduce((sum, c) => sum + c.montoPagado, 0);
    return { totalIngresos, totalEgresos, saldoDisponible: totalIngresos - totalEgresos };
  }, [ingresos, comprobantes]);
}

// ─── Fase 74: Vehículos, Inmuebles y Servicios ─────────────────

export function useVehiculos(): Vehiculo[] {
  const { vehiculos } = useHomeKeep();
  return vehiculos;
}

export function useVehiculo(id?: string): Vehiculo | undefined {
  const { vehiculos } = useHomeKeep();
  return useMemo(() => vehiculos.find((v) => v.id === id), [vehiculos, id]);
}

/** Vehículos de un integrante puntual -- para mostrarlos en su ficha de
 * Perfil Familiar (mismo criterio que useTarjetas filtrado a mano por
 * usuarioClienteId en EditarFamiliarDialog). */
export function useVehiculosDeIntegrante(usuarioClienteId?: string): Vehiculo[] {
  const { vehiculos } = useHomeKeep();
  return useMemo(() => {
    if (!usuarioClienteId) return [];
    return vehiculos.filter((v) => v.usuarioClienteId === usuarioClienteId);
  }, [vehiculos, usuarioClienteId]);
}

export function useInmuebles(): Inmueble[] {
  const { inmuebles } = useHomeKeep();
  return inmuebles;
}

export function useInmueble(id?: string): Inmueble | undefined {
  const { inmuebles } = useHomeKeep();
  return useMemo(() => inmuebles.find((i) => i.id === id), [inmuebles, id]);
}

/** Inmuebles de un integrante puntual (titular único, Fase 74) -- para
 * mostrarlos en su ficha de Perfil Familiar. */
export function useInmueblesDeIntegrante(usuarioClienteId?: string): Inmueble[] {
  const { inmuebles } = useHomeKeep();
  return useMemo(() => {
    if (!usuarioClienteId) return [];
    return inmuebles.filter((i) => i.usuarioClienteId === usuarioClienteId);
  }, [inmuebles, usuarioClienteId]);
}

export function useServiciosHogar(): ServicioHogar[] {
  const { serviciosHogar } = useHomeKeep();
  return serviciosHogar;
}

export function useServicioHogar(id?: string): ServicioHogar | undefined {
  const { serviciosHogar } = useHomeKeep();
  return useMemo(() => serviciosHogar.find((s) => s.id === id), [serviciosHogar, id]);
}

export type EstadoItemPanelServicio = 'cubierto' | 'pendiente_pago' | 'pendiente_carga';

export interface ItemPanelServicio {
  servicio: ServicioHogar;
  /** Comprobante real ya vinculado a este servicio, si llegó (Fase 74:
   * link vía Comprobante.servicioHogarId). undefined = todavía no llegó
   * ningún comprobante para el período actual -- se muestra la
   * estimación (monto/día aproximado) precargada en la Servicio. */
  comprobante?: Comprobante;
  monto: number;
  /** 'cubierto' = ya se pagó (se "desagota" del panel de pendientes,
   * a pedido de Carlos); 'pendiente_pago' = llegó el comprobante real
   * pero todavía no se pagó; 'pendiente_carga' = todavía no llegó
   * ningún comprobante, se muestra la estimación. */
  estado: EstadoItemPanelServicio;
}

/** Fase 74: arma el panel dinámico de "pagos de servicios continuos"
 * pedido por Carlos -- toma cada Servicio activo, busca si ya tiene un
 * Comprobante real vinculado (el más reciente, vía servicioHogarId) y
 * decide su estado: si está pagado se excluye de pendientes (criterio
 * de "desagotarse" pedido explícitamente), si no se muestra con el
 * monto real (comprobante ya cargado) o estimado (todavía no llegó).
 */
export function usePanelServicios(): { items: ItemPanelServicio[]; totalPendiente: number } {
  const { serviciosHogar, comprobantes } = useHomeKeep();
  return useMemo(() => {
    const comprobantesPorServicio = new Map<string, Comprobante[]>();
    for (const c of comprobantes) {
      if (!c.servicioHogarId || c.estado === 'anulado') continue;
      const arr = comprobantesPorServicio.get(c.servicioHogarId) ?? [];
      arr.push(c);
      comprobantesPorServicio.set(c.servicioHogarId, arr);
    }

    const items: ItemPanelServicio[] = serviciosHogar
      .filter((s) => s.activo)
      .map((servicio) => {
        // El más reciente por fecha -- se asume un comprobante real por
        // período (mensual/bimestral/etc.), el anterior ya quedó cerrado.
        const candidatos = (comprobantesPorServicio.get(servicio.id) ?? []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
        const comprobante = candidatos[0];

        if (comprobante) {
          const estado: EstadoItemPanelServicio = comprobante.estado === 'pagado' ? 'cubierto' : 'pendiente_pago';
          return { servicio, comprobante, monto: comprobante.total, estado };
        }
        return { servicio, monto: servicio.montoEstimado ?? 0, estado: 'pendiente_carga' as EstadoItemPanelServicio };
      });

    const totalPendiente = items.filter((i) => i.estado !== 'cubierto').reduce((sum, i) => sum + i.monto, 0);
    return { items, totalPendiente };
  }, [serviciosHogar, comprobantes]);
}

export type { HomeKeepAction };
