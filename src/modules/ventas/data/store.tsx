// ============================================================
// Módulo Ventas — State Management
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
} from '../types';

import { generarId } from '../types';
import { SEED_STATE } from './seed';

// ─── Constantes ──────────────────────────────────────────────

const STORAGE_KEY = 'edgy-ventas-state';

// ─── Action Types ────────────────────────────────────────────

type VentasAction =
  // Categorías
  | { type: 'ADD_CATEGORIA'; payload: CategoriaCliente }
  | { type: 'UPDATE_CATEGORIA'; payload: CategoriaCliente }
  | { type: 'DELETE_CATEGORIA'; payload: { id: string } }

  // Clientes
  | { type: 'ADD_CLIENTE'; payload: Cliente }
  | { type: 'UPDATE_CLIENTE'; payload: Cliente }
  | { type: 'TOGGLE_CLIENTE_ACTIVO'; payload: { id: string } }
  | { type: 'AJUSTAR_SALDO_CLIENTE'; payload: { clienteId: string; delta: number } }

  // Presupuestos
  | { type: 'ADD_PRESUPUESTO'; payload: Omit<Presupuesto, 'numero'> }
  | { type: 'UPDATE_PRESUPUESTO'; payload: Presupuesto }
  | { type: 'CAMBIAR_ESTADO_PRESUPUESTO'; payload: { id: string; nuevoEstado: EstadoPresupuesto } }
  | { type: 'CONVERTIR_PRESUPUESTO_A_ORDEN'; payload: { presupuestoId: string; tipoOrden: TipoOrden } }

  // Órdenes
  | { type: 'ADD_ORDEN'; payload: Omit<Orden, 'numero'> }
  | { type: 'UPDATE_ORDEN'; payload: Orden }
  | { type: 'CAMBIAR_ESTADO_ORDEN'; payload: { id: string; nuevoEstado: EstadoOrden } }
  | { type: 'REGISTRAR_ENTREGA_PARCIAL'; payload: { ordenId: string; items: { id: string; cantidadEntregada: number }[] } }

  // Comprobantes
  | { type: 'ADD_COMPROBANTE'; payload: Omit<Comprobante, 'numero'> }
  | { type: 'ANULAR_COMPROBANTE'; payload: { id: string } }
  | { type: 'ACTUALIZAR_COBRO_COMPROBANTE'; payload: { comprobanteId: string; montoCobrado: number } }

  // Cobros
  | { type: 'ADD_COBRO'; payload: Omit<Cobro, 'numero'> }

  // Config
  | { type: 'UPDATE_CONFIG'; payload: Partial<VentasConfig> };

// ─── Reducer ─────────────────────────────────────────────────

