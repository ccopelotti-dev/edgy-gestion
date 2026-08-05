// ============================================================
// Módulo Compras — Conexión con Recepción (stock)
// Edgy Gestión
//
// Antes, un comprobante de compra (factura) no tenía NINGUNA relación con
// el stock real de Productos y Stock -- era puramente fiscal/contable. El
// usuario pidió conectar ambos: si la línea de la factura está vinculada a
// un Insumo o Producto real del catálogo (ver ItemCompra.insumoId/
// productoId), y no hay un control de remito separado pendiente
// (comprobante.controlRemision === 'no'), el botón "Actualizar stock" del
// modal genera y confirma una Recepción real en Productos y Stock,
// convirtiendo la cantidad a la unidad de stock del insumo/producto si
// hace falta (ej. compraste "kg" de un insumo que lleva el stock en
// "gramo" -- ver convertirUnidad() en productos-stock/lib/format.ts).
//
// Mismo criterio cross-módulo que descontarStockVenta.ts (Ventas): este
// módulo no está montado dentro de ProductosStockProvider, así que se
// opera con consultas directas a Supabase en vez de dispatch a un store
// compartido.
// ============================================================

import { supabase } from '@/lib/supabase';
import { resolverPuntoVentaId, ajustarStockPuntoVenta } from '@/lib/puntoVenta';
import { convertirUnidad } from '@/modules/productos-stock/lib/format';
import type { UnidadMedida } from '@/modules/productos-stock/types';
import type { ItemComprobanteCompra } from '../types';

export interface ResultadoActualizarStock {
  recepcionId: string;
  /** Líneas donde no se pudo convertir de unidad (se cargó la cantidad tal
   * cual, sin convertir) -- para avisarle al usuario. */
  advertenciasConversion: string[];
}

