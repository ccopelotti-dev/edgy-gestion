-- ============================================================
-- Migración 0111: Fase 63 -- Agente conversacional en Ventas
-- Edgy Gestión · schema edgy_gestion
--
-- Piloto en Presupuestos (Punto Tex): cuando el cliente responde a un
-- Presupuesto recién enviado, una clasificación IA (n8n) decide entre
-- tres escenarios (ver diseño acordado con Carlos, 29-30/08):
--
--  1) Confirmación clara -> el agente aprueba el Presupuesto en el
--     sistema (equivalente a apretar "Aprobar"), crea la Orden y avisa
--     al supervisor. Ver función aprobar_presupuesto_agente() abajo.
--  2) Ambiguo / con condición -> el agente responde con un mensaje de
--     cortesía y PAUSA esa conversación (deja de autoresponderle a ese
--     teléfono) hasta que el supervisor la retome. Ver tabla
--     agente_conversaciones_pausadas abajo.
--  3) Rechazo claro -> el agente se despide con una frase neutra
--     (alternada al azar, ver n8n) y avisa al supervisor.
--
-- El despause tiene dos caminos (ambos resueltos por teléfono, no
-- global -- el vendedor humano puede tener varias conversaciones en
-- pausa en simultáneo, una por cliente):
--   a) Explícito: el supervisor manda "CONTINUAR-XXXX" como mensaje
--      PRIVADO a su propio número de agente (no en el chat del
--      cliente) -- lo resuelve un nodo nuevo en n8n.
--   b) Automático: en cuanto se envía un documento nuevo a ESE mismo
--      teléfono desde el sistema (ej. un presupuesto revisado), la
--      pausa queda obsoleta -- se resuelve en agente-documento-check.js
--      comparando pausado_en contra el último envío de
--      documentos_enviados_agente, sin necesidad de un paso extra.
-- ============================================================

-- ─── 1) agente_conversaciones_pausadas ──────────────────────────
-- Una fila por pausa (histórico -- no se pisa, se cierra con
-- despausado_en/despausado_por y se abre una nueva si hace falta). El
-- índice parcial único garantiza como mucho UNA pausa activa por
-- (cliente_id, telefono) a la vez.

create table if not exists edgy_gestion.agente_conversaciones_pausadas (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  telefono text not null,
  numero_documento_referencia text,
  motivo text,
  pausado_en timestamptz not null default now(),
  despausado_en timestamptz,
  despausado_por text check (despausado_por in ('comando_supervisor', 'documento_nuevo')),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_agente_conv_pausadas_activa_unica
  on edgy_gestion.agente_conversaciones_pausadas (cliente_id, telefono)
  where despausado_en is null;

create index if not exists idx_agente_conv_pausadas_cliente_telefono
  on edgy_gestion.agente_conversaciones_pausadas (cliente_id, telefono, pausado_en desc);

alter table edgy_gestion.agente_conversaciones_pausadas enable row level security;

-- ─── 2) aprobar_presupuesto_agente ──────────────────────────────
-- Equivalente server-side de "Aprobar y crear orden" (handleAprobar en
-- Presupuestos.tsx / CONVERTIR_PRESUPUESTO_A_ORDEN en store.tsx), para
-- que el agente pueda ejecutar la misma acción sin sesión de usuario.
-- Mismo criterio que crear_orden_venta_agente (0099): SECURITY DEFINER,
-- sin grant a anon/authenticated -- solo vía service_role.
--
-- Idempotente a propósito: si el presupuesto ya estaba aprobado (ej.
-- reintento del webhook de WhatsApp), devuelve los datos de la orden
-- ya existente en vez de duplicarla.
--
-- p_numero_documento llega tal cual lo guardó documentos_enviados_agente
-- (ej. "PRE-00009") -- se extrae la parte numérica al final.

create or replace function edgy_gestion.aprobar_presupuesto_agente(
  p_cliente_id uuid,
  p_numero_documento text
)
returns jsonb
language plpgsql
security definer
set search_path = edgy_gestion, public
as $$
declare
  v_numero_pres integer;
  v_presupuesto record;
  v_orden_existente record;
  v_numero_orden integer;
  v_orden_id uuid;
  v_cliente_venta record;
