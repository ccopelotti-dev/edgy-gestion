-- Edgy Gestión — esquema inicial del dashboard multi-cliente
-- Todo vive en el schema `edgy_gestion`, separado de `public`, para poder
-- compartir el mismo proyecto de Supabase con otra app (por ejemplo el
-- Edgy Trading Hub) sin que las tablas se mezclen ni se pisen.
--
-- Aplicar pegando este archivo completo en el SQL editor de Supabase.

create schema if not exists edgy_gestion;

-- 1. Clientes (tenants) ------------------------------------------------------
create table edgy_gestion.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo_negocio text not null check (
    tipo_negocio in ('gastronomico', 'comercio', 'logistica', 'produccion', 'servicios', 'agro')
  ),
  logo_url text,
  color_marca text,
  created_at timestamptz not null default now()
);

-- 2. Catálogo de módulos -----------------------------------------------------
create table edgy_gestion.modulos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  vertical text not null,
  descripcion text
);

-- 3. Módulos activados por cliente ------------------------------------------
create table edgy_gestion.cliente_modulos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  modulo_id uuid not null references edgy_gestion.modulos(id) on delete cascade,
  activo boolean not null default true,
  activado_en timestamptz default now(),
  unique (cliente_id, modulo_id)
);

-- 4. Usuarios del cliente -----------------------------------------------------
create table edgy_gestion.usuarios_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  rol text not null check (rol in ('admin', 'encargado', 'mozo', 'cocina', 'cajero')),
  created_at timestamptz not null default now()
);

-- 5. Permisos por módulo ------------------------------------------------------
create table edgy_gestion.permisos (
  id uuid primary key default gen_random_uuid(),
  usuario_cliente_id uuid not null references edgy_gestion.usuarios_cliente(id) on delete cascade,
  modulo_id uuid not null references edgy_gestion.modulos(id) on delete cascade,
  nivel text not null check (nivel in ('ver', 'editar', 'admin')),
  unique (usuario_cliente_id, modulo_id)
);

-- Función auxiliar: a qué cliente pertenece el usuario logueado -------------
create or replace function edgy_gestion.cliente_del_usuario_actual()
returns uuid
language sql
security definer
stable
as $$
  select cliente_id from edgy_gestion.usuarios_cliente where user_id = auth.uid() limit 1;
$$;

-- RLS ------------------------------------------------------------------------
alter table edgy_gestion.clientes enable row level security;
alter table edgy_gestion.cliente_modulos enable row level security;
alter table edgy_gestion.usuarios_cliente enable row level security;
alter table edgy_gestion.permisos enable row level security;
-- `modulos` es el catálogo público de la agencia, no tiene RLS por tenant.

create policy "ver el propio cliente"
  on edgy_gestion.clientes for select
  using (id = edgy_gestion.cliente_del_usuario_actual());

create policy "ver los propios módulos activados"
  on edgy_gestion.cliente_modulos for select
  using (cliente_id = edgy_gestion.cliente_del_usuario_actual());

create policy "administrar módulos del propio cliente"
  on edgy_gestion.cliente_modulos for all
  using (cliente_id = edgy_gestion.cliente_del_usuario_actual());

create policy "ver usuarios del propio cliente"
  on edgy_gestion.usuarios_cliente for select
  using (cliente_id = edgy_gestion.cliente_del_usuario_actual());

create policy "ver permisos del propio cliente"
  on edgy_gestion.permisos for select
  using (
    usuario_cliente_id in (
      select id from edgy_gestion.usuarios_cliente
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
    )
  );

-- Permisos de acceso al schema para los roles que usa la API de Supabase ----
-- (PostgREST necesita esto además de la RLS de cada tabla; la RLS sigue
-- siendo la que filtra fila por fila, esto solo habilita el acceso al schema)
grant usage on schema edgy_gestion to anon, authenticated;
grant select, insert, update, delete on all tables in schema edgy_gestion to anon, authenticated;
grant execute on function edgy_gestion.cliente_del_usuario_actual() to anon, authenticated;
alter default privileges in schema edgy_gestion
  grant select, insert, update, delete on tables to anon, authenticated;

-- Catálogo inicial de módulos -------------------------------------------------
insert into edgy_gestion.modulos (nombre, slug, vertical, descripcion) values
  ('Tesorería', 'tesoreria', 'core', 'Salud financiera, reservas líquidas y movimientos de caja'),
  ('Productos y stock', 'productos-stock', 'core', 'Catálogo de productos y control de stock'),
  ('Ventas', 'ventas', 'core', 'Registro de ventas y facturación'),
  ('Compras', 'compras', 'core', 'Órdenes de compra a proveedores'),
  ('Mesas y salón', 'mesas-salon', 'gastronomico', 'Mapa de mesas y estado de ocupación'),
  ('Comandas y cocina', 'comandas-cocina', 'gastronomico', 'Pedidos enviados a cocina'),
  ('Menú QR', 'menu-qr', 'gastronomico', 'Carta pública sin login'),
  ('Delivery por WhatsApp', 'delivery-whatsapp', 'gastronomico', 'Pedidos de delivery vía WhatsApp'),
  ('Caja por turno', 'caja-turno', 'gastronomico', 'Apertura, cierre y arqueo de caja por turno');
