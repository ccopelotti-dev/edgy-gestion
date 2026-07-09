-- ============================================================
-- Migración 0024: Productos · Fase 2 (Variantes de color/talle)
-- Edgy Gestión · schema edgy_gestion
--
-- Segunda de cinco fases del refactor de Productos. Un producto puede
-- ser 'unico' (como hoy, un solo stock) o 'con_variantes' (ej. una
-- remera con combinaciones color/talle, cada una con SU PROPIO stock
-- individual -- confirmado con el usuario). Mismo precio de venta para
-- todas las variantes de un producto (no se abre precio por variante,
-- a diferencia de Servicios).
--
-- RLS de `producto_variantes`: NO tiene cliente_id propio -- se gatea
-- vía join a productos.cliente_id, mismo patrón que `formula_lineas`
-- (ver 0017_productos_stock_completo.sql).
-- ============================================================

-- ─── Producto: tipo (unico / con_variantes) ────────────────

alter table edgy_gestion.productos
  add column if not exists tipo text not null default 'unico'
    check (tipo in ('unico', 'con_variantes'));

-- ─── Variantes de producto ──────────────────────────────────

create table if not exists edgy_gestion.producto_variantes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references edgy_gestion.productos(id) on delete cascade,
  color text,
  talle text,
  codigo_barras text,
  stock numeric not null default 0,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

alter table edgy_gestion.producto_variantes enable row level security;

create policy "Lectura interna de producto_variantes" on edgy_gestion.producto_variantes
  for select using (
    edgy_gestion.es_personal_edgy()
    or producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'lectura')
    )
  );

create policy "Alta de producto_variantes" on edgy_gestion.producto_variantes
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

create policy "Edicion de producto_variantes" on edgy_gestion.producto_variantes
  for update using (
    edgy_gestion.es_personal_edgy()
    or producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

create policy "Borrado de producto_variantes" on edgy_gestion.producto_variantes
  for delete using (
    edgy_gestion.es_personal_edgy()
    or producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

-- ─── Movimientos y recepción: referencia a la variante puntual ─
-- Cuando el producto es 'con_variantes', el movimiento/línea de
-- recepción apunta a la variante específica (variante_id) además del
-- producto -- así Recepción, Ajuste de stock y Control de Stock operan
-- sobre "Remera Roja M" y no sobre "Remera" en general.

alter table edgy_gestion.movimientos_stock
  add column if not exists variante_id uuid references edgy_gestion.producto_variantes(id);

alter table edgy_gestion.recepcion_lineas
  add column if not exists variante_id uuid references edgy_gestion.producto_variantes(id);
