// ============================================================
// Modulo Compras — Ordenes de Pago
// Edgy Gestion · Fase 22: factorización de "Registrar pago" en una
// herramienta propia, con plazo, transferencia y cheques (uno o varios
// por orden), y débito real en Tesorería al confirmar.
// ============================================================

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Ban,
  Download,
  Loader2,
  Wallet,
} from 'lucide-react';

import { useClienteActual } from '@/hooks/useClienteActual';
import {
  useProveedores,
  useComprobantesCompra,
  usePagos,
  useComprasDispatch,
} from '../data/store';
import {
  EstadoPagoBadge,
  MedioPagoBadge,
  Amount,
  EmptyState,
} from '../components/compras/display';
import { OrdenPagoDialog, ConfirmarPagoDialog, type CuentaBancariaOpcionDialog } from '../components/compras/dialogs';
import { descargarComprobantePagoPdf } from '../lib/pdfComprobantes';
import { listarCuentasBancarias } from '@/lib/tesoreriaSync';
import { formatDate, nowISO } from '../lib/format';
import type { EstadoPagoCompra, PagoCompra } from '../types';
import { generarId } from '../types';

export default function OrdenesPago() {
  const proveedores = useProveedores();
  const comprobantes = useComprobantesCompra();
  const pagos = usePagos();
  const dispatch = useComprasDispatch();
  const { cliente: empresaActual } = useClienteActual();

  // ── Filtros ───────────────────────────────────────────────

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoPagoCompra | ''>('');

  // ── Nueva Orden de Pago ───────────────────────────────────

  const [proveedorNuevaOrdenId, setProveedorNuevaOrdenId] = useState('');
  const [ordenPagoDialogOpen, setOrdenPagoDialogOpen] = useState(false);

  // ── Confirmar / descargar ─────────────────────────────────

  const [confirmarPagoId, setConfirmarPagoId] = useState<string | null>(null);
  const [cuentas, setCuentas] = useState<CuentaBancariaOpcionDialog[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generandoPdfId, setGenerandoPdfId] = useState<string | null>(null);

  useEffect(() => {
    if (confirmarPagoId && empresaActual) {
      listarCuentasBancarias(empresaActual.id).then(setCuentas);
    }
  }, [confirmarPagoId, empresaActual]);

  const nombreProveedor = (id: string) => proveedores.find((p) => p.id === id)?.nombre ?? 'Proveedor';

  const pagosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return pagos
      .filter((p) => {
        if (filtroEstado && p.estado !== filtroEstado) return false;
        if (q) {
          const numero = `pag-${String(p.numero).padStart(5, '0')}`;
          if (!nombreProveedor(p.proveedorId).toLowerCase().includes(q) && !numero.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.numero - a.numero);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagos, busqueda, filtroEstado, proveedores]);

  const proveedorNuevaOrden = proveedores.find((p) => p.id === proveedorNuevaOrdenId);
  const pagoAConfirmar = pagos.find((p) => p.id === confirmarPagoId);

  const comprobantesPendientes = (proveedorId: string) =>
    comprobantes.filter((c) => c.proveedorId === proveedorId && (c.estado === 'pendiente' || c.estado === 'pagado_parcial'));

  // ── Handlers ──────────────────────────────────────────────

  const handleSavePago = (data: {
    fecha: string;
    monto: number;
    medioPago: string;
    imputaciones: { comprobanteId: string; montoImputado: number }[];
    lineasPago: PagoCompra['lineasPago'];
  }) => {
    if (!proveedorNuevaOrdenId) return;
    const now = nowISO();
    dispatch({
      type: 'ADD_PAGO',
      payload: {
        id: generarId(),
        proveedorId: proveedorNuevaOrdenId,
        fecha: data.fecha,
        estado: 'pendiente',
        monto: data.monto,
        medioPago: data.medioPago as any,
        imputaciones: data.imputaciones,
        lineasPago: data.lineasPago,
        createdAt: now,
        updatedAt: now,
      },
    });
    setProveedorNuevaOrdenId('');
  };

  const handleConfirmarPago = (data: { fecha: string; lineasPago: PagoCompra['lineasPago'] }) => {
    if (!confirmarPagoId) return;
    dispatch({
      type: 'CONFIRMAR_PAGO',
      payload: { id: confirmarPagoId, fecha: data.fecha, lineasPago: data.lineasPago },
    });
    setConfirmarPagoId(null);
  };

  const handleAnular = (id: string) => {
    if (!confirm('¿Anular esta Orden de Pago? Todavía no se confirmó, así que no afectó ningún saldo ni cuenta.')) return;
    dispatch({ type: 'ANULAR_PAGO', payload: { id } });
  };

  const handleDescargarPdf = async (pago: PagoCompra) => {
    if (!empresaActual) return;
    setGenerandoPdfId(pago.id);
    try {
      const prov = proveedores.find((p) => p.id === pago.proveedorId);
      await descargarComprobantePagoPdf(empresaActual, prov, pago, comprobantes, 'Proveedor');
    } finally {
      setGenerandoPdfId(null);
    }
  };

  const estados: EstadoPagoCompra[] = ['pendiente', 'pagada', 'anulada'];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-[16rem]">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900"
              placeholder="Buscar por proveedor o numero..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <select
            className="rounded-lg border border-gray-300 py-2 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as EstadoPagoCompra | '')}
          >
            <option value="">Todos los estados</option>
            {estados.map((e) => (
              <option key={e} value={e}>{e === 'pendiente' ? 'Pendiente' : e === 'pagada' ? 'Pagada' : 'Anulada'}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-gray-300 py-2 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20"
            value={proveedorNuevaOrdenId}
            onChange={(e) => setProveedorNuevaOrdenId(e.target.value)}
          >
            <option value="">Elegir proveedor...</option>
            {proveedores.filter((p) => p.activo).map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
          <button
            onClick={() => setOrdenPagoDialogOpen(true)}
            disabled={!proveedorNuevaOrdenId}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            Nueva Orden de Pago
          </button>
        </div>
      </div>

      {/* Table */}
      {pagosFiltrados.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-10 w-10" />}
          title="No hay ordenes de pago"
          description="Elegí un proveedor y creá una Orden de Pago para empezar."
        />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium w-8" />
                <th className="px-4 py-3 font-medium whitespace-nowrap min-w-[7rem]">Numero</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap min-w-[11rem]">Proveedor</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap min-w-[7rem]">Fecha</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap min-w-[9rem]">Medio</th>
                <th className="px-4 py-3 text-right font-medium whitespace-nowrap min-w-[7rem]">Monto</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap min-w-[7rem]">Estado</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pagosFiltrados.map((pago) => {
                const isExpanded = expandedId === pago.id;
                return (
                  <Fragment key={pago.id}>
                    <tr
                      className="border-t border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : pago.id)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">PAG-{String(pago.numero).padStart(5, '0')}</td>
                      <td className="px-4 py-3 text-xs font-medium text-gray-900 whitespace-nowrap">{nombreProveedor(pago.proveedorId)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatDate(pago.fecha)}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><MedioPagoBadge medio={pago.medioPago} /></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap"><Amount value={pago.monto} size="xs" /></td>
                      <td className="px-4 py-3 whitespace-nowrap"><EstadoPagoBadge estado={pago.estado} /></td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {pago.estado === 'pendiente' && (
                            <>
                              <button onClick={() => setConfirmarPagoId(pago.id)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Confirmar pago">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => handleAnular(pago.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Anular">
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {pago.estado === 'pagada' && (
                            <button
                              onClick={() => handleDescargarPdf(pago)}
                              disabled={generandoPdfId === pago.id}
                              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                              title="Comprobante de Pago (PDF)"
                            >
                              {generandoPdfId === pago.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-gray-50/50 px-8 py-4">
                          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            <div>
                              <h4 className="font-semibold text-gray-900 text-sm mb-2">Imputado a</h4>
                              <div className="space-y-1">
                                {pago.imputaciones.map((imp) => {
                                  const c = comprobantes.find((x) => x.id === imp.comprobanteId);
                                  return (
                                    <div key={imp.comprobanteId} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm border border-gray-100">
                                      <span className="font-mono text-xs">{c ? `FC-${String(c.numero).padStart(5, '0')}` : 'Comprobante eliminado'}</span>
                                      <Amount value={imp.montoImputado} size="sm" />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-900 text-sm mb-2">Líneas de pago</h4>
                              <div className="space-y-1">
                                {pago.lineasPago.map((linea) => (
                                  <div key={linea.id} className="rounded-lg bg-white px-3 py-2 text-sm border border-gray-100">
                                    <div className="flex items-center justify-between">
                                      <MedioPagoBadge medio={linea.medioPago} />
                                      <Amount value={linea.monto} size="sm" />
                                    </div>
                                    {linea.medioPago === 'cheque' && (linea.chequeNumero || linea.chequeBanco) && (
                                      <p className="text-xs text-gray-500 mt-1">
                                        N.º {linea.chequeNumero || '—'} · {linea.chequeBanco || '—'}
                                        {linea.chequeFechaPago ? ` · vence ${formatDate(linea.chequeFechaPago)}` : ''}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          {pago.notas && <p className="text-sm text-gray-500 italic mt-3">Notas: {pago.notas}</p>}
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

      {proveedorNuevaOrden && (
        <OrdenPagoDialog
          open={ordenPagoDialogOpen}
          onOpenChange={setOrdenPagoDialogOpen}
          proveedor={proveedorNuevaOrden}
          comprobantesPendientes={comprobantesPendientes(proveedorNuevaOrden.id)}
          onSave={handleSavePago}
        />
      )}

      <ConfirmarPagoDialog
        open={confirmarPagoId !== null}
        onOpenChange={(v) => { if (!v) setConfirmarPagoId(null); }}
        pago={pagoAConfirmar}
        proveedorNombre={pagoAConfirmar ? nombreProveedor(pagoAConfirmar.proveedorId) : undefined}
        cuentas={cuentas}
        onConfirm={handleConfirmarPago}
      />
    </div>
  );
}
