-- =====================================================================
-- EDGY GESTIÓN — 0003: consolidado de las migraciones v2 a v8
-- Aplicadas directamente en producción durante el desarrollo de
-- Usuarios y Roles; este archivo las junta para que el repo refleje
-- el estado real de la base. Reemplaza, en los hechos, todo lo que
-- 0002_fix_insert_policies.sql había creado (ver v4 más abajo, que
-- da de baja esas policies de autoservicio).
-- =====================================================================


-- ============================== v2 ==============================
-- =====================================================================
-- EDGY GESTIÓN — Migración v2: Roles normalizados sobre la estructura
-- REAL existente (clientes, modulos, cliente_modulos, usuarios_cliente,
-- permisos). NO duplica nada, solo extiende.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catálogo de roles reutilizables, por cliente
-- ---------------------------------------------------------------------
create table if not exists edgy_gestion.roles (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references edgy_gestion.clientes(id) on delete cascade,
  nombre      text not null,
  es_sistema  boolean default false,  -- true para roles sugeridos (Dueño, Mozo, etc.)
  created_at  timestamptz default now(),
  unique (cliente_id, nombre)
);

-- ---------------------------------------------------------------------
-- 2. Bundle de permisos por rol (lo que reemplaza la asignación manual
--    módulo por módulo de cada empleado nuevo)
-- ---------------------------------------------------------------------
create table if not exists edgy_gestion.permisos_rol (
  id         uuid primary key default gen_random_uuid(),
  rol_id     uuid not null references edgy_gestion.roles(id) on delete cascade,
  modulo_id  uuid not null references edgy_gestion.modulos(id) on delete cascade,
  nivel      text not null,   -- mismo formato/valores que ya usa la tabla permisos
  unique (rol_id, modulo_id)
);

-- ---------------------------------------------------------------------
-- 3. Vincular usuarios_cliente al catálogo de roles
--    (se mantiene la columna 'rol' de texto libre sin tocar)
-- ---------------------------------------------------------------------
alter table edgy_gestion.usuarios_cliente
  add column if not exists rol_id uuid references edgy_gestion.roles(id);

-- ---------------------------------------------------------------------
-- 4. Soporte de login rápido por PIN para roles operativos
--    (Mozo, Cocina, Delivery) sin perder login completo para Dueño
-- ---------------------------------------------------------------------
alter table edgy_gestion.usuarios_cliente
  add column if not exists pin_hash  text,
  add column if not exists auth_mode text not null default 'full'
    check (auth_mode in ('full','pin'));

-- =====================================================================
-- FUNCIÓN: resolver el cliente_id del usuario autenticado actual
-- (base para todas las policies de RLS, incluidas las de Tesorería)
-- =====================================================================
create or replace function edgy_gestion.cliente_actual_id()
returns uuid
language sql
security definer
stable
as $$
  select cliente_id
  from edgy_gestion.usuarios_cliente
  where user_id = auth.uid()
  limit 1;
$$;

-- =====================================================================
-- FUNCIÓN: ¿el usuario actual tiene un nivel de permiso dado en un módulo?
-- Prioridad: 1) excepción individual en 'permisos' 2) bundle del rol
-- =====================================================================
create or replace function edgy_gestion.tiene_permiso(p_modulo_slug text, p_nivel text)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  v_usuario_cliente_id uuid;
  v_rol_id              uuid;
  v_modulo_id            uuid;
  v_override             text;
  v_bundle               text;
begin
  select uc.id, uc.rol_id
    into v_usuario_cliente_id, v_rol_id
  from edgy_gestion.usuarios_cliente uc
  where uc.user_id = auth.uid();

  select id into v_modulo_id from edgy_gestion.modulos where slug = p_modulo_slug;

  if v_usuario_cliente_id is null or v_modulo_id is null then
    return false;
  end if;

  -- 1. Excepción individual (tabla permisos existente) pisa al rol
  select nivel into v_override
  from edgy_gestion.permisos
  where usuario_cliente_id = v_usuario_cliente_id and modulo_id = v_modulo_id;

  if v_override is not null then
    return v_override = p_nivel;
  end if;

  -- 2. Si no hay excepción, usar el bundle del rol asignado
  if v_rol_id is null then
    return false;
  end if;

  select nivel into v_bundle
  from edgy_gestion.permisos_rol
  where rol_id = v_rol_id and modulo_id = v_modulo_id;

  return v_bundle = p_nivel;
