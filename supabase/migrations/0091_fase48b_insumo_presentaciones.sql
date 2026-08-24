-- Migración 0091 · Fase 48b · Presentaciones de compra del Insumo
--
-- Reemplaza a insumos.peso_envase (migración 0090, recién agregada y sin
-- datos cargados todavía -- confirmado, tabla vacía) porque Carlos detectó
-- el caso real de un insumo con MÁS de una presentación de compra (Starter
-- M-Culture RS 103 en sachets de 20 g y de 40 g). Un solo número no
-- alcanza -- pasa a ser una lista chica por insumo, mismo patrón que
-- formula_lineas/recepcion_lineas (tabla hija, sin cliente_id propio, RLS
-- vía join a insumos).
--
-- `es_default`: cuál presentación usa el sistema para sugerir cantidades
-- automáticamente (redondeo en OC generada desde faltantes de Producción).
-- Las demás quedan disponibles para elegir a mano en una compra puntual.
-- Se garantiza como máximo una default por insumo con un índice único
-- parcial (no con constraint de unicidad simple, que exigiría siempre
-- default=true).

create table if not exists edgy_gestion.insumo_presentaciones (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references edgy_gestion.insumos(id) on delete cascade,
  nombre text,
  contenido numeric not null check (contenido > 0),
  es_default boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists insumo_presentaciones_default_unica_idx
  on edgy_gestion.insumo_presentaciones (insumo_id)
  where es_default;

create index if not exists insumo_presentaciones_insumo_id_idx
  on edgy_gestion.insumo_presentaciones (insumo_id);

alter table edgy_gestion.insumo_presentaciones enable row level security;

create policy "Lectura interna de insumo_presentaciones" on edgy_gestion.insumo_presentaciones
  for select using (
    edgy_gestion.es_personal_edgy()
    or insumo_id in (
      select i.id from edgy_gestion.insumos i
      where i.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'lectura')
    )
  );

create policy "Alta de insumo_presentaciones" on edgy_gestion.insumo_presentaciones
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or insumo_id in (
      select i.id from edgy_gestion.insumos i
      where i.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

create policy "Edicion de insumo_presentaciones" on edgy_gestion.insumo_presentaciones
  for update using (
    edgy_gestion.es_personal_edgy()
    or insumo_id in (
      select i.id from edgy_gestion.insumos i
      where i.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

create policy "Borrado de insumo_presentaciones" on edgy_gestion.insumo_presentaciones
  for delete using (
    edgy_gestion.es_personal_edgy()
    or insumo_id in (
      select i.id from edgy_gestion.insumos i
      where i.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

-- insumos.peso_envase queda sin uso (sin datos, se deja la columna para no
-- generar un DROP innecesario -- si hace falta limpiarla más adelante, no
-- hay apuro).
comment on column edgy_gestion.insumos.peso_envase is
  'Deprecado (Fase 48b) -- reemplazado por insumo_presentaciones. Se deja la columna sin uso, sin datos cargados.';
