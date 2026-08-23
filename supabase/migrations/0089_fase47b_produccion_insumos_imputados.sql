-- Migración 0089 · Producción: snapshot de insumos imputados
--
-- Guarda, al momento de crear el borrador, exactamente qué insumos y
-- cuánto de cada uno se va a descontar (nombre y costo unitario incluidos,
-- como foto -- mismo criterio que ya usan las líneas de Fórmula). Sirve
-- para dos cosas con la MISMA columna: (a) al Confirmar, aplicar el
-- descuento real sin tener que recalcular la fórmula de nuevo (evita que
-- un cambio a la fórmula entre "registrar" y "confirmar" corra el arco),
-- y (b) el PDF de insumos imputados a un lote, tanto en borrador (preview)
-- como ya confirmado.
--
-- Histórico: los lotes viejos no tienen este detalle guardado -- quedan en
-- '[]'. No hace falta reconstruirlo (ya están confirmados, el stock ya se
-- movió con la lógica vieja) y el PDF para esos lotes puede avisar que es
-- de antes de este cambio si hace falta más adelante.

alter table edgy_gestion.producciones
  add column if not exists insumos_imputados jsonb not null default '[]'::jsonb;

-- ─── Verificación ────────────────────────────────────────────

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'producciones'
  and column_name = 'insumos_imputados';