begin
  if p_cliente_id is null then
    raise exception 'Falta el tenant';
  end if;

  v_numero_pres := nullif(substring(coalesce(p_numero_documento, '') from '(\d+)$'), '')::integer;
  if v_numero_pres is null then
    raise exception 'No se pudo interpretar el número de presupuesto (%)', p_numero_documento;
  end if;

  select p.* into v_presupuesto
  from edgy_gestion.presupuestos p
  where p.cliente_id = p_cliente_id and p.numero = v_numero_pres;

  if v_presupuesto.id is null then
    raise exception 'No se encontró el presupuesto %', p_numero_documento;
  end if;

  -- Idempotencia: si ya está aprobado, devolver la orden que ya existe
  -- en vez de crear una duplicada.
  if v_presupuesto.estado = 'aprobado' and v_presupuesto.orden_id is not null then
    select o.id, o.numero, o.total into v_orden_existente
    from edgy_gestion.ordenes_venta o
    where o.id = v_presupuesto.orden_id;

    select cv.id, cv.nombre, cv.telefono into v_cliente_venta
    from edgy_gestion.clientes_venta cv
    where cv.id = v_presupuesto.cliente_venta_id;

    return jsonb_build_object(
      'yaAprobado', true,
      'presupuestoId', v_presupuesto.id,
      'ordenId', v_orden_existente.id,
      'numeroOrden', 'OP-' || lpad(v_orden_existente.numero::text, 5, '0'),
      'total', v_orden_existente.total,
      'clienteVentaId', v_cliente_venta.id,
      'clienteNombre', v_cliente_venta.nombre,
      'telefono', v_cliente_venta.telefono
    );
  end if;

  if v_presupuesto.estado = 'cancelado' then
    raise exception 'El presupuesto % está cancelado, no se puede aprobar', p_numero_documento;
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero_orden
  from edgy_gestion.ordenes_venta
  where cliente_id = p_cliente_id and tipo = 'pedido';

  v_orden_id := gen_random_uuid();

  insert into edgy_gestion.ordenes_venta (
    id, cliente_id, numero, tipo, cliente_venta_id, presupuesto_id,
    fecha, estado, subtotal, descuento_general, total, notas,
    origen_modulo, origen_canal
  ) values (
    v_orden_id, p_cliente_id, v_numero_orden, 'pedido', v_presupuesto.cliente_venta_id, v_presupuesto.id,
    current_date, 'pendiente', v_presupuesto.subtotal, v_presupuesto.descuento_general, v_presupuesto.total, null,
    'agente-whatsapp', 'agente'
  );

  insert into edgy_gestion.orden_venta_items (
    id, orden_id, producto_id, descripcion, cantidad, precio_unitario, descuento, subtotal, cantidad_entregada
  )
  select gen_random_uuid(), v_orden_id, pi.producto_id, pi.descripcion, pi.cantidad, pi.precio_unitario, pi.descuento, pi.subtotal, 0
  from edgy_gestion.presupuesto_items pi
  where pi.presupuesto_id = v_presupuesto.id;

  update edgy_gestion.presupuestos
  set estado = 'aprobado', orden_id = v_orden_id
  where id = v_presupuesto.id;

  select cv.id, cv.nombre, cv.telefono into v_cliente_venta
  from edgy_gestion.clientes_venta cv
  where cv.id = v_presupuesto.cliente_venta_id;

  return jsonb_build_object(
    'yaAprobado', false,
    'presupuestoId', v_presupuesto.id,
    'ordenId', v_orden_id,
    'numeroOrden', 'OP-' || lpad(v_numero_orden::text, 5, '0'),
    'total', v_presupuesto.total,
    'clienteVentaId', v_cliente_venta.id,
    'clienteNombre', v_cliente_venta.nombre,
    'telefono', v_cliente_venta.telefono
  );
end;
$$;

revoke all on function edgy_gestion.aprobar_presupuesto_agente(uuid, text) from public;

-- ─── Verificación ────────────────────────────────────────────

select table_name from information_schema.tables
where table_schema = 'edgy_gestion' and table_name = 'agente_conversaciones_pausadas';

select routine_name from information_schema.routines
where routine_schema = 'edgy_gestion' and routine_name = 'aprobar_presupuesto_agente';
