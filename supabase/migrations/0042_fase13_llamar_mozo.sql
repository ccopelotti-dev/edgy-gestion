-- ============================================================
-- Migración 0042: Fase 13c — Llamar mozo (Realtime)
-- Edgy Gestión · schema edgy_gestion
--
-- Primera vez que el repo usa Supabase Realtime (antes todo era
-- fetch-al-montar + fire-and-forget, ver notas de syncToSupabase en
-- los distintos data/store.tsx). Un llamado a mozo necesita empujar el
-- aviso al panel de Salón apenas se crea, no cuando alguien refresque
-- la pantalla -- por eso esta tabla se agrega a la publicación
-- `supabase_realtime` y el frontend se suscribe con
-- supabase.channel(...).on('postgres_changes', ...).
--
-- Dos orígenes posibles (Fase 13c, ambos entran a la misma tabla):
-- - 'cliente': el comensal, desde el Menú QR de su mesa (requiere QR
--   por mesa -- ver retrofit de menu-qr/Index.tsx y MenuPublico.tsx),
--   vía el RPC público `crear_llamado_mozo_publico` (mismo patrón
--   security definer que crear_orden_venta_publica en 0036).
-- - 'personal': un miembro del staff (cocina, caja) marcando que un
--   mozo tiene que pasar por una mesa, insertado directo autenticado
--   (RLS normal, sin necesidad de RPC).
-- ============================================================

create table if not exists edgy_gestion.llamados_mozo (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  mesa_id uuid not null references edgy_gestion.mesas(id),
  origen text not null check (origen in ('cliente', 'personal')),
  motivo text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'atendido')),
  atendido_por uuid references edgy_gestion.usuarios_cliente(id),
  created_at timestamptz not null default now(),
  atendido_at timestamptz
);

alter table edgy_gestion.llamados_mozo enable row level security;

-- Lectura/edición: personal con permiso de mesas-salon o
-- comandas-cocina (el panel de Salón y el detalle de mesa son los dos
-- lugares donde el staff puede ver/atender un llamado).
create policy "Lectura interna de llamados_mozo" on edgy_gestion.llamados_mozo
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and (edgy_gestion.tiene_permiso('mesas-salon', 'lectura')
             or edgy_gestion.tiene_permiso('comandas-cocina', 'lectura')))
  );

create policy "Alta de llamados_mozo (personal)" on edgy_gestion.llamados_mozo
  for insert with check (
    origen = 'personal'
    and (
      edgy_gestion.es_personal_edgy()
      or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
          and (edgy_gestion.tiene_permiso('mesas-salon', 'escritura')
               or edgy_gestion.tiene_permiso('comandas-cocina', 'escritura')))
    )
  );

create policy "Marcar atendido llamados_mozo" on edgy_gestion.llamados_mozo
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and (edgy_gestion.tiene_permiso('mesas-salon', 'escritura')
             or edgy_gestion.tiene_permiso('comandas-cocina', 'escritura')))
  );

-- Los llamados con origen 'cliente' entran exclusivamente por el RPC
-- security definer de abajo (anon no tiene policy de insert acá).

alter publication supabase_realtime add table edgy_gestion.llamados_mozo;

-- ─── RPC público: llamado desde el Menú QR de una mesa ───────────

create or replace function edgy_gestion.crear_llamado_mozo_publico(
  p_slug text,
  p_numero_mesa integer,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = edgy_gestion, public
as $$
declare
  v_cliente_id uuid;
  v_mesa_id uuid;
  v_id uuid;
begin
  select id into v_cliente_id
  from edgy_gestion.clientes
  where slug = p_slug and estado = 'activo';

  if v_cliente_id is null then
    raise exception 'Negocio no encontrado';
  end if;

  select id into v_mesa_id
  from edgy_gestion.mesas
  where cliente_id = v_cliente_id and numero = p_numero_mesa;

  if v_mesa_id is null then
    raise exception 'Mesa no encontrada';
  end if;

  v_id := gen_random_uuid();

  insert into edgy_gestion.llamados_mozo (id, cliente_id, mesa_id, origen, motivo)
  values (v_id, v_cliente_id, v_mesa_id, 'cliente', nullif(btrim(coalesce(p_motivo, '')), ''));

  return jsonb_build_object('id', v_id);
end;
$$;

grant execute on function edgy_gestion.crear_llamado_mozo_publico(text, integer, text) to anon;
grant execute on function edgy_gestion.crear_llamado_mozo_publico(text, integer, text) to authenticated;

-- ─── Verificación ────────────────────────────────────────────

select table_name from information_schema.tables
where table_schema = 'edgy_gestion' and table_name = 'llamados_mozo';

select proname from pg_proc where proname = 'crear_llamado_mozo_publico';
