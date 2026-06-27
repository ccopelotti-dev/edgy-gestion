// ============================================================
// Módulo Compras — State Management
// Edgy Gestión · Context + useReducer + localStorage
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
  ComprasState,
  ComprasConfig,
  Proveedor,
  PedidoCotizacion,
  OrdenCompra,
  ComprobanteCompra,
  PagoCompra,
  EstadoCotizacion,
  EstadoOrdenCompra,
  EstadoComprobanteCompra,
  TipoComprobanteCompra,
  ItemCompra,
} from '../types';

import { generarId } from '../types';
import { SEED_STATE } from './seed';

// ─── Constantes ──────────────────────────────────────────────

const STORAGE_KEY = 'edgy-compras-state';

// ─── Action Types ────────────────────────────────────────────

type ComprasAction =
  // Proveedores
  | { type: 'ADD_PROVEEDOR'; payload: Proveedor }
  | { type: 'UPDATE_PROVEEDOR'; payload: Proveedor }
  | { type: 'TOGGLE_PROVEEDOR_ACTIVO'; payload: { id: string } }
  | { type: 'AJUSTAR_SALDO_PROVEEDOR'; payload: { proveedorId: string; delta: number } }

  // Cotizaciones
  | { type: 'ADD_COTIZACION'; payload: Omit<PedidoCotizacion, 'numero'> }
  | { type: 'UPDATE_COTIZACION'; payload: PedidoCotizacion }
  | { type: 'CAMBIAR_ESTADO_COTIZACION'; payload: { id: string; nuevoEstado: EstadoCotizacion } }
  | { type: 'CONVERTIR_COTIZACION_A_OC'; payload: { cotizacionId: string } }

  // Órdenes de compra
  | { type: 'ADD_ORDEN_COMPRA'; payload: Omit<OrdenCompra, 'numero'> }
  | { type: 'UPDATE_ORDEN_COMPRA'; payload: OrdenCompra }
  | { type: 'CAMBIAR_ESTADO_OC'; payload: { id: string; nuevoEstado: EstadoOrdenCompra } }

  // Comprobantes
  | { type: 'ADD_COMPROBANTE_COMPRA'; payload: Omit<ComprobanteCompra, 'numero'> }
  | { type: 'ANULAR_COMPROBANTE_COMPRA'; payload: { id: string } }
  | { type: 'ACTUALIZAR_PAGO_COMPROBANTE'; payload: { comprobanteId: string; montoPagado: number } }

  // Pagos
  | { type: 'ADD_PAGO'; payload: Omit<PagoCompra, 'numero'> }

  // Config
  | { type: 'UPDATE_CONFIG'; payload: Partial<ComprasConfig> };

// ─── Reducer ─────────────────────────────────────────────────

