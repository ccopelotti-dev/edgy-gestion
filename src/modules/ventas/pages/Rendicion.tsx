// ============================================================
// Módulo Ventas — Rendición de cadete (Fase 23c)
//
// Cierra el circuito de "cobro contra entrega" abierto en Fase 23b: un
// pedido de reparto propio puede quedar marcado `cobraContraEntrega`
// (el cadete cobra en efectivo al entregar). Esta pantalla lista, por
// cadete, todos los pedidos ya entregados con una factura todavía sin
// cobrar, deja elegir cuáles rinde y cuánto efectivo entregó, y al
// confirmar genera un Cobro (efectivo) imputado a cada factura -- el
// mismo motor de Cobro/Imputación que ya usan Cobranzas y Fase 23a.
//
// No hace falta ningún campo "rendido" nuevo: apenas el Cobro salda la
// factura (saldoPendiente -> 0, ver ADD_COBRO en data/store.tsx), el
// pedido deja de cumplir el filtro de abajo y desaparece solo de la
// lista de pendientes -- cero modelo nuevo, mismo criterio que 23a.
// ============================================================

import { useState, useMemo } from 'react';
import { Bike, Banknote } from 'lucide-react';

import { useVentas, useVentasDispatch } from '../data/store';
import { RendicionDialog } from '../components/ventas/dialogs';
import { EmptyState, KpiCard } from '../components/ventas/display';
import { formatARS, formatDate, formatNumero, todayISO, nowISO } from '../lib/format';
import { generarId } from '../types';

interface OrdenPendiente {
  ordenId: string;
  numeroOrden: number;
  clienteId: string;
  clienteNombre: string;
  comprobanteId: string;
  numeroComprobante: number;
  fecha: string;
  saldoPendiente: number;
}

interface GrupoCadete {
  cadeteNombre: string;
  ordenes: OrdenPendiente[];
}