end;
$$;

-- =====================================================================
-- RLS — aislamiento por tenant en las tablas existentes + las nuevas
-- (Solo SELECT por ahora. Las policies de INSERT/UPDATE/DELETE que
-- dependen de niveles de permiso van en el siguiente paso, una vez
-- confirmados los valores reales que usa la columna 'nivel'.)
-- =====================================================================
alter table edgy_gestion.clientes         enable row level security;
alter table edgy_gestion.usuarios_cliente  enable row level security;
alter table edgy_gestion.cliente_modulos   enable row level security;
alter table edgy_gestion.permisos          enable row level security;
alter table edgy_gestion.roles             enable row level security;
alter table edgy_gestion.permisos_rol      enable row level security;
-- 'modulos' es catálogo global (no es por tenant) -> solo lectura, sin RLS por cliente_id

create policy "clientes_select_propio" on edgy_gestion.clientes
  for select using (id = edgy_gestion.cliente_actual_id());

create policy "usuarios_cliente_select_mismo_cliente" on edgy_gestion.usuarios_cliente
  for select using (cliente_id = edgy_gestion.cliente_actual_id());

create policy "cliente_modulos_select_propio" on edgy_gestion.cliente_modulos
  for select using (cliente_id = edgy_gestion.cliente_actual_id());

create policy "roles_select_propio" on edgy_gestion.roles
  for select using (cliente_id = edgy_gestion.cliente_actual_id());

create policy "permisos_rol_select_propio" on edgy_gestion.permisos_rol
  for select using (
    rol_id in (
      select id from edgy_gestion.roles where cliente_id = edgy_gestion.cliente_actual_id()
    )
  );

create policy "permisos_select_propio" on edgy_gestion.permisos
  for select using (
    usuario_cliente_id in (
      select id from edgy_gestion.usuarios_cliente where cliente_id = edgy_gestion.cliente_actual_id()
    )
  );

-- TODO próximo paso: policies de insert/update/delete usando tiene_permiso()
-- una vez confirmados los valores reales de 'nivel' (lectura/escritura/admin u otros)
-- TODO próximo paso: policies sobre las tablas propias de Tesorería, una vez
-- confirmada dónde persiste sus datos (no aparecen todavía en edgy_gestion)


-- ============================== v3 ==============================
-- =====================================================================
-- EDGY GESTIÓN — Migración v3
-- 1) Jerarquía real de niveles (admin > escritura > lectura)
-- 2) Quién puede modificar Roles y Permisos (solo admin del cliente)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Rango numérico de cada nivel, para poder comparar "al menos X"
-- ---------------------------------------------------------------------
create or replace function edgy_gestion.nivel_rango(p_nivel text)
returns int
language sql
immutable
as $$
  select case p_nivel
    when 'lectura'   then 1
    when 'escritura' then 2
    when 'admin'     then 3
    else 0
  end;
$$;

-- ---------------------------------------------------------------------
-- 2. tiene_permiso() corregida — ahora compara por jerarquía, no
--    por igualdad exacta. admin satisface escritura y lectura.
--    Se borra la versión anterior porque el v2 la creó con el
--    parámetro llamado distinto (p_nivel vs p_nivel_minimo), y
--    Postgres no permite renombrar parámetros con CREATE OR REPLACE.
-- ---------------------------------------------------------------------
drop function if exists edgy_gestion.tiene_permiso(text, text);

create or replace function edgy_gestion.tiene_permiso(p_modulo_slug text, p_nivel_minimo text)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  v_usuario_cliente_id uuid;
  v_rol_id             uuid;
  v_modulo_id          uuid;
  v_override           text;
  v_bundle              text;
  v_nivel_efectivo      text;
