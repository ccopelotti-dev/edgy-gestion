-- ============================================================
-- Migración 0146 (Fase 80, 15/09): privacidad de Patrimonio por
-- integrante (Home Keep / Ficha de Integrante)
--
-- Contexto: Rosana, Mateo, Milagros y Martina todavía no tienen login
-- activado (queda para más adelante), pero Carlos quiere dejar resuelta
-- la privacidad ANTES de activarlo: hoy, cualquier integrante con acceso
-- de lectura a Home Keep vería el patrimonio (ingresos, tarjetas,
-- vehículos, inmuebles) de TODOS los demás integrantes, no solo el
-- propio -- la RLS actual solo filtra por cliente_id, no por dueño del
-- registro.
--
-- Solución: cada integrante (o el Dueño, en su nombre) puede marcar su
-- propio Patrimonio como privado -- guardado en
-- usuarios_cliente.datos_extra->>'patrimonio_privado' (sin columna
-- nueva: mismo campo "libre" que ya usa Perfil Familiar para datos sin
-- columna dedicada todavía, ver Fase 71i). Cuando está marcado, sus
-- filas de Patrimonio dejan de ser visibles para el resto de la familia
-- A NIVEL DE RLS (no solo en la UI) -- excepto para el propio dueño de
-- esos datos y para quien tenga rol admin (Dueño).
--
-- Los "Datos personales" (nombre/teléfono/fecha de nacimiento/CUIL)
-- viven en la MISMA fila de usuarios_cliente que ya necesita ser
-- visible completa para armar el selector de integrantes en la UI -- no
-- se puede ocultar a nivel de fila sin romper eso. Esa protección queda
-- resuelta del lado del frontend (Ficha de Integrante: campos tapados +
-- botón "Mostrar"), documentado ahí, no acá.
-- ============================================================

-- ─── 1. Helpers ──────────────────────────────────────────────────────

create or replace function edgy_gestion.usuario_cliente_actual()
returns uuid
language sql
stable
security definer
set search_path to 'edgy_gestion', 'public', 'pg_temp'
as $$
  select id from edgy_gestion.usuarios_cliente where user_id = auth.uid() limit 1;
$$;

grant execute on function edgy_gestion.usuario_cliente_actual() to anon, authenticated;

create or replace function edgy_gestion.es_admin_del_cliente()
returns boolean
language sql
stable
security definer
set search_path to 'edgy_gestion', 'public', 'pg_temp'
as $$
  select coalesce(r.es_admin, false)
  from edgy_gestion.usuarios_cliente uc
  left join edgy_gestion.roles r on r.id = uc.rol_id
  where uc.user_id = auth.uid();
$$;

grant execute on function edgy_gestion.es_admin_del_cliente() to anon, authenticated;

-- Devuelve true si el usuario logueado puede ver el patrimonio del
-- integrante `p_usuario_cliente_id` -- sí mismo, un admin, o cualquiera
-- si esa persona no marcó su patrimonio como privado.
create or replace function edgy_gestion.puede_ver_patrimonio(p_usuario_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'edgy_gestion', 'public', 'pg_temp'
as $$
  select
    p_usuario_cliente_id is null
    or edgy_gestion.es_admin_del_cliente()
    or p_usuario_cliente_id = edgy_gestion.usuario_cliente_actual()
    or coalesce(
      (select uc.datos_extra ->> 'patrimonio_privado' from edgy_gestion.usuarios_cliente uc where uc.id = p_usuario_cliente_id) = 'true',
      false
    ) = false;
$$;

grant execute on function edgy_gestion.puede_ver_patrimonio(uuid) to anon, authenticated;

-- ─── 2. Políticas de lectura de Patrimonio ───────────────────────────

drop policy if exists "Lectura interna de ingresos_hogar" on edgy_gestion.ingresos_hogar;
create policy "Lectura interna de ingresos_hogar" on edgy_gestion.ingresos_hogar
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.puede_ver_patrimonio(usuario_cliente_id))
  );

drop policy if exists "Lectura interna de tarjetas_credito_hogar" on edgy_gestion.tarjetas_credito_hogar;
create policy "Lectura interna de tarjetas_credito_hogar" on edgy_gestion.tarjetas_credito_hogar
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.puede_ver_patrimonio(usuario_cliente_id))
  );

drop policy if exists "Lectura interna de vehiculos_hogar" on edgy_gestion.vehiculos_hogar;
create policy "Lectura interna de vehiculos_hogar" on edgy_gestion.vehiculos_hogar
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.puede_ver_patrimonio(usuario_cliente_id))
  );

drop policy if exists "Lectura interna de inmuebles_hogar" on edgy_gestion.inmuebles_hogar;
create policy "Lectura interna de inmuebles_hogar" on edgy_gestion.inmuebles_hogar
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.puede_ver_patrimonio(usuario_cliente_id))
  );

drop policy if exists "Lectura interna de resumenes_tarjeta_hogar" on edgy_gestion.resumenes_tarjeta_hogar;
create policy "Lectura interna de resumenes_tarjeta_hogar" on edgy_gestion.resumenes_tarjeta_hogar
  for select using (
    edgy_gestion.es_personal_edgy()
    or (
      cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and edgy_gestion.puede_ver_patrimonio((select t.usuario_cliente_id from edgy_gestion.tarjetas_credito_hogar t where t.id = resumenes_tarjeta_hogar.tarjeta_id))
    )
  );

drop policy if exists "Lectura interna de consumos_tarjeta_hogar" on edgy_gestion.consumos_tarjeta_hogar;
create policy "Lectura interna de consumos_tarjeta_hogar" on edgy_gestion.consumos_tarjeta_hogar
  for select using (
    edgy_gestion.es_personal_edgy()
    or (
      cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and edgy_gestion.puede_ver_patrimonio((select t.usuario_cliente_id from edgy_gestion.tarjetas_credito_hogar t where t.id = consumos_tarjeta_hogar.tarjeta_id))
    )
  );

-- ─── Verificación ────────────────────────────────────────────
select edgy_gestion.puede_ver_patrimonio(null);
