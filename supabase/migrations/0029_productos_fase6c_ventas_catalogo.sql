-- ============================================================
-- Migración 0029: Productos · Fase 6c (Ventas con selector de catálogo)
-- Edgy Gestión · schema edgy_gestion
--
-- Fase 6 del refactor de Productos, reordenada: se construye 6c antes
-- que 6b porque el vínculo producto↔venta necesitaba ser permanente
-- (para descontar stock), no un parche transitorio -- 6b (garantía al
-- facturar) se va a apoyar en este mismo vínculo, ya resuelto acá.
--
-- Qué trae:
-- 1) clientes.lista_precio_ventas_id: misma idea que
--    lista_precio_comandas_id (migración 0028) pero para el canal
--    Ventas/Facturación. Si es null (default), Ventas sigue usando
--    productos.precio_venta exactamente como antes de esta fase.
-- 2) RLS: Ventas ahora lee y escribe en productos/producto_variantes
--    (selector de catálogo + descuento de stock al facturar) y escribe
--    en movimientos_stock (auditoría del descuento). Se agregan
--    policies ADICIONALES (se combinan por OR con las de
--    productos-stock, no las reemplazan) basadas en el permiso de
--    Ventas, para que cualquier usuario que puede facturar pueda
--    hacer esto sin depender de tener también permiso en Productos
--    asignado a su rol -- mismo criterio que la policy de `clientes`
--    agregada en 0028.
-- ============================================================

-- ─── Lista de precio por canal: Ventas / Facturación ──────────

alter table edgy_gestion.clientes
  add column if not exists lista_precio_ventas_id uuid
  references edgy_gestion.listas_precio(id) on delete set null;

-- ─── RLS: productos ────────────────────────────────────────────

create policy "productos_select_ventas_lectura" on edgy_gestion.productos
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas', 'lectura')
  );

create policy "productos_update_ventas_escritura" on edgy_gestion.productos
  for update using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas', 'escritura')
  )
  with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas', 'escritura')
  );

-- ─── RLS: producto_variantes (gateado vía join a productos, igual
--     que el resto de las policies de esta tabla) ────────────────

create policy "producto_variantes_select_ventas_lectura" on edgy_gestion.producto_variantes
  for select using (
    producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas', 'lectura')
    )
  );

create policy "producto_variantes_update_ventas_escritura" on edgy_gestion.producto_variantes
  for update using (
    producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas', 'escritura')
    )
  );

-- ─── RLS: movimientos_stock (alta del movimiento de egreso por venta) ─

create policy "movimientos_stock_insert_ventas_escritura" on edgy_gestion.movimientos_stock
  for insert with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas', 'escritura')
  );
