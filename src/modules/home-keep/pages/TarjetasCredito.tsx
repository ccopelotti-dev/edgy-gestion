// ============================================================
// Modulo Home Keep — Tarjetas de credito (Fase 70, ampliado Fase 72)
// Edgy Gestion · Resumen con detalle completo de consumos y cuotas,
// varias tarjetas en paralelo (a pedido de Carlos). Fase 72 suma cupo
// disponible en tiempo real, consumos "abiertos" del día a día, curva
// de gasto acumulado del mes y reintegros por promoción.
// ============================================================

import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Edit2,
  Power,
  ChevronDown,
  ChevronUp,
  CreditCard,
  DollarSign,
  Receipt,
  Trash2,
  BadgePercent,
  UserCircle2,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

import {
  useTarjetas,
  useResumenesTarjeta,
  useConsumosAbiertos,
  useCupoDisponible,
  useGastoAcumuladoAbierto,
  useHomeKeepDispatch,
  encadenarCuotasTarjeta,
} from '../data/store';
import { TarjetaDialog, ResumenTarjetaDialog, PagarResumenDialog, RegistrarConsumoDialog } from '../components/dialogs';
import { Amount, EmptyState, CupoDisponibleBar } from '../components/display';
import { formatARS, formatDate, formatDateShort, nowISO } from '../lib/format';
import { supabase } from '@/lib/supabase';
import { useClienteActual } from '@/hooks/useClienteActual';
import type { TarjetaCredito, ResumenTarjeta, ConsumoTarjeta, EstadoResumenTarjeta, MedioPago } from '../types';
import { ESTADO_RESUMEN_TARJETA_LABEL, generarId } from '../types';

const estadoResumenColor: Record<EstadoResumenTarjeta, string> = {
  pendiente: 'bg-amber-50 text-amber-700',
  pagado_parcial: 'bg-blue-50 text-blue-700',
  pagado: 'bg-green-50 text-green-700',
};

// ─── TarjetaCard (Fase 72) ──────────────────────────────────
// Se extrajo del .map() principal porque necesita sus propios hooks
// (cupo disponible, consumos abiertos, curva de gasto) -- las reglas de
// hooks no permiten llamarlos dentro de un callback de map.

interface TarjetaCardProps {
  tarjeta: TarjetaCredito;
  titularNombre?: string;
  resumenes: ResumenTarjeta[];
  expandedResumenId: string | null;
  onToggleExpand: (id: string) => void;
  onNuevoResumen: (t: TarjetaCredito) => void;
  onEditar: (t: TarjetaCredito) => void;
  onToggleActiva: (id: string) => void;
  onPagar: (r: ResumenTarjeta) => void;
  onRegistrarConsumo: (t: TarjetaCredito) => void;
  onEliminarConsumoAbierto: (id: string) => void;
}

