// ============================================================
// Módulo Ventas — Cobranzas
// ============================================================

import { useState, useMemo, Fragment } from 'react';
import { useVentas, useVentasDispatch, useCobros } from '../data/store';
import { CobroDialog } from '../components/ventas/dialogs';
import { MedioPagoBadge, Amount, EmptyState, KpiCard } from '../components/ventas/display';
import { formatARS, formatDate, formatNumero, todayISO } from '../lib/format';
import type { Cobro, Cliente, Comprobante } from '../types';
import { MEDIO_PAGO_LABEL, generarId } from '../types';
import {
  Receipt, Search, Plus, ChevronDown, ChevronRight,
  DollarSign, Clock, TrendingUp, FileText,
} from 'lucide-react';

export default function Cobranzas() {
  const { clientes, comprobantes, cobros, config } = useVentas();
  const dispatch = useVentasDispatch();

  const [busqueda, setBusqueda] = useState('');
  const [filtroMedio, setFiltroMedio] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogCliente, setDialogCliente] = useState<Cliente | null>(null);

  // ─── KPIs ─────────────────────────────────────────────────
  const hoy = todayISO();
  const mesActual = hoy.slice(0, 7);

  const stats = useMemo(() => {
    const cobrosDelMes = cobros.filter(c => c.fecha.startsWith(mesActual));
    const totalCobradoMes = cobrosDelMes.reduce((s, c) => s + c.monto, 0);
    const totalCobradoHoy = cobros.filter(c => c.fecha === hoy).reduce((s, c) => s + c.monto, 0);
    const pendienteCobro = comprobantes
      .filter(c => c.estado === 'emitido' || c.estado === 'cobrado_parcial')
      .reduce((s, c) => s + c.saldoPendiente, 0);
    return { totalCobradoMes, totalCobradoHoy, pendienteCobro, cantidadMes: cobrosDelMes.length };
  }, [cobros, comprobantes, mesActual, hoy]);

  // ─── Filtrado ─────────────────────────────────────────────
  const clienteMap = useMemo(() => {
    const m = new Map<string, Cliente>();
    clientes.forEach(c => m.set(c.id, c));
    return m;
  }, [clientes]);

  const cobrosFiltrados = useMemo(() => {
    let lista = [...cobros].sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (busqueda) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(c => {
        const cli = clienteMap.get(c.clienteId);
        return cli?.nombre.toLowerCase().includes(q) || formatNumero('COB', c.numero).toLowerCase().includes(q);
      });
    }
    if (filtroMedio) lista = lista.filter(c => c.medioPago === filtroMedio);
    if (fechaDesde) lista = lista.filter(c => c.fecha >= fechaDesde);
    if (fechaHasta) lista = lista.filter(c => c.fecha <= fechaHasta);
    return lista;
  }, [cobros, busqueda, filtroMedio, fechaDesde, fechaHasta, clienteMap]);

  // ─── Clientes con deuda ───────────────────────────────────
  const clientesConDeuda = useMemo(() => {
    return clientes
      .filter(c => c.saldoCuentaCorriente > 0)
      .sort((a, b) => b.saldoCuentaCorriente - a.saldoCuentaCorriente);
  }, [clientes]);

  const comprobantesPendientesCliente = (clienteId: string) =>
    comprobantes.filter(c =>
      c.clienteId === clienteId && (c.estado === 'emitido' || c.estado === 'cobrado_parcial')
    );

  function abrirCobro(cliente: Cliente) {
    setDialogCliente(cliente);
    setDialogOpen(true);
  }

  function handleSaveCobro(data: Omit<Cobro, 'id' | 'numero' | 'createdAt'>) {
    dispatch({
      type: 'ADD_COBRO',
      payload: { ...data, id: generarId(), numero: 0, createdAt: '' },
    });
    setDialogOpen(false);
    setDialogCliente(null);
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Cobrado este mes" value={formatARS(stats.totalCobradoMes)} icon={<DollarSign className="w-5 h-5 text-green-600" />} />
        <KpiCard title="Cobrado hoy" value={formatARS(stats.totalCobradoHoy)} icon={<TrendingUp className="w-5 h-5 text-blue-600" />} />
        <KpiCard title="Pendiente de cobro" value={formatARS(stats.pendienteCobro)} icon={<Clock className="w-5 h-5 text-amber-600" />} />
        <KpiCard title="Cobros del mes" value={stats.cantidadMes} icon={<Receipt className="w-5 h-5 text-purple-600" />} />
      </div>

      {/* Clientes con deuda */}
      {clientesConDeuda.length > 0 && (
        <div className="rounded-xl border bg-amber-50/60 p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-3">Clientes con saldo pendiente</h3>
          <div className="space-y-2">
            {clientesConDeuda.map(cli => (
              <div key={cli.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2 border border-amber-200">
                <div>
                  <span className="font-medium text-sm">{cli.nombre}</span>
                  <span className="ml-3 text-sm text-red-600 font-semibold">{formatARS(cli.saldoCuentaCorriente)}</span>
                </div>
                <button
                  onClick={() => abrirCobro(cli)}
                  className="text-xs bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700"
                >
                  Registrar cobro
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente o número..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <select value={filtroMedio} onChange={e => setFiltroMedio(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Todos los medios</option>
          {Object.entries(MEDIO_PAGO_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
      </div>

      {/* Tabla de cobros */}
      {cobrosFiltrados.length === 0 ? (
        <EmptyState icon={<Receipt className="w-10 h-10" />} title="Sin cobros registrados" description="Los cobros aparecerán aquí cuando se registren pagos de clientes." />
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Medio</th>
                <th className="px-4 py-3 font-medium text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cobrosFiltrados.map(cobro => {
                const cli = clienteMap.get(cobro.clienteId);
                const expanded = expandedId === cobro.id;
                return (
                  <Fragment key={cobro.id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedId(expanded ? null : cobro.id)}
                    >
                      <td className="px-4 py-3">
                        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-4 py-3 font-mono">{formatNumero('COB', cobro.numero)}</td>
                      <td className="px-4 py-3">{cli?.nombre ?? '—'}</td>
                      <td className="px-4 py-3">{formatDate(cobro.fecha)}</td>
                      <td className="px-4 py-3"><MedioPagoBadge medio={cobro.medioPago} /></td>
                      <td className="px-4 py-3 text-right"><Amount value={cobro.monto} /></td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={6} className="bg-gray-50/50 px-8 py-4">
                          <div className="space-y-3">
                            {cobro.notas && <p className="text-sm text-gray-600">{cobro.notas}</p>}
                            <h4 className="text-xs font-semibold text-gray-500 uppercase">Imputaciones</h4>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500">
                                  <th className="text-left py-1">Comprobante</th>
                                  <th className="text-left py-1">Tipo</th>
                                  <th className="text-left py-1">Fecha</th>
                                  <th className="text-right py-1">Imputado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cobro.imputaciones.map((imp, i) => {
                                  const comp = comprobantes.find(c => c.id === imp.comprobanteId);
                                  return (
                                    <tr key={i} className="border-t border-gray-100">
                                      <td className="py-1 font-mono">
                                        {comp ? formatNumero(comp.tipo === 'factura' ? 'FAC' : comp.tipo === 'recibo' ? 'REC' : comp.tipo === 'nota_credito' ? 'NC' : 'ND', comp.numero) : imp.comprobanteId}
                                      </td>
                                      <td className="py-1">{comp?.tipo ?? '—'}</td>
                                      <td className="py-1">{comp ? formatDate(comp.fecha) : '—'}</td>
                                      <td className="py-1 text-right font-semibold">{formatARS(imp.montoImputado)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog */}
      {dialogCliente && (
        <CobroDialog
          open={dialogOpen}
          onOpenChange={open => { setDialogOpen(open); if (!open) setDialogCliente(null); }}
          cliente={dialogCliente}
          comprobantesCliente={comprobantesPendientesCliente(dialogCliente.id)}
          onSave={handleSaveCobro}
        />
      )}
    </div>
  );
}

