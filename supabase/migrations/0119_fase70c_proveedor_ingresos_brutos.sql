-- Fase 70c: campo "Ingresos Brutos" (numero de inscripcion IIBB) en
-- Proveedor -- estandar impositivo argentino, relevante para retenciones.
-- Aplica tanto a Compras (proveedores) como a Home Keep (proveedores_hogar),
-- que son tablas separadas por diseno (ver 0106_fase56_modulo_home_keep.sql).

alter table edgy_gestion.proveedores
  add column if not exists ingresos_brutos text;

alter table edgy_gestion.proveedores_hogar
  add column if not exists ingresos_brutos text;

comment on column edgy_gestion.proveedores.ingresos_brutos is
  'Numero de inscripcion en Ingresos Brutos (IIBB) del proveedor, para retenciones. Texto libre (alfanumerico segun jurisdiccion).';
comment on column edgy_gestion.proveedores_hogar.ingresos_brutos is
  'Numero de inscripcion en Ingresos Brutos (IIBB) del proveedor, para retenciones. Texto libre (alfanumerico segun jurisdiccion).';
