-- ============================================================
-- Fase 64 (31/08, a pedido de Carlos): foto adjunta en el Cobro
-- ============================================================
--
-- Mismo criterio que Fase 61 (comprobantes_compra.imagen_url): el
-- operador puede adjuntar a mano una foto (ej. ticket del posnet) al
-- registrar un cobro en Ventas > Cobranzas. Se reutiliza el mismo
-- bucket privado "comprobantes-gastos" (RLS ya scopeada por
-- cliente_id como primer segmento del path, ver migración 0079) y el
-- mismo helper de subida/lectura (src/lib/imagenComprobanteAgente.ts)
-- que ya usa Comprobantes de Compras -- no hace falta bucket nuevo.

alter table edgy_gestion.cobros
  add column if not exists imagen_url text;

comment on column edgy_gestion.cobros.imagen_url is
  'Path en el bucket privado "comprobantes-gastos" de una foto adjuntada a mano al registrar el cobro (ej. ticket de posnet). NULL si no se adjuntó nada.';
