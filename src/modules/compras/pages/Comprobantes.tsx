// ============================================================
// Modulo Compras — Comprobantes
// Edgy Gestion · Gestion de comprobantes de compra
// ============================================================

import { useState, useMemo } from 'react';
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
  Factory,
  CheckCircle2,
} from 'lucide-react';

import { useClienteActual } from '@/hooks/useClienteActual';
import { descargarComprobanteCompraPdf } from '../lib/pdfComprobantes';
import { actualizarStockPorCompra } from '../lib/actualizarStockCompra';
import {
  useComprobantesCompra,
  useProveedores,
  useOrdenesCompra,
  usePagos,
  useCompras,
  useComprasDispatch,
} from '../data/store';
import {
  KpiCard,
  EstadoComprobanteBadge,
  MedioPagoBadge,
  Amount,
  EmptyState,
} from '../components/compras/display';
import { ComprobanteCompraDialog, PagoDialog } from '../components/compras/dialogs';
import {
  formatARS,
  formatDate,
  formatNumero,
  nowISO,
  PREFIJO_COMPROBANTE_COMPRA,
} from '../lib/format';
import type {
  TipoComprobanteCompra,
  EstadoComprobanteCompra,
  ComprobanteCompra,
  ItemComprobanteCompra,
  ControlRemision,
} from '../types';
import {
  TIPO_COMPROBANTE_COMPRA_LABEL,
  ESTADO_COMPROBANTE_COMPRA_LABEL,
  generarId,
} from '../types';

// ─── Componente principal ───────────────────────────────────

