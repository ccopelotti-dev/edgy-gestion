-- ============================================================
-- Migración 0032: Comandas · Fase 7a (Stock, cierre automático y
-- facturación con recibo)
-- Edgy Gestión · schema edgy_gestion
--
-- Auditoría solicitada por el usuario: Comandas es el único canal que
-- ya obliga a vincular cada ítem a un producto real del catálogo
-- (desde la Fase 6a) pero nunca recibió el descuento de stock ni la
-- activación de garantía que sí tienen Ventas (6c/6b) y Delivery (6d)
-- -- cada venta de mesa/mostrador dejaba el stock de Productos
-- desactualizado en silencio. Esta fase cierra ese círculo y además:
-- - Permite vincular la comanda a un cliente registrado (clientes_venta),
--   necesario para poder facturar a cuenta corriente (antes siempre
--   facturaba a "Consumidor Final", que no puede tener cuenta corriente).
-- - Habilita cuenta corriente como medio de pago real en Comandas (antes
--   se filtraba explícitamente del selector).
-- - Cuando el pago es de contado (cualquier medio salvo cuenta
--   corriente), se genera un recibo real (fila en `cobros` +
--   `cobro_imputaciones`, mismo mecanismo que ya usa Ventas/Cobranzas)
--   con el medio de pago elegido, y se registra el movimiento en
--   Tesorería. Si es cuenta corriente, el comprobante queda emitido con
--   saldo pendiente y no se genera recibo ni movimiento de caja -- se
--   cobra más adelante desde Cobranzas, mismo criterio que Ventas.
--
-- Qué trae:
-- 1) comandas.cliente_venta_id: cliente registrado opcional de la mesa.
-- 2) RLS adicionales para el permiso de Comandas y cocina sobre
--    productos/producto_variantes (selector + descuento de stock),
--    movimientos_stock (auditoría del descuento), garantias_emitidas
--    (activación) y cobros/cobro_imputaciones (recibo al cobrar de
--    contado) -- se combinan por OR con las existentes, no las
--    reemplazan. Mismo criterio que las migraciones 0029 (Ventas) y
--    0031 (Delivery).
-- ============================================================

-- ─── Cliente registrado opcional de la comanda ─────────────────

alter table edgy_gestion.comandas
  add column if not exists cliente_venta_id uuid
  references edgy_gestion.clientes_venta(id) on delete set null;

-- ─── RLS: productos ────────────────────────────────────────────

create policy "productos_select_comandas_lectura" on edgy_gestion.productos
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('comandas-cocina', 'lectura')
  );

create policy "productos_update_comandas_escritura" on edgy_gestion.productos
  for update using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('comandas-cocina', 'escritura')
  )
  with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('comandas-cocina', 'escritura')
  );

-- ─── RLS: producto_variantes ────────────────────────────────────

create policy "producto_variantes_select_comandas_lectura" on edgy_gestion.producto_variantes
  for select using (
    producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('comandas-cocina', 'lectura')
    )
  );

-- ─── RLS: movimientos_stock (alta del movimiento de egreso por comanda) ─

create policy "movimientos_stock_insert_comandas_escritura" on edgy_gestion.movimientos_stock
  for insert with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('comandas-cocina', 'escritura')
  );

-- ─── RLS: garantias_emitidas (alta adicional desde Comandas) ──────

create policy "garantias_emitidas_insert_comandas" on edgy_gestion.garantias_emitidas
  for insert with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('comandas-cocina', 'escritura')
  );

-- ─── RLS: cobros / cobro_imputaciones (recibo al cobrar de contado) ──
--
-- Defensivas: si la policy existente de estas tablas ya alcanza para
-- que Comandas pueda insertar (por ejemplo si solo valida cliente_id
-- sin exigir permiso de Ventas puntual), estas quedan de más pero no
-- rompen nada -- se combinan por OR, igual que el resto de esta
-- migración.

create policy "cobros_insert_comandas_escritura" on edgy_gestion.cobros
  for insert with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('comandas-cocina', 'escritura')
  );

create policy "cobro_imputaciones_insert_comandas_escritura" on edgy_gestion.cobro_imputaciones
  for insert with check (
    cobro_id in (
      select c.id from edgy_gestion.cobros c
      where c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('comandas-cocina', 'escritura')
    )
  );
