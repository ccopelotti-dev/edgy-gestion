-- Fase 75h (09/09, a pedido de Carlos -- "ármalo ahora"): extiende el
-- aislamiento Rúa/Casa Central (Fase 75f/75g, migración 0133) a Insumos,
-- Recepciones y Producciones. Hasta ahora solo rubros/productos tenían
-- punto_venta_id; insumos/recepciones/producciones quedaban visibles para
-- todos los locales del cliente sin ninguna posibilidad de filtrado.
--
-- Mismo criterio que Rubro (NO el de Producto): separación TOTAL, sin
-- opción "compartido" -- un insumo/recepción/producción nuevo en un
-- cliente con 2+ puntos de venta queda de uno puntual. Fórmula no suma
-- columna propia: hereda la visibilidad del Producto que arma (ver
-- filtrarPorPuntoVenta en src/modules/productos-stock/data/store.tsx).
--
-- Backfill: igual que rubros -- todo lo existente en un cliente con 2+
-- locales (hoy, solo Punto Tex) queda asignado al punto de venta
-- por_defecto (Casa Central). Clientes de un solo local no se tocan.

alter table edgy_gestion.insumos
  add column if not exists punto_venta_id uuid references edgy_gestion.puntos_venta(id);

alter table edgy_gestion.recepciones
  add column if not exists punto_venta_id uuid references edgy_gestion.puntos_venta(id);

alter table edgy_gestion.producciones
  add column if not exists punto_venta_id uuid references edgy_gestion.puntos_venta(id);

update edgy_gestion.insumos t
set punto_venta_id = pv.id
from edgy_gestion.puntos_venta pv
where pv.cliente_id = t.cliente_id
  and pv.por_defecto = true
  and t.punto_venta_id is null
  and (select count(*) from edgy_gestion.puntos_venta pv2 where pv2.cliente_id = t.cliente_id) >= 2;

update edgy_gestion.recepciones t
set punto_venta_id = pv.id
from edgy_gestion.puntos_venta pv
where pv.cliente_id = t.cliente_id
  and pv.por_defecto = true
  and t.punto_venta_id is null
  and (select count(*) from edgy_gestion.puntos_venta pv2 where pv2.cliente_id = t.cliente_id) >= 2;

update edgy_gestion.producciones t
set punto_venta_id = pv.id
from edgy_gestion.puntos_venta pv
where pv.cliente_id = t.cliente_id
  and pv.por_defecto = true
  and t.punto_venta_id is null
  and (select count(*) from edgy_gestion.puntos_venta pv2 where pv2.cliente_id = t.cliente_id) >= 2;
