-- ============================================================
-- Migración 0082 · Fichas de medida (Kit "A Medida")
-- Edgy Gestión · schema edgy_gestion
--
-- Origen: Punto Tex (Marina) toma medidas a domicilio en fichas de
-- papel para armar un presupuesto de productos hechos a medida
-- (cortinas, hoy; tapicería/fundas a futuro). Se repite el problema
-- clásico del papel: el cliente se reescribe en cada ficha, y cada
-- rubro tiene columnas propias (genérica: Producto/Medida/Peso/Tela/
-- Cantidad; cortinas: Ancho/Alto por paño + Tipo de barral + Tipo de
-- cortina + Tela).
--
-- No es núcleo -- vertical = 'a-medida' (kit nuevo, un solo módulo por
-- ahora), NO se backfillea a todos los clientes como los módulos
-- 'core'. Se activa a mano acá solo para Punto Tex; queda disponible
-- para cualquier cliente futuro que venda productos a medida (vía
-- Panel > Módulos o el wizard, igual que cualquier otro kit).
--
-- Requiere Ventas activo: fichas_medida.cliente_venta_id apunta a un
-- Cliente real de Ventas (evita reescribir nombre/teléfono/dirección
-- en cada ficha, y deja lista la integración "Generar presupuesto").
-- ============================================================

insert into edgy_gestion.modulos (nombre, slug, vertical, descripcion) values
  ('Fichas de medida', 'fichas-medida', 'a-medida', 'Toma de medidas a domicilio para presupuestar productos hechos a medida (cortinas, etc.)')
on conflict (slug) do nothing;

-- ─── Activar el módulo solo para Punto Tex ──────────────────
insert into edgy_gestion.cliente_modulos (cliente_id, modulo_id, activo, activado_en)
select c.id, m.id, true, now()
from edgy_gestion.clientes c
cross join (select id from edgy_gestion.modulos where slug = 'fichas-medida') m
where c.id = '9f4bb295-eb4b-4511-ad75-a790e441fb88'
and not exists (
  select 1 from edgy_gestion.cliente_modulos cm
  where cm.cliente_id = c.id and cm.modulo_id = m.id
);

-- ─── Fichas de medida ────────────────────────────────────────

create table if not exists edgy_gestion.fichas_medida (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  cliente_venta_id uuid not null references edgy_gestion.clientes_venta(id),
  tipo text not null default 'generica' check (tipo in ('generica', 'cortinas')),
  estado text not null default 'borrador' check (estado in ('borrador', 'lista', 'convertida')),
  fecha_pedido date not null default current_date,
  fecha_entrega date,
  sena numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notas text,
  -- Se completa cuando se usa "Generar presupuesto" -- deja la ficha
  -- trazable hasta el Presupuesto real de Ventas que generó.
  presupuesto_id uuid references edgy_gestion.presupuestos(id),
  creado_por uuid references edgy_gestion.usuarios_cliente(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table edgy_gestion.fichas_medida enable row level security;

create policy "Lectura interna de fichas_medida" on edgy_gestion.fichas_medida
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('fichas-medida', 'lectura'))
  );

create policy "Alta de fichas_medida" on edgy_gestion.fichas_medida
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('fichas-medida', 'escritura'))
  );

create policy "Edicion de fichas_medida" on edgy_gestion.fichas_medida
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('fichas-medida', 'escritura'))
  );

create policy "Borrado de fichas_medida" on edgy_gestion.fichas_medida
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('fichas-medida', 'escritura'))
  );

-- ─── Ítems del pedido (una fila por producto pedido) ────────
-- Columnas de "genérica" y "cortinas" conviven en la misma tabla
-- (nullable las que no aplican al tipo elegido en la ficha) -- mismo
-- criterio que otras tablas de ítems del sistema, evita una tabla por
-- variante para un catálogo de 2 tipos.

create table if not exists edgy_gestion.ficha_medida_items (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references edgy_gestion.fichas_medida(id) on delete cascade,
  producto text not null,
  tela text,
  cantidad numeric(12,2) not null default 1,
  -- Genérica
  medida text,
  peso text,
  -- Cortinas (tipo_barral/tipo_cortina: texto libre desde una lista
  -- fija en el frontend, no catálogo aparte -- son 7-8 opciones fijas
  -- según el papel de Punto Tex, no ameritan tabla propia)
  incluye_barral boolean,
  tipo_barral text,
  tipo_cortina text,
  notas text,
  orden int not null default 0
);

