// ============================================================
// Fase 26 · Modo Mostrador — Gráfico de evolución
// Edgy Gestión
// ============================================================
//
// Gráfico de líneas cruzadas (Ventas / Compras / Caja / Cta. cte.),
// parametrizable por Día/Semana/Mes, debajo de los botones grandes de
// Modo Mostrador. Sin librería de gráficos instalada en el proyecto
// (no hay chart.js/recharts/d3 en package.json), así que es un SVG
// liviano hecho a mano -- mismo criterio "artesanal" que ya se usaba
// en el bloque de flujo de fondos que se sacó de DashboardAdministrativo.
//
// Las 4 líneas son todas MOVIMIENTO DEL PERÍODO (no saldos acumulados),
// para que tengan una escala comparable y realmente "se crucen":
//   - Ventas: total facturado (no anulado) con fecha en el bucket.
//   - Compras: total de comprobantes de compra (no anulados) del bucket.
//   - Caja: neto de movimientos en efectivo (ingreso - egreso) del bucket
//     -- mismo criterio que useResumenDashboard/Tesorería.
//   - Cta. cte.: cuánto AUMENTÓ la deuda de clientes en el bucket, neto
//     (ventas facturadas a cuenta corriente del bucket) menos (cobros del
//     bucket). Es el movimiento neto de cuentas por cobrar, no el saldo
//     total acumulado -- un saldo acumulado solo puede crecer con el
//     tiempo y termina aplastando a las otras 3 líneas en la escala.
//
// Ventas/Compras/Cobros ya están 100% cargados en memoria (VentasProvider/
// ComprasProvider que envuelven Modo Mostrador traen el historial completo),
// así que se bucketea todo client-side sin pedir nada nuevo. Lo único que
// no vive en ningún Context de acá es Caja (Tesorería no está montada en
// esta pantalla), así que se pide con una consulta liviana aparte, una
// sola vez (6 meses de historial alcanzan para los 3 períodos), igual que
// ya se hace acá mismo para "Turno de caja".

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Comprobante, Cobro } from '@/modules/ventas/types';
import type { ComprobanteCompra } from '@/modules/compras/types';
import { formatARS } from '@/modules/ventas/lib/format';

type Periodo = 'dia' | 'semana' | 'mes';

interface Props {
  clienteId: string | undefined;
  comprobantesVenta: Comprobante[];
  cobros: Cobro[];
  comprobantesCompra: ComprobanteCompra[];
}

interface MovimientoCaja {
  fecha: string;
  monto: number;
  tipo: 'ingreso' | 'egreso';
}

interface Bucket {
  desde: string;
  hasta: string;
  label: string;
}

