// ============================================================
// Modulo Home Keep — Comprobantes
// Edgy Gestion · Gestion de comprobantes de gasto
// Clon recortado de compras/pages/Comprobantes.tsx: sin vínculo a Orden
// de Compra, sin columna/ícono de "Actualizar stock" (Home Keep no
// maneja catálogo ni stock).
// ============================================================

import { Fragment, useState, useMemo, useEffect } from 'react';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  DollarSign,
  XCircle,
  Receipt,
  Download,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';

import { useClienteActual } from '@/hooks/useClienteActual';
import {
  obtenerImagenesComprobantesAgente,
  abrirImagenComprobanteAgente,
} from '@/lib/imagenComprobanteAgente';
import { descargarComprobantePdf } from '../lib/pdfComprobantes';
import {
  useComprobantes,
  useProveedores,
  usePagos,
  useHomeKeepDispatch,
} from '../data/store';
import {
  KpiCard,
  EstadoComprobanteBadge,
  MedioPagoBadge,
  Amount,
  EmptyState,
} from '../components/display';
import { ComprobanteDialog, PagoDialog } from '../components/dialogs';
import {
  formatARS,
  formatDate,
  formatNumeroComprobante,
  nowISO,
} from '../lib/format';
import type {
  TipoComprobante,
  EstadoComprobante,
  ItemComprobante,
  Pago,
} from '../types';
import {
  TIPO_COMPROBANTE_LABEL,
  ESTADO_COMPROBANTE_LABEL,
  generarId,
} from '../types';

// ─── Componente principal ───────────────────────────────────

