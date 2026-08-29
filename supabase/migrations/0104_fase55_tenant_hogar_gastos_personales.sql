-- ============================================================
-- OBSOLETO -- ver Fase 56 (migraciones 0106+)
-- ============================================================
-- El tenant "Hogar" armado acá se dio de baja el mismo día: obligaba
-- a un login de Auth separado del negocio real, lo cual generaba
-- fricción (Carlos no podía simplemente "cambiar" de negocio con su
-- login de siempre). Se reemplazó por un MÓDULO de plataforma ("Home
-- Keep" / Kit Hogar) que corre bajo el mismo cliente_id y el mismo
-- login -- ver 0106_fase56_modulo_home_keep.sql y siguientes.
--
-- El cliente Hogar (c279fb9a-...), su rol, cliente_modulos,
-- permisos_rol, usuarios_cliente y categorias_gasto ya fueron
-- eliminados a mano el 29/08 al migrar a la Fase 56. Este archivo
-- queda solo como registro histórico de por qué se llegó al diseño
-- final -- NO correrlo de nuevo en una base limpia sin saltear la
-- sección 2 (creación del tenant) y el insert de usuarios_cliente.
-- ============================================================
--
-- Fase 55: tenant "Hogar" + categorías de gasto personal
-- Edgy Gestión · Núcleo + Compras
-- ============================================================
--
-- Carlos quiere trackear los gastos personales del hogar (changomás,
-- farmacia, colegio, etc.) reutilizando la infraestructura ya armada
-- de Compras (matching de proveedor por CUIT, comprobantes, forma de
-- pago) en vez de construir algo nuevo desde cero. Para eso se crea
-- un tercer "cliente" (tenant) llamado Hogar, con SOLO el módulo
-- Compras activo (nunca Ventas/Facturación) -- así los gastos del
-- hogar quedan en su propio libro, sin mezclarse nunca con los
-- comprobantes reales de Punto Tex o La Charcutería.
--
-- Las categorías de gasto (Vivienda, Alimentación, Salud, etc.) NO
-- reusan la tabla `rubros` existente a propósito: esa tabla ya está
-- en uso para clasificar Productos/Insumos de producción (ej. "Telas"
-- en Punto Tex), y mezclar ahí categorías de gasto doméstico dejaría
-- ese desplegable confuso para cualquiera que use Compras a futuro.
-- Se arma una tabla chica y separada: `categorias_gasto`.
--
-- IDs fijos (generados una sola vez, hardcodeados para poder
-- referenciarlos en más de un INSERT/ALTER dentro de este mismo
-- archivo sin depender de CTEs cruzados entre statements):
--   cliente Hogar:      c279fb9a-aa61-48f7-9f8c-1a609052db84
--   rol Dueño (Hogar):  1f948d5f-1f14-4e4b-87bc-ad525392bf87
--   módulo Compras:     7f85c9e5-98d4-4fd8-90df-bc526fcfa3c1 (ya existente)
--   usuario (Carlos):   165b38f5-d7b0-4f36-9ca8-5528ef063c62 (auth.users de
--                       c.copelotti@gmail.com -- su identidad de
--                       personal_edgy, NO el user_id de La Charcutería)
--
-- OJO -- versión corregida el mismo día: la primera vez este archivo
-- reutilizaba el user_id de Carlos en La Charcutería
-- (94e4477b-c660-4447-9f04-47c678c5e7af). Eso rompe
-- src/hooks/useClienteActual.ts, que asume UN solo tenant por user_id
-- (.single() sobre usuarios_cliente). Se detectó en vivo (2 filas para
-- el mismo user_id) y se corrigió usando en cambio la identidad de
-- Auth que Carlos ya tiene como personal_edgy (c.copelotti@gmail.com),
-- que no estaba atada a ningún cliente todavía.
-- ============================================================

set search_path to edgy_gestion, public;

-- ─── 1. Nuevo valor de tipo_negocio para tenants sin fin comercial ──

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
    'gastronomico_con_salon', 'gastronomico_sin_salon',
    'comercio', 'logistica', 'produccion', 'servicios', 'agro',
    'comercio_produccion', 'comercio_servicios', 'comercio_produccion_servicios',
    'hogar'
  ));

