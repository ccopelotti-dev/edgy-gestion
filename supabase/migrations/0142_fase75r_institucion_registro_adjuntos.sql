-- Fase 75r (11/09, a pedido de Carlos): adjuntos (archivos) para un
-- registro institucional -- pensado sobre todo para instituciones sin
-- sincronización automática (proveedor='manual', ej. un club) o para
-- guardar el documento real (ej. el PDF del boletín) cuando exista.
-- Reusa el bucket "archivos-cliente" (privado, ya existente -- ver
-- src/modules/utilidades/lib/archivos.ts) en vez de crear uno nuevo:
-- la policy de Storage ya valida por carpeta = cliente_id, no hace
-- falta ninguna policy nueva de Storage para esto.

create table if not exists edgy_gestion.institucion_registro_adjuntos (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid not null references edgy_gestion.institucion_registros(id) on delete cascade,
  cliente_id uuid not null references edgy_gestion.clientes(id),
  path text not null,
  nombre_archivo text not null,
  tamanio_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists institucion_registro_adjuntos_registro_idx
  on edgy_gestion.institucion_registro_adjuntos (registro_id);

alter table edgy_gestion.institucion_registro_adjuntos enable row level security;

create policy "Alta de institucion_registro_adjuntos" on edgy_gestion.institucion_registro_adjuntos
  for insert
  with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura'))
  );

create policy "Lectura interna de institucion_registro_adjuntos" on edgy_gestion.institucion_registro_adjuntos
  for select
  using (
    edgy_gestion.es_personal_edgy()
    or cliente_id = edgy_gestion.cliente_del_usuario_actual()
  );

create policy "Borrado de institucion_registro_adjuntos" on edgy_gestion.institucion_registro_adjuntos
  for delete
  using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura'))
  );