begin
  select uc.id, uc.rol_id
    into v_usuario_cliente_id, v_rol_id
  from edgy_gestion.usuarios_cliente uc
  where uc.user_id = auth.uid();

  select id into v_modulo_id from edgy_gestion.modulos where slug = p_modulo_slug;

  if v_usuario_cliente_id is null or v_modulo_id is null then
    return false;
  end if;

  -- excepción individual pisa al bundle del rol
  select nivel into v_override
  from edgy_gestion.permisos
  where usuario_cliente_id = v_usuario_cliente_id and modulo_id = v_modulo_id;

  if v_override is not null then
    v_nivel_efectivo := v_override;
  elsif v_rol_id is not null then
    select nivel into v_bundle
    from edgy_gestion.permisos_rol
    where rol_id = v_rol_id and modulo_id = v_modulo_id;
    v_nivel_efectivo := v_bundle;
  end if;

  if v_nivel_efectivo is null then
    return false;
  end if;

  return edgy_gestion.nivel_rango(v_nivel_efectivo) >= edgy_gestion.nivel_rango(p_nivel_minimo);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. ¿Quién puede crear/editar Roles y Permisos? Necesita ser admin
--    del cliente. Se marca a nivel de ROL (es_admin), con fallback al
--    'Dueño' de texto libre para usuarios que todavía no migraron a
--    rol_id.
-- ---------------------------------------------------------------------
alter table edgy_gestion.roles
  add column if not exists es_admin boolean not null default false;

create or replace function edgy_gestion.es_admin_cliente()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select r.es_admin
       from edgy_gestion.usuarios_cliente uc
       join edgy_gestion.roles r on r.id = uc.rol_id
      where uc.user_id = auth.uid()),
    (select uc.rol = 'Dueño'
       from edgy_gestion.usuarios_cliente uc
      where uc.user_id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------
-- 4. Policies de escritura — solo admin del cliente puede modificar
--    Roles, el bundle de Permisos por rol, las excepciones individuales
--    de Permisos, y activar/desactivar Módulos para su cliente.
-- ---------------------------------------------------------------------
create policy "roles_insert_admin" on edgy_gestion.roles
  for insert with check (cliente_id = edgy_gestion.cliente_actual_id() and edgy_gestion.es_admin_cliente());

create policy "roles_update_admin" on edgy_gestion.roles
  for update using (cliente_id = edgy_gestion.cliente_actual_id() and edgy_gestion.es_admin_cliente())
  with check (cliente_id = edgy_gestion.cliente_actual_id() and edgy_gestion.es_admin_cliente());

create policy "roles_delete_admin" on edgy_gestion.roles
  for delete using (cliente_id = edgy_gestion.cliente_actual_id() and edgy_gestion.es_admin_cliente());

create policy "permisos_rol_insert_admin" on edgy_gestion.permisos_rol
  for insert with check (
    rol_id in (select id from edgy_gestion.roles where cliente_id = edgy_gestion.cliente_actual_id())
    and edgy_gestion.es_admin_cliente()
  );

create policy "permisos_rol_update_admin" on edgy_gestion.permisos_rol
  for update using (
    rol_id in (select id from edgy_gestion.roles where cliente_id = edgy_gestion.cliente_actual_id())
    and edgy_gestion.es_admin_cliente()
  );

create policy "permisos_rol_delete_admin" on edgy_gestion.permisos_rol
  for delete using (
    rol_id in (select id from edgy_gestion.roles where cliente_id = edgy_gestion.cliente_actual_id())
    and edgy_gestion.es_admin_cliente()
  );

create policy "permisos_insert_admin" on edgy_gestion.permisos
  for insert with check (
    usuario_cliente_id in (select id from edgy_gestion.usuarios_cliente where cliente_id = edgy_gestion.cliente_actual_id())
    and edgy_gestion.es_admin_cliente()
  );

create policy "permisos_update_admin" on edgy_gestion.permisos
  for update using (
    usuario_cliente_id in (select id from edgy_gestion.usuarios_cliente where cliente_id = edgy_gestion.cliente_actual_id())
    and edgy_gestion.es_admin_cliente()
  );

create policy "usuarios_cliente_update_admin" on edgy_gestion.usuarios_cliente
  for update using (cliente_id = edgy_gestion.cliente_actual_id() and edgy_gestion.es_admin_cliente())
  with check (cliente_id = edgy_gestion.cliente_actual_id() and edgy_gestion.es_admin_cliente());

create policy "cliente_modulos_insert_admin" on edgy_gestion.cliente_modulos
  for insert with check (cliente_id = edgy_gestion.cliente_actual_id() and edgy_gestion.es_admin_cliente());

create policy "cliente_modulos_update_admin" on edgy_gestion.cliente_modulos
  for update using (cliente_id = edgy_gestion.cliente_actual_id() and edgy_gestion.es_admin_cliente())
  with check (cliente_id = edgy_gestion.cliente_actual_id() and edgy_gestion.es_admin_cliente());

-- NOTA: el alta inicial de usuarios_cliente vía el wizard de onboarding
-- (magic link) corre con la service_role key del backend, que bypassea
-- RLS por diseño de Supabase — esta policy de UPDATE no afecta ese flujo.


-- ============================== v4 ==============================
-- =====================================================================
-- EDGY GESTIÓN — Migración v4
-- 1) Nivel de Personal Interno de Edgy (Pablo, Carlos, agentes)
-- 2) El alta de clientes y la activación de módulos dejan de ser
--    autoservicio — quedan reservadas a personal interno
-- 3) Se retiran las policies viejas sin chequeo de admin/staff que
--    quedaban compitiendo con las nuevas
-- 4) Fix: unificar cliente_actual_id() con la función preexistente
--    cliente_del_usuario_actual() para no tener dos haciendo lo mismo
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla de Personal Interno de Edgy
-- ---------------------------------------------------------------------
create table if not exists edgy_gestion.personal_edgy (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nombre     text,
  activo     boolean not null default true,
  created_at timestamptz default now()
);