-- ─── 2. Cliente Hogar (solo Compras, nunca Ventas) ──────────────────

insert into edgy_gestion.clientes (id, nombre, tipo_negocio, slug, estado)
values ('c279fb9a-aa61-48f7-9f8c-1a609052db84', 'Hogar', 'hogar', 'hogar-copelotti', 'activo')
on conflict (id) do nothing;

insert into edgy_gestion.roles (id, cliente_id, nombre, es_sistema, es_admin, vista)
values (
  '1f948d5f-1f14-4e4b-87bc-ad525392bf87',
  'c279fb9a-aa61-48f7-9f8c-1a609052db84',
  'Dueño', true, true, 'administrativo'
)
on conflict (id) do nothing;

insert into edgy_gestion.cliente_modulos (cliente_id, modulo_id, activo)
values (
  'c279fb9a-aa61-48f7-9f8c-1a609052db84',
  '7f85c9e5-98d4-4fd8-90df-bc526fcfa3c1', -- Compras
  true
)
on conflict (cliente_id, modulo_id) do nothing;

insert into edgy_gestion.permisos_rol (rol_id, modulo_id, nivel)
values (
  '1f948d5f-1f14-4e4b-87bc-ad525392bf87',
  '7f85c9e5-98d4-4fd8-90df-bc526fcfa3c1', -- Compras
  'admin'
)
on conflict (rol_id, modulo_id) do nothing;

insert into edgy_gestion.usuarios_cliente (cliente_id, user_id, email, rol, rol_id, auth_mode, nombre)
values (
  'c279fb9a-aa61-48f7-9f8c-1a609052db84',
  '165b38f5-d7b0-4f36-9ca8-5528ef063c62', -- Carlos, identidad personal_edgy (c.copelotti@gmail.com), NO la de La Charcutería
  'c.copelotti@gmail.com',
  'Dueño',
  '1f948d5f-1f14-4e4b-87bc-ad525392bf87',
  'full',
  'Carlos Copelotti'
)
on conflict do nothing;

-- ─── 3. Categorías de gasto (separadas de Rubros de Insumo/Producto) ─

create table if not exists edgy_gestion.categorias_gasto (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now(),
  unique (cliente_id, nombre)
);

alter table edgy_gestion.categorias_gasto enable row level security;

insert into edgy_gestion.categorias_gasto (cliente_id, nombre) values
  ('c279fb9a-aa61-48f7-9f8c-1a609052db84', 'Vivienda'),
  ('c279fb9a-aa61-48f7-9f8c-1a609052db84', 'Alimentación y Supermercado'),
  ('c279fb9a-aa61-48f7-9f8c-1a609052db84', 'Educación'),
  ('c279fb9a-aa61-48f7-9f8c-1a609052db84', 'Salud'),
  ('c279fb9a-aa61-48f7-9f8c-1a609052db84', 'Transporte y Movilidad'),
  ('c279fb9a-aa61-48f7-9f8c-1a609052db84', 'Servicios y Suscripciones'),
  ('c279fb9a-aa61-48f7-9f8c-1a609052db84', 'Entretenimiento y Actividades'),
  ('c279fb9a-aa61-48f7-9f8c-1a609052db84', 'Vestimenta y Calzado'),
  ('c279fb9a-aa61-48f7-9f8c-1a609052db84', 'Ahorros e Imprevistos')
on conflict (cliente_id, nombre) do nothing;

-- ─── 4. Campo de categoría en ítems de comprobante de compra ────────

alter table edgy_gestion.comprobante_compra_items
  add column if not exists categoria_gasto_id uuid references edgy_gestion.categorias_gasto(id);

-- ─── Verificación ────────────────────────────────────────────

select id, nombre, tipo_negocio, estado from edgy_gestion.clientes
where id = 'c279fb9a-aa61-48f7-9f8c-1a609052db84';

select count(*) as categorias_creadas from edgy_gestion.categorias_gasto
where cliente_id = 'c279fb9a-aa61-48f7-9f8c-1a609052db84';