function TarjetaCard({
  tarjeta: t,
  titularNombre,
  resumenes,
  expandedResumenId,
  onToggleExpand,
  onNuevoResumen,
  onEditar,
  onToggleActiva,
  onPagar,
  onRegistrarConsumo,
  onEliminarConsumoAbierto,
}: TarjetaCardProps) {
  const cupo = useCupoDisponible(t.id);
  const consumosAbiertos = useConsumosAbiertos(t.id);
  const curva = useGastoAcumuladoAbierto(t.id);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header de tarjeta */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <CreditCard className="h-4 w-4 text-gray-400" />
          <div>
            <span className="text-sm font-semibold text-gray-900">{t.nombre}</span>
            {!t.activa && <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] text-gray-600">Inactiva</span>}
            <div className="text-xs text-gray-500">
              {titularNombre && (
                <span className="inline-flex items-center gap-0.5">
                  <UserCircle2 className="h-3 w-3" /> {titularNombre} ·{' '}
                </span>
              )}
              {t.banco && <span>{t.banco} · </span>}
              {t.ultimosDigitos && <span>**** {t.ultimosDigitos} · </span>}
              {t.diaCierre && <span>Cierre día {t.diaCierre} · </span>}
              {t.diaVencimiento && <span>Vence día {t.diaVencimiento}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onRegistrarConsumo(t)}
            className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Receipt className="h-3.5 w-3.5" /> Registrar consumo
          </button>
          <button
            onClick={() => onNuevoResumen(t)}
            className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo resumen
          </button>
          <button onClick={() => onEditar(t)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Editar">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onToggleActiva(t.id)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            title={t.activa ? 'Desactivar' : 'Activar'}
          >
            <Power className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Fase 72: cupo disponible -- solo tiene sentido si la tarjeta tiene límite cargado. */}
      {cupo.limite != null && (
        <div className="px-4 py-3 border-b border-gray-100">
          <CupoDisponibleBar limite={cupo.limite} deudaFacturada={cupo.deudaFacturada} consumidoAbierto={cupo.consumidoAbierto} />
        </div>
      )}

      {/* Fase 72: curva de gasto acumulado del período abierto. */}
      {curva.length > 1 && (
        <div className="px-4 pt-3 pb-1 border-b border-gray-100">
          <p className="mb-1 text-xs font-medium text-gray-500">Gasto acumulado del período en curso</p>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curva} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="fecha" tickFormatter={formatDateShort} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tickFormatter={(v: number) => formatARS(v)} width={70} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <Tooltip
                  formatter={(value: number) => formatARS(value)}
                  labelFormatter={(label: string) => formatDate(label)}
                />
                <Line type="monotone" dataKey="acumulado" stroke="#4f46e5" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Fase 72: consumos abiertos (día a día, sin resumen todavía). */}
      {consumosAbiertos.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100 space-y-1.5">
          <p className="text-xs font-medium text-gray-500">Consumos sin facturar todavía</p>
          {consumosAbiertos.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg bg-amber-50/60 px-3 py-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-900">{c.descripcion}</span>
                <span className="text-xs text-gray-500">{c.fechaConsumo ? formatDate(c.fechaConsumo) : '—'}</span>
                {c.cuotasTotales > 1 && (
                  <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                    Cuota {c.cuotaActual}/{c.cuotasTotales}
                  </span>
                )}
                {!!c.reintegroMonto && (
                  <span className="flex items-center gap-0.5 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">
                    <BadgePercent className="h-3 w-3" /> Reintegro {formatARS(c.reintegroMonto)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Amount value={c.monto} size="sm" />
                <button
                  onClick={() => onEliminarConsumoAbierto(c.id)}
                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resúmenes */}
      {resumenes.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">Todavía no hay resúmenes cargados para esta tarjeta.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="px-4 py-2 font-medium w-8" />
              <th className="px-4 py-2 font-medium whitespace-nowrap">Período</th>
              <th className="px-4 py-2 font-medium whitespace-nowrap">Vencimiento</th>
              <th className="px-4 py-2 text-right font-medium whitespace-nowrap">Total</th>
              <th className="px-4 py-2 text-right font-medium whitespace-nowrap">Saldo</th>
              <th className="px-4 py-2 font-medium whitespace-nowrap">Estado</th>
              <th className="px-4 py-2 font-medium whitespace-nowrap">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {resumenes.map((r) => {
              const isExpanded = expandedResumenId === r.id;
              return (
                <Fragment key={r.id}>
                  <tr
                    className="border-t border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                    onClick={() => onToggleExpand(r.id)}
                  >
                    <td className="px-4 py-3 text-gray-400">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-900 whitespace-nowrap">{r.periodo}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{r.fechaVencimiento ? formatDate(r.fechaVencimiento) : '—'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap"><Amount value={r.total} size="xs" /></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap"><Amount value={r.saldoPendiente} size="xs" /></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${estadoResumenColor[r.estado]}`}>
                        {ESTADO_RESUMEN_TARJETA_LABEL[r.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {r.estado !== 'pagado' && (
                        <button
                          onClick={() => onPagar(r)}
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
                          title="Pagar"
                        >
                          <DollarSign className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="bg-gray-50/50 px-8 py-3">
                        <div className="space-y-1">
                          {r.consumos.map((c) => (
                            <div key={c.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm border border-gray-100">
                              <span className="text-gray-900">{c.descripcion}</span>
                              <span className="text-gray-500">{c.fechaConsumo ? formatDate(c.fechaConsumo) : '—'}</span>
                              {c.cuotasTotales > 1 && (
                                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                                  Cuota {c.cuotaActual}/{c.cuotasTotales}
                                </span>
                              )}
                              {!!c.reintegroMonto && (
                                <span className="flex items-center gap-0.5 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">
                                  <BadgePercent className="h-3 w-3" /> Reintegro {formatARS(c.reintegroMonto)}
                                </span>
                              )}
                              <Amount value={c.monto} size="sm" />
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function TarjetasCredito() {
  const tarjetas = useTarjetas();
  const resumenesTarjeta = useResumenesTarjeta();
  const dispatch = useHomeKeepDispatch();
  const { cliente } = useClienteActual();

  // Fase 72c: el alta de tarjeta pasó a la ficha del titular en Perfil
  // Familiar -- acá solo se muestra de quién es cada una (lectura).
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string }[]>([]);
  useEffect(() => {
    if (!cliente) return;
    supabase
      .from('usuarios_cliente')
      .select('id, nombre, email')
      .eq('cliente_id', cliente.id)
      .then(({ data }) => {
        setUsuarios((data ?? []).map((u: any) => ({ id: u.id, nombre: u.nombre || u.email || 'Sin nombre' })));
      });
  }, [cliente]);
  const nombreTitular = (usuarioClienteId?: string) =>
    usuarioClienteId ? usuarios.find((u) => u.id === usuarioClienteId)?.nombre : undefined;

  const [tarjetaDialogOpen, setTarjetaDialogOpen] = useState(false);
  const [editTarjeta, setEditTarjeta] = useState<TarjetaCredito | null>(null);
  const [resumenDialogOpen, setResumenDialogOpen] = useState(false);
  const [resumenTarjeta, setResumenTarjeta] = useState<TarjetaCredito | null>(null);
  const [pagarResumen, setPagarResumen] = useState<ResumenTarjeta | null>(null);
  const [expandedResumenId, setExpandedResumenId] = useState<string | null>(null);
  // Fase 72: tarjeta para la que está abierto "Registrar consumo".
  const [consumoDialogOpen, setConsumoDialogOpen] = useState(false);
  const [consumoTarjeta, setConsumoTarjeta] = useState<TarjetaCredito | null>(null);

  // Consumos abiertos de la tarjeta sobre la que se está por cargar un
  // resumen -- se prellenan en el diálogo (ver más abajo).
  const consumosAbiertosDeResumenTarjeta = useConsumosAbiertos(resumenTarjeta?.id);

  // ── Tarjetas ──────────────────────────────────────────────

  const handleEditarTarjeta = (t: TarjetaCredito) => {
    setEditTarjeta(t);
    setTarjetaDialogOpen(true);
  };

  const handleSaveTarjeta = (data: Omit<TarjetaCredito, 'id' | 'activa' | 'createdAt' | 'updatedAt'>) => {
    const now = nowISO();
    if (editTarjeta) {
      dispatch({ type: 'UPDATE_TARJETA', payload: { ...editTarjeta, ...data, updatedAt: now } });
    } else {
      dispatch({ type: 'ADD_TARJETA', payload: { ...data, id: generarId(), activa: true, createdAt: now, updatedAt: now } });
    }
  };

  const handleToggleActiva = (id: string) => {
    dispatch({ type: 'TOGGLE_TARJETA_ACTIVA', payload: { id } });
  };

  // ── Resúmenes ─────────────────────────────────────────────

  const handleSaveResumen = (data: {
    tarjetaId: string;
    periodo: string;
    fechaCierre: string;
    fechaVencimiento: string;
    pagoMinimo?: number;
    notas: string;
    consumos: Omit<ConsumoTarjeta, 'compraId' | 'tarjetaId' | 'resumenId'>[];
  }) => {
    const now = nowISO();
    const resumenId = generarId();
    // Fase 72: cada fila ya trae su id (propio si es nuevo, o heredado de
    // un consumo abierto si venía prellenado -- ver ResumenTarjetaDialog)
    // -- acá solo se completan tarjetaId/resumenId, nunca se regenera el id.
    const consumosConId: ConsumoTarjeta[] = data.consumos.map((c) => ({
      ...c,
      tarjetaId: data.tarjetaId,
      resumenId,
    }));
    // Encadena cuotas contra resúmenes anteriores de la misma tarjeta
    // (ver comentario en store.tsx) antes de persistir.
    const consumosEncadenados = encadenarCuotasTarjeta(data.tarjetaId, consumosConId, resumenesTarjeta);
    const total = consumosEncadenados.reduce((sum, c) => sum + c.monto, 0);
    dispatch({
      type: 'ADD_RESUMEN_TARJETA',
      payload: {
        id: resumenId,
        tarjetaId: data.tarjetaId,
        periodo: data.periodo,
        fechaCierre: data.fechaCierre,
        fechaVencimiento: data.fechaVencimiento,
        total,
        pagoMinimo: data.pagoMinimo,
        estado: 'pendiente',
        montoPagado: 0,
        saldoPendiente: total,
        consumos: consumosEncadenados,
        notas: data.notas || undefined,
        createdAt: now,
        updatedAt: now,
      },
    });
  };

  const handleRegistrarConsumo = (data: {
    descripcion: string;
    fechaConsumo: string;
    monto: number;
    cuotaActual: number;
    cuotasTotales: number;
    reintegroConcepto?: string;
    reintegroMonto?: number;
  }) => {
    if (!consumoTarjeta) return;
    dispatch({
      type: 'ADD_CONSUMO_ABIERTO',
      payload: {
        id: generarId(),
        tarjetaId: consumoTarjeta.id,
        descripcion: data.descripcion,
        fechaConsumo: data.fechaConsumo,
        monto: data.monto,
        cuotaActual: data.cuotaActual,
        cuotasTotales: data.cuotasTotales,
        reintegroConcepto: data.reintegroConcepto,
        reintegroMonto: data.reintegroMonto,
      },
    });
  };

  const handleEliminarConsumoAbierto = (id: string) => {
    dispatch({ type: 'DELETE_CONSUMO_ABIERTO', payload: { id } });
  };

  const handlePagarResumen = (data: { monto: number; fecha: string; medioPago: MedioPago }) => {
    if (!pagarResumen) return;
    dispatch({
      type: 'PAGAR_RESUMEN_TARJETA',
      payload: { resumenId: pagarResumen.id, monto: data.monto, fecha: data.fecha, medioPago: data.medioPago },
    });
  };

  const resumenesDe = (tarjetaId: string) =>
    resumenesTarjeta.filter((r) => r.tarjetaId === tarjetaId).sort((a, b) => b.periodo.localeCompare(a.periodo));

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Tarjetas de crédito</h2>
        {/* Fase 72c: el alta de una tarjeta se hace desde la ficha del
            titular en Perfil Familiar -- este botón quedó como atajo. */}
        <Link
          to="/perfil-familiar"
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Agregar tarjeta en Perfil Familiar
        </Link>
      </div>

      {tarjetas.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-10 w-10" />}
          title="No hay tarjetas cargadas"
          description="Agregá una tarjeta para empezar a cargar sus resúmenes mensuales."
        />
      ) : (
        tarjetas.map((t) => (
          <TarjetaCard
            key={t.id}
            tarjeta={t}
            titularNombre={nombreTitular(t.usuarioClienteId)}
            resumenes={resumenesDe(t.id)}
            expandedResumenId={expandedResumenId}
            onToggleExpand={(id) => setExpandedResumenId((prev) => (prev === id ? null : id))}
            onNuevoResumen={(t) => {
              setResumenTarjeta(t);
              setResumenDialogOpen(true);
            }}
            onEditar={handleEditarTarjeta}
            onToggleActiva={handleToggleActiva}
            onPagar={setPagarResumen}
            onRegistrarConsumo={(t) => {
              setConsumoTarjeta(t);
              setConsumoDialogOpen(true);
            }}
            onEliminarConsumoAbierto={handleEliminarConsumoAbierto}
          />
        ))
      )}

      {/* Dialogs */}
      <TarjetaDialog
        open={tarjetaDialogOpen}
        onOpenChange={setTarjetaDialogOpen}
        tarjeta={editTarjeta ?? undefined}
        onSave={handleSaveTarjeta}
      />

      <ResumenTarjetaDialog
        open={resumenDialogOpen}
        onOpenChange={setResumenDialogOpen}
        tarjetas={resumenTarjeta ? [resumenTarjeta] : tarjetas}
        consumosAbiertos={consumosAbiertosDeResumenTarjeta}
        onSave={handleSaveResumen}
      />

      <PagarResumenDialog
        open={pagarResumen !== null}
        onOpenChange={(open) => { if (!open) setPagarResumen(null); }}
        resumen={pagarResumen ?? undefined}
        onSave={handlePagarResumen}
      />

      <RegistrarConsumoDialog
        open={consumoDialogOpen}
        onOpenChange={setConsumoDialogOpen}
        tarjetaNombre={consumoTarjeta?.nombre}
        onSave={handleRegistrarConsumo}
      />
    </div>
  );
}
