// ============================================================
// Módulo Ventas — Clientes
// Edgy Gestión · ABM y gestión de clientes
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  Edit2,
  DollarSign,
  Power,
  Phone,
  Mail,
  MapPin,
  FileText,
  CreditCard,
  User,
} from 'lucide-react';

import {
  useClientes,
  useComprobantes,
  useCobros,
  useVentas,
  useVentasDispatch,
} from '../data/store';
import {
  EstadoComprobanteBadge,
  MedioPagoBadge,
  Amount,
  EmptyState,
} from '../components/ventas/display';
import { ClienteDialog, CobroDialog } from '../components/ventas/dialogs';
import {
  formatCuit,
  formatDate,
  formatARS,
  formatNumero,
  PREFIJO_COMPROBANTE,
  daysUntil,
} from '../lib/format';
import type { Cliente, CategoriaCliente } from '../types';
import {
  CONDICION_IVA_LABEL,
  TIPO_DOCUMENTO_LABEL,
  labelTipoComprobante,
  MEDIO_PAGO_LABEL,
  generarId,
} from '../types';

// ─── Componente principal ───────────────────────────────────

export default function Clientes() {
  const clientes = useClientes();
  const comprobantes = useComprobantes();
  const cobros = useCobros();
  const { categorias } = useVentas();
  const dispatch = useVentasDispatch();

  // ── Filtros ───────────────────────────────────────────────

  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('');
  const [soloActivos, setSoloActivos] = useState(true);

  // ── Estado de UI ──────────────────────────────────────────

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCliente, setEditCliente] = useState<Cliente | null>(null);
  const [cobroDialogOpen, setCobroDialogOpen] = useState(false);
  const [cobroClienteId, setCobroClienteId] = useState<string | null>(null);

  // ── Datos filtrados ───────────────────────────────────────

  const clientesFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();

    return clientes.filter((c) => {
      // Filtro activo/inactivo
      if (soloActivos && !c.activo) return false;

      // Filtro categoría
      if (filtroCategoria && c.categoriaId !== filtroCategoria) return false;

      // Búsqueda por nombre o documento
      if (q) {
        const matchNombre = c.nombre.toLowerCase().includes(q);
        const matchDocumento = c.documento.includes(q);
        if (!matchNombre && !matchDocumento) return false;
      }

      return true;
    });
  }, [clientes, busqueda, filtroCategoria, soloActivos]);

  // ── Helpers ───────────────────────────────────────────────

  const categoriaNombre = useCallback(
    (categoriaId?: string) => {
      if (!categoriaId) return '—';
      const cat = categorias.find((c: CategoriaCliente) => c.id === categoriaId);
      return cat?.nombre ?? '—';
    },
    [categorias],
  );

  const formatDocumento = (cliente: Cliente) => {
    if (cliente.tipoDocumento === 'cuit' || cliente.tipoDocumento === 'cuil') {
      return formatCuit(cliente.documento);
    }
    return cliente.documento;
  };

  // ── Handlers ──────────────────────────────────────────────

  const handleNuevoCliente = () => {
    setEditCliente(null);
    setDialogOpen(true);
  };

  const handleEditCliente = (cliente: Cliente) => {
    setEditCliente(cliente);
    setDialogOpen(true);
  };

  const handleSaveCliente = (data: Omit<Cliente, 'id' | 'saldoCuentaCorriente' | 'activo' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    if (editCliente) {
      dispatch({
        type: 'UPDATE_CLIENTE',
        payload: {
          ...editCliente,
          ...data,
          updatedAt: now,
        },
      });
    } else {
      dispatch({
        type: 'ADD_CLIENTE',
        payload: {
          ...data,
          id: generarId(),
          saldoCuentaCorriente: 0,
          activo: true,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    setDialogOpen(false);
    setEditCliente(null);
  };

  const handleToggleActivo = (clienteId: string) => {
    dispatch({ type: 'TOGGLE_CLIENTE_ACTIVO', payload: { id: clienteId } });
  };

  const handleRegistrarCobro = (clienteId: string) => {
    setCobroClienteId(clienteId);
    setCobroDialogOpen(true);
  };

  const handleToggleExpand = (clienteId: string) => {
    setExpandedId((prev) => (prev === clienteId ? null : clienteId));
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>

        <button
          onClick={handleNuevoCliente}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo cliente
        </button>
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Búsqueda */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o documento..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Filtro categoría */}
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((cat: CategoriaCliente) => (
            <option key={cat.id} value={cat.id}>
              {cat.nombre}
            </option>
          ))}
        </select>

        {/* Toggle activos */}
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <button
            onClick={() => setSoloActivos(!soloActivos)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              soloActivos ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                soloActivos ? 'translate-x-4.5' : 'translate-x-0.5'
              }`}
            />
          </button>
          Solo activos
        </label>
      </div>

      {/* Tabla de clientes */}
      {clientesFiltrados.length === 0 ? (
        <EmptyState title="No se encontraron clientes con los filtros seleccionados" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Documento</th>
                <th className="px-4 py-3 font-medium">Condición IVA</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 text-right font-medium">Saldo Cta. Cte.</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.map((cliente) => (
                <ClienteRow
                  key={cliente.id}
                  cliente={cliente}
                  isExpanded={expandedId === cliente.id}
                  categoriaNombre={categoriaNombre(cliente.categoriaId)}
                  onToggleExpand={() => handleToggleExpand(cliente.id)}
                  onEdit={() => handleEditCliente(cliente)}
                  onToggleActivo={() => handleToggleActivo(cliente.id)}
                  onRegistrarCobro={() => handleRegistrarCobro(cliente.id)}
                  comprobantes={comprobantes}
                  cobros={cobros}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      <ClienteDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditCliente(null);
        }}
        cliente={editCliente ?? undefined}
        onSave={handleSaveCliente}
      />

      {cobroDialogOpen && cobroClienteId && (() => {
        const cobroCliente = clientes.find((c) => c.id === cobroClienteId);
        if (!cobroCliente) return null;
        const comprobantesCliente = comprobantes.filter(
          (c) => c.clienteId === cobroClienteId && (c.estado === 'emitido' || c.estado === 'cobrado_parcial'),
        );
        return (
          <CobroDialog
            open={cobroDialogOpen}
            onOpenChange={(open) => {
              setCobroDialogOpen(open);
              if (!open) setCobroClienteId(null);
            }}
            cliente={cobroCliente}
            comprobantesCliente={comprobantesCliente}
            onSave={(data) => {
              dispatch({
                type: 'ADD_COBRO',
                payload: {
                  id: generarId(),
                  clienteId: cobroClienteId,
                  fecha: data.fecha,
                  monto: data.monto,
                  medioPago: data.medioPago,
                  imputaciones: data.imputaciones,
                  createdAt: new Date().toISOString(),
                },
              });
              setCobroDialogOpen(false);
              setCobroClienteId(null);
            }}
          />
        );
      })()}
    </div>
  );
}

// ─── Fila de cliente con panel expandible ───────────────────

interface ClienteRowProps {
  cliente: Cliente;
  isExpanded: boolean;
  categoriaNombre: string;
  onToggleExpand: () => void;
  onEdit: () => void;
  onToggleActivo: () => void;
  onRegistrarCobro: () => void;
  comprobantes: ReturnType<typeof useComprobantes>;
  cobros: ReturnType<typeof useCobros>;
}

function ClienteRow({
  cliente,
  isExpanded,
  categoriaNombre,
  onToggleExpand,
  onEdit,
  onToggleActivo,
  onRegistrarCobro,
  comprobantes,
  cobros,
}: ClienteRowProps) {
  // ── Datos del cliente expandido ───────────────────────────

  const comprobantesPendientes = useMemo(
    () =>
      comprobantes
        .filter(
          (c) =>
            c.clienteId === cliente.id &&
            c.saldoPendiente > 0 &&
            c.estado !== 'anulado',
        )
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [comprobantes, cliente.id],
  );

  const ultimosCobros = useMemo(
    () =>
      cobros
        .filter((c) => c.clienteId === cliente.id)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .slice(0, 10),
    [cobros, cliente.id],
  );

  const formatDocumento = () => {
    if (cliente.tipoDocumento === 'cuit' || cliente.tipoDocumento === 'cuil') {
      return formatCuit(cliente.documento);
    }
    return cliente.documento;
  };

  return (
    <>
      {/* Fila principal */}
      <tr
        onClick={onToggleExpand}
        className="cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50 last:border-0"
      >
        <td className="px-4 py-3 font-medium text-gray-900">{cliente.nombre}</td>
        <td className="px-4 py-3 text-gray-600">
          <span className="mr-1 text-xs text-gray-400">
            {TIPO_DOCUMENTO_LABEL[cliente.tipoDocumento]}
          </span>
          {formatDocumento()}
        </td>
        <td className="px-4 py-3 text-gray-600">
          {CONDICION_IVA_LABEL[cliente.condicionIva]}
        </td>
        <td className="px-4 py-3 text-gray-600">{categoriaNombre}</td>
        <td className="px-4 py-3 text-right">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="hover:underline"
          >
            <Amount value={cliente.saldoCuentaCorriente} />
          </button>
        </td>
        <td className="px-4 py-3 text-gray-600">{cliente.telefono || '—'}</td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              cliente.activo
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {cliente.activo ? 'Activo' : 'Inactivo'}
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
          <td colSpan={8} className="bg-gray-50 px-4 py-5">
            <div className="space-y-5">
              {/* Info del cliente */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="h-4 w-4 text-gray-400" />
                  <span>
                    {CONDICION_IVA_LABEL[cliente.condicionIva]} — {TIPO_DOCUMENTO_LABEL[cliente.tipoDocumento]}{' '}
                    {formatDocumento()}
                  </span>
                </div>
                {cliente.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span>{cliente.email}</span>
                  </div>
                )}
                {cliente.telefono && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <span>{cliente.telefono}</span>
                  </div>
                )}
                {(cliente.direccion || cliente.localidad) && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span>
                      {[cliente.direccion, cliente.localidad, cliente.provincia]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <CreditCard className="h-4 w-4 text-gray-400" />
                  <span>
                    Límite de crédito:{' '}
                    {cliente.limiteCredito > 0
                      ? formatARS(cliente.limiteCredito)
                      : 'Sin límite'}
                  </span>
                </div>
              </div>

              {/* Estado de cuenta */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  Estado de cuenta
                </h3>

                {comprobantesPendientes.length === 0 ? (
                  <p className="text-sm text-gray-500">Sin comprobantes pendientes</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-gray-500">
                          <th className="px-3 py-2 font-medium">Comprobante</th>
                          <th className="px-3 py-2 font-medium">Tipo</th>
                          <th className="px-3 py-2 font-medium">Fecha</th>
                          <th className="px-3 py-2 text-right font-medium">Total</th>
                          <th className="px-3 py-2 text-right font-medium">Pendiente</th>
                          <th className="px-3 py-2 font-medium">Antigüedad</th>
                          <th className="px-3 py-2 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comprobantesPendientes.map((comp) => {
                          const dias = Math.abs(daysUntil(comp.fecha));
                          return (
                            <tr
                              key={comp.id}
                              className="border-b border-gray-50 last:border-0"
                            >
                              <td className="px-3 py-2 font-mono text-xs">
                                {formatNumero(PREFIJO_COMPROBANTE[comp.tipo], comp.numero)}
                              </td>
                              <td className="px-3 py-2 text-gray-600">
                                {labelTipoComprobante(comp.tipo, comp.modoEmision)}
                              </td>
                              <td className="px-3 py-2 text-gray-600">
                                {formatDate(comp.fecha)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Amount value={comp.total} />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Amount value={comp.saldoPendiente} />
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-xs text-amber-700">
                                  {dias} {dias === 1 ? 'día' : 'días'}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <EstadoComprobanteBadge estado={comp.estado} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Últimos movimientos (cobros) */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  Últimos movimientos
                </h3>

                {ultimosCobros.length === 0 ? (
                  <p className="text-sm text-gray-500">Sin cobros registrados</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-gray-500">
                          <th className="px-3 py-2 font-medium">N.° Cobro</th>
                          <th className="px-3 py-2 font-medium">Fecha</th>
                          <th className="px-3 py-2 font-medium">Medio de pago</th>
                          <th className="px-3 py-2 text-right font-medium">Monto</th>
                          <th className="px-3 py-2 font-medium">Imputaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ultimosCobros.map((cobro) => (
                          <tr
                            key={cobro.id}
                            className="border-b border-gray-50 last:border-0"
                          >
                            <td className="px-3 py-2 font-mono text-xs">
                              COB-{String(cobro.numero).padStart(5, '0')}
                            </td>
                            <td className="px-3 py-2 text-gray-600">
                              {formatDate(cobro.fecha)}
                            </td>
                            <td className="px-3 py-2">
                              <MedioPagoBadge medio={cobro.medioPago} />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Amount value={cobro.monto} />
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500">
                              {cobro.imputaciones.length}{' '}
                              {cobro.imputaciones.length === 1
                                ? 'comprobante'
                                : 'comprobantes'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Botones de acción */}
              <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Editar
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRegistrarCobro();
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  Registrar cobro
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleActivo();
                  }}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    cliente.activo
                      ? 'border-red-200 text-red-700 hover:bg-red-50'
                      : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <Power className="h-3.5 w-3.5" />
                  {cliente.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
