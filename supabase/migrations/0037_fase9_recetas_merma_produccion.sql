-- ============================================================
-- Migración 0037: Fase 9 -- Recetas, insumos y costeo real (con merma
-- de proceso) + "Registrar producción"
-- Edgy Gestión · schema edgy_gestion
--
-- Contexto: el módulo Productos-Stock ya tenía un sistema de recetas
-- ("Fórmula" / Formular Producto) con insumos, mano de obra y costos
-- operativos, y ya calculaba costo por unidad como total /
-- cantidad_producida. Lo que faltaba:
--
-- 1) Hacer explícito el % de merma DE PROCESO de la fórmula (ej: un
--    salame que en salazón pierde 30% de su peso) -- hoy ese dato
--    quedaba escondido dentro de `cantidad_producida` cargado a mano,
--    sin transparencia. Es un campo informativo: no cambia el costo
--    calculado (que sigue siendo total / cantidad_producida).
--
--    OJO: no confundir con `movimientos_stock.motivo = 'merma'`, que ya
--    existe y es para ajustes IRREGULARES de stock (se pudrió, se
--    rompió) -- un concepto distinto, con la mala suerte de compartir
--    nombre en la jerga real. Por eso en pantalla este campo se llama
--    "Merma de proceso".
--
-- 2) "Registrar producción": el tipo `MovimientoStock.origen` ya tenía
--    'formula' como valor válido desde el diseño original, pero nunca
--    se había implementado ninguna acción que lo generara. Esta fase
--    no agrega tabla nueva para esto -- reutiliza `movimientos_stock`
--    tal cual existe. No hay cambio de esquema para esta segunda parte,
--    solo para la merma de proceso (punto 1).
-- ============================================================

alter table edgy_gestion.formulas
  add column if not exists merma_porcentaje numeric not null default 0;

-- ─── Verificación ────────────────────────────────────────────

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'formulas'
order by ordinal_position;
