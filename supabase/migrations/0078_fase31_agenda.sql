-- ============================================================
-- Migración 0078 · Fase 31: módulo Agenda (núcleo)
-- Edgy Gestión · schema edgy_gestion
--
-- Copia el patrón de "Mi Agenda" de Edgy Trading Hub (calendario +
-- tareas + Notepad con audio) pero adaptado a multi-tenant real: en ETH
-- las tablas tienen RLS desactivada (uso personal, un solo usuario);
-- acá cada tabla queda scopeada por cliente_id con el mismo patrón
-- lectura/escritura vía tiene_permiso() que el resto de los módulos
-- (ver 0019_viandas.sql como referencia).
--
-- vertical = 'core': aparece para todo cliente, no es un Kit opcional
-- -- va inmediatamente debajo de Dashboard en el sidebar (ver
-- ORDEN_PRINCIPALES en Sidebar.tsx).
--
-- `notas` es la bandeja de entrada para la futura skill de
-- clasificación automática (Cowork, corre localmente 3 veces al día):
-- texto/imágenes/audio libres, con `procesado` para que la skill sepa
-- qué le falta mirar y `resultado` como bitácora de qué terminó
-- creando (o por qué la dejó pendiente de revisión). Por ahora la
-- carga solo la usa el staff de Edgy (logueado como admin del
-- cliente piloto) -- no hay gate especial de rol, es el mismo
-- 'agenda'/'escritura' de siempre.
-- ============================================================

insert into edgy_gestion.modulos (nombre, slug, vertical, descripcion) values
  ('Agenda', 'agenda', 'core', 'Calendario, tareas y bandeja de notas del negocio')
on conflict (slug) do nothing;

-- ─── Backfill: activar Agenda para los clientes ya existentes ──
-- No hay trigger que active módulos 'core' solos -- la activación real
-- ocurre en el Paso 3 del wizard (NuevoProyecto.tsx) al crear un
-- cliente nuevo, así que a los que ya existen hay que darles de alta
-- el módulo a mano acá, una sola vez.

insert into edgy_gestion.cliente_modulos (cliente_id, modulo_id, activo, activado_en)
select c.id, m.id, true, now()
from edgy_gestion.clientes c
cross join (select id from edgy_gestion.modulos where slug = 'agenda') m
where not exists (
  select 1 from edgy_gestion.cliente_modulos cm
  where cm.cliente_id = c.id and cm.modulo_id = m.id
);

-- ─── Tareas de agenda ────────────────────────────────────────

create table if not exists edgy_gestion.agenda_tareas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  titulo text not null,
  descripcion text,
  fecha date not null default current_date,
  hora_inicio time,
  hora_fin time,
  categoria text not null default 'trabajo'
    check (categoria in ('trabajo', 'personal', 'pago', 'entrega', 'otro')),
  prioridad text not null default 'media' check (prioridad in ('baja', 'media', 'alta')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecho')),
  creado_por uuid references edgy_gestion.usuarios_cliente(id),
  created_at timestamptz not null default now()
);

alter table edgy_gestion.agenda_tareas enable row level security;

create policy "Lectura interna de agenda_tareas" on edgy_gestion.agenda_tareas
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('agenda', 'lectura'))
  );

create policy "Alta de agenda_tareas" on edgy_gestion.agenda_tareas
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('agenda', 'escritura'))
  );

create policy "Edicion de agenda_tareas" on edgy_gestion.agenda_tareas
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('agenda', 'escritura'))
  );

create policy "Borrado de agenda_tareas" on edgy_gestion.agenda_tareas
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('agenda', 'escritura'))
  );

-- ─── Notas (bandeja de entrada) ──────────────────────────────

create table if not exists edgy_gestion.notas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  texto text,
  imagenes text[] not null default '{}',
  audios text[] not null default '{}',
  -- Fase 31b (skill, todavía no construida): false = pendiente de que
  -- la corrida de Cowork la mire. true = ya la clasificó (haya podido
  -- resolverla o la haya dejado marcada para revisión manual dentro de
  -- `resultado` -- nunca se fuerza una clasificación dudosa).
  procesado boolean not null default false,
  resultado jsonb,
  creado_por uuid references edgy_gestion.usuarios_cliente(id),
  created_at timestamptz not null default now()
);

alter table edgy_gestion.notas enable row level security;

create policy "Lectura interna de notas" on edgy_gestion.notas
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('agenda', 'lectura'))
  );

create policy "Alta de notas" on edgy_gestion.notas
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('agenda', 'escritura'))
  );

create policy "Edicion de notas" on edgy_gestion.notas
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('agenda', 'escritura'))
  );

create policy "Borrado de notas" on edgy_gestion.notas
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('agenda', 'escritura'))
  );

-- ─── Bucket de medios de notas (privado) ─────────────────────
-- Mismo criterio que "archivos-cliente" (privado, path
-- "{clienteId}/{id}-{nombre}", URL de descarga firmada al vuelo) --
-- a diferencia de "logos-clientes" o "productos-imagenes" que son
-- públicos. Acá puede haber audio/fotos con info sensible del
-- negocio, no corresponde que sea público. A diferencia de
-- "archivos-cliente" (creado a mano en su momento), esta política
-- queda versionada.

insert into storage.buckets (id, name, public)
values ('notas-media', 'notas-media', false)
on conflict (id) do update set public = false;

drop policy if exists "notas_media_lectura" on storage.objects;
create policy "notas_media_lectura"
on storage.objects for select
to authenticated
using (
  bucket_id = 'notas-media'
  and (
    edgy_gestion.es_personal_edgy()
    or (storage.foldername(name))[1] = edgy_gestion.cliente_del_usuario_actual()::text
  )
);

drop policy if exists "notas_media_escritura" on storage.objects;
create policy "notas_media_escritura"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'notas-media'
  and (
    edgy_gestion.es_personal_edgy()
    or (storage.foldername(name))[1] = edgy_gestion.cliente_del_usuario_actual()::text
  )
);

drop policy if exists "notas_media_borrado" on storage.objects;
create policy "notas_media_borrado"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'notas-media'
  and (
    edgy_gestion.es_personal_edgy()
    or (storage.foldername(name))[1] = edgy_gestion.cliente_del_usuario_actual()::text
  )
);

-- ─── Verificación ────────────────────────────────────────────

select table_name
from information_schema.tables
where table_schema = 'edgy_gestion'
  and table_name = any(array['agenda_tareas', 'notas']);

select slug, vertical from edgy_gestion.modulos where slug = 'agenda';

select count(*) as clientes_con_agenda_activa
from edgy_gestion.cliente_modulos cm
join edgy_gestion.modulos m on m.id = cm.modulo_id
where m.slug = 'agenda' and cm.activo = true;

select id, public from storage.buckets where id = 'notas-media';