insert into edgy_gestion.personal_edgy (user_id, nombre)
values ('165b38f5-d7b0-4f36-9ca8-5528ef063c62', 'Carlos Copelotti')
on conflict (user_id) do nothing;

-- Cuando Pablo tenga su cuenta, agregar acá:
-- insert into edgy_gestion.personal_edgy (user_id, nombre) values ('<uuid-de-pablo>', 'Pablo');

create or replace function edgy_gestion.es_personal_edgy()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from edgy_gestion.personal_edgy
    where user_id = auth.uid() and activo = true
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Fix de duplicación: cliente_actual_id() pasa a delegar en la
--    función preexistente, en vez de tener dos calculando lo mismo
-- ---------------------------------------------------------------------
create or replace function edgy_gestion.cliente_actual_id()
returns uuid
language sql
security definer
stable
as $$
  select edgy_gestion.cliente_del_usuario_actual();
$$;

-- =====================================================================
-- 3. CLIENTES — el alta deja de ser autoservicio
-- =====================================================================
drop policy if exists "cualquiera puede crear un cliente nuevo" on edgy_gestion.clientes;

create policy "clientes_insert_staff" on edgy_gestion.clientes
  for insert with check (edgy_gestion.es_personal_edgy());

create policy "clientes_update_staff" on edgy_gestion.clientes
  for update using (edgy_gestion.es_personal_edgy())
  with check (edgy_gestion.es_personal_edgy());

create policy "clientes_select_staff" on edgy_gestion.clientes
  for select using (edgy_gestion.es_personal_edgy());

-- =====================================================================
-- 4. CLIENTE_MODULOS — activar/desactivar módulos queda 100% reservado
--    a personal de Edgy (Opción 1 confirmada). Se retira la vieja
--    policy ALL sin filtro y las admin-scoped del v3 (estaban mal:
--    el Admin del CLIENTE no debe poder activar módulos por su cuenta)
-- =====================================================================
drop policy if exists "administrar módulos del propio cliente" on edgy_gestion.cliente_modulos;
drop policy if exists "cliente_modulos_insert_admin" on edgy_gestion.cliente_modulos;
drop policy if exists "cliente_modulos_update_admin" on edgy_gestion.cliente_modulos;