function ventasReducer(state: VentasState, action: VentasAction): VentasState {
  const now = new Date().toISOString();

  switch (action.type) {
    // ── Categorías ──────────────────────────────────────────

    case 'ADD_CATEGORIA':
      return {
        ...state,
        categorias: [...state.categorias, action.payload],
      };

    case 'UPDATE_CATEGORIA':
      return {
        ...state,
        categorias: state.categorias.map((c) =>
          c.id === action.payload.id ? action.payload : c
        ),
      };

    case 'DELETE_CATEGORIA':
      return {
        ...state,
        categorias: state.categorias.filter((c) => c.id !== action.payload.id),
        // Limpiar referencia en clientes
        clientes: state.clientes.map((cl) =>
          cl.categoriaId === action.payload.id
            ? { ...cl, categoriaId: undefined, updatedAt: now }
            : cl
        ),
      };

    // ── Clientes ────────────────────────────────────────────

    case 'ADD_CLIENTE':
      return {
        ...state,
        clientes: [...state.clientes, action.payload],
      };

    case 'UPDATE_CLIENTE':
      return {
        ...state,
        clientes: state.clientes.map((c) =>
          c.id === action.payload.id ? action.payload : c
        ),
      };

    case 'TOGGLE_CLIENTE_ACTIVO':
      return {
        ...state,
        clientes: state.clientes.map((c) =>
          c.id === action.payload.id
            ? { ...c, activo: !c.activo, updatedAt: now }
            : c
        ),
      };

    case 'AJUSTAR_SALDO_CLIENTE':
      return {
        ...state,
        clientes: state.clientes.map((c) =>
          c.id === action.payload.clienteId
            ? {
                ...c,
                saldoCuentaCorriente: c.saldoCuentaCorriente + action.payload.delta,
                updatedAt: now,
              }
            : c
        ),
      };

    // ── Presupuestos ────────────────────────────────────────

    case 'ADD_PRESUPUESTO': {
      const numero = state.nextNumeroPresupuesto;
      const presupuesto: Presupuesto = { ...action.payload, numero } as Presupuesto;
      return {
        ...state,
        presupuestos: [...state.presupuestos, presupuesto],
        nextNumeroPresupuesto: numero + 1,
      };
    }

    case 'UPDATE_PRESUPUESTO':
      return {
        ...state,
        presupuestos: state.presupuestos.map((p) =>
          p.id === action.payload.id ? action.payload : p
        ),
      };

    case 'CAMBIAR_ESTADO_PRESUPUESTO':
      return {
        ...state,
        presupuestos: state.presupuestos.map((p) =>
          p.id === action.payload.id
            ? { ...p, estado: action.payload.nuevoEstado, updatedAt: now }
            : p
        ),
      };

    case 'CONVERTIR_PRESUPUESTO_A_ORDEN': {
      const { presupuestoId, tipoOrden } = action.payload;
      const presupuesto = state.presupuestos.find((p) => p.id === presupuestoId);
      if (!presupuesto) return state;

      const ordenId = generarId();
      const numeroOrden = state.nextNumeroOrden[tipoOrden];

      // Crear items de orden a partir de items del presupuesto
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
          p.id === presupuestoId
            ? { ...p, estado: 'aprobado' as const, ordenId, updatedAt: now }
            : p
        ),
        ordenes: [...state.ordenes, nuevaOrden],
        nextNumeroOrden: {
          ...state.nextNumeroOrden,
          [tipoOrden]: numeroOrden + 1,
        },
      };
    }

    // ── Órdenes ─────────────────────────────────────────────

    case 'ADD_ORDEN': {
      const tipo = action.payload.tipo;
      const numero = state.nextNumeroOrden[tipo];
      const orden: Orden = { ...action.payload, numero } as Orden;
      return {
        ...state,
        ordenes: [...state.ordenes, orden],
        nextNumeroOrden: {
          ...state.nextNumeroOrden,
          [tipo]: numero + 1,
        },
      };
    }

    case 'UPDATE_ORDEN':
      return {
        ...state,
        ordenes: state.ordenes.map((o) =>
          o.id === action.payload.id ? action.payload : o
        ),
      };

    case 'CAMBIAR_ESTADO_ORDEN':
      return {
        ...state,
        ordenes: state.ordenes.map((o) =>
          o.id === action.payload.id
            ? {
                ...o,
                estado: action.payload.nuevoEstado,
                fechaCompletada:
                  action.payload.nuevoEstado === 'entregado' ? now : o.fechaCompletada,
                updatedAt: now,
              }
            : o
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
            return nuevaCantidad !== undefined
              ? { ...item, cantidadEntregada: nuevaCantidad }
              : item;
          });

          // Determinar nuevo estado
          const todosEntregados = updatedItems.every(
            (i) => i.cantidadEntregada >= i.cantidad
          );
          const algunoEntregado = updatedItems.some(
            (i) => i.cantidadEntregada > 0
          );

          let nuevoEstado: EstadoOrden = o.estado;
          if (todosEntregados) {
            nuevoEstado = 'entregado';
          } else if (algunoEntregado) {
            nuevoEstado = 'entregado_parcial';
          }

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

    // ── Comprobantes ────────────────────────────────────────

    case 'ADD_COMPROBANTE': {
      const tipo = action.payload.tipo;
      const numero = state.nextNumeroComprobante[tipo];
      const comprobante: Comprobante = { ...action.payload, numero } as Comprobante;

      let clientesDelta: { clienteId: string; delta: number } | null = null;

      // Factura a cuenta corriente: aumentar saldo del cliente
      if (tipo === 'factura' && comprobante.medioPago === 'cuenta_corriente') {
        clientesDelta = { clienteId: comprobante.clienteId, delta: comprobante.total };
      }

      // Nota de crédito: disminuir saldo del cliente
      if (tipo === 'nota_credito') {
        clientesDelta = { clienteId: comprobante.clienteId, delta: -comprobante.total };
      }

      // Vincular comprobante a la orden si corresponde
      let ordenes = state.ordenes;
      if (comprobante.ordenId) {
        ordenes = ordenes.map((o) =>
          o.id === comprobante.ordenId
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
        ordenes,
        clientes: clientesDelta
          ? state.clientes.map((c) =>
              c.id === clientesDelta!.clienteId
                ? {
                    ...c,
                    saldoCuentaCorriente: c.saldoCuentaCorriente + clientesDelta!.delta,
                    updatedAt: now,
                  }
                : c
            )
          : state.clientes,
      };
    }

    case 'ANULAR_COMPROBANTE': {
      const comprobante = state.comprobantes.find((c) => c.id === action.payload.id);
      if (!comprobante || comprobante.estado === 'anulado') return state;

      let clientesDelta: { clienteId: string; delta: number } | null = null;

      // Revertir saldo si era cuenta corriente
      if (comprobante.medioPago === 'cuenta_corriente') {
        if (comprobante.tipo === 'factura') {
          // Al anular factura CC: restar del saldo lo que quedaba pendiente (total - cobrado)
          clientesDelta = {
            clienteId: comprobante.clienteId,
            delta: -(comprobante.total - comprobante.montoCobrado),
          };
        } else if (comprobante.tipo === 'nota_credito') {
          // Al anular NC: re-sumar al saldo
          clientesDelta = {
            clienteId: comprobante.clienteId,
            delta: comprobante.total,
          };
        }
      }

      return {
        ...state,
        comprobantes: state.comprobantes.map((c) =>
          c.id === action.payload.id
            ? { ...c, estado: 'anulado' as EstadoComprobante, updatedAt: now }
            : c
        ),
        clientes: clientesDelta
          ? state.clientes.map((c) =>
              c.id === clientesDelta!.clienteId
                ? {
                    ...c,
                    saldoCuentaCorriente: c.saldoCuentaCorriente + clientesDelta!.delta,
                    updatedAt: now,
                  }
                : c
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
            if (saldoPendiente <= 0) {
              estado = 'cobrado';
            } else if (montoCobrado > 0) {
              estado = 'cobrado_parcial';
            } else {
              estado = 'emitido';
            }
          }

          return {
            ...c,
            montoCobrado,
            saldoPendiente: Math.max(0, saldoPendiente),
            estado,
            updatedAt: now,
          };
        }),
      };
    }

    // ── Cobros ──────────────────────────────────────────────

    case 'ADD_COBRO': {
      const numero = state.nextNumeroCobro;
      const cobro: Cobro = { ...action.payload, numero } as Cobro;

      // Aplicar imputaciones a comprobantes
      let comprobantes = [...state.comprobantes];
      for (const imp of cobro.imputaciones) {
        comprobantes = comprobantes.map((c) => {
          if (c.id !== imp.comprobanteId) return c;

          const nuevoMontoCobrado = c.montoCobrado + imp.montoImputado;
          const nuevoSaldoPendiente = c.total - nuevoMontoCobrado;

          let estado: EstadoComprobante = c.estado;
          if (c.estado !== 'anulado') {
            if (nuevoSaldoPendiente <= 0) {
              estado = 'cobrado';
            } else if (nuevoMontoCobrado > 0) {
              estado = 'cobrado_parcial';
            }
          }

          return {
            ...c,
            montoCobrado: nuevoMontoCobrado,
            saldoPendiente: Math.max(0, nuevoSaldoPendiente),
            estado,
            updatedAt: now,
          };
        });
      }

      // Disminuir saldo de cuenta corriente del cliente
      const clientes = state.clientes.map((c) =>
        c.id === cobro.clienteId
          ? {
              ...c,
              saldoCuentaCorriente: c.saldoCuentaCorriente - cobro.monto,
              updatedAt: now,
            }
          : c
      );

      return {
        ...state,
        cobros: [...state.cobros, cobro],
        nextNumeroCobro: numero + 1,
        comprobantes,
        clientes,
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

const VentasContext = createContext<VentasState | null>(null);
const VentasDispatchContext = createContext<Dispatch<VentasAction> | null>(null);

// ─── Helpers de persistencia ─────────────────────────────────

function loadState(): VentasState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as VentasState;
      // Validación mínima: debe tener clientes y config
      if (parsed.clientes && parsed.config) return parsed;
    }
  } catch {
    // localStorage corrupto o no disponible
  }
  return SEED_STATE;
}

