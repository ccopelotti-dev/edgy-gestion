-- ============================================================
-- Migración (Fase 81, 15/09): etapa de "Reposo" configurable en
-- Producción -- a pedido de Carlos (Charcutería): hay productos que
-- después de fabricados necesitan un tiempo de espera (curado, secado,
-- estacionamiento, etc.) antes de poder sumarse al stock disponible.
-- Nombre elegido a propósito genérico ("Reposo", no "Madurado"): sirve
-- para cualquier rubro, no solo fiambres/quesos.
--
-- Se configura por Fórmula (mismo lugar que ya vive `merma_porcentaje`,
-- que es un concepto distinto: esa es una merma DE COSTO informativa,
-- esta es una condición real que demora el alta de stock). Dos
-- criterios hoy, pensados para poder sumar un tercero más adelante sin
-- tocar el modelo:
--   - 'dias': el lote queda disponible solo con el paso del tiempo.
--   - 'peso': el lote queda disponible cuando una pesada de control
--     indica que llegó al % de su peso inicial que se definió como
--     objetivo (típico en embutidos/curados, donde el tiempo real varía
--     según humedad/ambiente).
--
-- Flujo de estados en `producciones`: antes 'borrador' -> 'confirmada'
-- (todo en un paso: se descuentan insumos Y se suma el producto
-- terminado). Ahora, si la fórmula tiene reposo configurado, pasa a
-- 'borrador' -> 'en_reposo' (los insumos YA se descontaron -- se usaron
-- físicamente -- pero el producto terminado todavía NO suma a stock) ->
-- 'confirmada' (recién acá se acredita el stock, al liberar el lote a
-- mano). Confirmado con Carlos: la cantidad que se acredita al liberar
-- es el PESO REAL post-reposo, no el teórico -- ese es el sentido de
-- todo esto. Para criterio 'dias' se asume por defecto el peso teórico
-- (ya contempla la merma esperada), corregible a mano si hace falta.
-- ============================================================

alter table edgy_gestion.formulas
  add column if not exists requiere_reposo boolean not null default false,
  add column if not exists criterio_reposo text,
  add column if not exists dias_reposo integer,
  add column if not exists porcentaje_peso_objetivo numeric;

alter table edgy_gestion.formulas
  add constraint formulas_criterio_reposo_check
    check (criterio_reposo is null or criterio_reposo in ('dias', 'peso'));

alter table edgy_gestion.formulas
  add constraint formulas_dias_reposo_check
    check (dias_reposo is null or dias_reposo > 0);

alter table edgy_gestion.formulas
  add constraint formulas_porcentaje_peso_objetivo_check
    check (porcentaje_peso_objetivo is null or (porcentaje_peso_objetivo > 0 and porcentaje_peso_objetivo <= 100));

-- Coherencia: si requiere_reposo, tiene que haber un criterio, y ese
-- criterio tiene que traer su dato (días o % de peso) cargado.
alter table edgy_gestion.formulas
  add constraint formulas_reposo_coherente_check
    check (
      not requiere_reposo
      or (criterio_reposo = 'dias' and dias_reposo is not null)
      or (criterio_reposo = 'peso' and porcentaje_peso_objetivo is not null)
    );

alter table edgy_gestion.producciones
  add column if not exists fecha_estimada_liberacion date,
  add column if not exists controles_reposo jsonb not null default '[]'::jsonb,
  add column if not exists peso_liberacion numeric,
  add column if not exists fecha_liberacion timestamptz;

alter table edgy_gestion.producciones drop constraint producciones_estado_check;
alter table edgy_gestion.producciones
  add constraint producciones_estado_check
    check (estado in ('borrador', 'confirmada', 'anulada', 'en_reposo'));

-- ─── Verificación ────────────────────────────────────────────
select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'edgy_gestion.producciones'::regclass and conname = 'producciones_estado_check';
