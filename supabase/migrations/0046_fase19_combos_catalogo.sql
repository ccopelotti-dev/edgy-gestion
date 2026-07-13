-- ============================================================
-- Migración 0046: Fase 19 (prep) — Personalización de Combos en catálogo
-- Edgy Gestión · schema edgy_gestion
--
-- Agregado pedido por el usuario antes de conectar Combos a los
-- catálogos de venta (Fase 19): la palabra "Combos" no siempre encaja
-- con cómo el cliente quiere mostrar sus promociones (ej: "PROMO 2x1",
-- "Ofertas Black Friday", "Oportunidades"). Se suman dos niveles de
-- personalización:
--   - Global (por cliente/negocio): título de la sección que agrupa
--     los combos en el catálogo público y demás listados. Default
--     'Combos' -- comportamiento sin cambios para quien no lo toque.
--   - Por combo: etiqueta/badge opcional para resaltar una promoción
--     puntual (ej. un combo con etiqueta "Black Friday" y otro con
--     "2x1" al mismo tiempo). NULL = sin badge, comportamiento actual.
-- ============================================================

alter table edgy_gestion.clientes
  add column if not exists combos_titulo_seccion text not null default 'Combos';

alter table edgy_gestion.combos
  add column if not exists etiqueta text;
