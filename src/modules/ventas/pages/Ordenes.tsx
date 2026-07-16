// ============================================================
// Modulo Ventas — Ordenes
// Edgy Gestion · Listado, creacion inline y gestion de ordenes
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  Play,
  Package,
  CheckCircle2,
  XCircle,
  FileText,
  Link2,
  Truck,
  ClipboardList,
  X,
} from 'lucide-react';

import {
  useOrdenes,
  useClientes,
  useVentas,
  useVentasDispatch,
} from '../data/store';
import { useClienteActual } from '@/hooks/useClienteActual';
import { terminologiaOrdenVenta } from '@/lib/terminologia';
import {
  KpiCard,
  EstadoOrdenBadge,
  TipoOrdenBadge,
  Amount,
  EmptyState,
} from '../components/ventas/display';
import { ComprobanteDialog } from '../components/ventas/dialogs';
import {
  formatDate,
  formatARS,
  formatNumero,
  formatPct,
  todayISO,
  nowISO,
  PREFIJO_ORDEN,
  PREFIJO_COMPROBANTE,
} from '../lib/format';
import type {
  Orden,
  OrdenItem,
  TipoOrden,
  EstadoOrden,
  TipoComprobante,
  ModoEmision,
  MedioPago,
  ComprobanteItem,
} from '../types';
import {
  TIPO_ORDEN_LABEL_CORTO,
  ESTADO_ORDEN_LABEL,
  calcularSubtotalItem,
  generarId,
} from '../types';

// ─── Componente principal ───────────────────────────────────

