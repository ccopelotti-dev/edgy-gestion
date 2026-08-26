-- ============================================================
-- Migración 0099: Fase 50 -- crear_orden_venta_agente
-- Edgy Gestión · schema edgy_gestion
--
-- Motor de creación de pedidos para el agente de WhatsApp (Capa 3,
-- endpoint agente-ordenes-crear.js). Mismo patrón que
-- crear_orden_venta_publica (0036_retrofit_ordenes_venta_publico.sql),
-- con dos diferencias a propósito:
--
--  1) El tenant llega ya resuelto como p_cliente_id (la Netlify
--     Function lo saca de la API key -- Capa 2), no por slug público.
--     Por eso esta función NO se otorga a anon/authenticated: quien la
--     llame con un p_cliente_id cualquiera podría crear pedidos en
--     cuentas ajenas. Solo se ejecuta vía service_role (bypassea
--     grants), igual que el resto de los endpoints /agente-*.
--
--  2) El pedido queda con un cliente IDENTIFICADO (clientes_venta real,
--     no null) -- decisión de Carlos, 26/08: "Iríamos a lo segundo con
--     cliente identificado". Si no existe un clientes_venta con ese
--     teléfono para el tenant, se crea uno con valores por defecto
--     razonables para las columnas NOT NULL/CHECK que el alta manual
--     sí pide (tipo_documento='otro', documento=el propio teléfono,
--     condicion_iva='consumidor_final') -- se puede completar después
--     a mano desde el panel si hace falta más precisión fiscal.
--
--     El precio se resuelve por la lista de precios de la categoría del
--     cliente (categorias_cliente_venta.lista_precio_id), no por
--     clientes.lista_precio_delivery_id como el circuito público -- un
--     cliente recién creado no tiene categoría, así que cae directo a
--     precio_venta (mismo fallback que ya usa el Menú Público).
-- ============================================================

create or replace function edgy_gestion.crear_orden_venta_agente(
  p_cliente_id uuid,          -- tenant (Edgy Gestión), ya resuelto por la API key
  p_telefono text,            -- teléfono del cliente final, identifica al clientes_venta
  p_nombre text,               -- solo se usa si hay que dar de alta al cliente
  p_canal_cumplimiento text,  -- 'retiro' | 'delivery'
  p_direccion text,
  p_notas text,
  p_items jsonb                -- [{ "productoId": "<uuid>", "cantidad": <numeric> }, ...]
)
returns jsonb
language plpgsql
security definer
set search_path = edgy_gestion, public
as $$
declare
  v_cliente_venta_id uuid;
  v_categoria_id uuid;
  v_lista_id uuid;
  v_porcentaje numeric;
  v_cliente_creado boolean := false;
  v_nombre_cliente text;
  v_item jsonb;
  v_producto record;
  v_override numeric;
  v_precio numeric;
  v_cantidad numeric;
  v_total numeric := 0;
  v_orden_id uuid;
  v_numero integer;
