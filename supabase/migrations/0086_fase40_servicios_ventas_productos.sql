-- Fase 40: Servicios vendibles en Ventas (Presupuestos + Comprobantes) +
-- vínculo Producto <-> Servicio asociado.

-- ─── Servicios como línea de venta ──────────────────────────────

alter table edgy_gestion.comprobante_venta_items
  add column if not exists servicio_id uuid references edgy_gestion.servicios(id),
  add column if not exists variante_servicio_id uuid references edgy_gestion.servicio_variantes(id);

alter table edgy_gestion.presupuesto_items
  add column if not exists servicio_id uuid references edgy_gestion.servicios(id),
  add column if not exists variante_servicio_id uuid references edgy_gestion.servicio_variantes(id);

-- Mismo gap que documentó la migración 0048 para combos: las policies de
-- SELECT de servicios/servicio_variantes solo dejan pasar al permiso
-- 'servicios'. Un usuario con permiso de 'ventas' pero sin 'servicios'
-- asignado a su rol no podría ver los servicios en el buscador de
-- Nuevo comprobante / Nuevo presupuesto. Se agregan policies ADICIONALES
-- de solo lectura por 'ventas', que se combinan por OR con las existentes.

create policy "servicios_select_ventas_lectura" on edgy_gestion.servicios
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas', 'lectura')
  );

create policy "servicio_variantes_select_ventas_lectura" on edgy_gestion.servicio_variantes
  for select using (
    servicio_id in (
      select s.id from edgy_gestion.servicios s
      where s.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas', 'lectura')
    )
  );

-- ─── Producto -> Servicio asociado ──────────────────────────────
-- Mismo patrón que Producto.marcaId / Producto.proveedorId (Fase 1): un
-- enlace opcional simple, no una tabla puente -- la gran mayoría de los
-- casos reales es "este producto tiene UN servicio típico asociado" (ej.
-- instalación). `obligatorio` decide si Ventas lo agrega solo al vender
-- el producto o solo lo sugiere.

alter table edgy_gestion.productos
  add column if not exists servicio_asociado_id uuid references edgy_gestion.servicios(id),
  add column if not exists servicio_asociado_obligatorio boolean not null default false;

-- ─── Verificación ────────────────────────────────────────────

select column_name from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'comprobante_venta_items'
  and column_name in ('servicio_id', 'variante_servicio_id');

select column_name from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'presupuesto_items'
  and column_name in ('servicio_id', 'variante_servicio_id');

select column_name from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'productos'
  and column_name in ('servicio_asociado_id', 'servicio_asociado_obligatorio');

select policyname from pg_policies
where schemaname = 'edgy_gestion' and tablename in ('servicios', 'servicio_variantes')
  and policyname like '%ventas%';
