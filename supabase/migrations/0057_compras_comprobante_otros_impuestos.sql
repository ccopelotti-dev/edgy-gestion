-- ============================================================
-- Migración 0057: Compras · Otros impuestos en Comprobante de compra
-- Edgy Gestión · schema edgy_gestion
--
-- Mismo criterio que la migración 0056 (Orden de Compra), pero acá en el
-- comprobante fiscal real: percepción de Ganancias, percepción de IIBB,
-- impuesto a los débitos y créditos bancarios, etc. -- lista libre porque
-- varía según proveedor/jurisdicción. Cuando el comprobante se registra
-- desde "Registrar factura" de una Orden de Compra, estos valores se
-- precargan desde la OC (ver ComprobanteCompraDialog con prop
-- `ordenCompra`), pero se pueden editar libremente antes de guardar.
--
-- comprobantes_compra ya existía fuera de las migraciones trackeadas (ver
-- comentario en 0055), por eso es ALTER TABLE ... ADD COLUMN IF NOT
-- EXISTS. Las políticas RLS existentes ya cubren la columna nueva.
-- ============================================================

alter table edgy_gestion.comprobantes_compra
  add column if not exists otros_impuestos jsonb not null default '[]'::jsonb;