alter table edgy_gestion.ficha_medida_items enable row level security;

create policy "Lectura interna de ficha_medida_items" on edgy_gestion.ficha_medida_items
  for select using (
    edgy_gestion.es_personal_edgy()
    or exists (
      select 1 from edgy_gestion.fichas_medida f
      where f.id = ficha_medida_items.ficha_id
        and f.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('fichas-medida', 'lectura')
    )
  );

create policy "Alta de ficha_medida_items" on edgy_gestion.ficha_medida_items
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or exists (
      select 1 from edgy_gestion.fichas_medida f
      where f.id = ficha_medida_items.ficha_id
        and f.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('fichas-medida', 'escritura')
    )
  );

create policy "Edicion de ficha_medida_items" on edgy_gestion.ficha_medida_items
  for update using (
    edgy_gestion.es_personal_edgy()
    or exists (
      select 1 from edgy_gestion.fichas_medida f
      where f.id = ficha_medida_items.ficha_id
        and f.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('fichas-medida', 'escritura')
    )
  );

create policy "Borrado de ficha_medida_items" on edgy_gestion.ficha_medida_items
  for delete using (
    edgy_gestion.es_personal_edgy()
    or exists (
      select 1 from edgy_gestion.fichas_medida f
      where f.id = ficha_medida_items.ficha_id
        and f.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('fichas-medida', 'escritura')
    )
  );

-- ─── Paños (Ancho/Alto) -- solo aplica a ítems tipo "cortinas" ──
-- Un ítem de cortina puede tener varias ventanas/paños con medidas
-- distintas (ver hoja "MEDIDAS 1-10" del papel de Punto Tex).

create table if not exists edgy_gestion.ficha_medida_panos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references edgy_gestion.ficha_medida_items(id) on delete cascade,
  ancho numeric(10,2),
  alto numeric(10,2),
  orden int not null default 0
);

alter table edgy_gestion.ficha_medida_panos enable row level security;

create policy "Lectura interna de ficha_medida_panos" on edgy_gestion.ficha_medida_panos
  for select using (
    edgy_gestion.es_personal_edgy()
    or exists (
      select 1 from edgy_gestion.ficha_medida_items i
      join edgy_gestion.fichas_medida f on f.id = i.ficha_id
      where i.id = ficha_medida_panos.item_id
        and f.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('fichas-medida', 'lectura')
    )
  );

create policy "Alta de ficha_medida_panos" on edgy_gestion.ficha_medida_panos
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or exists (
      select 1 from edgy_gestion.ficha_medida_items i
      join edgy_gestion.fichas_medida f on f.id = i.ficha_id
      where i.id = ficha_medida_panos.item_id
        and f.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('fichas-medida', 'escritura')
    )
  );

create policy "Edicion de ficha_medida_panos" on edgy_gestion.ficha_medida_panos
  for update using (
    edgy_gestion.es_personal_edgy()
    or exists (
      select 1 from edgy_gestion.ficha_medida_items i
      join edgy_gestion.fichas_medida f on f.id = i.ficha_id
      where i.id = ficha_medida_panos.item_id
        and f.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('fichas-medida', 'escritura')
    )
  );

create policy "Borrado de ficha_medida_panos" on edgy_gestion.ficha_medida_panos
  for delete using (
    edgy_gestion.es_personal_edgy()
    or exists (
      select 1 from edgy_gestion.ficha_medida_items i
      join edgy_gestion.fichas_medida f on f.id = i.ficha_id
      where i.id = ficha_medida_panos.item_id
        and f.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('fichas-medida', 'escritura')
    )
  );

-- ─── Verificación ────────────────────────────────────────────

select table_name
from information_schema.tables
where table_schema = 'edgy_gestion'
  and table_name = any(array['fichas_medida', 'ficha_medida_items', 'ficha_medida_panos']);

select slug, vertical from edgy_gestion.modulos where slug = 'fichas-medida';

select c.nombre, cm.activo
from edgy_gestion.cliente_modulos cm
join edgy_gestion.modulos m on m.id = cm.modulo_id
join edgy_gestion.clientes c on c.id = cm.cliente_id
where m.slug = 'fichas-medida';
