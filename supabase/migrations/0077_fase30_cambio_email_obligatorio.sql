-- ============================================================
-- Fase 30: cambio de email obligatorio en el próximo ingreso
-- Edgy Gestión · usuarios_cliente
-- ============================================================
--
-- Hoy no existe ninguna forma de cambiar el email de login de un
-- usuario ya creado (ni self-service ni desde el panel de Edgy) --
-- solo "reenviar acceso" (reset de contraseña a la MISMA dirección).
-- Esto lo resuelve así:
--
--   1) Staff marca `debe_cambiar_email = true` en la fila del usuario
--      (botón "Cambiar email" en ClienteDetalle.tsx).
--   2) La próxima vez que ese usuario entra a CUALQUIER pantalla del
--      dashboard (DashboardLayout, ver Layout.tsx), en vez del panel
--      normal ve una pantalla que le pide el email nuevo.
--   3) Al enviarlo, Supabase le manda un mail de verificación a esa
--      dirección nueva (supabase.auth.updateUser({ email })) -- recién
--      cuando lo confirma desde ahí se actualiza auth.users.email de
--      verdad. Hasta ese momento sigue entrando con el email viejo.
--   4) El link de confirmación cae en /confirmar-cambio-email, que
--      llama a confirmar_cambio_email() para sincronizar
--      usuarios_cliente.email con auth.users.email y apagar el flag.
--
-- De paso, se endurece vincular_usuario_actual() (0006_vincular_usuario.sql,
-- suelto en la raíz del repo, nunca versionado en supabase/migrations):
-- comparaba el email tal cual estaba guardado contra auth.users.email,
-- sin normalizar mayúsculas/espacios. Si alguien tipeó el mail del Admin
-- con un espacio de más o una mayúscula distinta a como Supabase Auth
-- terminó guardándolo, el match fallaba en silencio, el usuario quedaba
-- sin vincular para siempre, y la persona podía loguearse (Supabase Auth
-- no tiene drama) pero el sistema le mostraba "No encontramos un negocio
-- asociado a este usuario" -- exactamente el síntoma reportado en el
-- pendiente "el primer cambio de contraseña no permitió loguearse".
-- Nunca se pudo reproducir con un caso real, así que esto es una
-- corrección defensiva, no una confirmación de causa.
-- ============================================================

set search_path to edgy_gestion, public;

-- 1) Flag de cambio de email obligatorio
alter table edgy_gestion.usuarios_cliente
  add column if not exists debe_cambiar_email boolean not null default false;

comment on column edgy_gestion.usuarios_cliente.debe_cambiar_email is
  'Fase 30: true = la próxima vez que este usuario entra al dashboard, se le pide definir un email nuevo antes de dejarlo pasar. Lo prende el staff de Edgy desde ClienteDetalle.tsx; se apaga solo cuando confirmar_cambio_email() detecta que el email realmente cambió en auth.users.';

-- 2) RLS: el staff de Edgy necesita poder prender este flag (y en
-- general administrar usuarios_cliente) -- ya podía hacer INSERT y
-- SELECT (usuarios_cliente_insert_staff / usuarios_cliente_select_staff,
-- 0003_consolidado_v2_a_v8.sql) pero no UPDATE.
drop policy if exists "usuarios_cliente_update_staff" on edgy_gestion.usuarios_cliente;

create policy "usuarios_cliente_update_staff" on edgy_gestion.usuarios_cliente
  for update using (edgy_gestion.es_personal_edgy())
  with check (edgy_gestion.es_personal_edgy());

-- 3) RPC que confirma el cambio de email -- la llama el frontend al
-- caer en /confirmar-cambio-email (link de verificación de Supabase
-- Auth). Solo toca la fila del usuario que llama (auth.uid()), y solo
-- si auth.users.email realmente cambió respecto de lo guardado --
-- así es seguro llamarla más de una vez (ej. si el proyecto tiene
-- "secure email change" activado y hacen falta las dos confirmaciones,
-- la primera vez no hace nada y no rompe nada).
create or replace function edgy_gestion.confirmar_cambio_email()
returns void
language plpgsql
security definer
set search_path = edgy_gestion
as $$
declare
  v_auth_email text;
begin
  select email into v_auth_email from auth.users where id = auth.uid();

  update edgy_gestion.usuarios_cliente
  set email = v_auth_email,
      debe_cambiar_email = false
  where user_id = auth.uid()
    and email is distinct from v_auth_email;
end;
$$;

grant execute on function edgy_gestion.confirmar_cambio_email() to authenticated;

-- 4) Hardening defensivo de vincular_usuario_actual() -- normaliza
-- mayúsculas y espacios de ambos lados antes de comparar. Mismo
-- criterio de seguridad que la versión original: solo vincula filas
-- que coincidan con el email del USUARIO QUE LLAMA (auth.uid()), nunca
-- un parámetro.
create or replace function edgy_gestion.vincular_usuario_actual()
returns void
language plpgsql
security definer
set search_path = edgy_gestion
as $$
begin
  update edgy_gestion.usuarios_cliente
  set user_id = auth.uid()
  where user_id is null
    and lower(trim(email)) = (select lower(trim(email)) from auth.users where id = auth.uid());
end;
$$;

grant execute on function edgy_gestion.vincular_usuario_actual() to authenticated;

-- ─── Verificación ────────────────────────────────────────────

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'usuarios_cliente' and column_name = 'debe_cambiar_email';

select proname from pg_proc
where proname in ('confirmar_cambio_email', 'vincular_usuario_actual')
  and pronamespace = 'edgy_gestion'::regnamespace;
