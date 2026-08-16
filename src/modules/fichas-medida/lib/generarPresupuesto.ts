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
// Precios en $0: la ficha es de TOMA DE MEDIDAS, todavía sin cotizar --
// el presupuesto queda armado con la descripción completa de cada
// ítem, listo para que alguien le cargue el precio desde Ventas >
// Presupuestos (editar) antes de enviarlo al cliente.

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

  const filasItems = ficha.items.map((it) => ({
    id: crypto.randomUUID(),
    presupuesto_id: presupuestoId,
    producto_id: null,
    descripcion: descripcionItem(it),
    cantidad: it.cantidad,
    precio_unitario: 0,
    descuento: 0,
    subtotal: 0,
  }));

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

  return { ok: true, presupuestoId };
}
