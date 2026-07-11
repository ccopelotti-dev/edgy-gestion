-- ============================================================
-- Migración 0041: Fase 13b — Arqueo ciego en Caja por turno
-- Edgy Gestión · schema edgy_gestion
--
-- El cierre de turno YA es "ciego" en la UI actual (Turno.tsx nunca le
-- muestra el monto esperado al cajero mientras carga su conteo físico
-- -- `esperado` solo se calcula adentro de cerrarTurno(), después de
-- que el cajero ya escribió su número). Lo que faltaba era (a) guardar
-- ese monto esperado para poder auditar el arqueo más adelante (hoy
-- solo se persistía la `diferencia` ya calculada, sin dejar rastro de
-- contra qué se comparó), y (b) mostrarle al cajero un resumen claro
-- recién DESPUÉS de confirmar el cierre, en vez de que la diferencia
-- quede escondida hasta que alguien vaya a mirar el historial.
-- ============================================================

alter table edgy_gestion.turnos_caja
  add column if not exists monto_esperado numeric;

comment on column edgy_gestion.turnos_caja.monto_esperado is
  'Monto esperado en caja (apertura + neto de efectivo en Tesorería) calculado al momento del cierre -- se guarda para auditoría del arqueo, nunca se le muestra al cajero antes de que declare su conteo físico.';

-- ─── Verificación ────────────────────────────────────────────

select column_name, data_type
from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'turnos_caja'
  and column_name = 'monto_esperado';
