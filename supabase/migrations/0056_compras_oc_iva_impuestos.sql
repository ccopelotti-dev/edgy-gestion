-- ============================================================
-- Migración 0056: Compras · IVA por ítem y otros impuestos en OC
-- Edgy Gestión · schema edgy_gestion
--
-- El dialog "Cargar precios cotizados" de Órdenes de Compra (Fase 21)
-- necesita poder estimar el costo total real de una compra ANTES de
-- recibir la factura del proveedor: alícuota de IVA por ítem, más una
-- lista libre de otros impuestos/percepciones (percepción de Ganancias,
-- percepción de IIBB, impuesto a los débitos y créditos bancarios, etc.
-- -- varían mucho según proveedor/jurisdicción, por eso van como lista
-- libre en vez de columnas fijas).
--
-- Mismas columnas de IVA en cotizacion_compra_items para no tener dos
-- shapes distintas de "item genérico" (mismo criterio que la migración
-- 0054, que agregó producto_id/insumo_id/unidad a ambas tablas de items
-- aunque cotización no siempre las use).
--
-- Todas estas tablas ya existían fuera de las migraciones trackeadas (ver
-- comentario en 0055), por eso son ALTER TABLE ... ADD COLUMN IF NOT
-- EXISTS. Las políticas RLS existentes ya cubren las columnas nuevas.
-- ============================================================

alter table edgy_gestion.orden_compra_items
  add column if not exists alicuota_iva numeric,
  add column if not exists monto_iva numeric;

alter table edgy_gestion.cotizacion_compra_items
  add column if not exists alicuota_iva numeric,
  add column if not exists monto_iva numeric;

alter table edgy_gestion.ordenes_compra
  add column if not exists monto_iva numeric,
  add column if not exists otros_impuestos jsonb not null default '[]'::jsonb;
