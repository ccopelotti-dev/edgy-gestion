// ============================================================
// Modulo Home Keep — Tarjetas de credito (Fase 70)
// Edgy Gestion · Resumen con detalle completo de consumos y cuotas,
// varias tarjetas en paralelo (a pedido de Carlos).
// ============================================================

import { Fragment, useState } from 'react';
import {
  Plus,
  Edit2,
  Power,
  ChevronDown,
  ChevronUp,
  CreditCard,
  DollarSign,
} from 'lucide-react';

import {
  useTarjetas,
  useResumenesTarjeta,
  useHomeKeepDispatch,
  encadenarCuotasTarjeta,
} from '../data/store';
import { TarjetaDialog, ResumenTarjetaDialog, PagarResumenDialog } from '../components/dialogs';
import { Amount, EmptyState } from '../components/display';
import { formatDate, nowISO } from '../lib/format';
import type { TarjetaCredito, ResumenTarjeta, ConsumoTarjeta, EstadoResumenTarjeta, MedioPago } from '../types';
import { ESTADO_RESUMEN_TARJETA_LABEL, generarId } from '../types';

const estadoResumenColor: Record<EstadoResumenTarjeta, string> = {
  pendiente: 'bg-amber-50 text-amber-700',
  pagado_parcial: 'bg-blue-50 text-blue-700',
  pagado: 'bg-green-50 text-green-700',
};

export default function TarjetasCredito() {
  const tarjetas = useTarjetas();
  const resumenesTarjeta = useResumenesTarjeta();
  const dispatch = useHomeKeepDispatch();

  const [tarjetaDialogOpen, setTarjetaDialogOpen] = useState(false);
  const [editTarjeta, setEditTarjeta] = useState<TarjetaCredito | null>(null);
  const [resumenDialogOpen, setResumenDialogOpen] = useState(false);
  const [resumenTarjeta, setResumenTarjeta] = useState<TarjetaCredito | null>(null);
  const [pagarResumen, setPagarResumen] = useState<ResumenTarjeta | null>(null);
  const [expandedResumenId, setExpandedResumenId] = useState<string | null>(null);

  // ── Tarjetas ──────────────────────────────────────────────

  const handleNuevaTarjeta = () => {
    setEditTarjeta(null);
    setTarjetaDialogOpen(true);
  };

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
    consumos: Omit<ConsumoTarjeta, 'id' | 'compraId'>[];
  }) => {
    const now = nowISO();
    const consumosConId: ConsumoTarjeta[] = data.consumos.map((c) => ({ ...c, id: generarId() }));
    // Encadena cuotas contra resúmenes anteriores de la misma tarjeta
    // (ver comentario en store.tsx) antes de persistir.
    const consumosEncadenados = encadenarCuotasTarjeta(data.tarjetaId, consumosConId, resumenesTarjeta);
    const total = consumosEncadenados.reduce((sum, c) => sum + c.monto, 0);
    dispatch({
      type: 'ADD_RESUMEN_TARJETA',
      payload: {
        id: generarId(),
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
        <button
          onClick={handleNuevaTarjeta}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva tarjeta
        </button>
      </div>

      {tarjetas.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-10 w-10" />}
          title="No hay tarjetas cargadas"
          description="Agregá una tarjeta para empezar a cargar sus resúmenes mensuales."
        />
      ) : (
        tarjetas.map((t) => {
          const resumenes = resumenesDe(t.id);
          return (
            <div key={t.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              {/* Header de tarjeta */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-4 w-4 text-gray-400" />
                  <div>
                    <span className="text-sm font-semibold text-gray-900">{t.nombre}</span>
                    {!t.activa && <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] text-gray-600">Inactiva</span>}
                    <div className="text-xs text-gray-500">
                      {t.banco && <span>{t.banco} · </span>}
                      {t.ultimosDigitos && <span>**** {t.ultimosDigitos} · </span>}
                      {t.diaCierre && <span>Cierre día {t.diaCierre} · </span>}
                      {t.diaVencimiento && <span>Vence día {t.diaVencimiento}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setResumenTarjeta(t);
                      setResumenDialogOpen(true);
                    }}
                    className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Nuevo resumen
                  </button>
                  <button onClick={() => handleEditarTarjeta(t)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Editar">
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleToggleActiva(t.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                    title={t.activa ? 'Desactivar' : 'Activar'}
                  >
                    <Power className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

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
                            onClick={() => setExpandedResumenId(isExpanded ? null : r.id)}
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
                                  onClick={() => setPagarResumen(r)}
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
        })
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
        onSave={handleSaveResumen}
      />

      <PagarResumenDialog
        open={pagarResumen !== null}
        onOpenChange={(open) => { if (!open) setPagarResumen(null); }}
        resumen={pagarResumen ?? undefined}
        onSave={handlePagarResumen}
      />
    </div>
  );
}
