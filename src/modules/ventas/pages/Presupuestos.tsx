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
  Edit2,
  CheckCircle2,
  XCircle,
  Link2,
  Calendar,
  FileText,
  Download,
  Loader2,
  Mail,
  MessageCircle,
} from 'lucide-react';

import { useClienteActual } from '@/hooks/useClienteActual';
import { descargarPresupuestoPdf } from '../lib/pdfComprobantes';
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
  nowISO,
  PREFIJO_ORDEN,
} from '../lib/format';
import type {
  Presupuesto,
  PresupuestoItem,
  EstadoPresupuesto,
  TipoOrden,
  Cliente,
} from '../types';
import {
  ESTADO_PRESUPUESTO_LABEL,
  calcularSubtotalItem,
  generarId,
} from '../types';

// ─── Prefijo presupuesto ────────────────────────────────────

const PREFIJO_PRESUPUESTO = 'PRE';

// ─── Componente principal ───────────────────────────────────

export default function Presupuestos() {
  const todosPresupuestos = usePresupuestos();
  const clientes = useClientes();
  const { ordenes, config } = useVentas();
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
  // Fase 17: ícono de descarga de PDF -- mismo motor compartido que
  // Comprobantes.tsx (src/lib/comprobantes-pdf), con tipoLabel
  // "Presupuesto" en vez de Factura/Recibo.
  const { cliente: empresaActual } = useClienteActual();
  const [generandoPdfId, setGenerandoPdfId] = useState<string | null>(null);

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

  const handleDescargarPdf = async (pres: Presupuesto) => {
    if (!empresaActual) return;
    setGenerandoPdfId(pres.id);
    try {
      const cliente = clientes.find((c) => c.id === pres.clienteId);
      await descargarPresupuestoPdf(empresaActual, cliente, pres, clienteNombre(pres.clienteId));
    } finally {
      setGenerandoPdfId(null);
    }
  };

  // Envío por email / WhatsApp al cliente -- mismo criterio que Cotizaciones
  // (Compras): todavía no hay un motor de envío real, así que se arma un
  // link mailto:/wa.me con asunto y texto ya redactados a partir de los
  // datos del presupuesto, y se abre el cliente de correo o WhatsApp Web
  // del propio usuario. Un borrador enviado por cualquiera de las dos vías
  // pasa automáticamente a estado 'enviado'.
  const armarTextoPresupuesto = (pres: Presupuesto) => {
    const numero = formatNumero(PREFIJO_PRESUPUESTO, pres.numero);
    const lineas = pres.items.map((it) => `- ${it.descripcion} · cant. ${it.cantidad}`);
    return {
      asunto: `Presupuesto ${numero}`,
      cuerpo:
        `Hola${clienteNombre(pres.clienteId) !== 'Desconocido' ? ` ${clienteNombre(pres.clienteId)}` : ''},\n\n` +
        `Le enviamos el presupuesto ${numero} (válido ${pres.validezDias} días desde el ${formatDate(pres.fecha)}):\n\n` +
        `${lineas.join('\n')}\n\n` +
        `Total: ${formatARS(pres.total)}\n\n` +
        `${pres.condiciones ? `Condiciones: ${pres.condiciones}\n\n` : ''}` +
        `${pres.notas ? `Notas: ${pres.notas}\n\n` : ''}` +
        `Quedamos a disposición.\nSaludos.`,
    };
  };

  const marcarEnviadoSiBorrador = (pres: Presupuesto) => {
    if (pres.estado === 'borrador') handleEnviar(pres.id);
  };

  const handleEnviarEmail = (pres: Presupuesto, cliente?: Cliente) => {
    if (!cliente?.email) return;
    const { asunto, cuerpo } = armarTextoPresupuesto(pres);
    const url = `mailto:${cliente.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    window.open(url, '_blank');
    marcarEnviadoSiBorrador(pres);
  };

  const handleEnviarWhatsapp = (pres: Presupuesto, cliente?: Cliente) => {
    if (!cliente?.telefono) return;
    const telefono = cliente.telefono.replace(/\D/g, '');
    const { cuerpo } = armarTextoPresupuesto(pres);
    const url = `https://wa.me/${telefono}?text=${encodeURIComponent(cuerpo)}`;
    window.open(url, '_blank');
    marcarEnviadoSiBorrador(pres);
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
        <EmptyState title="No se encontraron presupuestos con los filtros seleccionados" />
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
                <th className="px-4 py-3 font-medium whitespace-nowrap">Acciones</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {presupuestosFiltrados.map((pres) => {
                const cliente = clientes.find((c) => c.id === pres.clienteId);
                return (
                  <PresupuestoRow
                    key={pres.id}
                    presupuesto={pres}
                    isExpanded={expandedId === pres.id}
                    clienteNombre={clienteNombre(pres.clienteId)}
                    cliente={cliente}
                    ordenNumero={pres.ordenId ? ordenNumero(pres.ordenId) : null}
                    onToggleExpand={() => handleToggleExpand(pres.id)}
                    onEditar={() => handleEditar(pres)}
                    onCancelar={() => handleCancelar(pres.id)}
                    onAprobar={(tipo) => handleAprobar(pres.id, tipo)}
                    onDescargarPdf={() => handleDescargarPdf(pres)}
                    generandoPdf={generandoPdfId === pres.id}
                    onEnviarEmail={() => handleEnviarEmail(pres, cliente)}
                    onEnviarWhatsapp={() => handleEnviarWhatsapp(pres, cliente)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog */}
      <PresupuestoDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditPresupuesto(null);
        }}
        clientes={clientes}
        presupuesto={editPresupuesto ?? undefined}
        validezDefault={config.validezPresupuestoDias}
        onSave={(data) => {
          const now = nowISO();
          const items: PresupuestoItem[] = data.items.map((it) => ({
            ...it,
            id: generarId(),
          }));
          const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
          const total = subtotal * (1 - data.descuentoGeneral / 100);
          const fechaVencimiento = (() => {
            const d = new Date(data.fecha);
            d.setDate(d.getDate() + data.validezDias);
            return d.toISOString().split('T')[0];
          })();

          if (editPresupuesto) {
            dispatch({
              type: 'UPDATE_PRESUPUESTO',
              payload: {
                ...editPresupuesto,
                clienteId: data.clienteId,
                fecha: data.fecha,
                validezDias: data.validezDias,
                fechaVencimiento,
                items,
                subtotal,
                descuentoGeneral: data.descuentoGeneral,
                total,
                condiciones: data.condiciones || undefined,
                notas: data.notas || undefined,
                updatedAt: now,
              },
            });
          } else {
            dispatch({
              type: 'ADD_PRESUPUESTO',
              payload: {
                id: generarId(),
                clienteId: data.clienteId,
                fecha: data.fecha,
                validezDias: data.validezDias,
                fechaVencimiento,
                estado: 'borrador',
                items,
                subtotal,
                descuentoGeneral: data.descuentoGeneral,
                total,
                condiciones: data.condiciones || undefined,
                notas: data.notas || undefined,
                createdAt: now,
                updatedAt: now,
              },
            });
          }
          setDialogOpen(false);
          setEditPresupuesto(null);
        }}
      />
    </div>
  );
}

// ─── Fila de presupuesto con panel expandible ───────────────

interface PresupuestoRowProps {
  presupuesto: Presupuesto;
  isExpanded: boolean;
  clienteNombre: string;
  cliente?: Cliente;
  ordenNumero: string | null;
  onToggleExpand: () => void;
  onEditar: () => void;
  onCancelar: () => void;
  onAprobar: (tipo: TipoOrden) => void;
  onDescargarPdf: () => void;
  generandoPdf: boolean;
  onEnviarEmail: () => void;
  onEnviarWhatsapp: () => void;
}

function PresupuestoRow({
  presupuesto,
  isExpanded,
  clienteNombre,
  cliente,
  ordenNumero,
  onToggleExpand,
  onEditar,
  onCancelar,
  onAprobar,
  onDescargarPdf,
  generandoPdf,
  onEnviarEmail,
  onEnviarWhatsapp,
}: PresupuestoRowProps) {
  const p = presupuesto;

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
          <Amount value={p.total} />
        </td>
        <td className="px-4 py-3">
          <EstadoPresupuestoBadge estado={p.estado} />
        </td>
        <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <button
              onClick={onDescargarPdf}
              disabled={generandoPdf}
              title="Descargar PDF"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            >
              {generandoPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={onEnviarEmail}
              disabled={!cliente?.email}
              title={cliente?.email ? `Enviar por email a ${cliente.email}` : 'El cliente no tiene email cargado'}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent"
            >
              <Mail className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onEnviarWhatsapp}
              disabled={!cliente?.telefono}
              title={cliente?.telefono ? `Enviar por WhatsApp a ${cliente.telefono}` : 'El cliente no tiene teléfono cargado'}
              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
            {p.estado === 'borrador' && (
              <>
                <button onClick={onEditar} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Editar">
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={onCancelar} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Cancelar">
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {p.estado === 'enviado' && (
              <>
                <button onClick={() => onAprobar('pedido')} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Aprobar y crear orden">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={onCancelar} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Cancelar">
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {p.estado === 'aprobado' && ordenNumero && (
              <span className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                <Link2 className="h-3 w-3 inline mr-1" />{ordenNumero}
              </span>
            )}
          </div>
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
          <td colSpan={8} className="bg-gray-50 px-4 py-5">
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
                            <Amount value={item.subtotal} />
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
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
