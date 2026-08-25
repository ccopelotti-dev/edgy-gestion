-- ============================================================
-- Migración 0095: Fase 48e -- Catálogo Técnico también en Producto
-- Edgy Gestión · schema edgy_gestion
--
-- A pedido de Carlos (24/08): el mismo repositorio de documentación
-- técnica que armamos para Insumo (Fase 48c/48d -- fichas técnicas,
-- hojas de seguridad, videos, texto libre) también hace falta en
-- Producto (manual de instalación, ficha técnica del fabricante,
-- certificado de garantía, video de uso).
--
-- Se crea `producto_documentos` como tabla PARALELA a
-- insumo_documentos (mismo esquema, misma RLS por join a la tabla
-- padre) en vez de una tabla polimórfica genérica -- mismo criterio
-- que el resto del sistema (clientes_pago_config factorizada por
-- proveedor, insumo_presentaciones aparte de producto_precios, etc.):
-- cada entidad tiene su propia tabla hija, nada de entidad_tipo +
-- entidad_id compartido. A diferencia de insumo_documentos (que nació
-- sin 'texto' y necesitó la migración 0093 para sumarlo), acá el tipo
-- 'texto' se incluye desde el día uno.
--
-- Producto YA tiene `imagenes` (galería pública, catálogo visual) --
-- esto es un repositorio aparte, de uso interno, en el bucket privado
-- "archivos-cliente" (pdf/imagen) o por URL externa (video) o texto
-- inline -- no reemplaza ni se mezcla con la galería.
-- ============================================================

create table if not exists edgy_gestion.producto_documentos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references edgy_gestion.productos(id) on delete cascade,
  tipo text not null check (tipo in ('pdf', 'imagen', 'video', 'texto')),
  titulo text not null,
  descripcion text,
  path text,
  url text,
  contenido text,
  created_at timestamptz not null default now(),
  constraint producto_documentos_contenido_check check (
    (tipo in ('pdf', 'imagen') and path is not null and url is null and contenido is null)
    or (tipo = 'video' and url is not null and path is null and contenido is null)
    or (tipo = 'texto' and contenido is not null and path is null and url is null)
  )
);

create index if not exists producto_documentos_producto_id_idx
  on edgy_gestion.producto_documentos (producto_id);

alter table edgy_gestion.producto_documentos enable row level security;

create policy "Lectura interna de producto_documentos" on edgy_gestion.producto_documentos
  for select using (
    edgy_gestion.es_personal_edgy()
    or producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'lectura')
    )
  );

create policy "Alta de producto_documentos" on edgy_gestion.producto_documentos
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

create policy "Edicion de producto_documentos" on edgy_gestion.producto_documentos
  for update using (
    edgy_gestion.es_personal_edgy()
    or producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

create policy "Borrado de producto_documentos" on edgy_gestion.producto_documentos
  for delete using (
    edgy_gestion.es_personal_edgy()
    or producto_id in (
      select p.id from edgy_gestion.productos p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

-- ─── Verificación ────────────────────────────────────────────

select table_name from information_schema.tables
where table_schema = 'edgy_gestion' and table_name = 'producto_documentos';
