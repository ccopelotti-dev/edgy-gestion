-- =====================================================================
-- EDGY GESTIÓN — Migración v13
-- Nada vinculaba el user_id real de Supabase Auth con la fila de
-- usuarios_cliente creada en el wizard — esa columna quedaba en null
-- para siempre, así que aunque el Admin definiera su contraseña
-- (CompletarCuenta.tsx) y entrara, useClienteActual nunca lo iba a
-- encontrar (depende de cliente_del_usuario_actual(), que matchea por
-- user_id). Esta función la llama el frontend una sola vez, justo
-- después de que la persona define su contraseña por primera vez.
--
-- Es segura porque solo vincula filas que coincidan con el email del
-- USUARIO QUE LLAMA (auth.uid()), tomado de auth.users, no de un
-- parámetro — no se puede usar para vincularse a la fila de otra
-- persona.
-- =====================================================================

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
    and email = (select email from auth.users where id = auth.uid());
end;
$$;

grant execute on function edgy_gestion.vincular_usuario_actual() to authenticated;
