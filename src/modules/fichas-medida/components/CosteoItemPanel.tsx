// Fase 62 (30/08, a pedido de Carlos): costeo manual "con calculadora en
// mano" embebido en un ítem de Ficha "Genérica" -- insumos del catálogo
// (buscador + costo autocompletado) + líneas libres de mano de obra/otros
// costos, sumados a un COSTO TOTAL, más un margen (por %, por monto fijo,
// o precio final tipeado a mano) para llegar al precio de venta del ítem.
//
// A propósito NO pasa por Formular Producto ni por ninguna Fórmula/
// Producto real: es transitorio, vive solo dentro de este ítem de esta
// ficha, mientras se completa el catálogo real (ver comentario de
// CosteoItemFicha en ../types/index.ts). Por eso tampoco hay conversión
// de unidades acá -- es una cuenta simple, cantidad × costo unitario.
//
// Este módulo no está montado dentro de ProductosStockProvider, así que
// el buscador de insumos consulta Supabase directo (mismo criterio que
// Compras, ver comentario en compras/components/compras/dialogs.tsx).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Search, Calculator } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatARS } from '@/modules/ventas/lib/format';
import type { CosteoItemFicha, LineaCosteoItem, ModoPrecioCosteoItem } from '../types';

const inputClass =
  'w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900';

interface InsumoCatalogoCosteo {
  id: string;
  nombre: string;
  unidad: string;
  costo: number;
}

function parseDecimal(texto: string): number {
  const limpio = texto.replace(',', '.').trim();
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}
function sanitizarDecimal(valor: string): string {
  return valor.replace(/[^0-9.,]/g, '');
}

function nuevaLineaInsumo(): LineaCosteoItem {
  return { id: crypto.randomUUID(), tipo: 'insumo', descripcion: '', cantidad: 1, costoUnitario: 0 };
}
function nuevaLineaLibre(): LineaCosteoItem {
  return { id: crypto.randomUUID(), tipo: 'mano_de_obra', descripcion: '', cantidad: 1, costoUnitario: 0 };
}

function recalcular(input: {
  lineas: LineaCosteoItem[];
  modoPrecio: ModoPrecioCosteoItem;
  margenPorcentaje: number;
  montoFijo: number;
  precioManual: number;
}): CosteoItemFicha {
  const costoTotal = input.lineas.reduce((acc, l) => acc + l.cantidad * l.costoUnitario, 0);
  const precioVenta =
    input.modoPrecio === 'margen'
      ? Math.round(costoTotal * (1 + input.margenPorcentaje / 100) * 100) / 100
      : input.modoPrecio === 'monto_fijo'
        ? Math.round((costoTotal + input.montoFijo) * 100) / 100
        : Math.round(input.precioManual * 100) / 100;
  return {
    lineas: input.lineas,
    modoPrecio: input.modoPrecio,
    margenPorcentaje: input.margenPorcentaje,
    montoFijo: input.montoFijo,
    precioManual: input.precioManual,
    costoTotal,
    precioVenta,
  };
}

// ─── Buscador inline de insumo (mismo criterio anti-Radix-portal que
// ProductoCatalogoCombobox en FichaDialog.tsx: dropdown NO portado a
// document.body, para que Radix no lo confunda con un click "afuera"
// del Dialog y lo cierre antes de tiempo). ────────────────────────────