// OJO: mismo criterio que useResumenDashboard.ts -- nunca toISOString()
// para fechas "de hoy"/buckets, da la fecha en UTC y en Argentina (UTC-3)
// después de las 21 hs ya rompe. Se arma siempre desde los componentes
// locales del Date.
function fechaLocalISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function generarBuckets(periodo: Periodo, hoy: Date): Bucket[] {
  const buckets: Bucket[] = [];

  if (periodo === 'dia') {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(hoy);
      d.setDate(d.getDate() - i);
      const iso = fechaLocalISO(d);
      buckets.push({ desde: iso, hasta: iso, label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` });
    }
  } else if (periodo === 'semana') {
    for (let i = 7; i >= 0; i--) {
      const ref = new Date(hoy);
      ref.setDate(ref.getDate() - i * 7);
      const diaSemana = ref.getDay(); // 0=domingo..6=sábado
      const offsetALunes = diaSemana === 0 ? 6 : diaSemana - 1;
      const inicio = new Date(ref);
      inicio.setDate(inicio.getDate() - offsetALunes);
      const fin = new Date(inicio);
      fin.setDate(fin.getDate() + 6);
      buckets.push({
        desde: fechaLocalISO(inicio),
        hasta: fechaLocalISO(fin),
        label: `${String(inicio.getDate()).padStart(2, '0')}/${String(inicio.getMonth() + 1).padStart(2, '0')}`,
      });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const fin = new Date(hoy.getFullYear(), hoy.getMonth() - i + 1, 0);
      buckets.push({
        desde: fechaLocalISO(inicio),
        hasta: fechaLocalISO(fin),
        label: inicio.toLocaleDateString('es-AR', { month: 'short' }).replace('.', ''),
      });
    }
  }

  return buckets;
}

const SERIES = [
  { key: 'ventas', label: 'Ventas', color: '#4f46e5' },
  { key: 'compras', label: 'Compras', color: '#ea580c' },
  { key: 'caja', label: 'Caja', color: '#059669' },
  { key: 'ctaCte', label: 'Cta. cte.', color: '#7c3aed' },
] as const;

export function EvolucionMostrador({ clienteId, comprobantesVenta, cobros, comprobantesCompra }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('dia');
  const [movimientosCaja, setMovimientosCaja] = useState<MovimientoCaja[]>([]);
  const [cargandoCaja, setCargandoCaja] = useState(true);

  // Un solo fetch de 6 meses de Caja, alcanza para los 3 períodos --
  // el bucketeo por Día/Semana/Mes se recalcula client-side sin volver
  // a pedir nada.
  useEffect(() => {
    if (!clienteId) return;
    let activo = true;
    const desde = new Date();
    desde.setMonth(desde.getMonth() - 6);
    supabase
      .from('movimientos_caja')
      .select('fecha, monto, tipo, medio_pago')
      .eq('cliente_id', clienteId)
      .eq('medio_pago', 'efectivo')
      .gte('fecha', fechaLocalISO(desde))
      .then(({ data }) => {
        if (!activo) return;
        setMovimientosCaja(
          ((data ?? []) as any[]).map((m) => ({ fecha: m.fecha, monto: Number(m.monto), tipo: m.tipo })),
        );
        setCargandoCaja(false);
      });
    return () => {
      activo = false;
    };
  }, [clienteId]);

  const buckets = useMemo(() => generarBuckets(periodo, new Date()), [periodo]);

  const serieValores = useMemo(() => {
    return buckets.map((b) => {
      const enRango = (fecha: string) => fecha >= b.desde && fecha <= b.hasta;

      const ventas = comprobantesVenta
        .filter((c) => c.tipo === 'factura' && c.estado !== 'anulado' && enRango(c.fecha))
        .reduce((s, c) => s + c.total, 0);

      const compras = comprobantesCompra
        .filter((c) => c.tipo === 'factura' && c.estado !== 'anulado' && enRango(c.fecha))
        .reduce((s, c) => s + c.total, 0);

      const caja = movimientosCaja
        .filter((m) => enRango(m.fecha))
        .reduce((s, m) => s + (m.tipo === 'ingreso' ? m.monto : -m.monto), 0);

      const ventasCtaCte = comprobantesVenta
        .filter((c) => c.tipo === 'factura' && c.estado !== 'anulado' && c.medioPago === 'cuenta_corriente' && enRango(c.fecha))
        .reduce((s, c) => s + c.total, 0);
      const cobradoPeriodo = cobros.filter((c) => enRango(c.fecha)).reduce((s, c) => s + c.monto, 0);
      const ctaCte = ventasCtaCte - cobradoPeriodo;

      return { label: b.label, ventas, compras, caja, ctaCte };
    });
  }, [buckets, comprobantesVenta, comprobantesCompra, movimientosCaja, cobros]);

  const hayDatos = serieValores.some((v) => v.ventas || v.compras || v.caja || v.ctaCte);

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Evolución</p>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
          {(['dia', 'semana', 'mes'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                periodo === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p === 'dia' ? 'Día' : p === 'semana' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
      </div>

      {cargandoCaja ? (
        <p className="py-8 text-center text-sm text-gray-400">Cargando...</p>
      ) : !hayDatos ? (
        <p className="py-8 text-center text-sm text-gray-400">Sin movimientos en este período todavía.</p>
      ) : (
        <GraficoLineas datos={serieValores} />
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function GraficoLineas({
  datos,
}: {
  datos: { label: string; ventas: number; compras: number; caja: number; ctaCte: number }[];
}) {
  const W = 640;
  const H = 220;
  const margenIzq = 64;
  const margenDer = 12;
  const margenSup = 12;
  const margenInf = 26;
  const anchoPlot = W - margenIzq - margenDer;
  const altoPlot = H - margenSup - margenInf;

  const todosLosValores = datos.flatMap((d) => [d.ventas, d.compras, d.caja, d.ctaCte]);
  let max = Math.max(...todosLosValores, 0);
  let min = Math.min(...todosLosValores, 0);
  if (max === min) {
    max = max + 1;
    min = min - 1;
  }
  const rango = max - min;

  const x = (i: number) => (datos.length > 1 ? margenIzq + (anchoPlot * i) / (datos.length - 1) : margenIzq + anchoPlot / 2);
  const y = (v: number) => margenSup + altoPlot * ((max - v) / rango);
  const yCero = y(0);

  function puntos(clave: 'ventas' | 'compras' | 'caja' | 'ctaCte') {
    return datos.map((d, i) => `${x(i)},${y(d[clave])}`).join(' ');
  }

  const formatCompacto = (v: number) => formatARS(v);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 220 }}>
      {/* Líneas de referencia (máx / cero / mín) */}
      <line x1={margenIzq} y1={margenSup} x2={W - margenDer} y2={margenSup} stroke="#f1f5f9" strokeWidth={1} />
      <line x1={margenIzq} y1={yCero} x2={W - margenDer} y2={yCero} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="3 3" />
      <line x1={margenIzq} y1={margenSup + altoPlot} x2={W - margenDer} y2={margenSup + altoPlot} stroke="#f1f5f9" strokeWidth={1} />

      <text x={margenIzq - 6} y={margenSup + 4} textAnchor="end" fontSize={9} fill="#94a3b8">{formatCompacto(max)}</text>
      <text x={margenIzq - 6} y={yCero + 3} textAnchor="end" fontSize={9} fill="#94a3b8">$0</text>
      <text x={margenIzq - 6} y={margenSup + altoPlot + 4} textAnchor="end" fontSize={9} fill="#94a3b8">{formatCompacto(min)}</text>

      {/* Etiquetas de eje X */}
      {datos.map((d, i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="#94a3b8">
          {d.label}
        </text>
      ))}

      {/* Series */}
      {SERIES.map((s) => (
        <polyline
          key={s.key}
          points={puntos(s.key)}
          fill="none"
          stroke={s.color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {SERIES.map((s) =>
        datos.map((d, i) => (
          <circle key={`${s.key}-${i}`} cx={x(i)} cy={y(d[s.key])} r={2.5} fill={s.color}>
            <title>{`${s.label} · ${d.label}: ${formatARS(d[s.key])}`}</title>
          </circle>
        )),
      )}
    </svg>
  );
}