export async function actualizarStockPorCompra(
  items: ItemComprobanteCompra[],
  opts: {
    clienteId: string;
    proveedorNombre: string;
    fecha: string;
    numeroRemito?: string;
    /** Ej. "FC-00007" -- para dejar rastro de origen en la Recepción. */
    numeroComprobante: string;
  },
): Promise<ResultadoActualizarStock | null> {
  const itemsVinculados = items.filter((i) => (i.productoId || i.insumoId) && i.cantidad > 0);
  if (itemsVinculados.length === 0) return null;

  // Fase 27e-2: null en clientes de un solo local -- sin cambios para
  // ellos (ver src/lib/puntoVenta.ts).
  const puntoVentaId = await resolverPuntoVentaId(opts.clienteId);

  // Resuelve la unidad de stock REAL y el stock actual de cada insumo/
  // producto vinculado, para poder convertir la cantidad comprada (que
  // puede estar en otra unidad) y sumar sobre el valor correcto.
  const insumoIds = Array.from(new Set(itemsVinculados.filter((i) => i.insumoId).map((i) => i.insumoId!)));
  const productoIds = Array.from(new Set(itemsVinculados.filter((i) => i.productoId).map((i) => i.productoId!)));

  const [insumosRes, productosRes] = await Promise.all([
    insumoIds.length
      ? supabase.from('insumos').select('id, unidad, stock').in('id', insumoIds)
      : Promise.resolve({ data: [] as any[] }),
    productoIds.length
      ? supabase.from('productos').select('id, unidad_venta, stock').in('id', productoIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const unidadInsumo = new Map<string, UnidadMedida>();
  const stockInsumo = new Map<string, number>();
  for (const r of (insumosRes.data ?? []) as any[]) {
    unidadInsumo.set(r.id, r.unidad);
    stockInsumo.set(r.id, Number(r.stock));
  }
  const unidadProducto = new Map<string, UnidadMedida>();
  const stockProducto = new Map<string, number>();
  for (const r of (productosRes.data ?? []) as any[]) {
    unidadProducto.set(r.id, r.unidad_venta);
    stockProducto.set(r.id, Number(r.stock));
  }

  const recepcionId = crypto.randomUUID();
  const advertenciasConversion: string[] = [];

  const lineas = itemsVinculados.map((item) => {
    const itemTipo: 'producto' | 'insumo' = item.insumoId ? 'insumo' : 'producto';
    const itemId = (item.insumoId ?? item.productoId)!;
    const unidadStock = itemTipo === 'insumo' ? unidadInsumo.get(itemId) : unidadProducto.get(itemId);
    const unidadCompra = item.unidad ?? unidadStock;

    let cantidadConvertida = item.cantidad;
    if (unidadStock && unidadCompra && unidadCompra !== unidadStock) {
      const convertida = convertirUnidad(item.cantidad, unidadCompra, unidadStock);
      if (convertida === null) {
        advertenciasConversion.push(
          `${item.descripcion}: no se pudo convertir de "${unidadCompra}" a "${unidadStock}", se cargó la cantidad tal cual.`,
        );
      } else {
        cantidadConvertida = convertida;
      }
    }

    return {
      id: crypto.randomUUID(),
      recepcion_id: recepcionId,
      item_tipo: itemTipo,
      item_id: itemId,
      cantidad: cantidadConvertida,
      costo_unitario: item.precioUnitario,
      fecha_vencimiento: null as string | null,
    };
  });

  // 1) Recepción (confirmada directamente -- "Actualizar stock" es un
  //    ingreso inmediato, no un borrador a revisar después).
  const { error: errRecepcion } = await supabase.from('recepciones').insert({
    id: recepcionId,
    cliente_id: opts.clienteId,
    fecha: opts.fecha,
    proveedor: opts.proveedorNombre,
    numero_remito: opts.numeroRemito || opts.numeroComprobante,
    estado: 'confirmada',
    notas: `Generada automáticamente desde Compras — comprobante ${opts.numeroComprobante}`,
  });
  if (errRecepcion) {
    console.error('Compras · error al generar recepción desde comprobante:', errRecepcion);
    return null;
  }

  if (lineas.length) {
    const { error: errLineas } = await supabase.from('recepcion_lineas').insert(lineas);
    if (errLineas) console.error('Compras · error al generar líneas de recepción:', errLineas);
  }

  // 2) Movimientos de stock (fire-and-forget, mismo criterio que
  //    descontarStockVenta.ts).
  const movimientos = lineas.map((l) => ({
    id: crypto.randomUUID(),
    cliente_id: opts.clienteId,
    tipo: 'ingreso',
    item_tipo: l.item_tipo,
    item_id: l.item_id,
    cantidad: l.cantidad,
    costo_unitario: l.costo_unitario,
    fecha: opts.fecha,
    origen: 'recepcion',
    origen_id: recepcionId,
    punto_venta_id: puntoVentaId,
  }));
  if (movimientos.length) {
    supabase.from('movimientos_stock').insert(movimientos).then(({ error }) => {
      if (error) console.error('Compras · error al generar movimientos de stock:', error);
    });
  }

  // 3) Stock real de insumos/productos.
  //
  //    Multi-local (puntoVentaId no nulo): la RPC ajusta
  //    stock_por_punto_venta y su trigger recalcula productos.stock/
  //    insumos.stock como el total -- el costo, que la RPC no toca, se
  //    actualiza aparte en la misma pasada.
  //
  //    Un solo local: EXACTAMENTE el mismo comportamiento que antes de la
  //    Fase 27e -- secuencial (no en paralelo), para que una misma línea
  //    repetida dos veces acumule sobre el valor ya actualizado, no sobre
  //    uno "viejo" leído antes de la primera pasada.
  for (const linea of lineas) {
    const tabla = linea.item_tipo === 'insumo' ? 'insumos' : 'productos';
    const stockMap = linea.item_tipo === 'insumo' ? stockInsumo : stockProducto;
    const stockActual = stockMap.get(linea.item_id) ?? 0;

    if (puntoVentaId) {
      await ajustarStockPuntoVenta({
        clienteId: opts.clienteId,
        puntoVentaId,
        itemTipo: linea.item_tipo,
        itemId: linea.item_id,
        delta: linea.cantidad,
      });
      if (linea.costo_unitario > 0) {
        await supabase.from(tabla).update({ costo: linea.costo_unitario }).eq('id', linea.item_id);
      }
    } else {
      const update: Record<string, number> = { stock: stockActual + linea.cantidad };
      if (linea.costo_unitario > 0) update.costo = linea.costo_unitario;
      await supabase.from(tabla).update(update).eq('id', linea.item_id);
    }
    stockMap.set(linea.item_id, stockActual + linea.cantidad);
  }

  return { recepcionId, advertenciasConversion };
}
