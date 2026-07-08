-- ============================================================
-- Migración 0018: núcleo del pack gastronómico
-- Edgy Gestión · schema edgy_gestion
--
-- CORRECCIÓN sobre lo que charlamos: el catálogo `modulos` ya tenía
-- previsto desde 0001_init.sql exactamente esto como 5 módulos
-- separados (mesas-salon, comandas-cocina, menu-qr, delivery-whatsapp,
-- caja-turno), no uno solo. No hay ningún hook de permisos a nivel de
-- sub-página en el frontend (los permisos siempre se resolvieron a
-- nivel de módulo completo, vía tiene_permiso(slug, nivel) en RLS), así
-- que separar en 3 módulos reales para el núcleo (en vez de uno solo)
-- es lo que respeta el diseño original Y te da de gratis la separación
-- de roles que charlamos (Mozo/Cocina/Cajero con accesos distintos)
-- sin inventar un sistema de permisos nuevo.
--
-- Reparto de tablas por módulo:
--   mesas-salon      -> sectores, mesas
--   caja-turno       -> turnos_caja
--   comandas-cocina  -> comandas, comanda_items
--
-- Cada módulo consulta directamente las tablas de los otros dos cuando
-- necesita mostrarlas (ej: comandas-cocina lee `mesas` para mostrar el
-- número de mesa), igual que el dashboard ya lee tablas de Ventas/
-- Tesorería/Stock sin pasar por el Context de esos módulos.
-- ============================================================

-- ─── Catálogo de módulos (por si 0001_init.sql no llegó a correr
-- en este proyecto o los slugs no existen todavía) ──────────────

insert into edgy_gestion.modulos (nombre, slug, vertical, descripcion) values
  ('Mesas y salón', 'mesas-salon', 'gastronomico', 'Mapa de mesas y estado de ocupación'),
  ('Comandas y cocina', 'comandas-cocina', 'gastronomico', 'Pedidos por mesa y vista de cocina (KDS)'),
  ('Caja por turno', 'caja-turno', 'gastronomico', 'Apertura, cierre y arqueo de caja por turno')
on conflict (slug) do nothing;

-- ─── Sectores (mesas-salon) ─────────────────────────────────

create table if not exists edgy_gestion.sectores (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  nombre text not null,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

alter table edgy_gestion.sectores enable row level security;

create policy "Lectura interna de sectores" on edgy_gestion.sectores
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('mesas-salon', 'lectura'))
  );

create policy "Alta de sectores" on edgy_gestion.sectores
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('mesas-salon', 'escritura'))
  );

create policy "Edicion de sectores" on edgy_gestion.sectores
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('mesas-salon', 'escritura'))
  );

create policy "Borrado de sectores" on edgy_gestion.sectores
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('mesas-salon', 'escritura'))
  );

-- ─── Mesas (mesas-salon) ────────────────────────────────────
--
-- `estado` queda denormalizado (igual que saldo_cuenta_corriente en
-- Clientes de Ventas) para que la grilla pinte sin tener que calcular
-- el estado leyendo comandas en cada render. Lo actualiza el propio
-- store cuando cambia el estado de la comanda asociada.

create table if not exists edgy_gestion.mesas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  sector_id uuid not null references edgy_gestion.sectores(id),
  numero integer not null,
  capacidad integer not null default 4,
  pos_x numeric not null default 0,
  pos_y numeric not null default 0,
  estado text not null default 'libre' check (estado in ('libre', 'ocupada', 'cobro', 'reservada')),
  comanda_actual_id uuid,
  created_at timestamptz not null default now()
);

alter table edgy_gestion.mesas enable row level security;

create policy "Lectura interna de mesas" on edgy_gestion.mesas
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('mesas-salon', 'lectura'))
  );

create policy "Alta de mesas" on edgy_gestion.mesas
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('mesas-salon', 'escritura'))
  );

create policy "Edicion de mesas" on edgy_gestion.mesas
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('mesas-salon', 'escritura'))
    -- comandas-cocina también necesita poder marcar una mesa como
    -- ocupada/cobro/libre cuando cambia el estado de su comanda.
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('comandas-cocina', 'escritura'))
  );

create policy "Borrado de mesas" on edgy_gestion.mesas
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('mesas-salon', 'escritura'))
  );

