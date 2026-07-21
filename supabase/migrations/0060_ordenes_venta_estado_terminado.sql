-- ============================================================
-- Migración 0060: Comandas/Órdenes de venta -- nuevo estado 'terminado'
-- Edgy Gestión · schema edgy_gestion
--
-- Contexto: hasta ahora `ordenes_venta.estado` iba de 'en_preparacion'
-- directo a 'entregado' (con 'entregado_parcial' como variante), y el
-- botón "Facturar" se habilitaba ya desde 'en_preparacion' -- se podía
-- facturar algo que todavía se estaba cocinando. Se agrega 'terminado'
-- entre medio ("la cocina ya terminó, listo para entregar/retirar") y
-- Facturar pasa a habilitarse recién desde ahí en adelante.
--
-- Nota histórica: la tabla `ordenes_venta` ya existía de antes de que
-- existiera esta carpeta de migraciones (ver comentario de la 0036), así
-- que el CHECK constraint real en producción es el que se haya definido
-- en esa creación original -- no necesariamente el que describe el
-- comentario de la migración 0034 (que fue un create-table no-op). Por
-- las dudas, este script busca el constraint real por metadata (no
-- asume un nombre) antes de reemplazarlo, así funciona sin importar
-- cuál sea.
-- ============================================================

set search_path to edgy_gestion, public;

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
      and rel.relname = 'ordenes_venta'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%estado%'
  loop
    execute format('alter table edgy_gestion.ordenes_venta drop constraint %I', r.conname);
  end loop;
end $$;

alter table edgy_gestion.ordenes_venta
  add constraint ordenes_venta_estado_check
  check (estado in ('pendiente', 'en_preparacion', 'terminado', 'entregado_parcial', 'entregado', 'cancelado'));