function comprasReducer(state: ComprasState, action: ComprasAction): ComprasState {
  const now = new Date().toISOString();

  switch (action.type) {
    // ── Proveedores ─────────────────────────────────────────

    case 'ADD_PROVEEDOR':
      return {
        ...state,
        proveedores: [...state.proveedores, action.payload],
      };

    case 'UPDATE_PROVEEDOR':
      return {
        ...state,
        proveedores: state.proveedores.map((p) =>
          p.id === action.payload.id ? action.payload : p
        ),
      };

    case 'TOGGLE_PROVEEDOR_ACTIVO':
      return {
        ...state,
        proveedores: state.proveedores.map((p) =>
          p.id === action.payload.id
            ? { ...p, activo: !p.activo, updatedAt: now }
            : p
        ),
      };

    case 'AJUSTAR_SALDO_PROVEEDOR':
      return {
        ...state,
        proveedores: state.proveedores.map((p) =>
          p.id === action.payload.proveedorId
            ? {
                ...p,
                saldoCuentaCorriente: p.saldoCuentaCorriente + action.payload.delta,
                updatedAt: now,
              }
            : p
        ),
      };

    // ── Cotizaciones ────────────────────────────────────────

    case 'ADD_COTIZACION': {
      const numero = state.nextNumeroCotizacion;
      const cotizacion: PedidoCotizacion = { ...action.payload, numero } as PedidoCotizacion;
      return {
        ...state,
        cotizaciones: [...state.cotizaciones, cotizacion],
        nextNumeroCotizacion: numero + 1,
      };
    }

    case 'UPDATE_COTIZACION':
      return {
        ...state,
        cotizaciones: state.cotizaciones.map((c) =>
          c.id === action.payload.id ? action.payload : c
        ),
      };

    case 'CAMBIAR_ESTADO_COTIZACION':
      return {
        ...state,
        cotizaciones: state.cotizaciones.map((c) =>
          c.id === action.payload.id
            ? { ...c, estado: action.payload.nuevoEstado, updatedAt: now }
            : c
        ),
      };

    case 'CONVERTIR_COTIZACION_A_OC': {
      const { cotizacionId } = action.payload;
      const cotizacion = state.cotizaciones.find((c) => c.id === cotizacionId);
      if (!cotizacion) return state;

      const ordenId = generarId();
      const numeroOC = state.nextNumeroOrdenCompra;

      // Crear items de OC a partir de items de la cotización
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
        fecha: new Date().toISOString().split('T')[0],
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
          c.id === cotizacionId
            ? { ...c, estado: 'aprobado' as const, ordenCompraId: ordenId, updatedAt: now }
            : c
        ),
        ordenesCompra: [...state.ordenesCompra, nuevaOC],
        nextNumeroOrdenCompra: numeroOC + 1,
      };
    }

    // ── Órdenes de Compra ───────────────────────────────────

    case 'ADD_ORDEN_COMPRA': {
      const numero = state.nextNumeroOrdenCompra;
      const orden: OrdenCompra = { ...action.payload, numero } as OrdenCompra;
      return {
        ...state,
        ordenesCompra: [...state.ordenesCompra, orden],
        nextNumeroOrdenCompra: numero + 1,
      };
    }

    case 'UPDATE_ORDEN_COMPRA':
      return {
        ...state,
        ordenesCompra: state.ordenesCompra.map((o) =>
          o.id === action.payload.id ? action.payload : o
        ),
      };

    case 'CAMBIAR_ESTADO_OC':
      return {
        ...state,
        ordenesCompra: state.ordenesCompra.map((o) =>
          o.id === action.payload.id
            ? { ...o, estado: action.payload.nuevoEstado, updatedAt: now }
            : o
        ),
      };

    // ── Comprobantes ────────────────────────────────────────

    case 'ADD_COMPROBANTE_COMPRA': {
      const tipo = action.payload.tipo;
      const numero = state.nextNumeroComprobante[tipo];
      const comprobante: ComprobanteCompra = { ...action.payload, numero } as ComprobanteCompra;

      let proveedoresDelta: { proveedorId: string; delta: number } | null = null;

      // Factura a cuenta corriente: aumentar saldo del proveedor (le debemos más)
      if (tipo === 'factura' && comprobante.medioPago === 'cuenta_corriente') {
        proveedoresDelta = { proveedorId: comprobante.proveedorId, delta: comprobante.total };
      }

      // Nota de crédito: disminuir saldo del proveedor (le debemos menos)
      if (tipo === 'nota_credito') {
        proveedoresDelta = { proveedorId: comprobante.proveedorId, delta: -comprobante.total };
      }

      // Vincular comprobante a la OC si corresponde
      let ordenesCompra = state.ordenesCompra;
      if (comprobante.ordenCompraId) {
        ordenesCompra = ordenesCompra.map((o) =>
          o.id === comprobante.ordenCompraId
            ? { ...o, comprobanteIds: [...o.comprobanteIds, comprobante.id], updatedAt: now }
            : o
        );
      }

      return {
        ...state,
        comprobantes: [...state.comprobantes, comprobante],
        nextNumeroComprobante: {
          ...state.nextNumeroComprobante,
          [tipo]: numero + 1,
        },
        ordenesCompra,
        proveedores: proveedoresDelta
          ? state.proveedores.map((p) =>
              p.id === proveedoresDelta!.proveedorId
                ? {
                    ...p,
                    saldoCuentaCorriente: p.saldoCuentaCorriente + proveedoresDelta!.delta,
                    updatedAt: now,
                  }
                : p
            )
          : state.proveedores,
      };
    }

    case 'ANULAR_COMPROBANTE_COMPRA': {
      const comprobante = state.comprobantes.find((c) => c.id === action.payload.id);
      if (!comprobante || comprobante.estado === 'anulado') return state;

      let proveedoresDelta: { proveedorId: string; delta: number } | null = null;

      // Revertir saldo si era cuenta corriente
      if (comprobante.medioPago === 'cuenta_corriente') {
        if (comprobante.tipo === 'factura') {
          // Al anular factura CC: restar del saldo lo que quedaba pendiente
          proveedoresDelta = {
            proveedorId: comprobante.proveedorId,
            delta: -(comprobante.total - comprobante.montoPagado),
          };
        } else if (comprobante.tipo === 'nota_credito') {
          // Al anular NC: re-sumar al saldo
          proveedoresDelta = {
            proveedorId: comprobante.proveedorId,
            delta: comprobante.total,
          };
        }
      }

      return {
        ...state,
        comprobantes: state.comprobantes.map((c) =>
          c.id === action.payload.id
            ? { ...c, estado: 'anulado' as EstadoComprobanteCompra, updatedAt: now }
            : c
        ),
        proveedores: proveedoresDelta
          ? state.proveedores.map((p) =>
              p.id === proveedoresDelta!.proveedorId
                ? {
                    ...p,
                    saldoCuentaCorriente: p.saldoCuentaCorriente + proveedoresDelta!.delta,
                    updatedAt: now,
                  }
                : p
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
          let estado: EstadoComprobanteCompra = c.estado;

          if (c.estado !== 'anulado') {
            if (saldoPendiente <= 0) {
              estado = 'pagado';
            } else if (montoPagado > 0) {
              estado = 'pagado_parcial';
            } else {
              estado = 'pendiente';
            }
          }

          return {
            ...c,
            montoPagado,
            saldoPendiente: Math.max(0, saldoPendiente),
            estado,
            updatedAt: now,
          };
        }),
      };
    }

    // ── Pagos ───────────────────────────────────────────────

    case 'ADD_PAGO': {
      const numero = state.nextNumeroPago;
      const pago: PagoCompra = { ...action.payload, numero } as PagoCompra;

      // Aplicar imputaciones a comprobantes
      let comprobantes = [...state.comprobantes];
      for (const imp of pago.imputaciones) {
        comprobantes = comprobantes.map((c) => {
          if (c.id !== imp.comprobanteId) return c;

          const nuevoMontoPagado = c.montoPagado + imp.montoImputado;
          const nuevoSaldoPendiente = c.total - nuevoMontoPagado;

          let estado: EstadoComprobanteCompra = c.estado;
          if (c.estado !== 'anulado') {
            if (nuevoSaldoPendiente <= 0) {
              estado = 'pagado';
            } else if (nuevoMontoPagado > 0) {
              estado = 'pagado_parcial';
            }
          }

          return {
            ...c,
            montoPagado: nuevoMontoPagado,
            saldoPendiente: Math.max(0, nuevoSaldoPendiente),
            estado,
            updatedAt: now,
          };
        });
      }

      // Disminuir saldo de cuenta corriente del proveedor (le pagamos)
      const proveedores = state.proveedores.map((p) =>
        p.id === pago.proveedorId
          ? {
              ...p,
              saldoCuentaCorriente: p.saldoCuentaCorriente - pago.monto,
              updatedAt: now,
            }
          : p
      );

      return {
        ...state,
        pagos: [...state.pagos, pago],
        nextNumeroPago: numero + 1,
        comprobantes,
        proveedores,
      };
    }

    // ── Config ──────────────────────────────────────────────

    case 'UPDATE_CONFIG':
      return {
        ...state,
        config: { ...state.config, ...action.payload },
      };

    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────