-- ─── Turnos de caja (caja-turno) ────────────────────────────

create table if not exists edgy_gestion.turnos_caja (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  usuario_apertura_id uuid references edgy_gestion.usuarios_cliente(id),
  fecha_apertura timestamptz not null default now(),
  monto_apertura numeric not null default 0,
  usuario_cierre_id uuid references edgy_gestion.usuarios_cliente(id),
  fecha_cierre timestamptz,
  monto_cierre_declarado numeric,
  diferencia numeric,
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  notas text
);

alter table edgy_gestion.turnos_caja enable row level security;

create policy "Lectura interna de turnos_caja" on edgy_gestion.turnos_caja
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('caja-turno', 'lectura'))
    -- mesas-salon y comandas-cocina necesitan leer si hay un turno
    -- abierto para decidir si el plano/las comandas quedan editables.
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('mesas-salon', 'lectura'))
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('comandas-cocina', 'lectura'))
  );

create policy "Alta de turnos_caja" on edgy_gestion.turnos_caja
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('caja-turno', 'escritura'))
  );

create policy "Edicion de turnos_caja" on edgy_gestion.turnos_caja
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('caja-turno', 'escritura'))
  );

-- ─── Comandas (comandas-cocina) ─────────────────────────────

create table if not exists edgy_gestion.comandas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  mesa_id uuid not null references edgy_gestion.mesas(id),
  turno_id uuid not null references edgy_gestion.turnos_caja(id),
  mozo_usuario_id uuid references edgy_gestion.usuarios_cliente(id),
  estado text not null default 'abierta' check (estado in ('abierta', 'cobro', 'cerrada', 'cancelada')),
  fecha_apertura timestamptz not null default now(),
  fecha_cierre timestamptz,
  subtotal numeric not null default 0,
  total numeric not null default 0,
  comprobante_id uuid,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table edgy_gestion.comandas enable row level security;

create policy "Lectura interna de comandas" on edgy_gestion.comandas
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('comandas-cocina', 'lectura'))
  );

create policy "Alta de comandas" on edgy_gestion.comandas
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('comandas-cocina', 'escritura'))
  );

create policy "Edicion de comandas" on edgy_gestion.comandas
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('comandas-cocina', 'escritura'))
  );

-- ─── Ítems de comanda (comandas-cocina) ─────────────────────
--
-- `estado_cocina` es lo que alimenta la vista Cocina (KDS): cada
-- ítem avanza pendiente -> en_preparacion -> listo -> entregado
-- independientemente del estado general de la comanda.

create table if not exists edgy_gestion.comanda_items (
  id uuid primary key default gen_random_uuid(),
  comanda_id uuid not null references edgy_gestion.comandas(id) on delete cascade,
  producto_id uuid references edgy_gestion.productos(id),
  descripcion text not null,
  cantidad numeric not null default 1,
  precio_unitario numeric not null default 0,
  subtotal numeric not null default 0,
  estado_cocina text not null default 'pendiente' check (
    estado_cocina in ('pendiente', 'en_preparacion', 'listo', 'entregado')
  ),
  nota text,
  created_at timestamptz not null default now()
);

alter table edgy_gestion.comanda_items enable row level security;

create policy "Lectura interna de comanda_items" on edgy_gestion.comanda_items
  for select using (
    edgy_gestion.es_personal_edgy()
    or comanda_id in (
      select c.id from edgy_gestion.comandas c
      where c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('comandas-cocina', 'lectura')
    )
  );

create policy "Alta de comanda_items" on edgy_gestion.comanda_items
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or comanda_id in (
      select c.id from edgy_gestion.comandas c
      where c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('comandas-cocina', 'escritura')
    )
  );

create policy "Edicion de comanda_items" on edgy_gestion.comanda_items
  for update using (
    edgy_gestion.es_personal_edgy()
    or comanda_id in (
      select c.id from edgy_gestion.comandas c
      where c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('comandas-cocina', 'escritura')
    )
  );

-- ─── Verificación ────────────────────────────────────────────

select table_name
from information_schema.tables
where table_schema = 'edgy_gestion'
  and table_name = any(array['sectores', 'mesas', 'turnos_caja', 'comandas', 'comanda_items']);

select slug from edgy_gestion.modulos where slug in ('mesas-salon', 'comandas-cocina', 'caja-turno');
