-- ============================================================
-- Fase 56b: columna "destino" en comprobantes_recibidos
-- ============================================================
--
-- Reemplaza a `cliente_id_compras` (Fase 55): con Home Keep como
-- módulo (Fase 56), un comprobante "de hogar" ya NO se carga contra
-- otro cliente_id -- se carga contra las tablas *_hogar del MISMO
-- negocio que mandó la foto. Alcanza con guardar un flag simple.
--
-- 'hogar'  -> cargar en comprobantes_hogar / proveedores_hogar.
-- NULL     -> comportamiento de siempre (comprobantes_compra / proveedores).
-- ============================================================

set search_path to edgy_gestion, public;

alter table edgy_gestion.comprobantes_recibidos
  add column if not exists destino text;

comment on column edgy_gestion.comprobantes_recibidos.destino is
  'Fase 56 -- si el admin puso "hogar" de pie de foto, el comprobante se carga en las tablas de Home Keep (comprobantes_hogar/proveedores_hogar) del MISMO cliente_id, no en Compras real. NULL = comportamiento de siempre (Compras). Reemplaza a cliente_id_compras (Fase 55, dejado de lado: ya no hace falta cambiar de cliente_id, Home Keep corre bajo el mismo negocio).';

comment on column edgy_gestion.comprobantes_recibidos.cliente_id_compras is
  'OBSOLETO (Fase 55) -- reemplazado por la columna destino (Fase 56). Se deja la columna para no romper filas históricas, pero el código ya no la escribe ni la lee.';
