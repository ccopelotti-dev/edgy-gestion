-- Migración 0087 · Proveedores: nombre de fantasía
--
-- Carlos pidió (22/08) poder cargar el nombre comercial del proveedor por
-- separado de la razón social -- ej. tique de "Don René" cuya razón social
-- real es "Baudax Maria Eugenia". Nullable y sin uso fiscal: es solo un
-- dato de referencia para identificar al proveedor más fácil en pantalla,
-- la razón social (`nombre`) sigue siendo la que se usa en comprobantes/PDF.

alter table edgy_gestion.proveedores
  add column if not exists nombre_fantasia text;

-- ─── Verificación ────────────────────────────────────────────

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'proveedores'
  and column_name = 'nombre_fantasia';
