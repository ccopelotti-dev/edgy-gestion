-- Fase 75f (08/09, a pedido de Carlos): Rúa (punto de venta de Punto Tex,
-- comercializa bazar/decoración) veía todos los rubros y productos de
-- Casa Central en el Dashboard de Productos y Stock. La causa: rubros no
-- tenía ninguna columna de punto de venta -- era imposible que Rúa tuviera
-- rubros propios, y ninguna pantalla filtraba por punto de venta.
--
-- Esta migración agrega punto_venta_id a rubros. Carlos pidió separación
-- TOTAL (a diferencia de Producto.punto_venta_id, que admite null =
-- "compartido entre locales"): todo rubro nuevo en un cliente con 2+
-- puntos de venta queda de uno puntual, sin opción compartida.
--
-- Backfill: los rubros existentes de un cliente con 2+ locales (hoy, solo
-- Punto Tex) quedan asignados al punto de venta por_defecto (Casa
-- Central) -- Rúa arranca sin rubros propios y los carga desde cero.
-- Clientes de un solo local (la inmensa mayoría) no se tocan: queda null
-- y el frontend no filtra nada para ellos (ver useProductosStock en
-- src/modules/productos-stock/data/store.tsx).

alter table edgy_gestion.rubros
  add column if not exists punto_venta_id uuid references edgy_gestion.puntos_venta(id);

update edgy_gestion.rubros r
set punto_venta_id = pv.id
from edgy_gestion.puntos_venta pv
where pv.cliente_id = r.cliente_id
  and pv.por_defecto = true
  and r.punto_venta_id is null
  and (select count(*) from edgy_gestion.puntos_venta pv2 where pv2.cliente_id = r.cliente_id) >= 2;