export default function Comprobantes() {
  const comprobantes = useComprobantes();
  const proveedores = useProveedores();
  const pagos = usePagos();
  const dispatch = useHomeKeepDispatch();

  // ── Filtros ───────────────────────────────────────────────

  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<TipoComprobante | ''>('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoComprobante | ''>('');

  // ── Estado de UI ──────────────────────────────────────────

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comprobanteDialogOpen, setComprobanteDialogOpen] = useState(false);
  const [pagoDialogOpen, setPagoDialogOpen] = useState(false);
  const [pagoComprobanteId, setPagoComprobanteId] = useState<string | null>(null);
  const { cliente: empresaActual } = useClienteActual();
  const [generandoPdfId, setGenerandoPdfId] = useState<string | null>(null);
  // Fase 57 -- comprobante.id -> path en el bucket "comprobantes-gastos"
  // de la foto original de WhatsApp, para los comprobantes cargados vía
  // el agente. Se trae una sola vez por carga de página, no por fila.
  const [imagenesAgente, setImagenesAgente] = useState<Map<string, string>>(new Map());
  const [abriendoImagenId, setAbriendoImagenId] = useState<string | null>(null);

  useEffect(() => {
    if (!empresaActual) return;
    obtenerImagenesComprobantesAgente(empresaActual.id, 'comprobante_hogar_id').then(setImagenesAgente);
  }, [empresaActual]);

  const handleVerImagen = async (comprobanteId: string) => {
    const path = imagenesAgente.get(comprobanteId);
    if (!path) return;
    setAbriendoImagenId(comprobanteId);
    try {
      await abrirImagenComprobanteAgente(path);
    } finally {
      setAbriendoImagenId(null);
    }
  };

  // ── KPIs ─────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

    const comprobantesMes = comprobantes.filter(
      (c) => c.estado !== 'anulado' && new Date(c.fecha) >= inicioMes,
    );

    const totalMes = comprobantesMes
      .filter((c) => c.tipo === 'factura')
      .reduce((s, c) => s + c.total, 0);

    const pendientePago = comprobantes
      .filter((c) => c.estado === 'pendiente' || c.estado === 'pagado_parcial')
      .reduce((s, c) => s + c.saldoPendiente, 0);

    return { totalMes, pendientePago, cantidadMes: comprobantesMes.length };
  }, [comprobantes]);

  // ── Datos filtrados ───────────────────────────────────────

  const comprobantesFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return comprobantes.filter((c) => {
      if (filtroTipo && c.tipo !== filtroTipo) return false;
      if (filtroEstado && c.estado !== filtroEstado) return false;
      if (q) {
        const prov = proveedores.find((p) => p.id === c.proveedorId);
        const matchProv = prov?.nombre.toLowerCase().includes(q);
        const matchNum = String(c.numero).includes(q);
        const matchNumProveedor = c.numeroComprobanteProveedor?.toLowerCase().includes(q);
        if (!matchProv && !matchNum && !matchNumProveedor) return false;
      }
      return true;
    });
  }, [comprobantes, busqueda, filtroTipo, filtroEstado, proveedores]);

  // ── Helpers ───────────────────────────────────────────────

  const nombreProveedor = (proveedorId: string) =>
    proveedores.find((p) => p.id === proveedorId)?.nombre ?? 'Desconocido';

  const pagosDeComprobante = (comprobanteId: string) =>
    pagos.filter((p) => p.imputaciones.some((imp) => imp.comprobanteId === comprobanteId));

  // ── Handlers ──────────────────────────────────────────────

  const handleSaveComprobante = (data: {
    tipo: TipoComprobante;
    proveedorId: string;
    numeroComprobanteProveedor: string;
    fecha: string;
    fechaVencimiento: string;
    medioPago: any;
    items: Omit<ItemComprobante, 'id'>[];
  }) => {
    const now = nowISO();
    const subtotal = data.items.reduce((s, i) => s + i.subtotal, 0);
    const montoIva = data.items.reduce((s, i) => s + i.montoIva, 0);
    const total = subtotal + montoIva;
    const comprobanteId = generarId();
    const itemsConId: ItemComprobante[] = data.items.map((it) => ({ ...it, id: generarId() }));

    dispatch({
      type: 'ADD_COMPROBANTE',
      payload: {
        id: comprobanteId,
        tipo: data.tipo,
        proveedorId: data.proveedorId,
        fecha: data.fecha,
        fechaVencimiento: data.fechaVencimiento || undefined,
        items: itemsConId,
        subtotal,
        montoIva,
        total,
        estado: 'pendiente',
        medioPago: data.medioPago,
        montoPagado: 0,
        saldoPendiente: total,
        numeroComprobanteProveedor: data.numeroComprobanteProveedor || undefined,
        createdAt: now,
        updatedAt: now,
      },
    });
  };

  const handleAnular = (id: string) => {
    dispatch({ type: 'ANULAR_COMPROBANTE', payload: { id } });
  };

  const handleDescargarPdf = async (comp: (typeof comprobantes)[number]) => {
    if (!empresaActual) return;
    setGenerandoPdfId(comp.id);
    try {
      const proveedor = proveedores.find((p) => p.id === comp.proveedorId);
      await descargarComprobantePdf(empresaActual, proveedor, comp, nombreProveedor(comp.proveedorId));
    } finally {
      setGenerandoPdfId(null);
    }
  };

  const handleRegistrarPago = (comprobanteId: string) => {
    setPagoComprobanteId(comprobanteId);
    setPagoDialogOpen(true);
  };

  const handleSavePago = (data: {
    fecha: string;
    monto: number;
    medioPago: string;
    imputaciones: { comprobanteId: string; montoImputado: number }[];
    lineasPago: Pago['lineasPago'];
  }) => {
    const comp = pagoComprobanteId ? comprobantes.find((c) => c.id === pagoComprobanteId) : null;
    if (!comp) return;
    const now = nowISO();
    dispatch({
      type: 'ADD_PAGO',
      payload: {
        id: generarId(),
        proveedorId: comp.proveedorId,
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
  };

  const pagoComprobante = pagoComprobanteId
    ? comprobantes.find((c) => c.id === pagoComprobanteId)
    : null;
  const pagoProveedor = pagoComprobante
    ? proveedores.find((p) => p.id === pagoComprobante.proveedorId)
    : undefined;

  // ── Render ────────────────────────────────────────────────

  const tipos: TipoComprobante[] = ['factura', 'nota_credito', 'nota_debito'];
  const estados: EstadoComprobante[] = ['pendiente', 'pagado_parcial', 'pagado', 'anulado'];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title="Total gastos del mes"
          value={formatARS(kpis.totalMes)}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KpiCard
          title="Pendiente de pago"
          value={formatARS(kpis.pendientePago)}
          icon={<Receipt className="h-5 w-5" />}
        />
        <KpiCard
          title="Comprobantes del mes"
          value={String(kpis.cantidadMes)}
          icon={<Receipt className="h-5 w-5" />}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
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
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as TipoComprobante | '')}
          >
            <option value="">Todos los tipos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>{TIPO_COMPROBANTE_LABEL[t]}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-gray-300 py-2 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as EstadoComprobante | '')}
          >
            <option value="">Todos los estados</option>
            {estados.map((e) => (
              <option key={e} value={e}>{ESTADO_COMPROBANTE_LABEL[e]}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setComprobanteDialogOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo comprobante
        </button>
      </div>

      {/* Table */}
      {comprobantesFiltrados.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-10 w-10" />}
          title="No hay comprobantes"
          description="Registre un comprobante de gasto para comenzar."
        />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto scroll-shadow-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-2 py-3 font-medium w-8" />
                <th className="px-3 py-3 font-medium">Numero</th>
                <th className="px-3 py-3 font-medium">Tipo</th>
                <th className="px-3 py-3 font-medium max-w-[140px]">Proveedor</th>
                <th className="px-3 py-3 font-medium">Fecha</th>
                <th className="px-3 py-3 text-right font-medium min-w-[6rem]">Subtotal</th>
                <th className="px-3 py-3 text-right font-medium min-w-[6rem]">IVA</th>
                <th className="px-3 py-3 text-right font-medium min-w-[6rem]">Total</th>
                <th className="px-3 py-3 text-right font-medium min-w-[6rem]">Pendiente</th>
                <th className="px-2 py-3 font-medium w-[96px]">Estado</th>
                <th className="px-2 py-3 font-medium w-[110px]">Pago</th>
                <th className="px-2 py-3 w-9" />
                <th className="px-2 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {comprobantesFiltrados.map((comp) => {
                const isExpanded = expandedId === comp.id;
                const compPagos = pagosDeComprobante(comp.id);

                return (
                  <Fragment key={comp.id}>
                    <tr
                      className="border-t border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : comp.id)}
                    >
                      <td className="px-2 py-3 text-gray-400">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs whitespace-nowrap" title={comp.numeroComprobanteProveedor ? 'Nro. de comprobante del proveedor' : 'Sin nro. del proveedor cargado -- se muestra el correlativo interno'}>
                        {formatNumeroComprobante(comp.tipo, comp.numero, comp.numeroComprobanteProveedor)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {TIPO_COMPROBANTE_LABEL[comp.tipo]}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-900 max-w-[140px] truncate" title={nombreProveedor(comp.proveedorId)}>{nombreProveedor(comp.proveedorId)}</td>
                      <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">{formatDate(comp.fecha)}</td>
                      <td className="px-3 py-3 text-right"><Amount value={comp.subtotal} size="xs" /></td>
                      <td className="px-3 py-3 text-right"><Amount value={comp.montoIva} size="xs" /></td>
                      <td className="px-3 py-3 text-right"><Amount value={comp.total} size="xs" /></td>
                      <td className="px-3 py-3 text-right"><Amount value={comp.saldoPendiente} size="xs" /></td>
                      <td className="px-2 py-3 w-[96px]"><EstadoComprobanteBadge estado={comp.estado} /></td>
                      <td className="px-2 py-3 w-[110px]"><MedioPagoBadge medio={comp.medioPago} /></td>
                      <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {imagenesAgente.has(comp.id) && (
                            <button
                              onClick={() => handleVerImagen(comp.id)}
                              disabled={abriendoImagenId === comp.id}
                              title="Ver foto original (WhatsApp)"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                            >
                              {abriendoImagenId === comp.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <ImageIcon className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => handleDescargarPdf(comp)}
                            disabled={generandoPdfId === comp.id}
                            title="Descargar PDF"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                          >
                            {generandoPdfId === comp.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {(comp.estado === 'pendiente' || comp.estado === 'pagado_parcial') && (
                            <>
                              <button onClick={() => handleRegistrarPago(comp.id)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Registrar pago">
                                <DollarSign className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => handleAnular(comp.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Anular">
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={13} className="bg-gray-50/50 px-8 py-4">
                          {/* Items with IVA */}
                          <h4 className="font-semibold text-gray-900 text-sm mb-2">Items</h4>
                          <div className="border border-gray-200 rounded-lg overflow-x-auto scroll-shadow-x mb-3">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 text-gray-600">
                                  <th className="text-left px-3 py-2 font-medium">Descripcion</th>
                                  <th className="text-right px-3 py-2 font-medium">Cant.</th>
                                  <th className="text-left px-3 py-2 font-medium">UM</th>
                                  <th className="text-right px-3 py-2 font-medium">Precio</th>
                                  <th className="text-right px-3 py-2 font-medium">Dto.%</th>
                                  <th className="text-right px-3 py-2 font-medium">IVA</th>
                                  <th className="text-right px-3 py-2 font-medium">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {comp.items.map((item) => (
                                  <tr key={item.id} className="border-t border-gray-100">
                                    <td className="px-3 py-2">{item.descripcion}</td>
                                    <td className="px-3 py-2 text-right">{item.cantidad}</td>
                                    <td className="px-3 py-2 text-gray-500">{item.unidad ?? '—'}</td>
                                    <td className="px-3 py-2 text-right">{formatARS(item.precioUnitario)}</td>
                                    <td className="px-3 py-2 text-right">{item.descuento}%</td>
                                    <td className="px-3 py-2 text-right">{item.alicuotaIva}%</td>
                                    <td className="px-3 py-2 text-right font-medium">{formatARS(item.subtotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Pagos */}
                          {compPagos.length > 0 && (
                            <div className="mb-2">
                              <h4 className="font-semibold text-gray-900 text-sm mb-1">Pagos registrados</h4>
                              <div className="space-y-1">
                                {compPagos.map((p) => (
                                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm border border-gray-100">
                                    <span className="font-mono text-xs">PAG-{String(p.numero).padStart(5, '0')}</span>
                                    <span className="text-gray-500">{formatDate(p.fecha)}</span>
                                    <MedioPagoBadge medio={p.medioPago} />
                                    <Amount value={p.monto} size="sm" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {comp.notas && (
                            <p className="text-sm text-gray-500 italic">Notas: {comp.notas}</p>
                          )}
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

      {/* Dialogs */}
      <ComprobanteDialog
        open={comprobanteDialogOpen}
        onOpenChange={setComprobanteDialogOpen}
        proveedores={proveedores.filter((p) => p.activo)}
        onSave={handleSaveComprobante}
      />

      {pagoProveedor && pagoComprobante && (
        <PagoDialog
          open={pagoDialogOpen}
          onOpenChange={setPagoDialogOpen}
          proveedor={pagoProveedor}
          comprobantesPendientes={comprobantes.filter(
            (c) => c.proveedorId === pagoProveedor.id && (c.estado === 'pendiente' || c.estado === 'pagado_parcial'),
          )}
          onSave={handleSavePago}
        />
      )}
    </div>
  );
}
