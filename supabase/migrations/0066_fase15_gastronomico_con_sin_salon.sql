-- ============================================================
-- Fase 15: Kit Gastronómico con salón vs sin salón
-- Edgy Gestión · Núcleo (clientes.tipo_negocio)
-- ============================================================
--
-- El pack gastronómico se subdivide en dos variantes de tipo_negocio:
--   - gastronomico_con_salon: bar/restorán con mesas -- kit completo
--     (mesas-salon, comandas-cocina, menu-qr, ventas-online, caja-turno,
--     viandas).
--   - gastronomico_sin_salon: rotisería/delivery sin mesas -- mismo kit
--     salvo mesas-salon y comandas-cocina (esta última exige mesaId por
--     diseño, Comanda.mesaId no es opcional; el ciclo de cocina/entrega
--     de estos clientes corre por ordenes_venta vía Ventas Online).
--
-- Antes existía un solo valor 'gastronomico'. Los clientes ya cargados
-- con ese valor se migran a 'gastronomico_con_salon' (son los que ya
-- venían usando mesas/salón en la práctica, ej. La Charcutería Express).
--
-- Nota: esto NO toca `modulos.vertical` (sigue siendo 'gastronomico'
-- para los 6 módulos del kit -- ver Sidebar.tsx/kits.ts, Fase 25): la
-- distinción con/sin salón es sobre qué MÓDULOS se sugieren/activan
-- para un cliente puntual (MODULOS_SUGERIDOS en src/types/index.ts), no
-- sobre a qué kit visual pertenece cada módulo.
-- ============================================================

set search_path to edgy_gestion, public;

-- Problema de orden circular ya pisado dos veces al correr esto en vivo:
-- si se reemplaza el constraint ANTES del backfill, las filas que todavía
-- dicen 'gastronomico' violan el constraint nuevo (que ya no lo admite).
-- Si se hace el backfill ANTES, el constraint viejo todavía no admite
-- 'gastronomico_con_salon'. Solución: un constraint intermedio que admite
-- AMBOS mundos (viejo + nuevos) mientras se hace el backfill, y recién
-- después se lo reemplaza por el final que ya no admite el valor viejo.

-- 1) Reemplazar el check constraint de tipo_negocio por uno transitorio
-- que admite 'gastronomico' (viejo) + los dos valores nuevos. Se busca
-- el constraint existente por definición (no por nombre fijo) porque
-- 0001_init.sql lo declaró sin nombre explícito -- mismo criterio que
-- 0060_ordenes_venta_estado_terminado.sql.
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
    'gastronomico', 'gastronomico_con_salon', 'gastronomico_sin_salon',
    'comercio', 'logistica', 'produccion', 'servicios', 'agro'
  ));

-- 2) Backfill de clientes existentes. `clientes` tiene un trigger de
-- protección (proteger_columnas_sensibles_clientes, creado directo en
-- la base -- no está en las migraciones versionadas) que bloquea
-- cualquier UPDATE sobre slug/estado/cuit/tipo_negocio, pensado para que
-- la app de un cliente no los pueda tocar desde Configuración. Este
-- backfill es un cambio de administración real (migración), así que se
-- desactivan los triggers de la tabla solo para este statement puntual.
alter table edgy_gestion.clientes disable trigger user;

update edgy_gestion.clientes
  set tipo_negocio = 'gastronomico_con_salon'
  where tipo_negocio = 'gastronomico';

alter table edgy_gestion.clientes enable trigger user;

-- 3) Ahora que ya no queda ninguna fila en 'gastronomico', se reemplaza
-- el constraint transitorio por el final (sin el valor viejo).
alter table edgy_gestion.clientes drop constraint clientes_tipo_negocio_check;

alter table edgy_gestion.clientes
  add constraint clientes_tipo_negocio_check
  check (tipo_negocio in (
    'gastronomico_con_salon', 'gastronomico_sin_salon',
    'comercio', 'logistica', 'produccion', 'servicios', 'agro'
  ));

-- ─── Verificación ────────────────────────────────────────────

select tipo_negocio, count(*) from edgy_gestion.clientes group by tipo_negocio order by 1;

select pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'edgy_gestion.clientes'::regclass and conname = 'clientes_tipo_negocio_check';
