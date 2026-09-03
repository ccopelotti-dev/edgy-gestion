-- ============================================================
-- Fase 70b: columna medio_pago en ingresos_hogar
-- ============================================================
-- Se me pasó en la migración 0117: para el "doble registro" del aporte
-- de la Charcutería (Fase 70), hace falta saber CÓMO salió la plata
-- (efectivo/transferencia) para reflejarlo bien en la Tesorería del
-- negocio (caja vs. banco). Solo aplica a tipo='aporte_negocio' -- se
-- ignora en ingreso_familiar/otro.
-- ============================================================

set search_path to edgy_gestion, public;

alter table edgy_gestion.ingresos_hogar add column if not exists medio_pago text;
comment on column edgy_gestion.ingresos_hogar.medio_pago is
  'Fase 70 -- solo relevante para tipo=aporte_negocio: cómo salió la plata de la Charcutería, para el espejo en su Tesorería.';
