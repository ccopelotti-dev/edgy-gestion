-- Migración 0090 · Fase 48 · Insumo.pesoEnvase
--
-- Carlos (24/08, cargando insumos técnicos de charcutería, ej. Starter
-- M-Culture RS 103 que viene en sachet de 40 g): dato opcional para saber
-- cuánto pesa/contiene UN envase de compra de este insumo, en la misma
-- unidad nativa del insumo (unidad_id). Mismo criterio "opt-in" que
-- ancho_rollo en productos/insumos o unidad_secundaria en formulas --
-- undefined/null = no aplica, no cambia nada para insumos existentes.
--
-- Alcance de esta fase (a pedido de Carlos, primero la data + ayuda visual,
-- el redondeo de Ordenes de Compra a múltiplos de envase queda para una
-- fase siguiente si hace falta):
--   - Insumos: campo editable en el modal + subtítulo en el listado.
--   - Recepción: texto de ayuda "≈ N envases" al cargar la cantidad de una
--     línea de este insumo (no cambia el flujo de carga).

alter table edgy_gestion.insumos
  add column if not exists peso_envase numeric null;

comment on column edgy_gestion.insumos.peso_envase is
  'Peso/contenido neto de UN envase de compra, en la unidad nativa del insumo (ej. 40 para un sachet de 40 g). Opcional -- null = no aplica.';
