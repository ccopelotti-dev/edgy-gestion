// ============================================================
// Modulo Compras — Dashboard
// Edgy Gestion · Vista general de compras
// ============================================================

import { useMemo } from 'react';
import {
  DollarSign,
  Clock,
  Building2,
  ClipboardList,
  TrendingUp,
  FileText,
  AlertTriangle,
} from 'lucide-react';

import { useDashboardCompras, useComprobantesCompra, useProveedores } from '../data/store';
import {
  KpiCard,
  EstadoComprobanteBadge,
  Amount,
  EmptyState,
} from '../components/compras/display';
import {
  formatARS,
  formatDate,
  formatNumero,
  PREFIJO_COMPROBANTE_COMPRA,
  daysUntil,
} from '../lib/format';
import { TIPO_COMPROBANTE_COMPRA_LABEL } from '../types';

// ─── Componente ─────────────────────────────────────────────

export default function Dashboard() {
  const stats = useDashboardCompras();
  const comprobantes = useComprobantesCompra();
  const proveedores = useProveedores();

  // ── Ultimos comprobantes ──────────────────────────────────

  const ultimosComprobantes = useMemo(
    () =>
      [...comprobantes]
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .slice(0, 5),
    [comprobantes],
  );

  // ── Alertas de pago ───────────────────────────────────────

  const alertasPago = useMemo(
    () =>
      comprobantes
        .filter((c) => c.saldoPendiente > 0 && c.estado !== 'anulado')
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [comprobantes],
  );

  // ── Helpers ───────────────────────────────────────────────

  const nombreProveedor = (proveedorId: string) =>
    proveedores.find((p) => p.id === proveedorId)?.nombre ?? 'Desconocido';

  const diasAntiguo = (fecha: string) => Math.abs(daysUntil(fecha));

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard de Compras</h1>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Compras del mes"
          value={formatARS(stats.comprasDelMes)}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KpiCard
          title="Pendiente de pago"
          value={formatARS(stats.pendientePago)}
          icon={<Clock className="h-5 w-5" />}
        />
        <KpiCard
          title="Proveedores activos"
          value={String(stats.proveedoresActivos)}
          icon={<Building2 className="h-5 w-5" />}
        />
        <KpiCard
          title="OC abiertas"
          value={String(stats.ordenesAbiertas)}
          icon={<ClipboardList className="h-5 w-5" />}
        />
      </div>

      {/* Top 5 proveedores */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Top 5 proveedores del mes</h2>
        </div>

        {stats.topProveedores.length === 0 ? (
          <EmptyState title="Sin compras registradas este mes" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="pb-2 font-medium">Proveedor</th>
                <th className="pb-2 text-right font-medium">Total facturado</th>
              </tr>
            </thead>
            <tbody>
              {stats.topProveedores.map((p, i) => (
                <tr key={p.proveedorId} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5">
                    <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                      {i + 1}
                    </span>
                    {p.nombre}
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

      {/* Ultimos comprobantes */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Ultimos comprobantes</h2>
        </div>

        {ultimosComprobantes.length === 0 ? (
          <EmptyState title="No hay comprobantes registrados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="pb-2 font-medium">Numero</th>
                  <th className="pb-2 font-medium">Proveedor</th>
                  <th className="pb-2 font-medium">Tipo</th>
                  <th className="pb-2 font-medium">Fecha</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                  <th className="pb-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {ultimosComprobantes.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 font-mono text-xs">
                      {formatNumero(PREFIJO_COMPROBANTE_COMPRA[c.tipo], c.numero)}
                    </td>
                    <td className="py-2.5">{nombreProveedor(c.proveedorId)}</td>
                    <td className="py-2.5">
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {TIPO_COMPROBANTE_COMPRA_LABEL[c.tipo]}
                      </span>
                    </td>
                    <td className="py-2.5 text-gray-600">{formatDate(c.fecha)}</td>
                    <td className="py-2.5 text-right">
                      <Amount value={c.total} />
                    </td>
                    <td className="py-2.5">
                      <EstadoComprobanteBadge estado={c.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Alertas de pago */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-gray-900">Alertas de pago</h2>
        </div>

        {alertasPago.length === 0 ? (
          <EmptyState title="No hay pagos pendientes" />
        ) : (
          <div className="space-y-2">
            {alertasPago.map((c) => {
              const dias = diasAntiguo(c.fecha);
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {formatNumero(PREFIJO_COMPROBANTE_COMPRA[c.tipo], c.numero)} — {nombreProveedor(c.proveedorId)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Emitido el {formatDate(c.fecha)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-amber-700">
                      {dias} {dias === 1 ? 'dia' : 'dias'} de antiguedad
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
