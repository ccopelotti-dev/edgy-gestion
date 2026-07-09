-- ============================================================
-- Migración 0025: Productos · Fase 3 (Listas de precio)
-- Edgy Gestión · schema edgy_gestion
--
-- Tercera de cinco fases del refactor de Productos. Catálogo flexible
-- (crear/renombrar/borrar) de listas de precio -- ej. "Mostrador/Salón",
-- "Delivery", "Mayorista/Eventos". Cada lista define un % de recargo por
-- defecto sobre el costo del producto; el precio final en esa lista es
-- costo * (1 + porcentaje_recargo / 100), salvo que el producto tenga un
-- override puntual en producto_precios.
--
-- IMPORTANTE: productos.precio_venta NO se toca en esta fase -- sigue
-- siendo el precio que usan Ventas, Comandas, Menú QR, Delivery y
-- Presupuestos/Cotizaciones (funciona como la lista "default" implícita).
-- Migrar esos módulos a usar listas de precio en vez de precio_venta queda
-- para una fase futura (Fase 6), a pedido del usuario -- por ahora las
-- listas solo se administran desde Productos.
--
-- RLS de `listas_precio`: mismo patrón que `marcas` (catálogo propio del
-- cliente). RLS de `producto_precios`: NO tiene cliente_id propio -- se
-- gatea vía join a productos.cliente_id, mismo patrón que
-- `producto_variantes` (ver 0024_productos_fase2_variantes.sql).
-- ============================================================

-- ─── Listas de precio ───────────────────────────────────────

create table if not exists edgy_gestion.listas_precio (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  nombre text not null,
  porcentaje_recargo numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (cliente_id, nombre)
);

alter table edgy_gestion.listas_precio enable row level security;

create policy "Lectura interna de listas_precio" on edgy_gestion.listas_precio
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'lectura'))
  );

create policy "Alta de listas_precio" on edgy_gestion.listas_precio
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura'))
  );

create policy "Edicion de listas_precio" on edgy_gestion.listas_precio
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura'))
  );

create policy "Borrado de listas_precio" on edgy_gestion.listas_precio
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura'))
  );

-- ─── Precio por producto y lista (override manual) ──────────

create table if not exists edgy_gestion.producto_precios (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references edgy_gestion.productos(id) on delete cascade,
  lista_id uuid not null references edgy_gestion.listas_precio(id) on delete cascade,
  precio numeric not null,
  created_at timestamptz not null default now(),
  unique (producto_id, lista_id)
);

alter table edgy_gestion.producto_precios enable row level security;

create policy "Lectura interna de producto_precios" on edgy_gestion.producto_precios
  for select using (
    edgy_gestion.es_personal_edgy()
    or producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'lectura')
    )
  );

create policy "Alta de producto_precios" on edgy_gestion.producto_precios
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

create policy "Edicion de producto_precios" on edgy_gestion.producto_precios
  for update using (
    edgy_gestion.es_personal_edgy()
    or producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

create policy "Borrado de producto_precios" on edgy_gestion.producto_precios
  for delete using (
    edgy_gestion.es_personal_edgy()
    or producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

-- ─── Seed: 3 listas por defecto para cada cliente existente ─
-- Editables/borrables desde la UI -- esto solo evita arrancar de cero.

insert into edgy_gestion.listas_precio (cliente_id, nombre, porcentaje_recargo)
select id, 'Mostrador/Salón', 20 from edgy_gestion.clientes
on conflict (cliente_id, nombre) do nothing;

insert into edgy_gestion.listas_precio (cliente_id, nombre, porcentaje_recargo)
select id, 'Delivery', 30 from edgy_gestion.clientes
on conflict (cliente_id, nombre) do nothing;

insert into edgy_gestion.listas_precio (cliente_id, nombre, porcentaje_recargo)
select id, 'Mayorista/Eventos', 70 from edgy_gestion.clientes
on conflict (cliente_id, nombre) do nothing;
