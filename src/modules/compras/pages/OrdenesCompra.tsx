// ============================================================
// Modulo Compras — Ordenes de Compra
// Edgy Gestion · Gestion de ordenes de compra
// ============================================================

import { Fragment, useState, useMemo } from 'react';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  PackageCheck,
  Package,
  XCircle,
  FileText,
  ClipboardList,
  Download,
  Loader2,
  Tag,
} from 'lucide-react';

import { useClienteActual } from '@/hooks/useClienteActual';
import { descargarOrdenCompraPdf } from '../lib/pdfComprobantes';
import {
  useOrdenesCompra,
  useProveedores,
  useCotizaciones,
  useComprobantesCompra,
  useCompras,
  useComprasDispatch,
} from '../data/store';
import {
  EstadoOCBadge,
  Amount,
  EmptyState,
} from '../components/compras/display';
import { ComprobanteCompraDialog, OrdenCompraPreciosDialog } from '../components/compras/dialogs';
import { actualizarStockPorCompra } from '../lib/actualizarStockCompra';
import {
  formatDate,
  formatARS,
  formatNumero,
  todayISO,
  nowISO,
  PREFIJO_COMPROBANTE_COMPRA,
} from '../lib/format';
import type { EstadoOrdenCompra, TipoComprobanteCompra, ItemComprobanteCompra, ControlRemision, ItemCompra, ImpuestoOrdenCompra } from '../types';
import {
  ESTADO_OC_LABEL,
  generarId,
  calcularSubtotalItem,
} from '../types';

// ─── Componente principal ───────────────────────────────────

