// "Generar presupuesto" -- cierra el círculo de la ficha de medida:
// arma un Presupuesto real de Ventas a partir de los ítems de la ficha
// (aplanados a una línea de texto legible por ítem, ya que Presupuesto
// no tiene columnas de Ancho/Alto/Tipo de barral propias) y lo inserta
// directo en Supabase -- este módulo no tiene VentasProvider propio
// (Agenda-style: sin Context compartido), así que replica a mano el
// mismo INSERT encadenado (presupuesto primero, items después, ver
// comentario "carrera RLS" en ventas/data/store.tsx ADD_PRESUPUESTO)
// en vez de depender del reducer de Ventas.
//
// Precios: si el ítem quedó vinculado a un Producto real del catálogo
// (Fase 41, "Producción a medida"), se precarga acá el precioVenta de
// ESE producto -- ya salió de una fórmula real, no hay motivo para
// hacerlo escribir el número a mano de nuevo. Si el ítem es solo texto
// libre (sin producto vinculado), sigue en $0 como siempre: la ficha es
// de TOMA DE MEDIDAS, sin nada de dónde sacar un precio, listo para que
// alguien lo cargue a mano desde Ventas > Presupuestos (editar).
//
// OJO: a propósito NO se copia el producto_id acá (se deja null incluso
// cuando el ítem está vinculado). Si se copiara, "Facturar directamente"
// (aplicarEfectosCatalogoAlFacturar) intentaría descontar stock genérico
// del producto -- correcto para un producto 'deposito', pero un error
// real para uno 'a_medida': ese stock nunca se tocó en Producción a
// propósito (ver Producto.modalidadStock), así que descontarlo acá lo
// dejaría en negativo sin sentido. Mientras no se necesite ese vínculo
// para otra cosa (reportes, etc.), queda afuera.

import { supabase } from '@/lib/supabase';
import type { FichaMedida, ItemFichaMedida } from '../types';

// Mismo default que ventas/data/seed.ts (config.validezPresupuestoDias)
// -- no hay tabla de configuración real para leerlo desde acá sin
// depender de VentasProvider, así que se replica el valor por defecto.
const VALIDEZ_DIAS_DEFAULT = 15;

function descripcionItem(it: ItemFichaMedida): string {
  const partes: string[] = [it.producto];
  if (it.tela) partes.push(`Tela: ${it.tela}`);

  if (it.medida) partes.push(`Medida: ${it.medida}`);
  if (it.peso) partes.push(`Peso: ${it.peso}`);

  if (it.panos && it.panos.length > 0) {
    // A pedido de Carlos (19/08): informar la cantidad de paños en el
    // detalle del Presupuesto -- sin agregar un campo nuevo, se deriva
    // del mismo array que ya se carga con "+ Agregar paño" en la Ficha.
    partes.push(`Paños: ${it.panos.length}`);
    const medidas = it.panos
      .map((p, i) => `${i + 1}) ${p.ancho ?? '?'}×${p.alto ?? '?'}`)
      .join(', ');
    partes.push(`Medidas: ${medidas}`);
  }
  if (it.incluyeBarral) partes.push(`Barral: ${it.tipoBarral || 'sí'}`);
  if (it.tipoCortina) partes.push(it.tipoCortina);
  if (it.notas) partes.push(it.notas);

  return partes.join(' — ');
}

type ResultadoGenerarPresupuesto = { ok: true; presupuestoId: string } | { ok: false; error: string };

export async function generarPresupuestoDesdeFicha(
  clienteTenantId: string,
  ficha: FichaMedida,
): Promise<ResultadoGenerarPresupuesto> {
  if (ficha.items.length === 0) {
    return { ok: false, error: 'La ficha no tiene ítems para pasar al presupuesto.' };
  }

  const { data: maxRow, error: errMax } = await supabase
    .from('presupuestos')
    .select('numero')
    .eq('cliente_id', clienteTenantId)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errMax) {
    return { ok: false, error: 'No pudimos calcular el número de presupuesto.' };
  }

  const numero = (maxRow?.numero ?? 0) + 1;
  const presupuestoId = crypto.randomUUID();
  const hoy = new Date().toISOString().split('T')[0];
  const fechaVencimiento = (() => {
    const d = new Date(hoy);
    d.setDate(d.getDate() + VALIDEZ_DIAS_DEFAULT);
    return d.toISOString().split('T')[0];
  })();

  const { error: errInsert } = await supabase.from('presupuestos').insert({
    id: presupuestoId,
    cliente_id: clienteTenantId,
    numero,
    cliente_venta_id: ficha.clienteVentaId,
    fecha: hoy,
    validez_dias: VALIDEZ_DIAS_DEFAULT,
    fecha_vencimiento: fechaVencimiento,
    estado: 'borrador',
    subtotal: 0,
    descuento_general: 0,
    total: 0,
    notas: ficha.notas || null,
    condiciones: null,
    orden_id: null,
  });

  if (errInsert) {
    return { ok: false, error: 'No pudimos crear el presupuesto.' };
  }

  const productoIds = Array.from(
    new Set(ficha.items.map((it) => it.productoId).filter((id): id is string => Boolean(id))),
  );
  const precioPorProducto = new Map<string, number>();
  if (productoIds.length > 0) {
    const { data: productosRows } = await supabase
      .from('productos')
      .select('id, precio_venta')
      .in('id', productoIds);
    for (const p of productosRows ?? []) precioPorProducto.set(p.id, Number(p.precio_venta));
  }

  const filasItems = ficha.items.map((it) => {
    const precio = it.productoId ? precioPorProducto.get(it.productoId) ?? 0 : 0;
    return {
      id: crypto.randomUUID(),
      presupuesto_id: presupuestoId,
      producto_id: null,
      descripcion: descripcionItem(it),
      cantidad: it.cantidad,
      precio_unitario: precio,
      descuento: 0,
      subtotal: precio * it.cantidad,
    };
  });

  // Obra con instalación: se agrega una línea más para el costo de
  // instalación -- todavía texto libre en $0 (editable a mano en Ventas),
  // hasta que exista una integración real con el módulo Servicios (Fase 40,
  // no construida todavía) que permita vincularla a un producto/servicio
  // real del catálogo.
  if (ficha.modalidadEntrega === 'obra_instalacion') {
    const direccion = ficha.domicilioTrabajo || ficha.clienteDireccion;
    filasItems.push({
      id: crypto.randomUUID(),
      presupuesto_id: presupuestoId,
      producto_id: null,
      descripcion: `Instalación en obra${direccion ? ` — ${direccion}` : ''}`,
      cantidad: 1,
      precio_unitario: 0,
      descuento: 0,
      subtotal: 0,
    });
  }

  const { error: errItems } = await supabase.from('presupuesto_items').insert(filasItems);
  if (errItems) {
    return { ok: false, error: 'El presupuesto se creó, pero no pudimos cargar los ítems.' };
  }

  // Si algún ítem trajo precio del producto vinculado, el encabezado del
  // presupuesto (subtotal/total) tiene que reflejarlo -- si no, el listado
  // de Ventas > Presupuestos sigue mostrando $0,00 aunque las líneas ya
  // tengan precio real cargado.
  const totalItems = filasItems.reduce((acc, f) => acc + f.subtotal, 0);
  if (totalItems > 0) {
    await supabase
      .from('presupuestos')
      .update({ subtotal: totalItems, total: totalItems })
      .eq('id', presupuestoId);
  }

  return { ok: true, presupuestoId };
}
