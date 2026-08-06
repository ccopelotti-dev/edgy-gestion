-- ============================================================
-- Fase 29: categorías combinadas de Tipo de negocio
-- Edgy Gestión · Núcleo (clientes.tipo_negocio)
-- ============================================================
--
-- Muchos emprendedores/pymes tienen actividades entrelazadas (ej: un
-- taller que fabrica y también vende al público, o un comercio que
-- además presta el servicio de instalación) y no encajan en una sola
-- categoría pura del wizard. Se agregan 3 valores combinados que no
-- reemplazan a los puros, se ofrecen como alternativa:
--   - comercio_produccion
--   - comercio_servicios
--   - comercio_produccion_servicios
--
-- Solo se agregan valores nuevos al CHECK -- no hay backfill (a
-- diferencia de 0066_fase15_gastronomico_con_sin_salon.sql, que sí
-- necesitó migrar filas existentes de un valor viejo a uno nuevo).
-- ============================================================

set search_path to edgy_gestion, public;

-- Se busca el constraint existente por definición (no por nombre fijo)
-- porque 0066 ya lo había recreado con el nombre clientes_tipo_negocio_check,
-- pero por las dudas se repite el mismo criterio defensivo.
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'edgy_gestion'
      and rel.relname = 'clientes'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%tipo_negocio%'
  loop
    execute format('alter table edgy_gestion.clientes drop constraint %I', r.conname);
  end loop;
end $$;

alter table edgy_gestion.clientes
  add constraint clientes_tipo_negocio_check
  check (tipo_negocio in (
    'gastronomico_con_salon', 'gastronomico_sin_salon',
    'comercio', 'logistica', 'produccion', 'servicios', 'agro',
    'comercio_produccion', 'comercio_servicios', 'comercio_produccion_servicios'
  ));

-- ─── Verificación ────────────────────────────────────────────

select pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'edgy_gestion.clientes'::regclass and conname = 'clientes_tipo_negocio_check';
