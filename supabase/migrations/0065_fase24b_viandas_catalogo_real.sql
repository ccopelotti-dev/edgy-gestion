-- ============================================================
-- Fase 24b: Viandas sobre catálogo real (PlanVianda/EntregaVianda)
-- Edgy Gestión · Viandas + Ventas
-- ============================================================
--
-- Contexto (rediseño completo de Viandas, Fase 24): cada entrega deja
-- de ser un texto libre (`menu_del_dia`) y pasa a ser una línea de
-- catálogo real (producto del rubro "Viandas"), que genera una Orden
-- en `ordenes_venta` (tipo 'pedido', origen_modulo 'viandas') -- así
-- entra al mismo ciclo de Comandas/Ordenes que Ventas Online/Menú QR
-- (pendiente -> en_preparacion -> terminado -> entregado) y, al llegar
-- a 'entregado', se factura automático en cuenta corriente (ver
-- handleCambiarEstado en ventas/pages/Ordenes.tsx, Fase 24c) con
-- descuento de stock/insumos incluido (aplicarEfectosCatalogoAlFacturar,
-- ya existente).
--
-- El precio de cada entrega es el prorrateo del abono
-- (precio_abono / cantidad_periodo del plan), no el precio de catálogo
-- del producto -- decisión explícita del cliente, es una foto tomada al
-- generar la entrega.
--
-- `menu_del_dia` (columna vieja) queda en la tabla sin usarse -- no se
-- borra para no romper filas históricas, simplemente el frontend deja
-- de escribirla.
-- ============================================================

set search_path to edgy_gestion, public;

-- ─── 1) Columnas nuevas en entregas_vianda ─────────────────────

alter table edgy_gestion.entregas_vianda
  add column if not exists producto_id uuid references edgy_gestion.productos(id),
  add column if not exists precio_unitario numeric,
  add column if not exists orden_id uuid references edgy_gestion.ordenes_venta(id),
  add column if not exists comprobante_id uuid references edgy_gestion.comprobantes_venta(id);

-- ─── 2) RLS: el módulo Viandas necesita poder crear la Orden ───
-- de cada entrega directamente en ordenes_venta/orden_venta_items
-- (mismo criterio que 0035/0036 le dieron a delivery-whatsapp en su
-- momento -- acá con el slug 'viandas', ya vigente, sin arrastrar el
-- bug de nomenclatura que quedó post-rename a ventas-online).

create policy "ordenes_venta_select_viandas" on edgy_gestion.ordenes_venta
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('viandas', 'lectura')
  );

create policy "ordenes_venta_insert_viandas" on edgy_gestion.ordenes_venta
  for insert with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('viandas', 'escritura')
  );

create policy "ordenes_venta_update_viandas" on edgy_gestion.ordenes_venta
  for update using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('viandas', 'escritura')
  );

create policy "orden_venta_items_select_viandas" on edgy_gestion.orden_venta_items
  for select using (
    orden_id in (
      select id from edgy_gestion.ordenes_venta
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('viandas', 'lectura')
    )
  );

create policy "orden_venta_items_insert_viandas" on edgy_gestion.orden_venta_items
  for insert with check (
    orden_id in (
      select id from edgy_gestion.ordenes_venta
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('viandas', 'escritura')
    )
  );

-- ─── Verificación ────────────────────────────────────────────

select column_name
from information_schema.columns
where table_schema = 'edgy_gestion'
  and table_name = 'entregas_vianda'
  and column_name in ('producto_id', 'precio_unitario', 'orden_id', 'comprobante_id');

select policyname from pg_policies
where schemaname = 'edgy_gestion'
  and tablename in ('ordenes_venta', 'orden_venta_items')
  and policyname like '%viandas%';
