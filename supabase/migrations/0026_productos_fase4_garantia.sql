-- ============================================================
-- Migración 0026: Productos · Fase 4 (Garantía automática + plantillas)
-- Edgy Gestión · schema edgy_gestion
--
-- Cuarta de seis fases del refactor de Productos. Catálogo flexible de
-- plantillas de garantía (ej. "Garantía estándar" 12 meses, "Garantía
-- extendida" 24 meses), con duración (meses) y cobertura (texto libre).
--
-- Asignación en dos niveles (a pedido del usuario -- "Ambas"):
--   - rubros.plantilla_garantia_id: default para todos los productos de
--     ese rubro.
--   - productos.plantilla_garantia_id: override puntual de un producto; si
--     no está seteado, hereda la del rubro.
--
-- IMPORTANTE: esta fase deja todo LISTO del lado de Productos. La
-- activación real de una garantía (para qué venta/cliente, desde cuándo
-- corre) sucede cuando Ventas emite una factura -- eso es la Fase 6, donde
-- Ventas va a leer si el producto vendido tiene una plantilla de garantía
-- asignada (propia o heredada del rubro) para activarla. Acá NO se crea
-- ninguna tabla de garantías "emitidas" ni de instancias activas.
--
-- RLS de `plantillas_garantia`: mismo patrón que `marcas` y `listas_precio`
-- (catálogo propio del cliente, con cliente_id directo).
-- ============================================================

-- ─── Plantillas de garantía ──────────────────────────────────

create table if not exists edgy_gestion.plantillas_garantia (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  nombre text not null,
  duracion_meses integer not null default 12,
  cobertura text,
  created_at timestamptz not null default now(),
  unique (cliente_id, nombre)
);

alter table edgy_gestion.plantillas_garantia enable row level security;

create policy "Lectura interna de plantillas_garantia" on edgy_gestion.plantillas_garantia
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'lectura'))
  );

create policy "Alta de plantillas_garantia" on edgy_gestion.plantillas_garantia
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura'))
  );

create policy "Edicion de plantillas_garantia" on edgy_gestion.plantillas_garantia
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura'))
  );

create policy "Borrado de plantillas_garantia" on edgy_gestion.plantillas_garantia
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura'))
  );

-- ─── Asignación en Rubros (default) y Productos (override) ──
-- "on delete set null": si se borra una plantilla, los rubros/productos que
-- la tenían asignada quedan simplemente sin garantía (no rompe nada).

alter table edgy_gestion.rubros
  add column if not exists plantilla_garantia_id uuid
  references edgy_gestion.plantillas_garantia(id) on delete set null;

alter table edgy_gestion.productos
  add column if not exists plantilla_garantia_id uuid
  references edgy_gestion.plantillas_garantia(id) on delete set null;