create policy "cliente_modulos_insert_staff" on edgy_gestion.cliente_modulos
  for insert with check (edgy_gestion.es_personal_edgy());

create policy "cliente_modulos_update_staff" on edgy_gestion.cliente_modulos
  for update using (edgy_gestion.es_personal_edgy())
  with check (edgy_gestion.es_personal_edgy());

create policy "cliente_modulos_select_staff" on edgy_gestion.cliente_modulos
  for select using (edgy_gestion.es_personal_edgy());

-- =====================================================================
-- 5. USUARIOS_CLIENTE — se retira la policy vieja que dejaba sumar
--    gente al equipo a cualquier empleado. Ahora puede sumar gente:
--    el personal de Edgy (alta inicial, cualquier cliente) o el Admin
--    del propio cliente (altas posteriores, solo dentro de su cliente)
-- =====================================================================
drop policy if exists "vincularse a un cliente o sumar gente al propio equipo" on edgy_gestion.usuarios_cliente;

create policy "usuarios_cliente_insert_staff" on edgy_gestion.usuarios_cliente
  for insert with check (edgy_gestion.es_personal_edgy());

create policy "usuarios_cliente_insert_admin" on edgy_gestion.usuarios_cliente
  for insert with check (
    cliente_id = edgy_gestion.cliente_actual_id() and edgy_gestion.es_admin_cliente()
  );

create policy "usuarios_cliente_select_staff" on edgy_gestion.usuarios_cliente
  for select using (edgy_gestion.es_personal_edgy());

-- =====================================================================
-- 6. PERMISOS — se retira la policy vieja sin chequeo de admin/staff
-- =====================================================================
drop policy if exists "asignar permisos al propio equipo" on edgy_gestion.permisos;

create policy "permisos_insert_staff" on edgy_gestion.permisos
  for insert with check (edgy_gestion.es_personal_edgy());

create policy "permisos_update_staff" on edgy_gestion.permisos
  for update using (edgy_gestion.es_personal_edgy());

create policy "permisos_select_staff" on edgy_gestion.permisos
  for select using (edgy_gestion.es_personal_edgy());

-- =====================================================================
-- 7. ROLES y PERMISOS_ROL — personal de Edgy puede armar el catálogo
--    de roles y sus bundles de permisos durante el alta inicial de
--    cualquier cliente (además del Admin del cliente, ya cubierto v3)
-- =====================================================================
create policy "roles_insert_staff" on edgy_gestion.roles
  for insert with check (edgy_gestion.es_personal_edgy());

create policy "roles_update_staff" on edgy_gestion.roles
  for update using (edgy_gestion.es_personal_edgy());

create policy "roles_delete_staff" on edgy_gestion.roles
  for delete using (edgy_gestion.es_personal_edgy());

create policy "roles_select_staff" on edgy_gestion.roles
  for select using (edgy_gestion.es_personal_edgy());

create policy "permisos_rol_insert_staff" on edgy_gestion.permisos_rol
  for insert with check (edgy_gestion.es_personal_edgy());

create policy "permisos_rol_update_staff" on edgy_gestion.permisos_rol
  for update using (edgy_gestion.es_personal_edgy());

create policy "permisos_rol_delete_staff" on edgy_gestion.permisos_rol
  for delete using (edgy_gestion.es_personal_edgy());

create policy "permisos_rol_select_staff" on edgy_gestion.permisos_rol
  for select using (edgy_gestion.es_personal_edgy());


-- ============================== v5 ==============================
-- =====================================================================
-- EDGY GESTIÓN — Migración v5
-- Empleados del cliente se identifican por CUIL/CUIT + PIN.
-- El personal de Edgy sigue usando email (sin cambios).
-- =====================================================================

-- El email deja de ser obligatorio — solo lo necesitan los usuarios
-- en auth_mode='full' (personal de Edgy, o el Admin del cliente si
-- decide loguearse con email en vez de PIN)
alter table edgy_gestion.usuarios_cliente
  alter column email drop not null;

alter table edgy_gestion.usuarios_cliente
  add column if not exists cuil   text,
  add column if not exists nombre text;

