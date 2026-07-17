// ============================================================
// Modulo Compras — Cotizaciones
// Edgy Gestion · Gestion de pedidos de cotizacion
// ============================================================

import { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  Send,
  Edit2,
  CheckCircle2,
  XCircle,
  MessageSquare,
  MessageCircle,
  Mail,
  ClipboardList,
  FileSearch,
  Download,
  Loader2,
} from 'lucide-react';

import { useClienteActual } from '@/hooks/useClienteActual';
import { descargarCotizacionPdf } from '../lib/pdfComprobantes';
import {
  useCotizaciones,
  useProveedores,
  useOrdenesCompra,
  useCompras,
  useComprasDispatch,
} from '../data/store';
import {
  EstadoCotizacionBadge,
  Amount,
  EmptyState,
} from '../components/compras/display';
import { CotizacionDialog } from '../components/compras/dialogs';
import { formatDate, formatARS, formatNumero, nowISO } from '../lib/format';
import type { EstadoCotizacion, Proveedor } from '../types';
import { ESTADO_COTIZACION_LABEL, generarId } from '../types';
import type { UnidadMedida } from '@/modules/productos-stock/types';

// ─── Componente principal ───────────────────────────────────

export default function Cotizaciones() {
  const cotizaciones = useCotizaciones();
  const proveedores = useProveedores();
  const ordenesCompra = useOrdenesCompra();
  const { config } = useCompras();
  const dispatch = useComprasDispatch();

  // ── Filtros ───────────────────────────────────────────────

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoCotizacion | ''>('');

  // ── Estado de UI ──────────────────────────────────────────

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCotizacion, setEditCotizacion] = useState<any>(null);
  // Fase 17: ícono de descarga de PDF -- mismo motor compartido de Ventas.
  const { cliente: empresaActual } = useClienteActual();
  const [generandoPdfId, setGenerandoPdfId] = useState<string | null>(null);

  // ── Datos filtrados ───────────────────────────────────────

  const cotizacionesFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return cotizaciones.filter((c) => {
      if (filtroEstado && c.estado !== filtroEstado) return false;
      if (q) {
        const prov = proveedores.find((p) => p.id === c.proveedorId);
        const matchProv = prov?.nombre.toLowerCase().includes(q);
        const matchNum = String(c.numero).includes(q);
        if (!matchProv && !matchNum) return false;
      }
      return true;
    });
  }, [cotizaciones, busqueda, filtroEstado, proveedores]);

  // ── Helpers ───────────────────────────────────────────────

  const nombreProveedor = (proveedorId: string) =>
    proveedores.find((p) => p.id === proveedorId)?.nombre ?? 'Desconocido';

  const ocNumero = (ordenCompraId?: string) => {
    if (!ordenCompraId) return null;
    const oc = ordenesCompra.find((o) => o.id === ordenCompraId);
    return oc ? formatNumero('OC', oc.numero) : null;
  };

  // ── Handlers ──────────────────────────────────────────────

  const handleNuevaCotizacion = () => {
    setEditCotizacion(null);
    setDialogOpen(true);
  };

  const handleSaveCotizacion = (data: {
    proveedorId: string;
    fecha: string;
    validezDias: number;
    notas: string;
    items: {
      descripcion: string; cantidad: number; precioUnitario: number; descuento: number; subtotal: number;
      insumoId?: string; productoId?: string; unidad?: UnidadMedida;
    }[];
  }) => {
    const now = nowISO();
    const fechaVenc = new Date(data.fecha);
    fechaVenc.setDate(fechaVenc.getDate() + data.validezDias);

    if (editCotizacion) {
      dispatch({
        type: 'UPDATE_COTIZACION',
        payload: {
          ...editCotizacion,
          ...data,
          fechaVencimiento: fechaVenc.toISOString().split('T')[0],
          items: data.items.map((it) => ({ ...it, id: generarId() })),
          subtotal: data.items.reduce((s, i) => s + i.subtotal, 0),
          total: data.items.reduce((s, i) => s + i.subtotal, 0),
          updatedAt: now,
        },
      });
    } else {
      dispatch({
        type: 'ADD_COTIZACION',
        payload: {
          id: generarId(),
          proveedorId: data.proveedorId,
          fecha: data.fecha,
          validezDias: data.validezDias,
          fechaVencimiento: fechaVenc.toISOString().split('T')[0],
          estado: 'borrador',
          items: data.items.map((it) => ({ ...it, id: generarId() })),
          subtotal: data.items.reduce((s, i) => s + i.subtotal, 0),
          total: data.items.reduce((s, i) => s + i.subtotal, 0),
          notas: data.notas || undefined,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  };

  const cambiarEstado = (id: string, nuevoEstado: EstadoCotizacion) => {
    dispatch({ type: 'CAMBIAR_ESTADO_COTIZACION', payload: { id, nuevoEstado } });
  };

  const convertirAOC = (cotizacionId: string) => {
    dispatch({ type: 'CONVERTIR_COTIZACION_A_OC', payload: { cotizacionId } });
  };

  // Envío por email / WhatsApp al proveedor -- todavía no hay un motor de
  // envío real (API de mail transaccional / WhatsApp Business), así que se
  // arma un link mailto:/wa.me con asunto y texto ya redactados a partir de
  // los datos de la cotización, y se abre el cliente de correo o WhatsApp
  // Web del propio usuario. Cuando se sume el motor real, este armado de
  // asunto/texto se puede reutilizar tal cual.
  const armarTextoCotizacion = (cot: (typeof cotizaciones)[number]) => {
    const numero = formatNumero('COT', cot.numero);
    const lineas = cot.items.map(
      (it) => `- ${it.descripcion} · cant. ${it.cantidad}${it.unidad ? ` ${it.unidad}` : ''}`,
    );
    return {
      asunto: `Pedido de cotización ${numero}`,
      cuerpo:
        `Hola${nombreProveedor(cot.proveedorId) !== 'Desconocido' ? ` ${nombreProveedor(cot.proveedorId)}` : ''},\n\n` +
        `Les solicitamos cotización para los siguientes ítems (Pedido ${numero}, válido ${cot.validezDias} días desde el ${formatDate(cot.fecha)}):\n\n` +
        `${lineas.join('\n')}\n\n` +
        `${cot.notas ? `Notas: ${cot.notas}\n\n` : ''}` +
        `Quedamos a la espera de sus precios.\nSaludos.`,
    };
  };

  const marcarEnviadoSiBorrador = (cot: (typeof cotizaciones)[number]) => {
    if (cot.estado === 'borrador') cambiarEstado(cot.id, 'enviado');
  };

  const handleEnviarEmail = (cot: (typeof cotizaciones)[number], proveedor?: Proveedor) => {
    if (!proveedor?.email) return;
    const { asunto, cuerpo } = armarTextoCotizacion(cot);
    const url = `mailto:${proveedor.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    window.open(url, '_blank');
    marcarEnviadoSiBorrador(cot);
  };

  const handleEnviarWhatsapp = (cot: (typeof cotizaciones)[number], proveedor?: Proveedor) => {
    if (!proveedor?.telefono) return;
    const telefono = proveedor.telefono.replace(/\D/g, '');
    const { cuerpo } = armarTextoCotizacion(cot);
    const url = `https://wa.me/${telefono}?text=${encodeURIComponent(cuerpo)}`;
    window.open(url, '_blank');
    marcarEnviadoSiBorrador(cot);
  };

  const handleDescargarPdf = async (cot: (typeof cotizaciones)[number]) => {
    if (!empresaActual) return;
    setGenerandoPdfId(cot.id);
    try {
      const proveedor = proveedores.find((p) => p.id === cot.proveedorId);
      await descargarCotizacionPdf(empresaActual, proveedor, cot, nombreProveedor(cot.proveedorId));
    } finally {
      setGenerandoPdfId(null);
    }
  };

  // ── Render ────────────────────────────────────────────────

  const estados: EstadoCotizacion[] = ['borrador', 'enviado', 'respondido', 'aprobado', 'vencido', 'cancelado'];

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
            onChange={(e) => setFiltroEstado(e.target.value as EstadoCotizacion | '')}
          >
            <option value="">Todos los estados</option>
            {estados.map((e) => (
              <option key={e} value={e}>{ESTADO_COTIZACION_LABEL[e]}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleNuevaCotizacion}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva cotizacion
        </button>
      </div>

      {/* Table */}
      {cotizacionesFiltradas.length === 0 ? (
        <EmptyState
          icon={<FileSearch className="h-10 w-10" />}
          title="No hay cotizaciones"
          description="Cree una cotizacion para solicitar precios a sus proveedores."
        />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium w-8" />
                <th className="px-4 py-3 font-medium">Numero</th>
                <th className="px-4 py-3 font-medium">Proveedor</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 w-10" />
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cotizacionesFiltradas.map((cot) => {
                const isExpanded = expandedId === cot.id;
                const linkedOC = ocNumero(cot.ordenCompraId);
                const proveedorCot = proveedores.find((p) => p.id === cot.proveedorId);

                return (
                  <tbody key={cot.id}>
                    <tr
                      className="border-t border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : cot.id)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{formatNumero('COT', cot.numero)}</td>
                      <td className="px-4 py-3 text-gray-900">{nombreProveedor(cot.proveedorId)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(cot.fecha)}</td>
                      <td className="px-4 py-3 text-right"><Amount value={cot.total} /></td>
                      <td className="px-4 py-3"><EstadoCotizacionBadge estado={cot.estado} /></td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            onClick={() => handleDescargarPdf(cot)}
                            disabled={generandoPdfId === cot.id}
                            title="Descargar PDF"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                          >
                            {generandoPdfId === cot.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleEnviarEmail(cot, proveedorCot)}
                            disabled={!proveedorCot?.email}
                            title={proveedorCot?.email ? `Enviar por email a ${proveedorCot.email}` : 'El proveedor no tiene email cargado'}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-gray-400"
                          >
                            <Mail className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleEnviarWhatsapp(cot, proveedorCot)}
                            disabled={!proveedorCot?.telefono}
                            title={proveedorCot?.telefono ? `Enviar por WhatsApp a ${proveedorCot.telefono}` : 'El proveedor no tiene teléfono cargado'}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-green-600 disabled:opacity-30 disabled:hover:text-gray-400"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {cot.estado === 'borrador' && (
                            <>
                              <button onClick={() => cambiarEstado(cot.id, 'enviado')} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Enviar">
                                <Send className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => { setEditCotizacion(cot); setDialogOpen(true); }} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Editar">
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => cambiarEstado(cot.id, 'cancelado')} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Cancelar">
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {cot.estado === 'enviado' && (
                            <>
                              <button onClick={() => cambiarEstado(cot.id, 'respondido')} className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="Marcar respondido">
                                <MessageSquare className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => cambiarEstado(cot.id, 'cancelado')} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Cancelar">
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {cot.estado === 'respondido' && (
                            <>
                              <button onClick={() => convertirAOC(cot.id)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Generar Orden de Compra (con los precios recibidos)">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => cambiarEstado(cot.id, 'cancelado')} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Cancelar">
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {cot.estado === 'aprobado' && linkedOC && (
                            <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                              <ClipboardList className="h-3 w-3 inline mr-1" />{linkedOC}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-gray-50/50 px-8 py-4">
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
                                {cot.items.map((item) => (
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
                          {cot.notas && (
                            <p className="text-sm text-gray-500 italic">Notas: {cot.notas}</p>
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

      {/* Dialog */}
      <CotizacionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        proveedores={proveedores.filter((p) => p.activo)}
        cotizacion={editCotizacion ?? undefined}
        validezDefault={config.validezCotizacionDias}
        onSave={handleSaveCotizacion}
      />
    </div>
  );
}