export default function Ordenes() {
  const todasOrdenes = useOrdenes();
  const clientes = useClientes();
  const { comprobantes, config } = useVentas();
  const dispatch = useVentasDispatch();

  // Fase 8e (cierre de 8d): el motor de ordenes_venta es el mismo para
  // cualquier rubro -- lo único que cambia es cómo se llama en
  // pantalla. Con Kit Gastronómico activo (comandas-cocina) esta
  // pantalla pasa a hablar de "Comanda(s)" en vez de "Orden(es)".
  const { modulosActivos } = useClienteActual();
  const term = terminologiaOrdenVenta(modulosActivos);
  const singularMin = term.singular.charAt(0).toLowerCase() + term.singular.slice(1);
  const pluralMin = term.plural.charAt(0).toLowerCase() + term.plural.slice(1);

  // ── Filtros ───────────────────────────────────────────────

  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<TipoOrden | ''>('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoOrden | ''>('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // ── Estado de UI ──────────────────────────────────────────

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNuevaOrden, setShowNuevaOrden] = useState(false);
  const [comprobanteDialogOpen, setComprobanteDialogOpen] = useState(false);
  const [ordenParaFacturar, setOrdenParaFacturar] = useState<Orden | null>(null);

  // ── Entrega parcial inline ────────────────────────────────

  const [entregaOrdenId, setEntregaOrdenId] = useState<string | null>(null);
  const [entregaCantidades, setEntregaCantidades] = useState<Record<string, number>>({});

  // ── Nueva orden inline ────────────────────────────────────

  const [nuevoTipo, setNuevoTipo] = useState<TipoOrden>('pedido');
  const [nuevoClienteId, setNuevoClienteId] = useState('');
  const [nuevoFecha, setNuevoFecha] = useState(todayISO());
  const [nuevoFechaEntrega, setNuevoFechaEntrega] = useState('');
  const [nuevoNotas, setNuevoNotas] = useState('');
  const [nuevoItems, setNuevoItems] = useState<
    { id: string; descripcion: string; cantidad: number; precioUnitario: number; descuento: number }[]
  >([{ id: generarId(), descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0 }]);

  // ── Helpers ───────────────────────────────────────────────

  const clienteNombre = useCallback(
    (clienteId: string) => {
      const c = clientes.find((cl) => cl.id === clienteId);
      return c?.nombre ?? 'Desconocido';
    },
    [clientes],
  );

  // ── KPIs ──────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
      .toISOString()
      .slice(0, 10);

    const pendientes = todasOrdenes.filter((o) => o.estado === 'pendiente').length;
    const enPreparacion = todasOrdenes.filter(
      (o) => o.estado === 'en_preparacion' || o.estado === 'entregado_parcial',
    ).length;
    const completadasMes = todasOrdenes.filter(
      (o) => o.estado === 'entregado' && o.fechaCompletada && o.fechaCompletada >= inicioMes,
    ).length;

    return { pendientes, enPreparacion, completadasMes };
  }, [todasOrdenes]);

  // ── Datos filtrados ───────────────────────────────────────

  const ordenesFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();

    return todasOrdenes.filter((o) => {
      if (filtroTipo && o.tipo !== filtroTipo) return false;
      if (filtroEstado && o.estado !== filtroEstado) return false;
      if (fechaDesde && o.fecha < fechaDesde) return false;
      if (fechaHasta && o.fecha > fechaHasta) return false;
      if (q) {
        const nombre = clienteNombre(o.clienteId).toLowerCase();
        if (!nombre.includes(q)) return false;
      }
      return true;
    });
  }, [todasOrdenes, busqueda, filtroTipo, filtroEstado, fechaDesde, fechaHasta, clienteNombre]);

  // ── Handlers nueva orden ──────────────────────────────────

  const handleAddItem = () => {
    setNuevoItems((prev) => [
      ...prev,
      { id: generarId(), descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0 },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setNuevoItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  };

  const handleUpdateItem = (id: string, field: string, value: string | number) => {
    setNuevoItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    );
  };

  const handleCrearOrden = () => {
    if (!nuevoClienteId || nuevoItems.every((i) => !i.descripcion)) return;

    const items: OrdenItem[] = nuevoItems
      .filter((i) => i.descripcion.trim())
      .map((i) => ({
        id: generarId(),
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        descuento: i.descuento,
        subtotal: calcularSubtotalItem(i.cantidad, i.precioUnitario, i.descuento),
        cantidadEntregada: 0,
      }));

    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);

    dispatch({
      type: 'ADD_ORDEN',
      payload: {
        id: generarId(),
        tipo: nuevoTipo,
        clienteId: nuevoClienteId,
        fecha: nuevoFecha,
        fechaEntrega: nuevoFechaEntrega || undefined,
        estado: 'pendiente',
        items,
        subtotal,
        descuentoGeneral: 0,
        total: subtotal,
        notas: nuevoNotas || undefined,
        comprobanteIds: [],
        createdAt: nowISO(),
        updatedAt: nowISO(),
      },
    });

    // Reset form
    setShowNuevaOrden(false);
    setNuevoTipo('pedido');
    setNuevoClienteId('');
    setNuevoFecha(todayISO());
    setNuevoFechaEntrega('');
    setNuevoNotas('');
    setNuevoItems([{ id: generarId(), descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0 }]);
  };

  // ── Handlers de acciones ──────────────────────────────────

  const handleCambiarEstado = (id: string, nuevoEstado: EstadoOrden) => {
    dispatch({ type: 'CAMBIAR_ESTADO_ORDEN', payload: { id, nuevoEstado } });
  };

  const handleIniciarEntregaParcial = (orden: Orden) => {
    const cantidades: Record<string, number> = {};
    orden.items.forEach((item) => {
      cantidades[item.id] = item.cantidadEntregada;
    });
    setEntregaCantidades(cantidades);
    setEntregaOrdenId(orden.id);
  };

  const handleGuardarEntregaParcial = (ordenId: string) => {
    const items = Object.entries(entregaCantidades).map(([id, cantidadEntregada]) => ({
      id,
      cantidadEntregada,
    }));
    dispatch({ type: 'REGISTRAR_ENTREGA_PARCIAL', payload: { ordenId, items } });
    setEntregaOrdenId(null);
    setEntregaCantidades({});
  };

  const handleFacturar = (orden: Orden) => {
    setOrdenParaFacturar(orden);
    setComprobanteDialogOpen(true);
  };

  const handleSaveComprobante = (data: {
    tipo: TipoComprobante;
    clienteId: string;
    fecha: string;
    medioPago: MedioPago;
    modoEmision: ModoEmision;
    items: Omit<ComprobanteItem, 'id'>[];
    descuentoGeneral: number;
  }) => {
    const items: ComprobanteItem[] = data.items.map((i) => ({
      ...i,
      id: generarId(),
    }));

    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    const montoIva = items.reduce((s, i) => s + i.montoIva, 0);
    const totalBruto = subtotal + montoIva;
    const total = totalBruto * (1 - data.descuentoGeneral / 100);

    dispatch({
      type: 'ADD_COMPROBANTE',
      payload: {
        id: generarId(),
        tipo: data.tipo,
        modoEmision: data.modoEmision,
        clienteId: data.clienteId,
        ordenId: ordenParaFacturar?.id,
        fecha: data.fecha,
        items,
        subtotal,
        descuentoGeneral: data.descuentoGeneral,
        montoIva,
        total,
        estado: 'emitido',
        medioPago: data.medioPago,
        montoCobrado: 0,
        saldoPendiente: total,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      },
    });

    setComprobanteDialogOpen(false);
    setOrdenParaFacturar(null);
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{term.plural}</h1>
        <button
          onClick={() => setShowNuevaOrden((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          {showNuevaOrden ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showNuevaOrden ? 'Cancelar' : `Nueva ${singularMin}`}
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title={`${term.plural} pendientes`}
          value={kpis.pendientes}
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <KpiCard
          title="En preparacion"
          value={kpis.enPreparacion}
          icon={<Package className="h-4 w-4" />}
        />
        <KpiCard
          title="Completadas este mes"
          value={kpis.completadasMes}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      {/* Nueva orden inline */}
      {showNuevaOrden && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{`Nueva ${singularMin}`}</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Tipo */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Tipo</label>
              <select
                value={nuevoTipo}
                onChange={(e) => setNuevoTipo(e.target.value as TipoOrden)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {(['pedido', 'produccion', 'servicio'] as TipoOrden[]).map((t) => (
                  <option key={t} value={t}>
                    {TIPO_ORDEN_LABEL_CORTO[t]}
                  </option>
                ))}
              </select>
            </div>

            {/* Cliente */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Cliente</label>
              <select
                value={nuevoClienteId}
                onChange={(e) => setNuevoClienteId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Seleccionar cliente...</option>
                {clientes
                  .filter((c) => c.activo)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </select>
            </div>

            {/* Fecha */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Fecha</label>
              <input
                type="date"
                value={nuevoFecha}
                onChange={(e) => setNuevoFecha(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Fecha entrega */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Fecha entrega</label>
              <input
                type="date"
                value={nuevoFechaEntrega}
                onChange={(e) => setNuevoFechaEntrega(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Notas</label>
            <input
              type="text"
              value={nuevoNotas}
              onChange={(e) => setNuevoNotas(e.target.value)}
              placeholder="Notas opcionales..."
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-500">Items</label>
              <button
                onClick={handleAddItem}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                <Plus className="h-3 w-3" />
                Agregar item
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="px-3 py-2 font-medium">Descripcion</th>
                    <th className="px-3 py-2 text-right font-medium w-24">Cantidad</th>
                    <th className="px-3 py-2 text-right font-medium w-32">Precio Unit.</th>
                    <th className="px-3 py-2 text-right font-medium w-24">Dto. %</th>
                    <th className="px-3 py-2 text-right font-medium w-32">Subtotal</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {nuevoItems.map((item) => {
                    const sub = calcularSubtotalItem(item.cantidad, item.precioUnitario, item.descuento);
                    return (
                      <tr key={item.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-1.5">
                          <input
                            type="text"
                            value={item.descripcion}
                            onChange={(e) => handleUpdateItem(item.id, 'descripcion', e.target.value)}
                            placeholder="Descripcion del item..."
                            className="w-full border-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min={1}
                            value={item.cantidad}
                            onChange={(e) => handleUpdateItem(item.id, 'cantidad', Number(e.target.value))}
                            className="w-full border-0 bg-transparent text-right text-sm text-gray-900 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.precioUnitario}
                            onChange={(e) => handleUpdateItem(item.id, 'precioUnitario', Number(e.target.value))}
                            className="w-full border-0 bg-transparent text-right text-sm text-gray-900 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={item.descuento}
                            onChange={(e) => handleUpdateItem(item.id, 'descuento', Number(e.target.value))}
                            className="w-full border-0 bg-transparent text-right text-sm text-gray-900 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium text-gray-900">
                          {formatARS(sub)}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Total y boton */}
          <div className="flex items-center justify-between border-t border-indigo-200 pt-4">
            <div className="text-sm text-gray-700">
              Total:{' '}
              <span className="text-lg font-bold text-gray-900">
                {formatARS(
                  nuevoItems.reduce(
                    (s, i) => s + calcularSubtotalItem(i.cantidad, i.precioUnitario, i.descuento),
                    0,
                  ),
                )}
              </span>
            </div>
            <button
              onClick={handleCrearOrden}
              disabled={!nuevoClienteId || nuevoItems.every((i) => !i.descripcion.trim())}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              {`Crear ${singularMin}`}
            </button>
          </div>
        </div>
      )}

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre de cliente..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as TipoOrden | '')}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Todos los tipos</option>
          {(['pedido', 'produccion', 'servicio'] as TipoOrden[]).map((t) => (
            <option key={t} value={t}>
              {TIPO_ORDEN_LABEL_CORTO[t]}
            </option>
          ))}
        </select>

        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as EstadoOrden | '')}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADO_ORDEN_LABEL) as EstadoOrden[]).map((est) => (
            <option key={est} value={est}>
              {ESTADO_ORDEN_LABEL[est]}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Hasta</label>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Tabla de ordenes */}
      {ordenesFiltradas.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" />}
          title={`No se encontraron ${pluralMin}`}
          description={`No hay ${pluralMin} con los filtros seleccionados`}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Numero</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Entrega</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {ordenesFiltradas.map((orden) => {
                const isExpanded = expandedId === orden.id;
                const comprobantesOrden = comprobantes.filter((c) =>
                  orden.comprobanteIds.includes(c.id),
                );
                const editandoEntrega = entregaOrdenId === orden.id;

                return (
                  <OrdenRow
                    key={orden.id}
                    orden={orden}
                    terminoSingularMin={singularMin}
                    isExpanded={isExpanded}
                    clienteNombre={clienteNombre(orden.clienteId)}
                    comprobantesOrden={comprobantesOrden}
                    editandoEntrega={editandoEntrega}
                    entregaCantidades={entregaCantidades}
                    onToggleExpand={() => setExpandedId(isExpanded ? null : orden.id)}
                    onCambiarEstado={(est) => handleCambiarEstado(orden.id, est)}
                    onIniciarEntrega={() => handleIniciarEntregaParcial(orden)}
                    onCancelarEntrega={() => setEntregaOrdenId(null)}
                    onGuardarEntrega={() => handleGuardarEntregaParcial(orden.id)}
                    onUpdateEntregaCantidad={(itemId, cant) =>
                      setEntregaCantidades((prev) => ({ ...prev, [itemId]: cant }))
                    }
                    onFacturar={() => handleFacturar(orden)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Comprobante dialog */}
      {comprobanteDialogOpen && ordenParaFacturar && (
        <ComprobanteDialog
          open={comprobanteDialogOpen}
          onOpenChange={(open) => {
            setComprobanteDialogOpen(open);
            if (!open) setOrdenParaFacturar(null);
          }}
          clientes={clientes}
          onSave={handleSaveComprobante}
          modoEmisionDefault={config.modoEmisionDefault}
        />
      )}
    </div>
  );
}

// ─── Fila de orden con panel expandible ─────────────────────

interface OrdenRowProps {
  orden: Orden;
  terminoSingularMin: string;
  isExpanded: boolean;
  clienteNombre: string;
  comprobantesOrden: { id: string; tipo: TipoComprobante; numero: number; total: number }[];
  editandoEntrega: boolean;
  entregaCantidades: Record<string, number>;
  onToggleExpand: () => void;
  onCambiarEstado: (estado: EstadoOrden) => void;
  onIniciarEntrega: () => void;
  onCancelarEntrega: () => void;
  onGuardarEntrega: () => void;
  onUpdateEntregaCantidad: (itemId: string, cantidad: number) => void;
  onFacturar: () => void;
}

function OrdenRow({
  orden,
  terminoSingularMin,
  isExpanded,
  clienteNombre,
  comprobantesOrden,
  editandoEntrega,
  entregaCantidades,
  onToggleExpand,
  onCambiarEstado,
  onIniciarEntrega,
  onCancelarEntrega,
  onGuardarEntrega,
  onUpdateEntregaCantidad,
  onFacturar,
}: OrdenRowProps) {
  const o = orden;
  const prefijo = PREFIJO_ORDEN[o.tipo];

  return (
    <>
      {/* Fila principal */}
      <tr
        onClick={onToggleExpand}
        className="cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50 last:border-0"
      >
        <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">
          {formatNumero(prefijo, o.numero)}
        </td>
        <td className="px-4 py-3">
          <TipoOrdenBadge tipo={o.tipo} />
        </td>
        <td className="px-4 py-3 text-gray-900">{clienteNombre}</td>
        <td className="px-4 py-3 text-gray-600">{formatDate(o.fecha)}</td>
        <td className="px-4 py-3 text-gray-600">
          {o.fechaEntrega ? formatDate(o.fechaEntrega) : '—'}
        </td>
        <td className="px-4 py-3 text-right">
          <Amount value={o.total} size="sm" />
        </td>
        <td className="px-4 py-3">
          <EstadoOrdenBadge estado={o.estado} tipo={o.tipo} />
        </td>
        <td className="px-4 py-3 text-center">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </td>
      </tr>

      {/* Panel expandido */}
      {isExpanded && (
        <tr>
          <td colSpan={8} className="bg-gray-50 px-4 py-5">
            <div className="space-y-5">
              {/* Tabla de items */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  Detalle de items
                </h3>
                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-gray-500">
                        <th className="px-3 py-2 font-medium">Descripcion</th>
                        <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                        <th className="px-3 py-2 text-right font-medium">Precio Unit.</th>
                        <th className="px-3 py-2 text-right font-medium">Dto.</th>
                        <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                        <th className="px-3 py-2 text-right font-medium">Entregado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.items.map((item) => (
                        <tr key={item.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 text-gray-900">{item.descripcion}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{item.cantidad}</td>
                          <td className="px-3 py-2 text-right">
                            <Amount value={item.precioUnitario} size="sm" />
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {item.descuento > 0 ? formatPct(item.descuento) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Amount value={item.subtotal} size="sm" />
                          </td>
                          <td className="px-3 py-2 text-right">
                            {editandoEntrega ? (
                              <input
                                type="number"
                                min={0}
                                max={item.cantidad}
                                value={entregaCantidades[item.id] ?? item.cantidadEntregada}
                                onChange={(e) =>
                                  onUpdateEntregaCantidad(item.id, Number(e.target.value))
                                }
                                onClick={(e) => e.stopPropagation()}
                                className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            ) : (
                              <span
                                className={
                                  item.cantidadEntregada >= item.cantidad
                                    ? 'text-green-700 font-medium'
                                    : item.cantidadEntregada > 0
                                      ? 'text-amber-600 font-medium'
                                      : 'text-gray-400'
                                }
                              >
                                {item.cantidadEntregada} / {item.cantidad}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200">
                        <td colSpan={4} className="px-3 py-2 text-right font-semibold text-gray-900">
                          Total
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">
                          {formatARS(o.total)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Entrega parcial botones */}
              {editandoEntrega && (
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onGuardarEntrega();
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Guardar entregas
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancelarEntrega();
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {/* Origen */}
              {(o.origenModulo || o.origenCanal) && (
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <h4 className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Origen
                  </h4>
                  <div className="flex flex-wrap gap-3 text-sm text-gray-700">
                    {o.origenModulo && (
                      <span>
                        Modulo: <span className="font-medium">{o.origenModulo}</span>
                      </span>
                    )}
                    {o.origenCanal && (
                      <span>
                        Canal: <span className="font-medium">{o.origenCanal}</span>
                      </span>
                    )}
                    {o.origenExternoId && (
                      <span>
                        ID externo: <span className="font-mono text-xs">{o.origenExternoId}</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Notas */}
              {o.notas && (
                <div>
                  <h4 className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Notas
                  </h4>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{o.notas}</p>
                </div>
              )}

              {/* Comprobantes vinculados */}
              {comprobantesOrden.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <Link2 className="h-3.5 w-3.5" />
                    Comprobantes vinculados
                  </h4>
                  <div className="space-y-1">
                    {comprobantesOrden.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm"
                      >
                        <span className="font-mono text-xs text-gray-600">
                          {formatNumero(PREFIJO_COMPROBANTE[c.tipo], c.numero)}
                        </span>
                        <span className="text-gray-900">{formatARS(c.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Acciones segun estado */}
              {o.estado !== 'cancelado' && (
                <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
                  {o.estado === 'pendiente' && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCambiarEstado('en_preparacion');
                        }}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Iniciar preparacion
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCambiarEstado('cancelado');
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancelar
                      </button>
                    </>
                  )}

                  {(o.estado === 'en_preparacion' || o.estado === 'entregado_parcial') && (
                    <>
                      {!editandoEntrega && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onIniciarEntrega();
                          }}
                          className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors"
                        >
                          <Truck className="h-3.5 w-3.5" />
                          Registrar entrega parcial
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCambiarEstado('entregado');
                        }}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Marcar entregado
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onFacturar();
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Facturar
                      </button>
                    </>
                  )}

                  {o.estado === 'entregado' && comprobantesOrden.length === 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFacturar();
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Facturar
                    </button>
                  )}
                </div>
              )}

              {/* Estado cancelado: read-only */}
              {o.estado === 'cancelado' && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  {`Esta ${terminoSingularMin} fue cancelada`}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