export default function OrdenesCompra() {
  const ordenesCompra = useOrdenesCompra();
  const proveedores = useProveedores();
  const cotizaciones = useCotizaciones();
  const comprobantes = useComprobantesCompra();
  const comprasState = useCompras();
  const dispatch = useComprasDispatch();

  // ── Filtros ───────────────────────────────────────────────

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoOrdenCompra | ''>('');

  // ── Estado de UI ──────────────────────────────────────────

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [comprobanteDialogOpen, setComprobanteDialogOpen] = useState(false);
  // Fase 17: ícono de descarga de PDF -- mismo motor compartido de Ventas.
  const { cliente: empresaActual } = useClienteActual();
  const [generandoPdfId, setGenerandoPdfId] = useState<string | null>(null);
  // Fase 21 (punto 3 de Cotizaciones): una vez generada la OC desde una
  // cotización respondida, acá se cargan los precios cotizados y se
  // confirman -- ver OrdenCompraPreciosDialog.
  const [preciosOrdenId, setPreciosOrdenId] = useState<string | null>(null);

  // ── Inline form state ─────────────────────────────────────

  const [formProveedorId, setFormProveedorId] = useState('');
  const [formFecha, setFormFecha] = useState(todayISO());
  const [formFechaEntrega, setFormFechaEntrega] = useState('');
  const [formNotas, setFormNotas] = useState('');
  const [formItems, setFormItems] = useState([
    { key: generarId(), descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0 },
  ]);

  // ── Datos filtrados ───────────────────────────────────────

  const ordenesFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return ordenesCompra.filter((o) => {
      if (filtroEstado && o.estado !== filtroEstado) return false;
      if (q) {
        const prov = proveedores.find((p) => p.id === o.proveedorId);
        const matchProv = prov?.nombre.toLowerCase().includes(q);
        const matchNum = String(o.numero).includes(q);
        if (!matchProv && !matchNum) return false;
      }
      return true;
    });
  }, [ordenesCompra, busqueda, filtroEstado, proveedores]);

  // ── Helpers ───────────────────────────────────────────────

  const nombreProveedor = (proveedorId: string) =>
    proveedores.find((p) => p.id === proveedorId)?.nombre ?? 'Desconocido';

  const cotNumero = (cotizacionId?: string) => {
    if (!cotizacionId) return null;
    const cot = cotizaciones.find((c) => c.id === cotizacionId);
    return cot ? formatNumero('COT', cot.numero) : null;
  };

  const comprobantesDeOC = (ocId: string) =>
    comprobantes.filter((c) => c.ordenCompraId === ocId);

  // ── Inline form handlers ──────────────────────────────────

  const resetForm = () => {
    setFormProveedorId('');
    setFormFecha(todayISO());
    setFormFechaEntrega('');
    setFormNotas('');
    setFormItems([{ key: generarId(), descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0 }]);
    setShowForm(false);
  };

  const addFormItem = () => {
    setFormItems((prev) => [...prev, { key: generarId(), descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0 }]);
  };

  const updateFormItem = (index: number, field: string, value: string | number) => {
    setFormItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const removeFormItem = (index: number) => {
    if (formItems.length > 1) setFormItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitOC = () => {
    if (!formProveedorId || formItems.some((it) => !it.descripcion.trim())) return;

    const now = nowISO();
    const items = formItems.map((it) => ({
      id: generarId(),
      descripcion: it.descripcion.trim(),
      cantidad: it.cantidad,
      precioUnitario: it.precioUnitario,
      descuento: it.descuento,
      subtotal: calcularSubtotalItem(it.cantidad, it.precioUnitario, it.descuento),
    }));
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);

    dispatch({
      type: 'ADD_ORDEN_COMPRA',
      payload: {
        id: generarId(),
        proveedorId: formProveedorId,
        fecha: formFecha,
        fechaEntrega: formFechaEntrega || undefined,
        estado: 'pendiente',
        items,
        subtotal,
        total: subtotal,
        notas: formNotas || undefined,
        comprobanteIds: [],
        createdAt: now,
        updatedAt: now,
      },
    });
    resetForm();
  };

  // ── OC action handlers ────────────────────────────────────

  const cambiarEstado = (id: string, nuevoEstado: EstadoOrdenCompra) => {
    dispatch({ type: 'CAMBIAR_ESTADO_OC', payload: { id, nuevoEstado } });
  };

  const handleGuardarPrecios = (
    ordenId: string,
    data: { items: ItemCompra[]; montoIva: number; otrosImpuestos: ImpuestoOrdenCompra[] },
  ) => {
    const orden = ordenesCompra.find((o) => o.id === ordenId);
    if (!orden) return;
    const subtotal = data.items.reduce((s, i) => s + i.subtotal, 0);
    const totalOtrosImpuestos = data.otrosImpuestos.reduce((s, i) => s + i.monto, 0);
    dispatch({
      type: 'UPDATE_ORDEN_COMPRA',
      payload: {
        ...orden,
        items: data.items,
        subtotal,
        montoIva: data.montoIva,
        otrosImpuestos: data.otrosImpuestos,
        total: subtotal + data.montoIva + totalOtrosImpuestos,
        updatedAt: nowISO(),
      },
    });
  };

  const handleDescargarPdf = async (oc: (typeof ordenesCompra)[number]) => {
    if (!empresaActual) return;
    setGenerandoPdfId(oc.id);
    try {
      const proveedor = proveedores.find((p) => p.id === oc.proveedorId);
      await descargarOrdenCompraPdf(empresaActual, proveedor, oc, nombreProveedor(oc.proveedorId));
    } finally {
      setGenerandoPdfId(null);
    }
  };

  const handleSaveComprobante = async (data: {
    tipo: TipoComprobanteCompra;
    proveedorId: string;
    /** Nro. de comprobante fiscal del proveedor (ej. "0001-00000542"). */
    numeroComprobanteProveedor: string;
    fecha: string;
    fechaVencimiento: string;
    medioPago: any;
    items: Omit<ItemComprobanteCompra, 'id'>[];
    controlRemision: ControlRemision;
    numeroRemito: string;
    // Conexión Compras -> Recepción (misma lógica que en Comprobantes.tsx).
    actualizarStock: boolean;
  }) => {
    const now = nowISO();
    const subtotal = data.items.reduce((s, i) => s + i.subtotal, 0);
    const montoIva = data.items.reduce((s, i) => s + i.montoIva, 0);
    const total = subtotal + montoIva;
    const comprobanteId = generarId();
    const itemsConId: ItemComprobanteCompra[] = data.items.map((it) => ({ ...it, id: generarId() }));

    dispatch({
      type: 'ADD_COMPROBANTE_COMPRA',
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
        controlRemision: data.controlRemision,
        numeroRemito: data.numeroRemito || undefined,
        numeroComprobanteProveedor: data.numeroComprobanteProveedor || undefined,
        stockActualizado: false,
        createdAt: now,
        updatedAt: now,
      },
    });

    if (data.actualizarStock && empresaActual) {
      const numeroFormateado = formatNumero(
        PREFIJO_COMPROBANTE_COMPRA[data.tipo],
        comprasState.nextNumeroComprobante[data.tipo],
      );
      const resultado = await actualizarStockPorCompra(itemsConId, {
        clienteId: empresaActual.id,
        proveedorNombre: nombreProveedor(data.proveedorId),
        fecha: data.fecha,
        numeroRemito: data.numeroRemito || undefined,
        numeroComprobante: numeroFormateado,
      });
      if (resultado) {
        dispatch({
          type: 'MARCAR_STOCK_ACTUALIZADO',
          payload: { comprobanteId, recepcionId: resultado.recepcionId },
        });
        if (resultado.advertenciasConversion.length > 0) {
          alert(
            `Comprobante guardado y stock actualizado, con advertencias:\n\n${resultado.advertenciasConversion.join('\n')}`,
          );
        }
      } else {
        alert(
          'El comprobante se guardó, pero no se pudo actualizar el stock. Podés reintentarlo desde Comprobantes.',
        );
      }
    }
  };

  // ── Render ────────────────────────────────────────────────

  const estados: EstadoOrdenCompra[] = ['pendiente', 'parcial', 'recibida', 'cancelada'];

  return (
    <div className="space-y-4">
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
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as EstadoOrdenCompra | '')}
          >
            <option value="">Todos los estados</option>
            {estados.map((e) => (
              <option key={e} value={e}>{ESTADO_OC_LABEL[e]}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva OC
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Nueva Orden de Compra</h3>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor *</label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                value={formProveedorId}
                onChange={(e) => setFormProveedorId(e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {proveedores.filter((p) => p.activo).map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20" type="date" value={formFecha} onChange={(e) => setFormFecha(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha entrega</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20" type="date" value={formFechaEntrega} onChange={(e) => setFormFechaEntrega(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20" value={formNotas} onChange={(e) => setFormNotas(e.target.value)} />
            </div>
          </div>

          {/* Items editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Items</span>
              <button onClick={addFormItem} className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Agregar
              </button>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="text-left px-3 py-2 font-medium">Descripcion</th>
                    <th className="text-right px-3 py-2 font-medium w-20">Cant.</th>
                    <th className="text-right px-3 py-2 font-medium w-24">Precio</th>
                    <th className="text-right px-3 py-2 font-medium w-16">Dto.%</th>
                    <th className="text-right px-3 py-2 font-medium w-24">Subtotal</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {formItems.map((item, idx) => {
                    const sub = calcularSubtotalItem(item.cantidad, item.precioUnitario, item.descuento);
                    return (
                      <tr key={item.key} className="border-t border-gray-100">
                        <td className="px-2 py-1.5">
                          <input className="w-full border-0 bg-transparent text-sm focus:outline-none" placeholder="Descripcion" value={item.descripcion} onChange={(e) => updateFormItem(idx, 'descripcion', e.target.value)} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input className="w-full text-right border-0 bg-transparent text-sm focus:outline-none" type="number" min={1} value={item.cantidad} onChange={(e) => updateFormItem(idx, 'cantidad', Number(e.target.value))} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input className="w-full text-right border-0 bg-transparent text-sm focus:outline-none" type="number" min={0} step={0.01} value={item.precioUnitario} onChange={(e) => updateFormItem(idx, 'precioUnitario', Number(e.target.value))} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input className="w-full text-right border-0 bg-transparent text-sm focus:outline-none" type="number" min={0} max={100} value={item.descuento} onChange={(e) => updateFormItem(idx, 'descuento', Number(e.target.value))} />
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-700 font-medium">{formatARS(sub)}</td>
                        <td className="px-1 py-1.5">
                          <button onClick={() => removeFormItem(idx)} disabled={formItems.length <= 1} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30">
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={resetForm} className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSubmitOC}
              disabled={!formProveedorId || formItems.some((it) => !it.descripcion.trim())}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Crear OC
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {ordenesFiltradas.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" />}
          title="No hay ordenes de compra"
          description="Cree una orden de compra o apruebe una cotizacion."
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
                <th className="px-4 py-3 font-medium whitespace-nowrap min-w-[7rem]">Entrega</th>
                <th className="px-4 py-3 text-right font-medium whitespace-nowrap min-w-[7rem]">Total</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap min-w-[8rem]">Estado</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap min-w-[3rem]" />
                <th className="px-4 py-3 font-medium whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ordenesFiltradas.map((oc) => {
                const isExpanded = expandedId === oc.id;
                const linkedCot = cotNumero(oc.cotizacionId);
                const comps = comprobantesDeOC(oc.id);

                return (
                  <Fragment key={oc.id}>
                    <tr
                      className="border-t border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : oc.id)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{formatNumero('OC', oc.numero)}</td>
                      <td className="px-4 py-3 text-xs font-medium text-gray-900 whitespace-nowrap">{nombreProveedor(oc.proveedorId)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatDate(oc.fecha)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{oc.fechaEntrega ? formatDate(oc.fechaEntrega) : '—'}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap"><Amount value={oc.total} size="xs" /></td>
                      <td className="px-4 py-3 whitespace-nowrap"><EstadoOCBadge estado={oc.estado} /></td>
                      <td className="px-4 py-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDescargarPdf(oc)}
                          disabled={generandoPdfId === oc.id}
                          title="Descargar PDF"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                        >
                          {generandoPdfId === oc.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {oc.estado === 'pendiente' && (
                            <>
                              <button onClick={() => setPreciosOrdenId(oc.id)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="Cargar precios cotizados, IVA e impuestos / confirmar">
                                <Tag className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => cambiarEstado(oc.id, 'parcial')} className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="Marcar parcial">
                                <Package className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => cambiarEstado(oc.id, 'recibida')} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Marcar recibida">
                                <PackageCheck className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setComprobanteDialogOpen(true)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Registrar factura">
                                <FileText className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => cambiarEstado(oc.id, 'cancelada')} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Cancelar">
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {oc.estado === 'parcial' && (
                            <>
                              <button onClick={() => cambiarEstado(oc.id, 'recibida')} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Marcar recibida">
                                <PackageCheck className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setComprobanteDialogOpen(true)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Registrar factura">
                                <FileText className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {oc.estado === 'recibida' && comps.length === 0 && (
                            <button onClick={() => setComprobanteDialogOpen(true)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Registrar factura">
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={9} className="bg-gray-50/50 px-8 py-4">
                          {/* Items */}
                          <h4 className="font-semibold text-gray-900 text-sm mb-2">Items</h4>
                          <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 text-gray-600">
                                  <th className="text-left px-3 py-2 font-medium">Descripcion</th>
                                  <th className="text-right px-3 py-2 font-medium">Cant.</th>
                                  <th className="text-right px-3 py-2 font-medium">Precio</th>
                                  <th className="text-right px-3 py-2 font-medium">Dto.%</th>
                                  <th className="text-right px-3 py-2 font-medium">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {oc.items.map((item) => (
                                  <tr key={item.id} className="border-t border-gray-100">
                                    <td className="px-3 py-2">{item.descripcion}</td>
                                    <td className="px-3 py-2 text-right">{item.cantidad}</td>
                                    <td className="px-3 py-2 text-right">{formatARS(item.precioUnitario)}</td>
                                    <td className="px-3 py-2 text-right">{item.descuento}%</td>
                                    <td className="px-3 py-2 text-right font-medium">{formatARS(item.subtotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* IVA / otros impuestos, si ya se cargaron precios */}
                          {((oc.montoIva ?? 0) > 0 || (oc.otrosImpuestos?.length ?? 0) > 0) && (
                            <div className="flex justify-end mb-3">
                              <div className="w-64 text-sm space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Subtotal</span>
                                  <span className="text-gray-900">{formatARS(oc.subtotal)}</span>
                                </div>
                                {(oc.montoIva ?? 0) > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">IVA</span>
                                    <span className="text-gray-900">{formatARS(oc.montoIva ?? 0)}</span>
                                  </div>
                                )}
                                {oc.otrosImpuestos?.map((imp) => (
                                  <div className="flex justify-between" key={imp.id}>
                                    <span className="text-gray-500">{imp.concepto}</span>
                                    <span className="text-gray-900">{formatARS(imp.monto)}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between pt-1.5 border-t border-gray-200 font-semibold">
                                  <span className="text-gray-900">TOTAL</span>
                                  <span className="text-gray-900">{formatARS(oc.total)}</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Linked cotizacion */}
                          {linkedCot && (
                            <p className="text-sm text-gray-600 mb-2">
                              Cotizacion vinculada: <span className="font-mono text-xs font-medium">{linkedCot}</span>
                            </p>
                          )}

                          {/* Linked comprobantes */}
                          {comps.length > 0 && (
                            <div className="mb-2">
                              <h4 className="font-semibold text-gray-900 text-sm mb-1">Comprobantes vinculados</h4>
                              <div className="space-y-1">
                                {comps.map((c) => (
                                  <div key={c.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm border border-gray-100">
                                    <span className="font-mono text-xs">{formatNumero(PREFIJO_COMPROBANTE_COMPRA[c.tipo], c.numero)}</span>
                                    <span className="text-gray-500">{formatDate(c.fecha)}</span>
                                    <Amount value={c.total} size="sm" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {oc.notas && (
                            <p className="text-sm text-gray-500 italic">Notas: {oc.notas}</p>
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

      {/* Comprobante Dialog */}
      <ComprobanteCompraDialog
        open={comprobanteDialogOpen}
        onOpenChange={setComprobanteDialogOpen}
        proveedores={proveedores.filter((p) => p.activo)}
        onSave={handleSaveComprobante}
      />

      {/* Cargar precios cotizados / confirmar OC */}
      <OrdenCompraPreciosDialog
        open={preciosOrdenId !== null}
        onOpenChange={(v) => { if (!v) setPreciosOrdenId(null); }}
        orden={ordenesCompra.find((o) => o.id === preciosOrdenId) ?? undefined}
        proveedorNombre={preciosOrdenId ? nombreProveedor(ordenesCompra.find((o) => o.id === preciosOrdenId)?.proveedorId ?? '') : undefined}
        onSave={(data) => { if (preciosOrdenId) handleGuardarPrecios(preciosOrdenId, data); }}
      />
    </div>
  );
}
