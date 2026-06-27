// ============================================================
// Módulo Ventas — Presupuestos
// Edgy Gestión · Listado, detalle y gestión de presupuestos
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  Send,
  Edit2,
  CheckCircle2,
  XCircle,
  Link2,
  Calendar,
  FileText,
} from 'lucide-react';

import {
  usePresupuestos,
  useClientes,
  useVentas,
  useVentasDispatch,
} from '../data/store';
import {
  EstadoPresupuestoBadge,
  Amount,
  EmptyState,
} from '../components/ventas/display';
import { PresupuestoDialog } from '../components/ventas/dialogs';
import {
  formatDate,
  formatARS,
  formatNumero,
  formatPct,
  PREFIJO_ORDEN,
} from '../lib/format';
import type {
  Presupuesto,
  EstadoPresupuesto,
  TipoOrden,
} from '../types';
import {
  ESTADO_PRESUPUESTO_LABEL,
  calcularSubtotalItem,
} from '../types';

// ─── Prefijo presupuesto ────────────────────────────────────

const PREFIJO_PRESUPUESTO = 'PRE';

// ─── Componente principal ───────────────────────────────────

export default function Presupuestos() {
  const todosPresupuestos = usePresupuestos();
  const clientes = useClientes();
  const { ordenes } = useVentas();
  const dispatch = useVentasDispatch();

  // ── Filtros ───────────────────────────────────────────────

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoPresupuesto | ''>('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // ── Estado de UI ──────────────────────────────────────────

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPresupuesto, setEditPresupuesto] = useState<Presupuesto | null>(null);

  // ── Helpers ───────────────────────────────────────────────

  const clienteNombre = useCallback(
    (clienteId: string) => {
      const c = clientes.find((cl) => cl.id === clienteId);
      return c?.nombre ?? 'Desconocido';
    },
    [clientes],
  );

  const ordenNumero = useCallback(
    (ordenId: string) => {
      const o = ordenes.find((or) => or.id === ordenId);
      if (!o) return '—';
      return formatNumero(PREFIJO_ORDEN[o.tipo], o.numero);
    },
    [ordenes],
  );

  // ── Datos filtrados ───────────────────────────────────────

  const presupuestosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();

    return todosPresupuestos.filter((p) => {
      // Filtro estado
      if (filtroEstado && p.estado !== filtroEstado) return false;

      // Filtro fecha desde
      if (fechaDesde && p.fecha < fechaDesde) return false;

      // Filtro fecha hasta
      if (fechaHasta && p.fecha > fechaHasta) return false;

      // Búsqueda por nombre de cliente
      if (q) {
        const nombre = clienteNombre(p.clienteId).toLowerCase();
        if (!nombre.includes(q)) return false;
      }

      return true;
    });
  }, [todosPresupuestos, busqueda, filtroEstado, fechaDesde, fechaHasta, clienteNombre]);

  // ── Handlers ──────────────────────────────────────────────

  const handleNuevo = () => {
    setEditPresupuesto(null);
    setDialogOpen(true);
  };

  const handleEditar = (presupuesto: Presupuesto) => {
    setEditPresupuesto(presupuesto);
    setDialogOpen(true);
  };

  const handleEnviar = (id: string) => {
    dispatch({
      type: 'CAMBIAR_ESTADO_PRESUPUESTO',
      payload: { id, nuevoEstado: 'enviado' },
    });
  };

  const handleCancelar = (id: string) => {
    dispatch({
      type: 'CAMBIAR_ESTADO_PRESUPUESTO',
      payload: { id, nuevoEstado: 'cancelado' },
    });
  };

  const handleAprobar = (presupuestoId: string, tipoOrden: TipoOrden = 'pedido') => {
    dispatch({
      type: 'CONVERTIR_PRESUPUESTO_A_ORDEN',
      payload: { presupuestoId, tipoOrden },
    });
  };

  const handleToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Presupuestos</h1>

        <button
          onClick={handleNuevo}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo presupuesto
        </button>
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Búsqueda por cliente */}
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

        {/* Filtro estado */}
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as EstadoPresupuesto | '')}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADO_PRESUPUESTO_LABEL) as EstadoPresupuesto[]).map((est) => (
            <option key={est} value={est}>
              {ESTADO_PRESUPUESTO_LABEL[est]}
            </option>
          ))}
        </select>

        {/* Fecha desde */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Fecha hasta */}
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

      {/* Tabla de presupuestos */}
      {presupuestosFiltrados.length === 0 ? (
        <EmptyState message="No se encontraron presupuestos con los filtros seleccionados" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Validez</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {presupuestosFiltrados.map((pres) => (
                <PresupuestoRow
                  key={pres.id}
                  presupuesto={pres}
                  isExpanded={expandedId === pres.id}
                  clienteNombre={clienteNombre(pres.clienteId)}
                  ordenNumero={pres.ordenId ? ordenNumero(pres.ordenId) : null}
                  onToggleExpand={() => handleToggleExpand(pres.id)}
                  onEnviar={() => handleEnviar(pres.id)}
                  onEditar={() => handleEditar(pres)}
                  onCancelar={() => handleCancelar(pres.id)}
                  onAprobar={(tipo) => handleAprobar(pres.id, tipo)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog */}
      {dialogOpen && (
        <PresupuestoDialog
          presupuesto={editPresupuesto}
          onClose={() => {
            setDialogOpen(false);
            setEditPresupuesto(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Fila de presupuesto con panel expandible ───────────────

interface PresupuestoRowProps {
  presupuesto: Presupuesto;
  isExpanded: boolean;
  clienteNombre: string;
  ordenNumero: string | null;
  onToggleExpand: () => void;
  onEnviar: () => void;
  onEditar: () => void;
  onCancelar: () => void;
  onAprobar: (tipo: TipoOrden) => void;
}

function PresupuestoRow({
  presupuesto,
  isExpanded,
  clienteNombre,
  ordenNumero,
  onToggleExpand,
  onEnviar,
  onEditar,
  onCancelar,
  onAprobar,
}: PresupuestoRowProps) {
  const p = presupuesto;
  const esReadOnly = p.estado === 'vencido' || p.estado === 'cancelado' || p.estado === 'aprobado';

  return (
    <>
      {/* Fila principal */}
      <tr
        onClick={onToggleExpand}
        className="cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50 last:border-0"
      >
        <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">
          {formatNumero(PREFIJO_PRESUPUESTO, p.numero)}
        </td>
        <td className="px-4 py-3 text-gray-900">{clienteNombre}</td>
        <td className="px-4 py-3 text-gray-600">{formatDate(p.fecha)}</td>
        <td className="px-4 py-3 text-gray-600">
          {p.validezDias} {p.validezDias === 1 ? 'día' : 'días'}
        </td>
        <td className="px-4 py-3 text-right">
          <Amount value={p.total} className="font-semibold" />
        </td>
        <td className="px-4 py-3">
          <EstadoPresupuestoBadge estado={p.estado} />
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
          <td colSpan={7} className="bg-gray-50 px-4 py-5">
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
                        <th className="px-3 py-2 font-medium">Descripción</th>
                        <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                        <th className="px-3 py-2 text-right font-medium">Precio Unit.</th>
                        <th className="px-3 py-2 text-right font-medium">Dto.</th>
                        <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.items.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-gray-50 last:border-0"
                        >
                          <td className="px-3 py-2 text-gray-900">
                            {item.descripcion}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {item.cantidad}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Amount value={item.precioUnitario} />
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {item.descuento > 0 ? formatPct(item.descuento) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Amount value={item.subtotal} className="font-medium" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {p.descuentoGeneral > 0 && (
                        <tr className="border-t border-gray-100">
                          <td colSpan={4} className="px-3 py-2 text-right text-sm text-gray-500">
                            Descuento general ({formatPct(p.descuentoGeneral)})
                          </td>
                          <td className="px-3 py-2 text-right text-sm text-red-600">
                            -{formatARS(p.subtotal * (p.descuentoGeneral / 100))}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-gray-200">
                        <td colSpan={4} className="px-3 py-2 text-right font-semibold text-gray-900">
                          Total
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">
                          {formatARS(p.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Condiciones y notas */}
              {(p.condiciones || p.notas) && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {p.condiciones && (
                    <div>
                      <h4 className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Condiciones comerciales
                      </h4>
                      <p className="text-sm text-gray-700 whitespace-pre-line">
                        {p.condiciones}
                      </p>
                    </div>
                  )}
                  {p.notas && (
                    <div>
                      <h4 className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Notas
                      </h4>
                      <p className="text-sm text-gray-700 whitespace-pre-line">
                        {p.notas}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Info de vencimiento */}
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Calendar className="h-4 w-4" />
                Vence: {formatDate(p.fechaVencimiento)}
              </div>

              {/* Orden vinculada (si aprobado) */}
              {p.estado === 'aprobado' && p.ordenId && (
                <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800">
                  <Link2 className="h-4 w-4" />
                  Orden generada: <span className="font-mono font-medium">{ordenNumero}</span>
                </div>
              )}

              {/* Acciones según estado */}
              {!esReadOnly && (
                <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
                  {p.estado === 'borrador' && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEnviar();
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Enviar
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditar();
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancelar();
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancelar
                      </button>
                    </>
                  )}

                  {p.estado === 'enviado' && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAprobar('pedido');
                        }}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Aprobar y crear orden
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancelar();
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