function saveState(state: VentasState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded o no disponible
  }
}

// ─── Provider ────────────────────────────────────────────────

export function VentasProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(ventasReducer, null, loadState);

  // Persistir en localStorage en cada cambio
  useEffect(() => {
    saveState(state);
  }, [state]);

  return (
    <VentasContext.Provider value={state}>
      <VentasDispatchContext.Provider value={dispatch}>
        {children}
      </VentasDispatchContext.Provider>
    </VentasContext.Provider>
  );
}

// ─── Hooks base ──────────────────────────────────────────────

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

// ─── Hooks de dominio ────────────────────────────────────────

export function useClientes(): Cliente[] {
  const { clientes } = useVentas();
  return clientes;
}

export function useCliente(id: string): Cliente | undefined {
  const { clientes } = useVentas();
  return useMemo(() => clientes.find((c) => c.id === id), [clientes, id]);
}

// ── Presupuestos ────────────────────────────────────────────

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

// ── Órdenes ─────────────────────────────────────────────────

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

// ── Comprobantes ────────────────────────────────────────────

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

// ── Cobros ──────────────────────────────────────────────────

export function useCobros(clienteId?: string): Cobro[] {
  const { cobros } = useVentas();

  return useMemo(() => {
    if (!clienteId) return cobros;
    return cobros.filter((c) => c.clienteId === clienteId);
  }, [cobros, clienteId]);
}

