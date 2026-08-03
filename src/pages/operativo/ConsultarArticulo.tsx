// ============================================================
// Fase 26 · Modo Mostrador — Consultar artículo
// Edgy Gestión · Buscador rápido de producto, solo lectura
// ============================================================
//
// A diferencia de Productos y Stock (que tiene edición completa y no es
// apto para dejarlo en manos de un Cajero), esto es un buscador directo
// contra la tabla `productos` -- sin pasar por ningún módulo ni
// Provider -- que muestra todo el dato disponible del artículo tal
// como pidió el usuario: precio, costo, stock (con desglose por
// variante si aplica), rubro, marca y estado. Solo lectura, no permite
// editar nada desde acá.

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useClienteActual } from '@/hooks/useClienteActual';
import { formatARS } from '@/modules/ventas/lib/format';

const overlayClass =
  'fixed inset-0 bg-black/50 z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0';
const contentClass =
  'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto z-50';

interface VarianteRow {
  id: string;
  color?: string;
  talle?: string;
  stock: number;
}

interface ProductoDetalle {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  precioVenta: number;
  costo: number;
  iva: number;
  unidadVenta: string;
  stock: number;
  stockMinimo: number;
  controlaStock: boolean;
  disponible: boolean;
  estado: string;
  codigoBarras?: string;
  tipo: string;
  rubroNombre?: string;
  marcaNombre?: string;
  variantes: VarianteRow[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function etiquetaVariante(v: VarianteRow): string {
  return [v.color, v.talle].filter(Boolean).join(' / ') || 'Variante';
}

export function ConsultarArticulo({ open, onOpenChange }: Props) {
  const { cliente: clienteTenant } = useClienteActual();
  const [busqueda, setBusqueda] = useState('');
  const [candidatos, setCandidatos] = useState<{ id: string; nombre: string; precioVenta: number }[]>([]);
  const [detalle, setDetalle] = useState<ProductoDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // Reset al abrir/cerrar
  useEffect(() => {
    if (!open) {
      setBusqueda('');
      setCandidatos([]);
      setDetalle(null);
    }
  }, [open]);

  // Sugerencias en vivo mientras escribe
  useEffect(() => {
    if (!open || !clienteTenant?.id) return;
    const q = busqueda.trim();
    if (!q) {
      setCandidatos([]);
      return;
    }
    let activo = true;
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('productos')
        .select('id, nombre, precio_venta')
        .eq('cliente_id', clienteTenant.id)
        .ilike('nombre', `%${q}%`)
        .order('nombre')
        .limit(10);
      if (activo) {
        setCandidatos((data ?? []).map((p) => ({ id: p.id, nombre: p.nombre, precioVenta: Number(p.precio_venta) })));
      }
    }, 250);
    return () => {
      activo = false;
      clearTimeout(timer);
    };
  }, [busqueda, open, clienteTenant?.id]);

