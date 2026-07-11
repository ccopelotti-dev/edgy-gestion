// ============================================================
// Modulo Ventas — Comprobantes
// Edgy Gestion · Listado, detalle y gestion de comprobantes
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  FileText,
  Link2,
  XCircle,
  DollarSign,
  Receipt,
  BadgeCheck,
  Ban,
  Download,
  Loader2,
} from 'lucide-react';

import { useClienteActual } from '@/hooks/useClienteActual';
import {
  generarComprobantePdf,
  type EmpresaParaPdf,
} from '@/lib/comprobantes-pdf/generarComprobantePdf';
import {
  useComprobantes,
  useClientes,
  useVentas,
  useVentasDispatch,
  useCobros,
} from '../data/store';
import {
  KpiCard,
  EstadoComprobanteBadge,
  MedioPagoBadge,
  Amount,
  EmptyState,
} from '../components/ventas/display';
import { ComprobanteDialog, CobroDialog } from '../components/ventas/dialogs';
import {
  formatDate,
  formatARS,
  formatNumero,
  formatPct,
  nowISO,
  PREFIJO_COMPROBANTE,
  PREFIJO_ORDEN,
} from '../lib/format';
import type {
  Comprobante,
  ComprobanteItem,
  TipoComprobante,
  EstadoComprobante,
  ModoEmision,
  MedioPago,
  ImputacionCobro,
  Cliente,
  Cobro,
} from '../types';
import {
  TIPO_COMPROBANTE_LABEL,
  ESTADO_COMPROBANTE_LABEL,
  CONSUMIDOR_FINAL_ID,
  labelTipoComprobante,
  generarId,
} from '../types';

// ─── Modo emision labels ────────────────────────────────────

const MODO_EMISION_LABEL: Record<ModoEmision, string> = {
  interno: 'Interno',
  electronica: 'AFIP',
};

// ─── Componente principal ───────────────────────────────────

