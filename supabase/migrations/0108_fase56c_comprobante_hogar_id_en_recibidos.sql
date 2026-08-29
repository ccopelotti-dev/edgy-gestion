-- ============================================================
-- Fase 56c: comprobante_hogar_id en comprobantes_recibidos
-- ============================================================
--
-- `comprobante_compra_id` tiene FK a `comprobantes_compra` -- no
-- admite el id de un `comprobantes_hogar`. Hace falta una columna
-- hermana para el caso destino='hogar' (ver agenteComprobanteCompra.js).
-- ============================================================

set search_path to edgy_gestion, public;

alter table edgy_gestion.comprobantes_recibidos
  add column if not exists comprobante_hogar_id uuid references edgy_gestion.comprobantes_hogar(id) on delete set null;

comment on column edgy_gestion.comprobantes_recibidos.comprobante_hogar_id is
  'Fase 56 -- igual que comprobante_compra_id pero para cuando destino=''hogar'': comprobante_compra_id tiene FK a comprobantes_compra y no admite el id de comprobantes_hogar.';
