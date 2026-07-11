-- ============================================================
-- Migración 0040: Fase 13a — Traslado de mesas
-- Edgy Gestión · schema edgy_gestion
--
-- Mover una comanda de salón abierta (o en cobro) de una mesa a otra.
-- Hasta ahora el ciclo de vida de una mesa (mesas.estado,
-- mesas.comanda_actual_id) solo lo tocaba comandas-cocina con updates
-- sueltos fire-and-forget (ver actualizarEstadoMesa() en
-- comandas-cocina/data/store.tsx) -- para un traslado hacen falta 3
-- escrituras coordinadas (liberar origen, ocupar destino, repuntar
-- comanda.mesa_id) y no queremos que puedan quedar a mitad de camino
-- si el usuario cierra la pestaña o hay un error de red entre medio.
-- Por eso esto va como función transaccional (mismo criterio que
-- crear_orden_venta_publica en 0036): todo o nada, con las
-- validaciones de negocio adentro (mesa destino tiene que estar libre,
-- la comanda tiene que seguir abierta/en cobro) en vez de confiar en
-- que el frontend las respete.
-- ============================================================

create or replace function edgy_gestion.trasladar_comanda(
  p_comanda_id uuid,
  p_mesa_destino_id uuid
)
returns void
language plpgsql
security definer
set search_path = edgy_gestion, public
as $$
declare
  v_cliente_id uuid;
  v_mesa_origen_id uuid;
  v_estado_comanda text;
  v_cliente_destino uuid;
  v_estado_destino text;
begin
  v_cliente_id := edgy_gestion.cliente_del_usuario_actual();

  if not (
    edgy_gestion.es_personal_edgy()
    or edgy_gestion.tiene_permiso('comandas-cocina', 'escritura')
  ) then
    raise exception 'Sin permiso para trasladar comandas de salón';
  end if;

  select mesa_id, estado into v_mesa_origen_id, v_estado_comanda
  from edgy_gestion.comandas
  where id = p_comanda_id and cliente_id = v_cliente_id
  for update;

  if v_mesa_origen_id is null then
    raise exception 'No se encontró la comanda de salón';
  end if;

  if v_estado_comanda not in ('abierta', 'cobro') then
    raise exception 'Solo se puede trasladar una comanda abierta o en cobro';
  end if;

  if p_mesa_destino_id = v_mesa_origen_id then
    raise exception 'La mesa destino es la misma que la de origen';
  end if;

  select cliente_id, estado into v_cliente_destino, v_estado_destino
  from edgy_gestion.mesas
  where id = p_mesa_destino_id
  for update;

  if v_cliente_destino is null or v_cliente_destino is distinct from v_cliente_id then
    raise exception 'No se encontró la mesa destino';
  end if;

  if v_estado_destino <> 'libre' then
    raise exception 'La mesa destino no está libre';
  end if;

  update edgy_gestion.comandas
  set mesa_id = p_mesa_destino_id, updated_at = now()
  where id = p_comanda_id;

  -- La mesa destino queda en el mismo estado que tenía la comanda
  -- (ocupada si estaba 'abierta', cobro si estaba 'cobro') -- mismo
  -- mapeo que actualizarEstadoMesa() usa hoy para abrir/pasar a cobro.
  update edgy_gestion.mesas
  set estado = v_estado_comanda, comanda_actual_id = p_comanda_id
  where id = p_mesa_destino_id;

  update edgy_gestion.mesas
  set estado = 'libre', comanda_actual_id = null
  where id = v_mesa_origen_id;
end;
$$;

grant execute on function edgy_gestion.trasladar_comanda(uuid, uuid) to authenticated;

-- ─── Verificación ────────────────────────────────────────────

select proname, prosecdef
from pg_proc
where proname = 'trasladar_comanda';
