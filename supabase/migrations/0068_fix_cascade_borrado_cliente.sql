-- Edgy Gestión — Fix: borrado en cascada de un cliente (tenant)
--
-- Detectado al querer borrar un cliente de prueba: 15 tablas (sectores,
-- mesas, turnos_caja, comandas, planes_vianda, pedidos_delivery, marcas,
-- listas_precio, plantillas_garantia, combos, garantias_emitidas,
-- ordenes_venta, llamados_mozo, clientes_pago_config, producciones)
-- tienen su columna cliente_id referenciando edgy_gestion.clientes(id)
-- SIN "on delete cascade" (a diferencia del resto del esquema, que sí lo
-- tiene desde 0001_init.sql) — quedaron así por un descuido en las fases
-- en que se crearon. Sin este fix, un DELETE de edgy_gestion.clientes
-- falla con "violates foreign key constraint" apenas ese cliente tiene
-- datos cargados en cualquiera de esas 15 tablas.
--
-- Este script busca dinámicamente TODAS las foreign keys de cualquier
-- tabla de edgy_gestion hacia clientes(id) que todavía no sean cascade,
-- y las recrea como on delete cascade — así no depende de adivinar
-- nombres de constraint a mano, y de paso cubre cualquier tabla nueva
-- que se haya sumado sin que lo notemos.
--
-- Aplicar pegando este archivo completo en el SQL editor de Supabase.

do $$
declare
  r record;
begin
  for r in
    select
      con.conname          as constraint_name,
      con.conrelid::regclass as tabla
    from pg_constraint con
    where con.contype = 'f'
      and con.confrelid = 'edgy_gestion.clientes'::regclass
      and con.confdeltype <> 'c'  -- 'c' = ya es cascade, no tocar
  loop
    execute format(
      'alter table %s drop constraint %I',
      r.tabla, r.constraint_name
    );
    execute format(
      'alter table %s add constraint %I foreign key (cliente_id) references edgy_gestion.clientes(id) on delete cascade',
      r.tabla, r.constraint_name
    );
    raise notice 'cascade agregado: % en %', r.constraint_name, r.tabla;
  end loop;
end $$;