export default function Comprobantes() {
  const comprobantes = useComprobantesCompra();
  const proveedores = useProveedores();
  const ordenesCompra = useOrdenesCompra();
  const pagos = usePagos();
  const comprasState = useCompras();
  const dispatch = useComprasDispatch();

  // ── Filtros ───────────────────────────────────────────────

  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<TipoComprobanteCompra | ''>('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoComprobanteCompra | ''>('');

  // ── Estado de UI ──────────────────────────────────────────

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comprobanteDialogOpen, setComprobanteDialogOpen] = useState(false);
  const [pagoDialogOpen, setPagoDialogOpen] = useState(false);
  const [pagoComprobanteId, setPagoComprobanteId] = useState<string | null>(null);
  // Fase 17: ícono de descarga de PDF -- mismo motor compartido de Ventas.
  const { cliente: empresaActual } = useClienteActual();
  const [generandoPdfId, setGenerandoPdfId] = useState<string | null>(null);
  // Conexión Compras -> Recepción: ícono de fila para comprobantes ya
  // guardados que todavía no empujaron su stock (ver handleActualizarStockExistente).
  const [actualizandoStockId, setActualizandoStockId] = useState<string | null>(null);

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
        // También se puede buscar por el Nro. de Comprobante fiscal del
        // proveedor (ej. "0001-00000542") -- es lo que el operador suele
        // tener a mano al buscar una compra puntual.
        const matchNumProveedor = c.numeroComprobanteProveedor?.toLowerCase().includes(q);
        if (!matchProv && !matchNum && !matchNumProveedor) return false;
      }
      return true;
    });
  }, [comprobantes, busqueda, filtroTipo, filtroEstado, proveedores]);

  // ── Helpers ───────────────────────────────────────────────

  const nombreProveedor = (proveedorId: string) =>
    proveedores.find((p) => p.id === proveedorId)?.nombre ?? 'Desconocido';

  const ocNumero = (ordenCompraId?: string) => {
    if (!ordenCompraId) return null;
    const oc = ordenesCompra.find((o) => o.id === ordenCompraId);
    return oc ? formatNumero('OC', oc.numero) : null;
  };

  const pagosDeComprobante = (comprobanteId: string) =>
    pagos.filter((p) => p.imputaciones.some((imp) => imp.comprobanteId === comprobanteId));

  // ── Handlers ──────────────────────────────────────────────

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
    // Conexión Compras -> Recepción: true si se apretó "Actualizar stock"
    // (guarda el comprobante Y empuja el stock ya mismo), false si fue
    // "Guardar" (solo el registro fiscal -- el stock se actualiza después,
    // a mano en Recepción o con el ícono de la fila).
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
          'El comprobante se guardó, pero no se pudo actualizar el stock. Podés reintentarlo desde el ícono de la fila.',
        );
      }
    }
  };

  const handleActualizarStockExistente = async (comp: ComprobanteCompra) => {
    if (!empresaActual) return;
    setActualizandoStockId(comp.id);
    try {
      const numeroFormateado = formatNumero(PREFIJO_COMPROBANTE_COMPRA[comp.tipo], comp.numero);
      const resultado = await actualizarStockPorCompra(comp.items, {
        clienteId: empresaActual.id,
        proveedorNombre: nombreProveedor(comp.proveedorId),
        fecha: comp.fecha,
        numeroRemito: comp.numeroRemito,
        numeroComprobante: numeroFormateado,
      });
      if (resultado) {
        dispatch({
          type: 'MARCAR_STOCK_ACTUALIZADO',
          payload: { comprobanteId: comp.id, recepcionId: resultado.recepcionId },
        });
        if (resultado.advertenciasConversion.length > 0) {
          alert(`Stock actualizado, con advertencias:\n\n${resultado.advertenciasConversion.join('\n')}`);
        }
      } else {
        alert('No se pudo actualizar el stock. Verificá que haya líneas vinculadas a un insumo o producto.');
      }
    } finally {
      setActualizandoStockId(null);
    }
  };

  const handleAnular = (id: string) => {
    dispatch({ type: 'ANULAR_COMPROBANTE_COMPRA', payload: { id } });
  };

  const handleDescargarPdf = async (comp: (typeof comprobantes)[number]) => {
    if (!empresaActual) return;
    setGenerandoPdfId(comp.id);
    try {
      const proveedor = proveedores.find((p) => p.id === comp.proveedorId);
      await descargarComprobanteCompraPdf(empresaActual, proveedor, comp, nombreProveedor(comp.proveedorId));
    } finally {
      setGenerandoPdfId(null);
    }
  };

  const handleRegistrarPago = (comprobanteId: string) => {
    setPagoComprobanteId(comprobanteId);
    setPagoDialogOpen(true);
  };

  const handleSavePago = (data: { fecha: string; monto: number; medioPago: string; imputaciones: { comprobanteId: string; montoImputado: number }[] }) => {
    const comp = pagoComprobanteId ? comprobantes.find((c) => c.id === pagoComprobanteId) : null;
    if (!comp) return;
    dispatch({
      type: 'ADD_PAGO',
      payload: {
        id: generarId(),
        proveedorId: comp.proveedorId,
        fecha: data.fecha,
        monto: data.monto,
        medioPago: data.medioPago as any,
        imputaciones: data.imputaciones,
        createdAt: nowISO(),
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

  const tipos: TipoComprobanteCompra[] = ['factura', 'nota_credito', 'nota_debito'];
  const estados: EstadoComprobanteCompra[] = ['pendiente', 'pagado_parcial', 'pagado', 'anulado'];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title="Total compras del mes"
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
            onChange={(e) => setFiltroTipo(e.target.value as TipoComprobanteCompra | '')}
          >
            <option value="">Todos los tipos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>{TIPO_COMPROBANTE_COMPRA_LABEL[t]}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-gray-300 py-2 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as EstadoComprobanteCompra | '')}
          >
            <option value="">Todos los estados</option>
            {estados.map((e) => (
              <option key={e} value={e}>{ESTADO_COMPROBANTE_COMPRA_LABEL[e]}</option>
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
          description="Registre un comprobante de compra para comenzar."
        />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium w-8" />
                <th className="px-4 py-3 font-medium">Numero</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Proveedor</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 text-right font-medium">Subtotal</th>
                <th className="px-4 py-3 text-right font-medium">IVA</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Pendiente</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Pago</th>
                <th className="px-4 py-3 w-10" />
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {comprobantesFiltrados.map((comp) => {
                const isExpanded = expandedId === comp.id;
                const linkedOC = ocNumero(comp.ordenCompraId);
                const compPagos = pagosDeComprobante(comp.id);

                return (
                  <tbody key={comp.id}>
                    <tr
                      className="border-t border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : comp.id)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <div>{formatNumero(PREFIJO_COMPROBANTE_COMPRA[comp.tipo], comp.numero)}</div>
                        {comp.numeroComprobanteProveedor && (
                          <div className="text-gray-400 font-normal mt-0.5" title="Nro. de Comprobante del proveedor">
                            {comp.numeroComprobanteProveedor}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {TIPO_COMPROBANTE_COMPRA_LABEL[comp.tipo]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{nombreProveedor(comp.proveedorId)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(comp.fecha)}</td>
                      <td className="px-4 py-3 text-right"><Amount value={comp.subtotal} size="sm" /></td>
                      <td className="px-4 py-3 text-right"><Amount value={comp.montoIva} size="sm" /></td>
                      <td className="px-4 py-3 text-right"><Amount value={comp.total} /></td>
                      <td className="px-4 py-3 text-right"><Amount value={comp.saldoPendiente} size="sm" /></td>
                      <td className="px-4 py-3"><EstadoComprobanteBadge estado={comp.estado} /></td>
                      <td className="px-4 py-3"><MedioPagoBadge medio={comp.medioPago} /></td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
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
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {comp.stockActualizado ? (
                            <span
                              title="Stock actualizado en Productos y Stock"
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Stock
                            </span>
                          ) : (
                            comp.controlRemision === 'no' &&
                            comp.items.some((i) => i.insumoId || i.productoId) && (
                              <button
                                onClick={() => handleActualizarStockExistente(comp)}
                                disabled={actualizandoStockId === comp.id}
                                className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg disabled:opacity-50"
                                title="Actualizar stock (generar recepción)"
                              >
                                {actualizandoStockId === comp.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Factory className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )
                          )}
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
                          <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
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
                                    <td className="px-3 py-2">
                                      {item.descripcion}
                                      {(item.insumoId || item.productoId) && (
                                        <span
                                          className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${item.insumoId ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}
                                        >
                                          {item.insumoId ? 'Insumo' : 'Producto'}
                                        </span>
                                      )}
                                    </td>
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

                          {/* Conexión con Recepción */}
                          <p className="text-sm text-gray-600 mb-2">
                            Control de Remisión: <span className="font-medium">{comp.controlRemision === 'si' ? 'Sí' : 'No'}</span>
                            {comp.numeroRemito && (
                              <>
                                {' · '}Remito Nro. <span className="font-mono text-xs font-medium">{comp.numeroRemito}</span>
                              </>
                            )}
                          </p>

                          {/* Linked OC */}
                          {linkedOC && (
                            <p className="text-sm text-gray-600 mb-2">
                              OC vinculada: <span className="font-mono text-xs font-medium">{linkedOC}</span>
                            </p>
                          )}

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
                  </tbody>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      <ComprobanteCompraDialog
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