// ─── Dashboard Stats ─────────────────────────────────────────

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

    // Solo facturas no anuladas
    const facturas = comprobantes.filter(
      (c) => c.tipo === 'factura' && c.estado !== 'anulado'
    );

    // Facturas del mes
    const facturasMes = facturas.filter(
      (c) => new Date(c.fecha) >= inicioMes
    );

    // Facturas última semana
    const facturasSemana = facturas.filter(
      (c) => new Date(c.fecha) >= hace7Dias
    );

    // Facturas de hoy
    const facturasHoy = facturas.filter((c) => c.fecha === hoyStr);

    const ventasDelMes = facturasMes.reduce((sum, c) => sum + c.total, 0);
    const ventasSemana = facturasSemana.reduce((sum, c) => sum + c.total, 0);
    const ventasHoy = facturasHoy.reduce((sum, c) => sum + c.total, 0);

    // Pendiente de cobro: suma de saldoPendiente en comprobantes emitidos o cobrados parcial
    const pendienteCobro = comprobantes
      .filter((c) => c.estado === 'emitido' || c.estado === 'cobrado_parcial')
      .reduce((sum, c) => sum + c.saldoPendiente, 0);

    // Unidades vendidas este mes (suma de cantidades en facturas del mes)
    const unidadesVendidas = facturasMes.reduce(
      (sum, c) => sum + c.items.reduce((s, item) => s + item.cantidad, 0),
      0
    );

    // Top 5 clientes por total facturado este mes
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

    // Top 5 productos por cantidad vendida este mes
    const productoMap = new Map<string, { cantidad: number; total: number }>();
    for (const f of facturasMes) {
      for (const item of f.items) {
        const key = item.descripcion;
        const prev = productoMap.get(key) || { cantidad: 0, total: 0 };
        productoMap.set(key, {
          cantidad: prev.cantidad + item.cantidad,
          total: prev.total + item.subtotal,
        });
      }
    }
    const topProductos = Array.from(productoMap.entries())
      .map(([descripcion, { cantidad, total }]) => ({ descripcion, cantidad, total }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);

    return {
      ventasDelMes,
      ventasSemana,
      ventasHoy,
      pendienteCobro,
      unidadesVendidas,
      topClientes,
      topProductos,
    };
  }, [comprobantes, clientes]);
}

// ─── Re-exports para conveniencia ────────────────────────────

export type { VentasAction };
