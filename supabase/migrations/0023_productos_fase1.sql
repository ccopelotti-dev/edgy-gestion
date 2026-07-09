-- ============================================================
-- Migración 0023: Productos · Fase 1 (Marca, Proveedor preferido,
-- Vencimiento/lote)
-- Edgy Gestión · schema edgy_gestion
--
-- Primera de cinco fases del refactor de Productos acordado con el
-- usuario. Esta fase es deliberadamente de bajo riesgo: no toca
-- ningún otro módulo (comandas-cocina, delivery-whatsapp, ventas
-- siguen exactamente igual), solo agrega catálogo y campos opcionales.
--
-- RLS de `marcas`: mismo patrón exacto que `insumos` (ver
-- 0017_productos_stock_completo.sql) -- catálogo propio del cliente,
-- gateado por el permiso del módulo 'productos-stock'.
-- ============================================================

-- ─── Marca ──────────────────────────────────────────────────

create table if not exists edgy_gestion.marcas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  nombre text not null,
  created_at timestamptz not null default now(),
  unique (cliente_id, nombre)
);

alter table edgy_gestion.marcas enable row level security;

create policy "Lectura interna de marcas" on edgy_gestion.marcas
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'lectura'))
  );

create policy "Alta de marcas" on edgy_gestion.marcas
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura'))
  );

create policy "Edicion de marcas" on edgy_gestion.marcas
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura'))
  );

create policy "Borrado de marcas" on edgy_gestion.marcas
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura'))
  );

-- ─── Producto: marca y proveedor preferido ─────────────────

alter table edgy_gestion.productos
  add column if not exists marca_id uuid references edgy_gestion.marcas(id);

-- proveedor_id es el "proveedor preferido" del producto, para integrar
-- mejor con Compras más adelante (ej. sugerir proveedor al reponer
-- stock). No reemplaza el campo `proveedor` de texto libre que ya
-- existe en Recepción -- ese sigue siendo por remito, este es el
-- default del catálogo.
alter table edgy_gestion.productos
  add column if not exists proveedor_id uuid references edgy_gestion.proveedores(id);

-- ─── Vencimiento / lote ─────────────────────────────────────
-- Se carga por línea de Recepción (dónde entra la mercadería) y se
-- copia al movimiento de stock que esa línea genera al confirmar la
-- recepción (mismo patrón que costo_unitario) -- así Control de Stock
-- puede alertar "por vencer" consultando movimientos_stock directo,
-- sin tener que volver a la recepción original.

alter table edgy_gestion.recepcion_lineas
  add column if not exists fecha_vencimiento date;

alter table edgy_gestion.movimientos_stock
  add column if not exists fecha_vencimiento date;
