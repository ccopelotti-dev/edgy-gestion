// ============================================================
// Modulo Home Keep — Ingresos (Fase 70)
// Edgy Gestion · De donde sale la plata: aporte de la Charcuteria
// (doble registro en su Tesoreria, ver data/store.tsx) e ingreso fijo
// de un familiar.
// ============================================================

import { useState } from 'react';
import { Plus, Trash2, Wallet, TrendingUp, TrendingDown } from 'lucide-react';

import { useIngresos, useSaldoHogar, useHomeKeepDispatch } from '../data/store';
import { IngresoDialog } from '../components/dialogs';
import { KpiCard, EmptyState, Amount } from '../components/display';
import { formatARS, formatDate, nowISO } from '../lib/format';
import type { Ingreso } from '../types';
import { TIPO_INGRESO_LABEL, generarId } from '../types';

export default function Ingresos() {
  const ingresos = useIngresos();
  const saldo = useSaldoHogar();
  const dispatch = useHomeKeepDispatch();

  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSave = (data: {
    fecha: string;
    tipo: Ingreso['tipo'];
    origen: string;
    concepto: string;
    monto: number;
    medioPago?: Ingreso['medioPago'];
    recurrente: boolean;
    diaMesRecurrente?: number;
    notas: string;
  }) => {
    const now = nowISO();
    dispatch({
      type: 'ADD_INGRESO',
      payload: {
        id: generarId(),
        fecha: data.fecha,
        tipo: data.tipo,
        origen: data.origen || undefined,
        concepto: data.concepto || undefined,
        monto: data.monto,
        medioPago: data.medioPago,
        recurrente: data.recurrente,
        diaMesRecurrente: data.diaMesRecurrente,
        notas: data.notas || undefined,
        createdAt: now,
        updatedAt: now,
      },
    });
  };

  const handleDelete = (id: string) => {
    dispatch({ type: 'DELETE_INGRESO', payload: { id } });
  };

  const ingresosOrdenados = [...ingresos].sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard title="Saldo disponible" value={formatARS(saldo.saldoDisponible)} icon={<Wallet className="h-4 w-4" />} />
        <KpiCard title="Total ingresado" value={formatARS(saldo.totalIngresos)} icon={<TrendingUp className="h-4 w-4" />} />
        <KpiCard title="Total gastado" value={formatARS(saldo.totalEgresos)} icon={<TrendingDown className="h-4 w-4" />} />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Ingresos</h2>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo ingreso
        </button>
      </div>

      {/* Tabla */}
      {ingresosOrdenados.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-10 w-10" />}
          title="Todavía no hay ingresos cargados"
          description="Registrá el aporte de la Charcutería o un ingreso fijo familiar para empezar a ver el saldo disponible del hogar."
        />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto scroll-shadow-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium whitespace-nowrap">Fecha</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Tipo</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Origen</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Concepto</th>
                <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Monto</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Recurrente</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ingresosOrdenados.map((i) => (
                <tr key={i.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatDate(i.fecha)}</td>
                  <td className="px-4 py-3 text-xs text-gray-900 whitespace-nowrap">{TIPO_INGRESO_LABEL[i.tipo]}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{i.origen ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{i.concepto ?? '—'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap"><Amount value={i.monto} size="xs" /></td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {i.recurrente ? `Día ${i.diaMesRecurrente ?? '—'} de cada mes` : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      onClick={() => handleDelete(i.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <IngresoDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
    </div>
  );
}