function InsumoCombobox({
  value,
  options,
  onSelect,
}: {
  value: string;
  options: InsumoCatalogoCosteo[];
  onSelect: (insumo: InsumoCatalogoCosteo | null) => void;
}) {
  const seleccionado = options.find((o) => o.id === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickFuera(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? options.filter((o) => o.nombre.toLowerCase().includes(q)) : options;
    return base.slice(0, 30);
  }, [query, options]);

  return (
    <div className="relative" ref={wrapperRef}>
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
      <input
        className={inputClass + ' pl-7'}
        value={open ? query : seleccionado?.nombre ?? ''}
        placeholder="Buscar insumo del catálogo..."
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (filtradas.length > 0) {
              onSelect(filtradas[0]);
              setOpen(false);
              setQuery('');
            }
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && (
        <div className="absolute left-0 top-full z-[60] mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {filtradas.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">Sin resultados</p>
          ) : (
            filtradas.map((o) => (
              <button
                key={o.id}
                type="button"
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                onClick={() => {
                  onSelect(o);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <span className="truncate">{o.nombre}</span>
                <span className="ml-2 shrink-0 text-xs text-gray-400">
                  {formatARS(o.costo)}/{o.unidad}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  clienteTenantId: string;
  value: CosteoItemFicha | undefined;
  onChange: (nuevo: CosteoItemFicha | undefined) => void;
}

export function CosteoItemPanel({ clienteTenantId, value, onChange }: Props) {
  const [insumosCatalogo, setInsumosCatalogo] = useState<InsumoCatalogoCosteo[]>([]);

  useEffect(() => {
    if (!clienteTenantId) return;
    let activo = true;
    supabase
      .from('insumos')
      .select('id, nombre, unidad, costo')
      .eq('cliente_id', clienteTenantId)
      .order('nombre')
      .then(({ data }) => {
        if (!activo) return;
        setInsumosCatalogo(
          ((data ?? []) as any[]).map((i) => ({
            id: i.id,
            nombre: i.nombre,
            unidad: i.unidad,
            costo: Number(i.costo),
          })),
        );
      });
    return () => {
      activo = false;
    };
  }, [clienteTenantId]);

  const lineas = value?.lineas ?? [];
  const modoPrecio: ModoPrecioCosteoItem = value?.modoPrecio ?? 'margen';
  const margenPorcentaje = value?.margenPorcentaje ?? 30;
  const montoFijo = value?.montoFijo ?? 0;
  const precioManual = value?.precioManual ?? 0;
  const costoTotal = value?.costoTotal ?? 0;
  const precioVenta = value?.precioVenta ?? 0;

  const lineasInsumo = lineas.filter((l) => l.tipo === 'insumo');
  const lineasLibres = lineas.filter((l) => l.tipo !== 'insumo');

  function emitir(patch: {
    lineas?: LineaCosteoItem[];
    modoPrecio?: ModoPrecioCosteoItem;
    margenPorcentaje?: number;
    montoFijo?: number;
    precioManual?: number;
  }) {
    onChange(
      recalcular({
        lineas: patch.lineas ?? lineas,
        modoPrecio: patch.modoPrecio ?? modoPrecio,
        margenPorcentaje: patch.margenPorcentaje ?? margenPorcentaje,
        montoFijo: patch.montoFijo ?? montoFijo,
        precioManual: patch.precioManual ?? precioManual,
      }),
    );
  }

  function actualizarLinea(id: string, patch: Partial<LineaCosteoItem>) {
    emitir({ lineas: lineas.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  }
  function eliminarLinea(id: string) {
    const restantes = lineas.filter((l) => l.id !== id);
    if (restantes.length === 0 && precioVenta === 0 && modoPrecio === 'margen' && margenPorcentaje === 30) {
      // Última línea borrada y todavía no se tocó nada más -- limpiar del
      // todo en vez de dejar un objeto "vacío" guardado de más.
      onChange(undefined);
      return;
    }
    emitir({ lineas: restantes });
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
        <Calculator className="h-3.5 w-3.5" />
        Costeo (calculadora manual, opcional)
      </div>
      <p className="mb-2 text-xs text-gray-400">
        Mientras no está el presupuestado automático: cargá acá los insumos y la mano de obra de este ítem
        para que el precio de venta salga solo. No queda vinculado a ningún producto del catálogo.
      </p>

      {/* Insumos */}
      <div className="space-y-1.5">
        {lineasInsumo.length > 0 && (
          <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_5rem_4.5rem_1.75rem] gap-1.5 px-0.5 text-[10px] text-gray-400">
            <span>Insumo</span>
            <span className="text-right">Cant.</span>
            <span className="text-right">Costo unit.</span>
            <span className="text-right">Subtotal</span>
            <span />
          </div>
        )}
        {lineasInsumo.map((l) => (
          <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_3.5rem_5rem_4.5rem_1.75rem] items-center gap-1.5">
            <InsumoCombobox
              value={l.insumoId ?? ''}
              options={insumosCatalogo}
              onSelect={(insumo) =>
                actualizarLinea(l.id, {
                  insumoId: insumo?.id,
                  descripcion: insumo?.nombre ?? l.descripcion,
                  unidad: insumo?.unidad,
                  costoUnitario: insumo?.costo ?? l.costoUnitario,
                })
              }
            />
            <input
              type="text"
              inputMode="decimal"
              className={inputClass + ' text-right'}
              value={l.cantidad}
              title="Cantidad"
              onChange={(e) => actualizarLinea(l.id, { cantidad: parseDecimal(sanitizarDecimal(e.target.value)) || 0 })}
            />
            <input
              type="text"
              inputMode="decimal"
              className={inputClass + ' text-right'}
              value={l.costoUnitario}
              title="Costo unitario"
              onChange={(e) => actualizarLinea(l.id, { costoUnitario: parseDecimal(sanitizarDecimal(e.target.value)) || 0 })}
            />
            <span className="text-right text-xs font-medium text-gray-600">
              {formatARS(l.cantidad * l.costoUnitario)}
            </span>
            <button
              type="button"
              onClick={() => eliminarLinea(l.id)}
              className="flex items-center justify-center rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
              title="Quitar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => emitir({ lineas: [...lineas, nuevaLineaInsumo()] })}
          className="flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar insumo
        </button>
      </div>

      {/* Mano de obra / otros costos */}
      <div className="mt-3 space-y-1.5">
        {lineasLibres.map((l) => (
          <div key={l.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)_5.5rem_1.75rem] items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                actualizarLinea(l.id, { tipo: l.tipo === 'mano_de_obra' ? 'costo_operativo' : 'mano_de_obra' })
              }
              className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                l.tipo === 'mano_de_obra' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
              }`}
              title="Click para cambiar el tipo"
            >
              {l.tipo === 'mano_de_obra' ? 'Mano de obra' : 'Otro costo'}
            </button>
            <input
              type="text"
              placeholder="Concepto (ej. Hechura, Traslado...)"
              className={inputClass}
              value={l.descripcion}
              onChange={(e) => actualizarLinea(l.id, { descripcion: e.target.value })}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="Monto"
              className={inputClass + ' text-right'}
              value={l.costoUnitario || ''}
              onChange={(e) => actualizarLinea(l.id, { costoUnitario: parseDecimal(sanitizarDecimal(e.target.value)) || 0 })}
            />
            <button
              type="button"
              onClick={() => eliminarLinea(l.id)}
              className="flex items-center justify-center rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
              title="Quitar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => emitir({ lineas: [...lineas, nuevaLineaLibre()] })}
          className="flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar línea (mano de obra / otro costo)
        </button>
      </div>

      {lineas.length > 0 && (
        <>
          {/* Resumen */}
          <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <span className="text-gray-500">Costo total</span>
            <span className="font-semibold text-gray-900">{formatARS(costoTotal)}</span>
          </div>

          {/* Margen */}
          <div className="mt-2">
            <div className="mb-1.5 flex gap-1.5">
              {(
                [
                  { key: 'margen', label: 'Por margen (%)' },
                  { key: 'monto_fijo', label: 'Monto fijo' },
                  { key: 'manual', label: 'Manual' },
                ] as { key: ModoPrecioCosteoItem; label: string }[]
              ).map((op) => (
                <button
                  key={op.key}
                  type="button"
                  onClick={() => emitir({ modoPrecio: op.key })}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    modoPrecio === op.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>

            {modoPrecio === 'margen' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Ganancia sobre costo</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className={inputClass + ' w-20 text-right'}
                  value={margenPorcentaje}
                  onChange={(e) => emitir({ margenPorcentaje: parseDecimal(sanitizarDecimal(e.target.value)) || 0 })}
                />
                <span className="text-xs text-gray-500">%</span>
              </div>
            )}
            {modoPrecio === 'monto_fijo' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Ganancia en $ (se suma al costo)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className={inputClass + ' w-28 text-right'}
                  value={montoFijo}
                  onChange={(e) => emitir({ montoFijo: parseDecimal(sanitizarDecimal(e.target.value)) || 0 })}
                />
              </div>
            )}
            {modoPrecio === 'manual' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Precio de venta final</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className={inputClass + ' w-28 text-right'}
                  value={precioManual}
                  onChange={(e) => emitir({ precioManual: parseDecimal(sanitizarDecimal(e.target.value)) || 0 })}
                />
              </div>
            )}
          </div>

          {/* Precio de venta resultante */}
          <div className="mt-2 flex items-center justify-between rounded-lg bg-teal-50 px-3 py-2 text-sm">
            <span className="font-medium text-teal-800">Precio de venta del ítem</span>
            <span className="text-base font-bold text-teal-800">{formatARS(precioVenta)}</span>
          </div>
        </>
      )}
    </div>
  );
}
