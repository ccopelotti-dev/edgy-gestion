// ============================================================
// Módulo Ventas — Punto de Venta
// Edgy Gestión · Facturación rápida / POS simplificado
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search,
  Plus,
  Trash2,
  ShoppingCart,
  Clock,
  Receipt,
} from 'lucide-react';

import {
  useClientes,
  useVentas,
  useVentasDispatch,
} from '../../data/store';
import { Amount, EmptyState } from '../../components/ventas/display';
import {
  formatARS,
  formatDateTime,
  formatNumero,
  PREFIJO_COMPROBANTE,
  nowISO,
  todayISO,
} from '../../lib/format';
import {
  calcularSubtotalItem,
  calcularTotalConIva,
  generarId,
  CONSUMIDOR_FINAL_ID,
  clienteConsumidorFinal,
  MEDIO_PAGO_LABEL,
  type MedioPago,
  type ModoEmision,
  type ComprobanteItem,
} from '../../types';

// ─── Tipos locales ──────────────────────────────────────────

interface LineaVenta {
  id: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
}

// ─── Componente principal ───────────────────────────────────

export default function PuntoDeVenta() {
  const clientes = useClientes();
  const { config, nextNumeroComprobante } = useVentas();
  const dispatch = useVentasDispatch();

  // ── Estado del formulario ─────────────────────────────────

  const [lineas, setLineas] = useState<LineaVenta[]>([]);
  const [clienteId, setClienteId] = useState<string>(CONSUMIDOR_FINAL_ID);
  const [medioPago, setMedioPago] = useState<MedioPago>('efectivo');
  const [modoEmision, setModoEmision] = useState<ModoEmision>(config.modoEmisionDefault);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [ahora, setAhora] = useState(nowISO());
  const [toast, setToast] = useState<string | null>(null);

  // Reloj en vivo
  useEffect(() => {
    const timer = setInterval(() => setAhora(nowISO()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Auto-ocultar toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Cálculos derivados ────────────────────────────────────

  const subtotalNeto = useMemo(
    () =>
      lineas.reduce(
        (sum, l) => sum + calcularSubtotalItem(l.cantidad, l.precioUnitario, l.descuento),
        0,
      ),
    [lineas],
  );

  const { montoIva, total } = useMemo(
    () => calcularTotalConIva(subtotalNeto, config.ivaDefault),
    [subtotalNeto, config.ivaDefault],
  );

  // Lista de clientes para el selector (Consumidor Final + activos)
  const opcionesCliente = useMemo(
    () => [clienteConsumidorFinal, ...clientes.filter((c) => c.activo)],
    [clientes],
  );

  // ── Handlers de líneas ────────────────────────────────────

  const handleAgregarLinea = useCallback(() => {
    const desc = busquedaProducto.trim();
    setLineas((prev) => [
      ...prev,
      {
        id: generarId(),
        descripcion: desc || 'Producto',
        cantidad: 1,
        precioUnitario: 0,
        descuento: 0,
      },
    ]);
    setBusquedaProducto('');
  }, [busquedaProducto]);

  const handleEliminarLinea = useCallback((id: string) => {
    setLineas((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const handleCambioLinea = useCallback(
    (id: string, campo: keyof LineaVenta, valor: string) => {
      setLineas((prev) =>
        prev.map((l) => {
          if (l.id !== id) return l;
          if (campo === 'descripcion') return { ...l, descripcion: valor };
          const num = parseFloat(valor) || 0;
          return { ...l, [campo]: Math.max(0, num) };
        }),
      );
    },
    [],
  );

  // ── Facturar ──────────────────────────────────────────────

  const handleFacturar = useCallback(() => {
    if (lineas.length === 0) return;

    const now = nowISO();
    const hoy = todayISO();

    // Construir items del comprobante
    const items: ComprobanteItem[] = lineas.map((l) => {
      const sub = calcularSubtotalItem(l.cantidad, l.precioUnitario, l.descuento);
      const iva = sub * (config.ivaDefault / 100);
      return {
        id: generarId(),
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        descuento: l.descuento,
        alicuotaIva: config.ivaDefault,
        subtotal: sub,
        montoIva: iva,
      };
    });

    const comprobanteId = generarId();
    const esPagoCompleto = medioPago === 'efectivo';

    dispatch({
      type: 'ADD_COMPROBANTE',
      payload: {
        id: comprobanteId,
        tipo: 'factura',
        modoEmision,
        clienteId,
        fecha: hoy,
        items,
        subtotal: subtotalNeto,
        descuentoGeneral: 0,
        montoIva,
        total,
        estado: esPagoCompleto ? 'cobrado' : 'emitido',
        medioPago,
        montoCobrado: esPagoCompleto ? total : 0,
        saldoPendiente: esPagoCompleto ? 0 : total,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Si es efectivo, registrar cobro automático
    if (esPagoCompleto) {
      dispatch({
        type: 'ADD_COBRO',
        payload: {
          id: generarId(),
          clienteId,
          fecha: hoy,
          monto: total,
          medioPago: 'efectivo',
          imputaciones: [{ comprobanteId, montoImputado: total }],
          createdAt: now,
        },
      });
    }

    // Número de factura (el store lo asigna, pero podemos predecirlo para el toast)
    const numFactura = nextNumeroComprobante.factura;
    setToast(`Factura ${formatNumero(PREFIJO_COMPROBANTE.factura, numFactura)} generada`);

    // Limpiar formulario
    setLineas([]);
    setClienteId(CONSUMIDOR_FINAL_ID);
    setMedioPago('efectivo');
    setBusquedaProducto('');
  }, [
    lineas,
    clienteId,
    medioPago,
    modoEmision,
    config.ivaDefault,
    subtotalNeto,
    montoIva,
    total,
    nextNumeroComprobante,
    dispatch,
  ]);

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Punto de Venta</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Clock className="h-4 w-4" />
          {formatDateTime(ahora)}
        </div>
      </div>

      {/* Toast de confirmación */}
      {toast && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <Receipt className="h-4 w-4" />
          {toast}
        </div>
      )}

      <div className="flex gap-6">
        {/* ── Panel izquierdo: Items (70%) ──────────────────── */}
        <div className="w-[70%] space-y-4">
          {/* Buscador / agregar producto */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={busquedaProducto}
                onChange={(e) => setBusquedaProducto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && busquedaProducto.trim()) {
                    handleAgregarLinea();
                  }
                }}
                placeholder="Descripción del producto o servicio..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <button
              onClick={handleAgregarLinea}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Agregar
            </button>
          </div>

          {/* Tabla de items */}
          {lineas.length === 0 ? (
            <EmptyState message="Agregue productos para comenzar la venta" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="px-4 py-3 font-medium">Descripción</th>
                    <th className="px-4 py-3 font-medium w-24">Cantidad</th>
                    <th className="px-4 py-3 font-medium w-32">Precio Unit.</th>
                    <th className="px-4 py-3 font-medium w-24">Dto. %</th>
                    <th className="px-4 py-3 text-right font-medium w-32">Subtotal</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((linea) => {
                    const sub = calcularSubtotalItem(
                      linea.cantidad,
                      linea.precioUnitario,
                      linea.descuento,
                    );
                    return (
                      <tr
                        key={linea.id}
                        className="border-b border-gray-50 last:border-0"
                      >
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={linea.descripcion}
                            onChange={(e) =>
                              handleCambioLinea(linea.id, 'descripcion', e.target.value)
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={linea.cantidad}
                            onChange={(e) =>
                              handleCambioLinea(linea.id, 'cantidad', e.target.value)
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-900 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={linea.precioUnitario}
                            onChange={(e) =>
                              handleCambioLinea(linea.id, 'precioUnitario', e.target.value)
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-900 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={linea.descuento}
                            onChange={(e) =>
                              handleCambioLinea(linea.id, 'descuento', e.target.value)
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-900 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Amount value={sub} />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => handleEliminarLinea(linea.id)}
                            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Panel derecho: Resumen (30%) ─────────────────── */}
        <div className="w-[30%] space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
            {/* Cliente */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Cliente
              </label>
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {opcionesCliente.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Totales */}
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal neto</span>
                <Amount value={subtotalNeto} />
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>IVA ({config.ivaDefault}%)</span>
                <Amount value={montoIva} />
              </div>
              <div className="flex justify-between text-lg font-bold text-gray-900 border-t border-gray-200 pt-2">
                <span>Total</span>
                <span>{formatARS(total)}</span>
              </div>
            </div>

            {/* Medio de pago */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Medio de pago
              </label>
              <select
                value={medioPago}
                onChange={(e) => setMedioPago(e.target.value as MedioPago)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {(Object.keys(MEDIO_PAGO_LABEL) as MedioPago[]).map((mp) => (
                  <option key={mp} value={mp}>
                    {MEDIO_PAGO_LABEL[mp]}
                  </option>
                ))}
              </select>
            </div>

            {/* Modo de emisión */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Modo de emisión
              </label>
              <div className="flex gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="modoEmision"
                    value="interno"
                    checked={modoEmision === 'interno'}
                    onChange={() => setModoEmision('interno')}
                    className="accent-indigo-600"
                  />
                  Interno
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="modoEmision"
                    value="electronica"
                    checked={modoEmision === 'electronica'}
                    onChange={() => setModoEmision('electronica')}
                    className="accent-indigo-600"
                  />
                  Electrónica
                </label>
              </div>
            </div>

            {/* Botón FACTURAR */}
            <button
              onClick={handleFacturar}
              disabled={lineas.length === 0 || total <= 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-base font-bold text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              <ShoppingCart className="h-5 w-5" />
              FACTURAR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
