-- ============================================================
-- Migración 0062: Rename módulo delivery-whatsapp -> ventas-online
-- (Fase 22a) · Edgy Gestión · schema edgy_gestion
--
-- El módulo "Delivery por WhatsApp" pasa a llamarse "Ventas Online":
-- deja de ser exclusivamente un canal de pedidos por WhatsApp para
-- ser el canal de venta y comunicación online con el cliente en
-- general (WhatsApp hoy, otras plataformas a futuro). Requerimiento
-- del usuario: renombrar tanto la etiqueta visible como el
-- identificador interno (slug), no solo el label.
--
-- Como `tiene_permiso(p_modulo_slug, p_nivel)` resuelve el módulo por
-- slug en cada evaluación de RLS, todas las policies que tenían
-- 'delivery-whatsapp' hardcodeado como literal quedarían rotas apenas
-- se renombre el slug en `modulos`. Por eso esta migración dropea y
-- recrea, una por una, exactamente las mismas policies (mismo nombre,
-- misma lógica) que ya existían -- solo cambia el literal del slug.
-- La activación por tenant (`cliente_modulos`) y los permisos
-- (`permisos`/`permisos_rol`) no se tocan: referencian `modulos` por
-- `modulo_id uuid`, no por slug, así que sobreviven el rename solas.
--
-- Origen de cada policy recreada (para auditoría):
--   0031_productos_fase6d_delivery_catalogo.sql:
--     productos_select_delivery_lectura, productos_update_delivery_escritura,
--     producto_variantes_select_delivery_lectura,
--     producto_variantes_update_delivery_escritura,
--     movimientos_stock_insert_delivery_escritura,
--     garantias_emitidas_insert_delivery
--   0035_ordenes_venta_fase8b8c.sql:
--     pedidos_delivery_select/insert/update/delete
--   0036_retrofit_ordenes_venta_publico.sql:
--     orden_venta_items_select_delivery/insert_delivery/update_delivery
--
-- También: backfill de `ordenes_venta.origen_modulo` para las órdenes
-- ya creadas por este canal, y update del catálogo `modulos` (nombre +
-- slug). El slug se actualiza último para que las policies de arriba
-- ya estén apuntando al nuevo literal cuando el UPDATE surta efecto.
-- ============================================================

set search_path to edgy_gestion, public;

-- ─── 1) productos / producto_variantes / movimientos_stock / garantias_emitidas (0031) ───

drop policy if exists "productos_select_delivery_lectura" on edgy_gestion.productos;
create policy "productos_select_delivery_lectura" on edgy_gestion.productos
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas-online', 'lectura')
  );

drop policy if exists "productos_update_delivery_escritura" on edgy_gestion.productos;
create policy "productos_update_delivery_escritura" on edgy_gestion.productos
  for update using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas-online', 'escritura')
  )
  with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas-online', 'escritura')
  );

drop policy if exists "producto_variantes_select_delivery_lectura" on edgy_gestion.producto_variantes;
create policy "producto_variantes_select_delivery_lectura" on edgy_gestion.producto_variantes
  for select using (
    producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas-online', 'lectura')
    )
  );

drop policy if exists "producto_variantes_update_delivery_escritura" on edgy_gestion.producto_variantes;
create policy "producto_variantes_update_delivery_escritura" on edgy_gestion.producto_variantes
  for update using (
    producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas-online', 'escritura')
    )
  );

drop policy if exists "movimientos_stock_insert_delivery_escritura" on edgy_gestion.movimientos_stock;
create policy "movimientos_stock_insert_delivery_escritura" on edgy_gestion.movimientos_stock
  for insert with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas-online', 'escritura')
  );

drop policy if exists "garantias_emitidas_insert_delivery" on edgy_gestion.garantias_emitidas;
create policy "garantias_emitidas_insert_delivery" on edgy_gestion.garantias_emitidas
  for insert with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas-online', 'escritura')
  );

-- ─── 2) pedidos_delivery (0035) ────────────────────────────────

drop policy if exists "pedidos_delivery_select" on edgy_gestion.pedidos_delivery;
create policy "pedidos_delivery_select" on edgy_gestion.pedidos_delivery
  for select using (
    edgy_gestion.es_personal_edgy()
    or orden_venta_id in (
      select id from edgy_gestion.ordenes_venta
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas-online', 'lectura')
    )
  );

drop policy if exists "pedidos_delivery_insert" on edgy_gestion.pedidos_delivery;
create policy "pedidos_delivery_insert" on edgy_gestion.pedidos_delivery
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or orden_venta_id in (
      select id from edgy_gestion.ordenes_venta
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas-online', 'escritura')
    )
  );

drop policy if exists "pedidos_delivery_update" on edgy_gestion.pedidos_delivery;
create policy "pedidos_delivery_update" on edgy_gestion.pedidos_delivery
  for update using (
    edgy_gestion.es_personal_edgy()
    or orden_venta_id in (
      select id from edgy_gestion.ordenes_venta
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas-online', 'escritura')
    )
  );

drop policy if exists "pedidos_delivery_delete" on edgy_gestion.pedidos_delivery;
create policy "pedidos_delivery_delete" on edgy_gestion.pedidos_delivery
  for delete using (
    edgy_gestion.es_personal_edgy()
    or orden_venta_id in (
      select id from edgy_gestion.ordenes_venta
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas-online', 'admin')
    )
  );

-- ─── 3) orden_venta_items (0036) ───────────────────────────────

drop policy if exists "orden_venta_items_select_delivery" on edgy_gestion.orden_venta_items;
create policy "orden_venta_items_select_delivery" on edgy_gestion.orden_venta_items
  for select using (
    edgy_gestion.es_personal_edgy()
    or orden_id in (
      select id from edgy_gestion.ordenes_venta
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas-online', 'lectura')
    )
  );

drop policy if exists "orden_venta_items_insert_delivery" on edgy_gestion.orden_venta_items;
create policy "orden_venta_items_insert_delivery" on edgy_gestion.orden_venta_items
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or orden_id in (
      select id from edgy_gestion.ordenes_venta
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas-online', 'escritura')
    )
  );

drop policy if exists "orden_venta_items_update_delivery" on edgy_gestion.orden_venta_items;
create policy "orden_venta_items_update_delivery" on edgy_gestion.orden_venta_items
  for update using (
    edgy_gestion.es_personal_edgy()
    or orden_id in (
      select id from edgy_gestion.ordenes_venta
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas-online', 'escritura')
    )
  );

-- ─── 4) Backfill de datos ya escritos con el slug viejo ────────

update edgy_gestion.ordenes_venta
  set origen_modulo = 'ventas-online'
  where origen_modulo = 'delivery-whatsapp';

-- ─── 5) Catálogo modulos: nombre + slug (al final, ya con las
--     policies de arriba apuntando al nuevo literal) ────────────

update edgy_gestion.modulos
  set nombre = 'Ventas Online',
      slug = 'ventas-online'
  where slug = 'delivery-whatsapp';
