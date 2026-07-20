-- ============================================================
-- Migración 0058: Compras · Orden de Pago (líneas de pago + estado)
-- Edgy Gestión · schema edgy_gestion
--
-- Factoriza "Registrar pago" en una Orden de Pago con ciclo de vida:
-- se arma en 'pendiente' (qué se cancela + con qué combinación de medios,
-- ej. transferencia + 3 cheques a 30/60/90) y recién al confirmarla (estado
-- 'pagada') se elige la cuenta bancaria real y se emiten los cheques reales
-- en Tesorería. Los pagos ya existentes quedan en 'pagada' (ya estaban
-- ejecutados) -- ver default abajo.
--
-- pagos_compra, movimientos_bancarios y cheques ya existían fuera de las
-- migraciones trackeadas (ver comentario en 0055/0057), por eso son
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS. Las políticas RLS existentes
-- ya cubren las columnas nuevas.
-- ============================================================

alter table edgy_gestion.pagos_compra
  add column if not exists estado text not null default 'pagada',
  add column if not exists lineas_pago jsonb not null default '[]'::jsonb,
  add column if not exists fecha_confirmacion date,
  add column if not exists updated_at timestamptz not null default now();

-- Trazabilidad: desde Tesorería poder rastrear de qué Orden de Pago de
-- Compras vino un movimiento bancario o un cheque emitido.
alter table edgy_gestion.movimientos_bancarios
  add column if not exists origen_id uuid;

alter table edgy_gestion.cheques
  add column if not exists origen_modulo text,
  add column if not exists origen_id uuid;
