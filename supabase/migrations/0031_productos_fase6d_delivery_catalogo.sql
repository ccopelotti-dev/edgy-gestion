-- ============================================================
-- Migración 0031: Productos · Fase 6d (Delivery con catálogo y lista de precio)
-- Edgy Gestión · schema edgy_gestion
--
-- Última sub-fase de la Fase 6 del refactor de Productos (6a Comandas,
-- 6c Ventas con catálogo, 6b Garantía al facturar -- ambas apoyadas en
-- el vínculo producto↔venta permanente resuelto en 6c). Esta fase
-- extiende ese mismo vínculo a Delivery por WhatsApp: los ítems de un
-- pedido pueden seguir siendo texto libre (comportamiento default sin
-- cambios) o estar vinculados a un producto real del catálogo, con el
-- mismo comportamiento que ya tiene Ventas -- descuento de stock
-- bloqueante y activación automática de garantía -- en el momento en
-- que el pedido se marca "Entregado" (que es cuando Delivery genera la
-- Venta real vía cerrarPedidoComoVenta.ts).
--
-- Qué trae:
-- 1) clientes.lista_precio_delivery_id: misma idea que
--    lista_precio_comandas_id (0028) y lista_precio_ventas_id (0029)
--    pero para el canal Delivery. Si es null (default), Delivery sigue
--    usando productos.precio_venta exactamente como antes.
-- 2) RLS: mismas policies adicionales que ya tiene Ventas (0029) para
--    productos/producto_variantes/movimientos_stock, pero basadas en
--    el permiso de Delivery por WhatsApp -- se combinan por OR con las
--    existentes, no las reemplazan.
-- 3) RLS: policy adicional de INSERT en garantias_emitidas (0030) para
--    que Delivery pueda activar garantías sin depender de que el
--    usuario también tenga permiso de escritura en Ventas.
-- ============================================================

-- ─── Lista de precio por canal: Delivery ───────────────────────

alter table edgy_gestion.clientes
  add column if not exists lista_precio_delivery_id uuid
  references edgy_gestion.listas_precio(id) on delete set null;

-- ─── RLS: productos ────────────────────────────────────────────

create policy "productos_select_delivery_lectura" on edgy_gestion.productos
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('delivery-whatsapp', 'lectura')
  );

create policy "productos_update_delivery_escritura" on edgy_gestion.productos
  for update using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('delivery-whatsapp', 'escritura')
  )
  with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('delivery-whatsapp', 'escritura')
  );

-- ─── RLS: producto_variantes (gateado vía join a productos, igual
--     que el resto de las policies de esta tabla) ────────────────

create policy "producto_variantes_select_delivery_lectura" on edgy_gestion.producto_variantes
  for select using (
    producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('delivery-whatsapp', 'lectura')
    )
  );

create policy "producto_variantes_update_delivery_escritura" on edgy_gestion.producto_variantes
  for update using (
    producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('delivery-whatsapp', 'escritura')
    )
  );

-- ─── RLS: movimientos_stock (alta del movimiento de egreso por pedido) ─

create policy "movimientos_stock_insert_delivery_escritura" on edgy_gestion.movimientos_stock
  for insert with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('delivery-whatsapp', 'escritura')
  );

-- ─── RLS: garantias_emitidas (alta adicional desde Delivery) ──────

create policy "garantias_emitidas_insert_delivery" on edgy_gestion.garantias_emitidas
  for insert with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('delivery-whatsapp', 'escritura')
  );