export default function Rendicion() {
  const { ordenes, comprobantes, clientes } = useVentas();
  const dispatch = useVentasDispatch();

  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({});
  const [dialogCadeteId, setDialogCadeteId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const clienteMap = useMemo(() => {
    const m = new Map<string, string>();
    clientes.forEach((c) => m.set(c.id, c.nombre));
    return m;
  }, [clientes]);

  const pendientesPorCadete = useMemo(() => {
    const grupos = new Map<string, GrupoCadete>();
    for (const o of ordenes) {
      if (!o.cobraContraEntrega || o.estadoLogistica !== 'entregado' || !o.cadeteId) continue;
      const factura = comprobantes.find(
        (c) =>
          o.comprobanteIds.includes(c.id) &&
          c.tipo === 'factura' &&
          c.estado !== 'anulado' &&
          c.saldoPendiente > 0.01,
      );
      if (!factura) continue;

      const grupo = grupos.get(o.cadeteId) ?? { cadeteNombre: o.cadeteNombre ?? 'Sin nombre', ordenes: [] };
      grupo.ordenes.push({
        ordenId: o.id,
        numeroOrden: o.numero,
        clienteId: factura.clienteId,
        clienteNombre: clienteMap.get(factura.clienteId) ?? 'Consumidor Final',
        comprobanteId: factura.id,
        numeroComprobante: factura.numero,
        fecha: factura.fecha,
        saldoPendiente: factura.saldoPendiente,
      });
      grupos.set(o.cadeteId, grupo);
    }
    return grupos;
  }, [ordenes, comprobantes, clienteMap]);

  const totalPendiente = useMemo(() => {
    let total = 0;
    for (const grupo of pendientesPorCadete.values()) {
      total += grupo.ordenes.reduce((s, o) => s + o.saldoPendiente, 0);
    }
    return total;
  }, [pendientesPorCadete]);

  function toggleOrden(ordenId: string) {
    setSeleccion((prev) => ({ ...prev, [ordenId]: !prev[ordenId] }));
  }

  function abrirRendicion(cadeteId: string) {
    setDialogCadeteId(cadeteId);
    setDialogOpen(true);
  }

  function handleConfirmarRendicion(data: { montoDeclarado: number; notas?: string }) {
    if (!dialogCadeteId) return;
    const grupo = pendientesPorCadete.get(dialogCadeteId);
    if (!grupo) return;
    const seleccionadas = grupo.ordenes.filter((o) => seleccion[o.ordenId]);
    if (seleccionadas.length === 0) return;

    const montoEsperado = seleccionadas.reduce((s, o) => s + o.saldoPendiente, 0);
    const diferencia = Math.round((data.montoDeclarado - montoEsperado) * 100) / 100;
    const notaDiferencia =
      Math.abs(diferencia) > 0.01
        ? ` Diferencia de arqueo: ${diferencia > 0 ? '+' : ''}${formatARS(diferencia)} (esperado ${formatARS(montoEsperado)}, entregado ${formatARS(data.montoDeclarado)}).`
        : '';

    // Un Cobro tiene un único clienteId -- si el cadete rindió pedidos de
    // varios clientes distintos en la misma tanda, se genera un Cobro por
    // cada cliente, imputado solo a las facturas de ESE cliente.
    const porCliente = new Map<string, OrdenPendiente[]>();
    for (const o of seleccionadas) {
      const arr = porCliente.get(o.clienteId) ?? [];
      arr.push(o);
      porCliente.set(o.clienteId, arr);
    }

    for (const [clienteId, ords] of porCliente) {
      dispatch({
        type: 'ADD_COBRO',
        payload: {
          id: generarId(),
          clienteId,
          fecha: todayISO(),
          monto: ords.reduce((s, o) => s + o.saldoPendiente, 0),
          medioPago: 'efectivo',
          imputaciones: ords.map((o) => ({ comprobanteId: o.comprobanteId, montoImputado: o.saldoPendiente })),
          notas: `Rendición de cadete (${grupo.cadeteNombre}).${notaDiferencia}${data.notas ? ' ' + data.notas : ''}`,
          createdAt: nowISO(),
        },
      });
    }

    setSeleccion((prev) => {
      const next = { ...prev };
      for (const o of seleccionadas) delete next[o.ordenId];
      return next;
    });
    setDialogOpen(false);
    setDialogCadeteId(null);
  }

  const gruposArray = Array.from(pendientesPorCadete.entries());
  const dialogGrupo = dialogCadeteId ? pendientesPorCadete.get(dialogCadeteId) : undefined;
  const dialogOrdenesSeleccionadas = (dialogGrupo?.ordenes ?? []).filter((o) => seleccion[o.ordenId]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard
          title="Pendiente de rendición"
          value={formatARS(totalPendiente)}
          icon={<Banknote className="w-5 h-5 text-amber-600" />}
        />
        <KpiCard
          title="Cadetes con pendientes"
          value={gruposArray.length}
          icon={<Bike className="w-5 h-5 text-gray-500" />}
        />
      </div>

      {gruposArray.length === 0 ? (
        <EmptyState
          icon={<Bike className="w-10 h-10" />}
          title="Sin rendiciones pendientes"
          description="Cuando un pedido de reparto propio quede marcado 'cobra contra entrega' y se entregue, va a aparecer acá para que el cadete rinda el efectivo."
        />
      ) : (
        <div className="space-y-4">
          {gruposArray.map(([cadeteId, grupo]) => {
            const seleccionadas = grupo.ordenes.filter((o) => seleccion[o.ordenId]);
            const totalSeleccionado = seleccionadas.reduce((s, o) => s + o.saldoPendiente, 0);
            const totalGrupo = grupo.ordenes.reduce((s, o) => s + o.saldoPendiente, 0);
            return (
              <div key={cadeteId} className="rounded-xl border overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-gray-50 border-b">
                  <div className="flex items-center gap-2">
                    <Bike className="w-4 h-4 text-gray-500" />
                    <span className="font-semibold text-sm text-gray-900">{grupo.cadeteNombre}</span>
                    <span className="text-xs text-gray-500">
                      {grupo.ordenes.length} pedido(s) pendiente(s) — {formatARS(totalGrupo)}
                    </span>
                  </div>
                  <button
                    disabled={seleccionadas.length === 0}
                    onClick={() => abrirRendicion(cadeteId)}
                    className="text-xs bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Rendir seleccionados ({formatARS(totalSeleccionado)})
                  </button>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-white text-left text-gray-500">
                    <tr>
                      <th className="px-4 py-2 w-8"></th>
                      <th className="px-4 py-2 font-medium">Pedido</th>
                      <th className="px-4 py-2 font-medium">Cliente</th>
                      <th className="px-4 py-2 font-medium">Factura</th>
                      <th className="px-4 py-2 font-medium">Fecha</th>
                      <th className="px-4 py-2 font-medium text-right">A cobrar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {grupo.ordenes.map((o) => (
                      <tr key={o.ordenId} className="hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={!!seleccion[o.ordenId]}
                            onChange={() => toggleOrden(o.ordenId)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        </td>
                        <td className="px-4 py-2 font-mono">#{o.numeroOrden}</td>
                        <td className="px-4 py-2">{o.clienteNombre}</td>
                        <td className="px-4 py-2 font-mono">{formatNumero('FAC', o.numeroComprobante)}</td>
                        <td className="px-4 py-2">{formatDate(o.fecha)}</td>
                        <td className="px-4 py-2 text-right font-semibold">{formatARS(o.saldoPendiente)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {dialogGrupo && (
        <RendicionDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setDialogCadeteId(null);
          }}
          cadeteNombre={dialogGrupo.cadeteNombre}
          ordenes={dialogOrdenesSeleccionadas}
          onConfirmar={handleConfirmarRendicion}
        />
      )}
    </div>
  );
}
