-- ============================================================
-- Migración 0047: Fase 19.1 — Combos vendibles en Ventas/Nuevo comprobante
-- Edgy Gestión · schema edgy_gestion
--
-- Agrega combo_id (opcional, mutuamente excluyente con producto_id) a
-- comprobante_venta_items: una línea de comprobante ahora puede estar
-- vinculada a un Combo del catálogo en vez de a un Producto único. La
-- venta de un combo descuenta stock de sus componentes fijos (ver
-- src/modules/ventas/lib/descontarStockVenta.ts), no tiene stock propio.
-- ============================================================

alter table edgy_gestion.comprobante_venta_items
  add column if not exists combo_id uuid references edgy_gestion.combos(id);