-- CUIL/CUIT: 11 dígitos, sin guiones. El formato con guiones (XX-XXXXXXXX-X)
-- es solo de presentación — se normaliza a dígitos antes de guardar.
alter table edgy_gestion.usuarios_cliente
  add constraint usuarios_cliente_cuil_formato
  check (cuil is null or cuil ~ '^[0-9]{11}$');

-- Único por cliente (no global: la misma persona podría, en teoría,
-- trabajar para dos clientes distintos de Edgy con el mismo CUIL)
create unique index if not exists usuarios_cliente_cliente_cuil_uniq
  on edgy_gestion.usuarios_cliente (cliente_id, cuil)
  where cuil is not null;

-- Integridad: cada modo de autenticación exige su propio dato base.
-- auth_mode='pin' NO exige pin_hash todavía — lo completa el empleado
-- en su primer ingreso, no el Admin al darlo de alta.
alter table edgy_gestion.usuarios_cliente
  add constraint usuarios_cliente_auth_mode_datos
  check (
    (auth_mode = 'full' and email is not null)
    or
    (auth_mode = 'pin'  and cuil is not null)
  );


-- ============================== v6 ==============================
-- =====================================================================
-- EDGY GESTIÓN — Migración v6
-- Cierre de gap: personal_edgy quedó sin RLS habilitado desde el v4
-- =====================================================================

alter table edgy_gestion.personal_edgy enable row level security;

create policy "personal_edgy_select_staff" on edgy_gestion.personal_edgy
  for select using (edgy_gestion.es_personal_edgy());

-- Sin policies de insert/update/delete a propósito: alta y baja de
-- personal interno de Edgy se hace por fuera del dashboard de clientes
-- (consola de Supabase o backend con service_role), no es una acción
-- que el propio personal deba poder hacer desde la app.


-- ============================== v7 ==============================
-- =====================================================================
-- EDGY GESTIÓN — Migración v7
-- Nuevos campos en clientes para el Paso 1 del wizard de alta:
-- Titular, Dirección, CUIT, Teléfono
-- =====================================================================

alter table edgy_gestion.clientes
  add column if not exists titular   text,
  add column if not exists direccion text,
  add column if not exists telefono  text,
  add column if not exists cuit      text;

-- CUIT: mismo formato que el CUIL de usuarios_cliente (11 dígitos,
-- sin guiones — el formato con guiones es solo de presentación)
alter table edgy_gestion.clientes
  add constraint clientes_cuit_formato
  check (cuit is null or cuit ~ '^[0-9]{11}$');

-- Un CUIT identifica a una única entidad legal — no debería repetirse
-- entre dos clientes distintos de Edgy
create unique index if not exists clientes_cuit_uniq
  on edgy_gestion.clientes (cuit)
  where cuit is not null;


-- ============================== v8 ==============================
-- =====================================================================
-- EDGY GESTIÓN — Migración v8 (URGENTE — correr antes de probar el
-- wizard nuevo)
-- Las restricciones CHECK originales de 0001_init.sql nunca se
-- actualizaron cuando pasamos a roles reutilizables y a la jerarquía
-- real de niveles. Con el wizard nuevo, CUALQUIER alta de usuario o de
-- permiso por rol va a fallar contra la base hasta correr esto.
-- =====================================================================

-- `rol` ahora es texto libre de respaldo (el dato real vive en rol_id
-- -> roles.nombre, que admite cualquier nombre por cliente). La lista
-- fija de 5 valores en minúscula ya no tiene sentido.
alter table edgy_gestion.usuarios_cliente
  drop constraint if exists usuarios_cliente_rol_check;

-- `permisos.nivel` debe admitir los mismos valores que `permisos_rol.nivel`
-- y que nivel_rango() ya espera (lectura/escritura/admin), no los viejos
-- (ver/editar/admin).
alter table edgy_gestion.permisos
  drop constraint if exists permisos_nivel_check;

alter table edgy_gestion.permisos
  add constraint permisos_nivel_check
  check (nivel in ('lectura', 'escritura', 'admin'));

