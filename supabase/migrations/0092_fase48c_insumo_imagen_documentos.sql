-- Migración 0092 · Fase 48c · Imagen y Catálogo Técnico del Insumo
--
-- A pedido de Carlos (24/08), para cerrar el Modal de Insumo: una foto de
-- referencia (mismo bucket público que Producto.imagenes, pero UN solo
-- campo -- un insumo no necesita galería) y un repositorio de documentación
-- técnica (fichas técnicas, hojas de seguridad, videos de uso). Pensado
-- explícitamente por Carlos para que en el futuro un agente de IA o una
-- automatización pueda encontrar y usar esta información -- por eso
-- `titulo` es obligatorio en cada documento (es la referencia legible que
-- un agente va a usar para elegir qué documento abrir).
--
-- Mismo patrón de tabla hija sin cliente_id propio que insumo_presentaciones
-- (migración 0091): RLS vía join a insumos.

alter table edgy_gestion.insumos
  add column if not exists imagen_url text;

comment on column edgy_gestion.insumos.imagen_url is
  'Fase 48c: foto de referencia del insumo. URL pública, bucket "productos-imagenes" (mismo bucket que productos.imagenes). NULL = sin foto cargada.';

create table if not exists edgy_gestion.insumo_documentos (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references edgy_gestion.insumos(id) on delete cascade,
  tipo text not null check (tipo in ('pdf', 'imagen', 'video')),
  titulo text not null,
  descripcion text,
  path text,
  url text,
  created_at timestamptz not null default now(),
  constraint insumo_documentos_contenido_check check (
    (tipo in ('pdf', 'imagen') and path is not null and url is null)
    or (tipo = 'video' and url is not null and path is null)
  )
);

create index if not exists insumo_documentos_insumo_id_idx
  on edgy_gestion.insumo_documentos (insumo_id);

alter table edgy_gestion.insumo_documentos enable row level security;

create policy "Lectura interna de insumo_documentos" on edgy_gestion.insumo_documentos
  for select using (
    edgy_gestion.es_personal_edgy()
    or insumo_id in (
      select i.id from edgy_gestion.insumos i
      where i.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'lectura')
    )
  );

create policy "Alta de insumo_documentos" on edgy_gestion.insumo_documentos
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or insumo_id in (
      select i.id from edgy_gestion.insumos i
      where i.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

create policy "Edicion de insumo_documentos" on edgy_gestion.insumo_documentos
  for update using (
    edgy_gestion.es_personal_edgy()
    or insumo_id in (
      select i.id from edgy_gestion.insumos i
      where i.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

create policy "Borrado de insumo_documentos" on edgy_gestion.insumo_documentos
  for delete using (
    edgy_gestion.es_personal_edgy()
    or insumo_id in (
      select i.id from edgy_gestion.insumos i
      where i.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );
