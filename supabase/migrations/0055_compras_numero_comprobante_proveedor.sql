-- ============================================================
-- Migración 0055: Compras · Nro. de Comprobante del proveedor
-- Edgy Gestión · schema edgy_gestion
--
-- Hasta ahora comprobantes_compra solo guardaba `numero`, el correlativo
-- INTERNO de Edgy Gestión (FC-00001, FC-00002...). No había forma de
-- cargar el número real que viene impreso en la factura del proveedor
-- (ej. "0001-00000542") -- dato fundamental para identificar la compra
-- frente al proveedor y para el libro IVA Compras del período fiscal.
--
-- Esta columna guarda ese número ya formateado (con guion), cargado en el
-- modal "Nuevo comprobante de compra" con el mismo criterio de UI que
-- Nro. de Remito (dos campos: Pto. Vta 4 dígitos + Número 8 dígitos, con
-- autocompletado de ceros).
--
-- comprobantes_compra ya existía en Supabase (creada fuera de las
-- migraciones trackeadas -- ver comentario en 0023_productos_fase1.sql),
-- por eso es ALTER TABLE ... ADD COLUMN IF NOT EXISTS, sin CREATE TABLE.
-- Las políticas RLS existentes de la tabla ya cubren la columna nueva.
-- ============================================================

alter table edgy_gestion.comprobantes_compra
  add column if not exists numero_comprobante_proveedor text;
