-- Migración 0093 · Fase 48d · Catálogo Técnico: tipo "texto libre"
--
-- A pedido de Carlos (24/08): además de PDF/imagen y link de video, el
-- Catálogo Técnico de un Insumo (migración 0092) necesita un tercer tipo
-- de documento -- texto libre escrito directo en el sistema (ej. pegar acá
-- mismo la especificación técnica de un proveedor, sin necesidad de subir
-- un archivo). Se guarda en una columna propia (`contenido`) en vez de
-- `path`/`url` -- no es un archivo en Storage, es dato de la fila.

alter table edgy_gestion.insumo_documentos
  add column if not exists contenido text;

comment on column edgy_gestion.insumo_documentos.contenido is
  'Fase 48d: contenido del documento cuando tipo=''texto'' (especificación técnica escrita directo en el sistema). NULL para pdf/imagen/video.';

alter table edgy_gestion.insumo_documentos
  drop constraint if exists insumo_documentos_tipo_check;
alter table edgy_gestion.insumo_documentos
  add constraint insumo_documentos_tipo_check check (tipo in ('pdf', 'imagen', 'video', 'texto'));

alter table edgy_gestion.insumo_documentos
  drop constraint if exists insumo_documentos_contenido_check;
alter table edgy_gestion.insumo_documentos
  add constraint insumo_documentos_contenido_check check (
    (tipo in ('pdf', 'imagen') and path is not null and url is null and contenido is null)
    or (tipo = 'video' and url is not null and path is null and contenido is null)
    or (tipo = 'texto' and contenido is not null and path is null and url is null)
  );
