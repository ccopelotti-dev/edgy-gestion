// ============================================================
// Modulo Compras — Proveedores
// Edgy Gestion · ABM y gestion de proveedores
// ============================================================

import { useState, useMemo } from 'react';
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
} from 'lucide-react';

import {
  useProveedores,
  useComprobantesCompra,
  usePagos,
  useComprasDispatch,
} from '../data/store';
import {
  EstadoComprobanteBadge,
  MedioPagoBadge,
  Amount,
  EmptyState,
} from '../components/compras/display';
import { ProveedorDialog, PagoDialog } from '../components/compras/dialogs';
import {
  formatCuit,
  formatDate,
  formatARS,
  formatNumero,
  PREFIJO_COMPROBANTE_COMPRA,
  nowISO,
} from '../lib/format';
import type { Proveedor } from '../types';
import { CONDICION_IVA_PROV_LABEL, generarId } from '../types';

// ─── Componente principal ───────────────────────────────────

export default function Proveedores() {
  const proveedores = useProveedores();
  const comprobantes = useComprobantesCompra();
  const pagos = usePagos();
  const dispatch = useComprasDispatch();

  // ── Filtros ───────────────────────────────────────────────

  const [busqueda, setBusqueda] = useState('');
  const [soloActivos, setSoloActivos] = useState(true);

  // ── Estado de UI ──────────────────────────────────────────

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProveedor, setEditProveedor] = useState<Proveedor | null>(null);
  const [pagoDialogOpen, setPagoDialogOpen] = useState(false);
  const [pagoProveedorId, setPagoProveedorId] = useState<string | null>(null);

  // ── Datos filtrados ───────────────────────────────────────

  const proveedoresFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return proveedores.filter((p) => {
      if (soloActivos && !p.activo) return false;
      if (q) {
        const matchNombre = p.nombre.toLowerCase().includes(q);
        const matchCuit = p.cuit.includes(q);
        if (!matchNombre && !matchCuit) return false;
      }
      return true;
    });
  }, [proveedores, busqueda, soloActivos]);

  // ── Handlers ──────────────────────────────────────────────

  const handleNuevoProveedor = () => {
    setEditProveedor(null);
    setDialogOpen(true);
  };

  const handleEditarProveedor = (prov: Proveedor) => {
    setEditProveedor(prov);
    setDialogOpen(true);
  };

  const handleSaveProveedor = (data: Omit<Proveedor, 'id' | 'saldoCuentaCorriente' | 'activo' | 'createdAt' | 'updatedAt'>) => {
    const now = nowISO();
    if (editProveedor) {
      dispatch({
        type: 'UPDATE_PROVEEDOR',
        payload: { ...editProveedor, ...data, updatedAt: now },
      });
    } else {
      dispatch({
        type: 'ADD_PROVEEDOR',
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
  };

  const handleToggleActivo = (id: string) => {
    dispatch({ type: 'TOGGLE_PROVEEDOR_ACTIVO', payload: { id } });
  };

  const handleRegistrarPago = (proveedorId: string) => {
    setPagoProveedorId(proveedorId);
    setPagoDialogOpen(true);
  };

  const handleSavePago = (data: { fecha: string; monto: number; medioPago: string; imputaciones: { comprobanteId: string; montoImputado: number }[] }) => {
    if (!pagoProveedorId) return;
    dispatch({
      type: 'ADD_PAGO',
      payload: {
        id: generarId(),
        proveedorId: pagoProveedorId,
        fecha: data.fecha,
        monto: data.monto,
        medioPago: data.medioPago as any,
        imputaciones: data.imputaciones,
        createdAt: nowISO(),
      },
    });
  };

  // ── Helpers ───────────────────────────────────────────────

  const comprobantesPendientes = (proveedorId: string) =>
    comprobantes.filter(
      (c) => c.proveedorId === proveedorId && (c.estado === 'pendiente' || c.estado === 'pagado_parcial'),
    );

  const ultimosPagos = (proveedorId: string) =>
    pagos
      .filter((p) => p.proveedorId === proveedorId)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 5);

  const pagoProveedor = pagoProveedorId
    ? proveedores.find((p) => p.id === pagoProveedorId)
    : undefined;

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900"
              placeholder="Buscar por nombre o CUIT..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={soloActivos}
              onChange={(e) => setSoloActivos(e.target.checked)}
              className="rounded border-gray-300"
            />
            Solo activos
          </label>
        </div>
        <button
          onClick={handleNuevoProveedor}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo proveedor
        </button>
      </div>

      {/* Table */}
      {proveedoresFiltrados.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="No hay proveedores"
          description="Cree un proveedor para comenzar a registrar compras."
        />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium w-8" />
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">CUIT</th>
                <th className="px-4 py-3 font-medium">Cond. IVA</th>
                <th className="px-4 py-3 font-medium">Rubro</th>
                <th className="px-4 py-3 text-right font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {proveedoresFiltrados.map((prov) => {
                const isExpanded = expandedId === prov.id;
                const pendientes = comprobantesPendientes(prov.id);
                const ultPagos = ultimosPagos(prov.id);

                return (
                  <tbody key={prov.id}>
                    <tr
                      className="border-t border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : prov.id)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{prov.nombre}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{formatCuit(prov.cuit)}</td>
                      <td className="px-4 py-3 text-gray-600">{CONDICION_IVA_PROV_LABEL[prov.condicionIva]}</td>
                      <td className="px-4 py-3 text-gray-600">{prov.rubro ?? '—'}</td>
                      <td className="px-4 py-3 text-right"><Amount value={prov.saldoCuentaCorriente} /></td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${prov.activo ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {prov.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleEditarProveedor(prov)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Editar">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleRegistrarPago(prov.id)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Registrar pago">
                            <DollarSign className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleToggleActivo(prov.id)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title={prov.activo ? 'Desactivar' : 'Activar'}>
                            <Power className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-gray-50/50 px-8 py-4">
                          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            {/* Info de contacto */}
                            <div className="space-y-2 text-sm">
                              <h4 className="font-semibold text-gray-900">Datos de contacto</h4>
                              {prov.contacto && <p className="flex items-center gap-2 text-gray-600"><span className="font-medium">Contacto:</span> {prov.contacto}</p>}
                              {prov.email && <p className="flex items-center gap-2 text-gray-600"><Mail className="h-3.5 w-3.5" /> {prov.email}</p>}
                              {prov.telefono && <p className="flex items-center gap-2 text-gray-600"><Phone className="h-3.5 w-3.5" /> {prov.telefono}</p>}
                              {prov.direccion && <p className="flex items-center gap-2 text-gray-600"><MapPin className="h-3.5 w-3.5" /> {prov.direccion}{prov.localidad ? `, ${prov.localidad}` : ''}{prov.provincia ? `, ${prov.provincia}` : ''}</p>}
                              {prov.notas && <p className="text-gray-500 italic">{prov.notas}</p>}
                            </div>

                            {/* Comprobantes pendientes */}
                            <div>
                              <h4 className="font-semibold text-gray-900 text-sm mb-2">Comprobantes pendientes ({pendientes.length})</h4>
                              {pendientes.length === 0 ? (
                                <p className="text-sm text-gray-500">Sin comprobantes pendientes.</p>
                              ) : (
                                <div className="space-y-1">
                                  {pendientes.slice(0, 5).map((c) => (
                                    <div key={c.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm border border-gray-100">
                                      <span className="font-mono text-xs">{formatNumero(PREFIJO_COMPROBANTE_COMPRA[c.tipo], c.numero)}</span>
                                      <span className="text-gray-500">{formatDate(c.fecha)}</span>
                                      <EstadoComprobanteBadge estado={c.estado} />
                                      <Amount value={c.saldoPendiente} size="sm" />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Ultimos pagos */}
                          {ultPagos.length > 0 && (
                            <div className="mt-4">
                              <h4 className="font-semibold text-gray-900 text-sm mb-2">Ultimos pagos</h4>
                              <div className="space-y-1">
                                {ultPagos.map((p) => (
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
      <ProveedorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        proveedor={editProveedor ?? undefined}
        onSave={handleSaveProveedor}
      />

      {pagoProveedor && (
        <PagoDialog
          open={pagoDialogOpen}
          onOpenChange={setPagoDialogOpen}
          proveedor={pagoProveedor}
          comprobantesPendientes={comprobantesPendientes(pagoProveedor.id)}
          onSave={handleSavePago}
        />
      )}
    </div>
  );
}