export default function Comprobantes() {
  const todosComprobantes = useComprobantes();
  const clientes = useClientes();
  const { ordenes, config, cobros: todosCobros } = useVentas();
  const dispatch = useVentasDispatch();

  // ── Filtros ───────────────────────────────────────────────

  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<TipoComprobante | ''>('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoComprobante | ''>('');
  const [filtroModo, setFiltroModo] = useState<ModoEmision | ''>('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // ── Estado de UI ──────────────────────────────────────────

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comprobanteDialogOpen, setComprobanteDialogOpen] = useState(false);
  const [cobroDialogOpen, setCobroDialogOpen] = useState(false);
  const [cobroClienteId, setCobroClienteId] = useState<string | null>(null);
  // Fase 10: motor de PDF -- id del comprobante que se está generando
  // en este momento (deshabilita su botón mientras descarga el logo).
  const [generandoPdfId, setGenerandoPdfId] = useState<string | null>(null);
  const { cliente: empresaActual } = useClienteActual();

  // ── Helpers ───────────────────────────────────────────────

  const clienteNombre = useCallback(
    (clienteId: string) => {
      const c = clientes.find((cl) => cl.id === clienteId);
      return c?.nombre ?? 'Desconocido';
    },
    [clientes],
  );

  const clienteById = useCallback(
    (clienteId: string): Cliente | undefined => {
      return clientes.find((cl) => cl.id === clienteId);
    },
    [clientes],
  );

  const ordenNumeroStr = useCallback(
    (ordenId: string) => {
      const o = ordenes.find((or) => or.id === ordenId);
      if (!o) return '—';
      return formatNumero(PREFIJO_ORDEN[o.tipo], o.numero);
    },
    [ordenes],
  );

  // ── KPIs ──────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
      .toISOString()
      .slice(0, 10);

    const compMes = todosComprobantes.filter(
      (c) => c.tipo === 'factura' && c.estado !== 'anulado' && c.fecha >= inicioMes,
    );

    const totalFacturado = compMes.reduce((s, c) => s + c.total, 0);

    const pendienteCobro = todosComprobantes
      .filter((c) => c.estado === 'emitido' || c.estado === 'cobrado_parcial')
      .reduce((s, c) => s + c.saldoPendiente, 0);

    const emitidosMes = todosComprobantes.filter(
      (c) => c.estado !== 'anulado' && c.fecha >= inicioMes,
    ).length;

    return { totalFacturado, pendienteCobro, emitidosMes };
  }, [todosComprobantes]);

  // ── Datos filtrados ───────────────────────────────────────

  const comprobantesFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();

    return todosComprobantes.filter((c) => {
      if (filtroTipo && c.tipo !== filtroTipo) return false;
      if (filtroEstado && c.estado !== filtroEstado) return false;
      if (filtroModo && c.modoEmision !== filtroModo) return false;
      if (fechaDesde && c.fecha < fechaDesde) return false;
      if (fechaHasta && c.fecha > fechaHasta) return false;
      if (q) {
        const nombre = clienteNombre(c.clienteId).toLowerCase();
        const numStr = formatNumero(PREFIJO_COMPROBANTE[c.tipo], c.numero).toLowerCase();
        if (!nombre.includes(q) && !numStr.includes(q)) return false;
      }
      return true;
    });
  }, [todosComprobantes, busqueda, filtroTipo, filtroEstado, filtroModo, fechaDesde, fechaHasta, clienteNombre]);

  // ── Handlers ──────────────────────────────────────────────

  const handleNuevoComprobante = () => {
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
  };

  const handleAnular = (id: string) => {
    if (!confirm('Esta seguro de anular este comprobante? Esta accion no se puede deshacer.')) return;
    dispatch({ type: 'ANULAR_COMPROBANTE', payload: { id } });
  };

  // Fase 10: descarga el comprobante como PDF usando el motor
  // compartido (src/lib/comprobantes-pdf) -- toma el logo y el color
  // de marca del cliente (empresa) actual, cargados en Configuración >
  // Empresa. Disponible para cualquier comprobante, esté o no anulado
  // (sirve como respaldo aunque ya no tenga efecto comercial).
  const handleDescargarPdf = async (comp: Comprobante) => {
    if (!empresaActual) return;
    setGenerandoPdfId(comp.id);
    try {
      const cliente = clienteById(comp.clienteId);
      const empresaPdf: EmpresaParaPdf = {
        nombre: empresaActual.nombre,
        cuit: empresaActual.cuit,
        direccion: empresaActual.direccion,
        telefono: empresaActual.telefono,
        logoUrl: empresaActual.logo_url,
        colorMarca: empresaActual.color_marca,
      };
      await generarComprobantePdf(
        empresaPdf,
        {
          tipoLabel: labelTipoComprobante(comp.tipo, comp.modoEmision),
          numero: formatNumero(PREFIJO_COMPROBANTE[comp.tipo], comp.numero),
          fecha: formatDate(comp.fecha),
          clienteNombre: cliente?.nombre ?? clienteNombre(comp.clienteId),
          // "Consumidor Final" usa '0' como documento placeholder (ver
          // clienteConsumidorFinal en ../types) -- no tiene sentido
          // mostrarlo en el PDF, así que se omite específicamente para
          // ese cliente en vez de asumir que cualquier '0' es inválido.
          clienteDocumento:
            cliente && cliente.id !== CONSUMIDOR_FINAL_ID ? cliente.documento : null,
          items: comp.items.map((i) => ({
            descripcion: i.descripcion,
            cantidad: i.cantidad,
            precioUnitario: i.precioUnitario,
            subtotal: i.subtotal,
          })),
          subtotal: comp.subtotal,
          descuentoGeneral: comp.descuentoGeneral,
          montoIva: comp.montoIva,
          total: comp.total,
        },
        formatNumero(PREFIJO_COMPROBANTE[comp.tipo], comp.numero),
      );
    } finally {
      setGenerandoPdfId(null);
    }
  };

  const handleRegistrarCobro = (clienteId: string) => {
    setCobroClienteId(clienteId);
    setCobroDialogOpen(true);
  };

  const handleSaveCobro = (data: {
    fecha: string;
    monto: number;
    medioPago: MedioPago;
    imputaciones: ImputacionCobro[];
  }) => {
    if (!cobroClienteId) return;

    dispatch({
      type: 'ADD_COBRO',
      payload: {
        id: generarId(),
        clienteId: cobroClienteId,
        fecha: data.fecha,
        monto: data.monto,
        medioPago: data.medioPago,
        imputaciones: data.imputaciones,
        createdAt: nowISO(),
      },
    });

    setCobroDialogOpen(false);
    setCobroClienteId(null);
  };

  // ── Render ────────────────────────────────────────────────

  const cobroCliente = cobroClienteId ? clienteById(cobroClienteId) : undefined;
  const comprobantesDelCliente = cobroClienteId
    ? todosComprobantes.filter(
        (c) =>
          c.clienteId === cobroClienteId &&
          (c.estado === 'emitido' || c.estado === 'cobrado_parcial'),
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Comprobantes</h1>
        <button
          onClick={handleNuevoComprobante}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo comprobante
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title="Total facturado (mes)"
          value={formatARS(kpis.totalFacturado)}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KpiCard
          title="Pendiente de cobro"
          value={formatARS(kpis.pendienteCobro)}
          icon={<Receipt className="h-4 w-4" />}
        />
        <KpiCard
          title="Comprobantes emitidos (mes)"
          value={kpis.emitidosMes}
          icon={<FileText className="h-4 w-4" />}
        />
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente o numero..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as TipoComprobante | '')}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Todos los tipos</option>
          {(Object.keys(TIPO_COMPROBANTE_LABEL) as TipoComprobante[]).map((t) => (
            <option key={t} value={t}>
              {TIPO_COMPROBANTE_LABEL[t]}
            </option>
          ))}
        </select>

        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as EstadoComprobante | '')}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADO_COMPROBANTE_LABEL) as EstadoComprobante[]).map((est) => (
            <option key={est} value={est}>
              {ESTADO_COMPROBANTE_LABEL[est]}
            </option>
          ))}
        </select>

        <select
          value={filtroModo}
          onChange={(e) => setFiltroModo(e.target.value as ModoEmision | '')}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Toda emision</option>
          {(Object.keys(MODO_EMISION_LABEL) as ModoEmision[]).map((m) => (
            <option key={m} value={m}>
              {MODO_EMISION_LABEL[m]}
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

      {/* Tabla de comprobantes */}
      {comprobantesFiltrados.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="No se encontraron comprobantes"
          description="No hay comprobantes con los filtros seleccionados"
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
                <th className="px-4 py-3 text-right font-medium">Subtotal</th>
                <th className="px-4 py-3 text-right font-medium">IVA</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Pago</th>
                <th className="px-4 py-3 font-medium">Emision</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {comprobantesFiltrados.map((comp) => {
                const isExpanded = expandedId === comp.id;
                const cobrosComp = todosCobros.filter((co) =>
                  co.imputaciones.some((imp) => imp.comprobanteId === comp.id),
                );

                return (
                  <ComprobanteRow
                    key={comp.id}
                    comprobante={comp}
                    isExpanded={isExpanded}
                    clienteNombre={clienteNombre(comp.clienteId)}
                    ordenNumero={comp.ordenId ? ordenNumeroStr(comp.ordenId) : null}
                    cobros={cobrosComp}
                    onToggleExpand={() => setExpandedId(isExpanded ? null : comp.id)}
                    onAnular={() => handleAnular(comp.id)}
                    onRegistrarCobro={() => handleRegistrarCobro(comp.clienteId)}
                    onDescargarPdf={() => handleDescargarPdf(comp)}
                    generandoPdf={generandoPdfId === comp.id}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Comprobante dialog */}
      {comprobanteDialogOpen && (
        <ComprobanteDialog
          open={comprobanteDialogOpen}
          onOpenChange={setComprobanteDialogOpen}
          clientes={clientes}
          onSave={handleSaveComprobante}
          modoEmisionDefault={config.modoEmisionDefault}
        />
      )}

      {/* Cobro dialog */}
      {cobroDialogOpen && cobroCliente && (
        <CobroDialog
          open={cobroDialogOpen}
          onOpenChange={(open) => {
            setCobroDialogOpen(open);
            if (!open) setCobroClienteId(null);
          }}
          cliente={cobroCliente}
          comprobantesCliente={comprobantesDelCliente}
          onSave={handleSaveCobro}
        />
      )}
    </div>
  );
}

// ─── Fila de comprobante con panel expandible ───────────────

interface ComprobanteRowProps {
  comprobante: Comprobante;
  isExpanded: boolean;
  clienteNombre: string;
  ordenNumero: string | null;
  cobros: Cobro[];
  onToggleExpand: () => void;
  onAnular: () => void;
  onRegistrarCobro: () => void;
  onDescargarPdf: () => void;
  generandoPdf: boolean;
}

function ComprobanteRow({
  comprobante,
  isExpanded,
  clienteNombre,
  ordenNumero,
  cobros,
  onToggleExpand,
  onAnular,
  onRegistrarCobro,
  onDescargarPdf,
  generandoPdf,
}: ComprobanteRowProps) {
  const c = comprobante;
  const prefijo = PREFIJO_COMPROBANTE[c.tipo];

  return (
    <>
      {/* Fila principal */}
      <tr
        onClick={onToggleExpand}
        className="cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50 last:border-0"
      >
        <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">
          {formatNumero(prefijo, c.numero)}
        </td>
        <td className="px-4 py-3 text-gray-700">
          {labelTipoComprobante(c.tipo, c.modoEmision)}
        </td>
        <td className="px-4 py-3 text-gray-900">{clienteNombre}</td>
        <td className="px-4 py-3 text-gray-600">{formatDate(c.fecha)}</td>
        <td className="px-4 py-3 text-right">
          <Amount value={c.subtotal} size="sm" />
        </td>
        <td className="px-4 py-3 text-right text-gray-600 tabular-nums text-sm">
          {formatARS(c.montoIva)}
        </td>
        <td className="px-4 py-3 text-right">
          <Amount value={c.total} size="sm" />
        </td>
        <td className="px-4 py-3 text-right">
          <span
            className={`tabular-nums text-sm font-medium ${
              c.saldoPendiente > 0 ? 'text-red-600' : 'text-green-700'
            }`}
          >
            {formatARS(c.saldoPendiente)}
          </span>
        </td>
        <td className="px-4 py-3">
          <EstadoComprobanteBadge estado={c.estado} />
        </td>
        <td className="px-4 py-3">
          <MedioPagoBadge medio={c.medioPago} />
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${
              c.modoEmision === 'electronica'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {c.modoEmision === 'electronica' ? 'AFIP' : 'INT'}
          </span>
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
          <td colSpan={12} className="bg-gray-50 px-4 py-5">
            <div className="space-y-5">
              {/* Tabla de items */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <FileText className="h-4 w-4 text-indigo-600" />
                    Detalle de items
                  </h3>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDescargarPdf();
                    }}
                    disabled={generandoPdf}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {generandoPdf ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Descargar PDF
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-gray-500">
                        <th className="px-3 py-2 font-medium">Descripcion</th>
                        <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                        <th className="px-3 py-2 text-right font-medium">Precio Unit.</th>
                        <th className="px-3 py-2 text-right font-medium">Dto.</th>
                        <th className="px-3 py-2 text-right font-medium">IVA</th>
                        <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                        <th className="px-3 py-2 text-right font-medium">Monto IVA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.items.map((item) => (
                        <tr key={item.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 text-gray-900">{item.descripcion}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{item.cantidad}</td>
                          <td className="px-3 py-2 text-right">
                            <Amount value={item.precioUnitario} size="sm" />
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {item.descuento > 0 ? formatPct(item.descuento) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {formatPct(item.alicuotaIva)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Amount value={item.subtotal} size="sm" />
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600 tabular-nums">
                            {formatARS(item.montoIva)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-100">
                        <td colSpan={5} className="px-3 py-2 text-right text-sm text-gray-500">
                          Subtotal neto
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">
                          {formatARS(c.subtotal)}
                        </td>
                        <td />
                      </tr>
                      <tr>
                        <td colSpan={5} className="px-3 py-1 text-right text-sm text-gray-500">
                          IVA total
                        </td>
                        <td />
                        <td className="px-3 py-1 text-right text-sm font-medium text-gray-900">
                          {formatARS(c.montoIva)}
                        </td>
                      </tr>
                      {c.descuentoGeneral > 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-1 text-right text-sm text-gray-500">
                            Descuento general ({formatPct(c.descuentoGeneral)})
                          </td>
                          <td colSpan={2} className="px-3 py-1 text-right text-sm text-red-600">
                            -{formatARS((c.subtotal + c.montoIva) * (c.descuentoGeneral / 100))}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-gray-200">
                        <td colSpan={5} className="px-3 py-2 text-right font-bold text-gray-900">
                          TOTAL
                        </td>
                        <td colSpan={2} className="px-3 py-2 text-right font-bold text-gray-900 text-base">
                          {formatARS(c.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Datos AFIP */}
              {c.afip && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-900">
                    <BadgeCheck className="h-4 w-4" />
                    Datos AFIP
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <span className="text-xs text-blue-600">CAE</span>
                      <p className="font-mono font-medium text-blue-900">
                        {c.afip.cae ?? '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-blue-600">Vencimiento CAE</span>
                      <p className="font-medium text-blue-900">
                        {c.afip.vencimientoCae ? formatDate(c.afip.vencimientoCae) : '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-blue-600">Punto de venta</span>
                      <p className="font-medium text-blue-900">
                        {c.afip.puntoVenta?.toString().padStart(5, '0') ?? '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-blue-600">Resultado</span>
                      <p
                        className={`font-medium ${
                          c.afip.resultado === 'A' ? 'text-green-700' : 'text-red-700'
                        }`}
                      >
                        {c.afip.resultado === 'A' ? 'Aprobado' : c.afip.resultado === 'R' ? 'Rechazado' : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Orden vinculada */}
              {c.ordenId && ordenNumero && (
                <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800">
                  <Link2 className="h-4 w-4" />
                  Orden vinculada: <span className="font-mono font-medium">{ordenNumero}</span>
                </div>
              )}

              {/* Cobros */}
              {cobros.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <DollarSign className="h-3.5 w-3.5" />
                    Cobros registrados
                  </h4>
                  <div className="space-y-1">
                    {cobros.map((cobro) => {
                      const impComp = cobro.imputaciones.find(
                        (imp) => imp.comprobanteId === c.id,
                      );
                      return (
                        <div
                          key={cobro.id}
                          className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm"
                        >
                          <span className="text-gray-600">{formatDate(cobro.fecha)}</span>
                          <span className="font-medium text-gray-900">
                            {formatARS(impComp?.montoImputado ?? cobro.monto)}
                          </span>
                          <MedioPagoBadge medio={cobro.medioPago} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Acciones segun estado */}
              {(c.estado === 'emitido' || c.estado === 'cobrado_parcial') && (
                <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRegistrarCobro();
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors"
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    Registrar cobro
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAnular();
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Anular
                  </button>
                </div>
              )}

              {c.estado === 'cobrado' && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-800">
                  <BadgeCheck className="h-4 w-4" />
                  Cobrado
                </div>
              )}

              {c.estado === 'anulado' && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
                  <Ban className="h-4 w-4" />
                  Anulado
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