  async function verDetalle(productoId: string) {
    setCargandoDetalle(true);
    setDetalle(null);
    const [productoRes, variantesRes] = await Promise.all([
      supabase
        .from('productos')
        .select(
          'id, codigo, nombre, descripcion, precio_venta, costo, iva, unidad_venta, stock, stock_minimo, controla_stock, disponible, estado, codigo_barras, tipo, rubro_id, marca_id, rubros(nombre), marcas(nombre)',
        )
        .eq('id', productoId)
        .maybeSingle(),
      supabase.from('producto_variantes').select('id, color, talle, stock').eq('producto_id', productoId),
    ]);

    const p = productoRes.data as any;
    if (p) {
      setDetalle({
        id: p.id,
        codigo: p.codigo ?? '',
        nombre: p.nombre,
        descripcion: p.descripcion ?? '',
        precioVenta: Number(p.precio_venta),
        costo: Number(p.costo),
        iva: Number(p.iva),
        unidadVenta: p.unidad_venta ?? '',
        stock: Number(p.stock),
        stockMinimo: Number(p.stock_minimo ?? 0),
        controlaStock: !!p.controla_stock,
        disponible: !!p.disponible,
        estado: p.estado ?? '',
        codigoBarras: p.codigo_barras ?? undefined,
        tipo: p.tipo ?? 'unico',
        rubroNombre: p.rubros?.nombre,
        marcaNombre: p.marcas?.nombre,
        variantes: (variantesRes.data ?? []).map((v: any) => ({
          id: v.id,
          color: v.color ?? undefined,
          talle: v.talle ?? undefined,
          stock: Number(v.stock),
        })),
      });
    }
    setCargandoDetalle(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentClass}>
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-gray-900">Consultar artículo</Dialog.Title>
            <Dialog.Close className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              type="text"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setDetalle(null);
              }}
              placeholder="Buscar por nombre..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900"
            />
          </div>

          {!detalle && candidatos.length > 0 && (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {candidatos.map((c) => (
                <button
                  key={c.id}
                  onClick={() => verDetalle(c.id)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                >
                  <span className="text-gray-900">{c.nombre}</span>
                  <span className="text-gray-500">{formatARS(c.precioVenta)}</span>
                </button>
              ))}
            </div>
          )}

          {!detalle && busqueda.trim() && candidatos.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">Sin resultados.</p>
          )}

          {cargandoDetalle && <p className="py-6 text-center text-sm text-gray-400">Buscando...</p>}

          {detalle && (
            <div className="space-y-4">
              <button
                onClick={() => setDetalle(null)}
                className="text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                ← Volver a la búsqueda
              </button>

              <div>
                <p className="text-base font-semibold text-gray-900">{detalle.nombre}</p>
                {detalle.descripcion && <p className="text-sm text-gray-500">{detalle.descripcion}</p>}
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                  {detalle.codigo && <span>Código {detalle.codigo}</span>}
                  {detalle.codigoBarras && <span>· Cód. barras {detalle.codigoBarras}</span>}
                  {detalle.rubroNombre && <span>· {detalle.rubroNombre}</span>}
                  {detalle.marcaNombre && <span>· {detalle.marcaNombre}</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Precio de venta</p>
                  <p className="text-lg font-semibold text-gray-900">{formatARS(detalle.precioVenta)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Costo</p>
                  <p className="text-lg font-semibold text-gray-900">{formatARS(detalle.costo)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-400">IVA</p>
                  <p className="text-sm font-medium text-gray-900">{detalle.iva}%</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Unidad de venta</p>
                  <p className="text-sm font-medium text-gray-900">{detalle.unidadVenta || '—'}</p>
                </div>
              </div>

              {detalle.controlaStock && detalle.tipo !== 'con_variantes' && (
                <div
                  className={
                    detalle.stock <= detalle.stockMinimo
                      ? 'rounded-lg border border-amber-200 bg-amber-50 p-3'
                      : 'rounded-lg border border-gray-200 p-3'
                  }
                >
                  <p className="text-xs uppercase tracking-wide text-gray-400">Stock disponible</p>
                  <p className="text-lg font-semibold text-gray-900">{detalle.stock}</p>
                  {detalle.stock <= detalle.stockMinimo && (
                    <p className="mt-1 text-xs font-medium text-amber-700">Por debajo del mínimo ({detalle.stockMinimo})</p>
                  )}
                </div>
              )}

              {detalle.tipo === 'con_variantes' && detalle.variantes.length > 0 && (
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">Stock por variante</p>
                  <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {detalle.variantes.map((v) => (
                      <div key={v.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-gray-700">{etiquetaVariante(v)}</span>
                        <span className={v.stock <= 0 ? 'font-medium text-red-600' : 'font-medium text-gray-900'}>
                          {v.stock}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!detalle.controlaStock && (
                <p className="text-xs text-gray-400">Este producto no controla stock.</p>
              )}

              <div className="flex items-center gap-2 text-xs">
                <span
                  className={
                    detalle.disponible && detalle.estado === 'activo'
                      ? 'rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700'
                      : 'rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-500'
                  }
                >
                  {detalle.disponible && detalle.estado === 'activo' ? 'Disponible' : 'No disponible'}
                </span>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