const ComprasContext = createContext<ComprasState | null>(null);
const ComprasDispatchContext = createContext<Dispatch<ComprasAction> | null>(null);

// ─── Helpers de persistencia ─────────────────────────────────

function loadState(): ComprasState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ComprasState;
      // Validación mínima: debe tener proveedores y config
      if (parsed.proveedores && parsed.config) return parsed;
    }
  } catch {
    // localStorage corrupto o no disponible
  }
  return SEED_STATE;
}

function saveState(state: ComprasState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded o no disponible
  }
}

// ─── Provider ────────────────────────────────────────────────

export function ComprasProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(comprasReducer, null, loadState);

  // Persistir en localStorage en cada cambio
  useEffect(() => {
    saveState(state);
  }, [state]);

  return (
    <ComprasContext.Provider value={state}>
      <ComprasDispatchContext.Provider value={dispatch}>
        {children}
      </ComprasDispatchContext.Provider>
    </ComprasContext.Provider>
  );
}

// ─── Hooks base ──────────────────────────────────────────────

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

// ─── Hooks de dominio ────────────────────────────────────────

export function useProveedores(): Proveedor[] {
  const { proveedores } = useCompras();
  return proveedores;
}

export function useProveedor(id: string): Proveedor | undefined {
  const { proveedores } = useCompras();
  return useMemo(() => proveedores.find((p) => p.id === id), [proveedores, id]);
}

// ── Cotizaciones ────────────────────────────────────────────

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

// ── Órdenes de compra ──────────────────────────────────────

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

// ── Comprobantes ────────────────────────────────────────────

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

// ── Pagos ──────────────────────────────────────────────────

export function usePagos(proveedorId?: string): PagoCompra[] {
  const { pagos } = useCompras();

  return useMemo(() => {
    if (!proveedorId) return pagos;
    return pagos.filter((p) => p.proveedorId === proveedorId);
  }, [pagos, proveedorId]);
}

// ─── Dashboard Stats ─────────────────────────────────────────

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

    // Solo facturas no anuladas
    const facturas = comprobantes.filter(
      (c) => c.tipo === 'factura' && c.estado !== 'anulado'
    );

    // Facturas del mes
    const facturasMes = facturas.filter(
      (c) => new Date(c.fecha) >= inicioMes
    );

    const comprasDelMes = facturasMes.reduce((sum, c) => sum + c.total, 0);

    // Pendiente de pago: suma de saldoPendiente en comprobantes pendiente o pagado_parcial
    const pendientePago = comprobantes
      .filter((c) => c.estado === 'pendiente' || c.estado === 'pagado_parcial')
      .reduce((sum, c) => sum + c.saldoPendiente, 0);

    // Proveedores activos
    const proveedoresActivos = proveedores.filter((p) => p.activo).length;

    // Órdenes abiertas: pendiente + parcial
    const ordenesAbiertas = ordenesCompra.filter(
      (o) => o.estado === 'pendiente' || o.estado === 'parcial'
    ).length;

    // Top 5 proveedores por total facturado este mes
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

    return {
      comprasDelMes,
      pendientePago,
      proveedoresActivos,
      ordenesAbiertas,
      topProveedores,
    };
  }, [comprobantes, proveedores, ordenesCompra]);
}

// ─── Re-exports para conveniencia ────────────────────────────

export type { ComprasAction };