begin
  if p_cliente_id is null then
    raise exception 'Falta el tenant';
  end if;
  if p_telefono is null or btrim(p_telefono) = '' then
    raise exception 'Falta el teléfono';
  end if;
  if p_canal_cumplimiento not in ('retiro', 'delivery') then
    raise exception 'Modalidad de entrega inválida';
  end if;
  if p_direccion is null or btrim(p_direccion) = '' then
    raise exception 'Falta la dirección';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene ítems';
  end if;

  -- Identificar o crear el cliente por teléfono, dentro del tenant.
  select id, categoria_id, nombre into v_cliente_venta_id, v_categoria_id, v_nombre_cliente
  from edgy_gestion.clientes_venta
  where cliente_id = p_cliente_id and telefono = btrim(p_telefono) and activo = true;

  if v_cliente_venta_id is null then
    v_nombre_cliente := nullif(btrim(coalesce(p_nombre, '')), '');
    if v_nombre_cliente is null then
      v_nombre_cliente := 'Cliente WhatsApp ' || btrim(p_telefono);
    end if;

    insert into edgy_gestion.clientes_venta (
      id, cliente_id, nombre, tipo_documento, documento, condicion_iva, telefono, activo
    ) values (
      gen_random_uuid(), p_cliente_id, v_nombre_cliente, 'otro', btrim(p_telefono),
      'consumidor_final', btrim(p_telefono), true
    )
    returning id into v_cliente_venta_id;

    v_cliente_creado := true;
    v_categoria_id := null;
  end if;

  if v_categoria_id is not null then
    select lista_precio_id into v_lista_id
    from edgy_gestion.categorias_cliente_venta
    where id = v_categoria_id;
  end if;

  select coalesce(lp.porcentaje_recargo, 0) into v_porcentaje
  from edgy_gestion.listas_precio lp
  where lp.id = v_lista_id;

  select coalesce(max(numero), 0) + 1 into v_numero
  from edgy_gestion.ordenes_venta
  where cliente_id = p_cliente_id and tipo = 'pedido';

  v_orden_id := gen_random_uuid();

  insert into edgy_gestion.ordenes_venta (
    id, cliente_id, numero, tipo, cliente_venta_id,
    contacto_nombre, contacto_telefono,
    fecha, estado, subtotal, descuento_general, total, notas,
    origen_modulo, origen_canal
  ) values (
    v_orden_id, p_cliente_id, v_numero, 'pedido', v_cliente_venta_id,
    v_nombre_cliente, btrim(p_telefono),
    current_date, 'pendiente', 0, 0, 0,
    nullif(btrim(coalesce(p_notas, '')), ''),
    'agente-whatsapp', p_canal_cumplimiento
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cantidad := (v_item->>'cantidad')::numeric;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad inválida en el pedido';
    end if;

    select p.id, p.nombre, p.precio_venta, p.costo
      into v_producto
    from edgy_gestion.productos p
    where p.id = (v_item->>'productoId')::uuid
      and p.cliente_id = p_cliente_id
      and p.disponible = true
      and p.estado = 'activo'
      and p.tipo is distinct from 'con_variantes';

    if v_producto.id is null then
      raise exception 'Un producto del pedido ya no está disponible';
    end if;

    if v_lista_id is null then
      v_precio := v_producto.precio_venta;
    else
      select pp.precio into v_override
      from edgy_gestion.producto_precios pp
      where pp.producto_id = v_producto.id and pp.lista_id = v_lista_id;
      v_precio := coalesce(v_override, v_producto.costo * (1 + v_porcentaje / 100));
    end if;

    insert into edgy_gestion.orden_venta_items (
      id, orden_id, producto_id, descripcion, cantidad,
      precio_unitario, descuento, subtotal, cantidad_entregada
    ) values (
      gen_random_uuid(), v_orden_id, v_producto.id, v_producto.nombre, v_cantidad,
      v_precio, 0, v_precio * v_cantidad, 0
    );

    v_total := v_total + (v_precio * v_cantidad);
  end loop;

  update edgy_gestion.ordenes_venta
  set subtotal = v_total, total = v_total
  where id = v_orden_id;

  -- Igual que crear_orden_venta_publica: el pedido queda visible en la
  -- pantalla de Delivery sea "retiro" o "delivery".
  insert into edgy_gestion.pedidos_delivery (id, orden_venta_id, estado, direccion, modalidad)
  values (gen_random_uuid(), v_orden_id, 'pendiente', btrim(p_direccion), p_canal_cumplimiento);

  return jsonb_build_object(
    'ordenId', v_orden_id,
    'numero', v_numero,
    'total', v_total,
    'clienteVentaId', v_cliente_venta_id,
    'clienteCreado', v_cliente_creado
  );
end;
$$;

-- A propósito NO se otorga a anon/authenticated (ver nota arriba) --
-- se revoca el EXECUTE por default a PUBLIC para que quede accesible
-- solo vía service_role (Netlify Functions con supabaseAdmin).
revoke all on function edgy_gestion.crear_orden_venta_agente(uuid, text, text, text, text, text, jsonb) from public;

-- ─── Verificación ────────────────────────────────────────────

select routine_name from information_schema.routines
where routine_schema = 'edgy_gestion' and routine_name = 'crear_orden_venta_agente';
