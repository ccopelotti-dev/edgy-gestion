-- ============================================================
-- Fase 5b: Mejoras a Combos (Productos y Stock)
-- Edgy Gestión
--
-- Agrega:
--   - imagenes: galería de fotos del combo (mismo patrón que
--     productos.imagenes), la primera es la "principal".
--   - descuento_porcentaje: % de descuento aplicado sobre el
--     precio sugerido (suma de precio_venta de componentes fijos)
--     para llegar al precio de venta final del combo. El precio
--     final sigue siendo editable a mano (precio_venta ya existía).
-- ============================================================

alter table edgy_gestion.combos
  add column if not exists imagenes text[] not null default '{}',
  add column if not exists descuento_porcentaje numeric not null default 0;
