// ============================================================
// Módulo Ventas — Dashboard
// Edgy Gestión · Vista general de ventas
// ============================================================

import { useState, useMemo } from 'react';
import {
  DollarSign,
  Clock,
  Package,
  Users,
  AlertTriangle,
  TrendingUp,
  ShoppingBag,
  FileText,
  Download,
  Loader2,
} from 'lucide-react';

import { useClienteActual } from '@/hooks/useClienteActual';
import { descargarComprobantePdf } from '../lib/pdfComprobantes';
import { useDashboardStats, useComprobantes, useClientes } from '../data/store';
import {
  KpiCard,
  EstadoComprobanteBadge,
  Amount,
  EmptyState,
} from '../components/ventas/display';
import {
  formatARS,
  formatDate,
  formatNumero,
  PREFIJO_COMPROBANTE,
  daysUntil,
  formatQty,
} from '../lib/format';
import type { Comprobante } from '../types';
import { labelTipoComprobante } from '../types';

// ─── Tipos internos ─────────────────────────────────────────

type Periodo = 'Hoy' | 'Esta semana' | 'Este mes';

// ─── Componente ─────────────────────────────────────────────

export default function Dashboard() {
  const [periodo, setPeriodo] = useState<Periodo>('Este mes');

  const stats = useDashboardStats();
  const comprobantes = useComprobantes();
  const clientes = useClientes();
  const { cliente: empresaActual } = useClienteActual();
  // Fase 17: ícono de descarga de PDF también en este listado -- id
  // del comprobante que se está generando (deshabilita su botón
  // mientras descarga el logo).
  const [generandoPdfId, setGenerandoPdfId] = useState<string | null>(null);

  // ── KPI según período seleccionado ────────────────────────

  const ventasPeriodo = useMemo(() => {
    switch (periodo) {
      case 'Hoy':
        return stats.ventasHoy;
      case 'Esta semana':
        return stats.ventasSemana;
      case 'Este mes':
        return stats.ventasDelMes;
    }
  }, [periodo, stats]);

  const clientesActivos = useMemo(
    () => clientes.filter((c) => c.activo).length,
    [clientes],
  );

  // ── Últimos comprobantes ──────────────────────────────────

  const ultimosComprobantes = useMemo(
    () =>
      [...comprobantes]
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .slice(0, 5),
    [comprobantes],
  );

  // ── Alertas de cobro ──────────────────────────────────────

  const alertasCobro = useMemo(
    () =>
      comprobantes
        .filter((c) => c.saldoPendiente > 0 && c.estado !== 'anulado')
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [comprobantes],
  );

  // ── Helpers ───────────────────────────────────────────────

  const nombreCliente = (clienteId: string) =>
    clientes.find((c) => c.id === clienteId)?.nombre ?? 'Desconocido';

  const handleDescargarPdf = async (comp: Comprobante) => {
    if (!empresaActual) return;
    setGenerandoPdfId(comp.id);
    try {
      const cliente = clientes.find((c) => c.id === comp.clienteId);
      await descargarComprobantePdf(empresaActual, cliente, comp, nombreCliente(comp.clienteId));
    } finally {
      setGenerandoPdfId(null);
    }
  };

  const diasVencido = (comp: Comprobante) => {
    const dias = daysUntil(comp.fecha);
    return Math.abs(dias);
  };

  // ── Render ────────────────────────────────────────────────

  const periodos: Periodo[] = ['Hoy', 'Esta semana', 'Este mes'];

  return (
    <div className="space-y-6">
      {/* Header + filtro de período */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard de Ventas</h1>

        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {periodos.map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                periodo === p
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={`Ventas — ${periodo.toLowerCase()}`}
          value={formatARS(ventasPeriodo)}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KpiCard
          title="Pendiente de cobro"
          value={formatARS(stats.pendienteCobro)}
          icon={<Clock className="h-5 w-5" />}
        />
        <KpiCard
          title="Unidades vendidas"
          value={formatQty(stats.unidadesVendidas)}
          icon={<Package className="h-5 w-5" />}
        />
        <KpiCard
          title="Clientes activos"
          value={String(clientesActivos)}
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      {/* Dos columnas: Ranking clientes + Productos más vendidos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Ranking de clientes */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Ranking de clientes</h2>
          </div>

          {stats.topClientes.length === 0 ? (
            <EmptyState title="Sin datos de clientes en el período" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 text-right font-medium">Total facturado</th>
                </tr>
              </thead>
              <tbody>
                {stats.topClientes.map((c, i) => (
                  <tr
                    key={c.clienteId}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="py-2.5">
                      <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                        {i + 1}
                      </span>
                      {c.nombre}
                    </td>
                    <td className="py-2.5 text-right">
                      <Amount value={c.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Productos más vendidos */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Productos más vendidos</h2>
          </div>

          {stats.topProductos.length === 0 ? (
            <EmptyState title="Sin datos de productos en el período" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="pb-2 font-medium">Producto</th>
                  <th className="pb-2 text-right font-medium">Cantidad</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.topProductos.map((p, i) => (
                  <tr
                    key={p.descripcion}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="py-2.5">
                      <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700">
                        {i + 1}
                      </span>
                      {p.descripcion}
                    </td>
                    <td className="py-2.5 text-right font-medium text-gray-700">
                      {formatQty(p.cantidad)}
                    </td>
                    <td className="py-2.5 text-right">
                      <Amount value={p.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Últimos comprobantes */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">Últimos comprobantes</h2>
        </div>

        {ultimosComprobantes.length === 0 ? (
          <EmptyState title="No hay comprobantes registrados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="pb-2 font-medium">Número</th>
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 font-medium">Tipo</th>
                  <th className="pb-2 font-medium">Fecha</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                  <th className="pb-2 font-medium">Estado</th>
                  <th className="pb-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {ultimosComprobantes.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="py-2.5 font-mono text-xs">
                      {formatNumero(PREFIJO_COMPROBANTE[c.tipo], c.numero)}
                    </td>
                    <td className="py-2.5">{nombreCliente(c.clienteId)}</td>
                    <td className="py-2.5">
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {labelTipoComprobante(c.tipo, c.modoEmision)}
                      </span>
                    </td>
                    <td className="py-2.5 text-gray-600">{formatDate(c.fecha)}</td>
                    <td className="py-2.5 text-right">
                      <Amount value={c.total} />
                    </td>
                    <td className="py-2.5">
                      <EstadoComprobanteBadge estado={c.estado} />
                    </td>
                    <td className="py-2.5 text-center">
                      <button
                        onClick={() => handleDescargarPdf(c)}
                        disabled={generandoPdfId === c.id}
                        title="Descargar PDF"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                      >
                        {generandoPdfId === c.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Alertas de cobro */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-gray-900">Alertas de cobro</h2>
        </div>

        {alertasCobro.length === 0 ? (
          <EmptyState title="No hay deudas pendientes" />
        ) : (
          <div className="space-y-2">
            {alertasCobro.map((c) => {
              const dias = diasVencido(c);
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {formatNumero(PREFIJO_COMPROBANTE[c.tipo], c.numero)} — {nombreCliente(c.clienteId)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Emitido el {formatDate(c.fecha)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-amber-700">
                      {dias} {dias === 1 ? 'día' : 'días'} de antigüedad
                    </span>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Pendiente</p>
                      <Amount value={c.saldoPendiente} size="sm" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
