-- ============================================================
-- Migración 0036: Retrofit del Catálogo Público / Delivery sobre el
-- motor REAL de Órdenes de Venta
-- Edgy Gestión · schema edgy_gestion
--
-- Contexto: las Fases 8a/8b/8c se construyeron asumiendo que
-- `ordenes_venta` era una tabla nueva a crear -- en realidad ya
-- existía (motor de Presupuestos/Órdenes de Ventas.tsx y
-- Presupuestos.tsx, sin migración propia porque es anterior a la
-- carpeta supabase/migrations/). El `create table if not exists` de
-- 0034 fue un no-op sobre la estructura real, y el RPC
-- `crear_orden_venta_publica` creado en 0035 insertaba columnas que no
-- existen en la tabla real -- roto desde que se desplegó, nunca
-- ejecutado con tráfico real. Esta migración retrofitea el motor real
-- para que el Catálogo Público y Delivery lo usen correctamente, sin
-- tocar nada de lo que ya usan Presupuestos.tsx/Ordenes.tsx.
--
-- Qué trae:
-- 1) `ordenes_venta.cliente_venta_id` pasa a ser nullable -- hoy es
--    uuid not null, lo que en los hechos también le pega al patrón
--    "Consumidor Final" que ya usa el resto de Ventas (CONSUMIDOR_FINAL_ID
--    es un string, no un uuid válido, así que un intento de insertarlo
--    ahí ya fallaría). Se relaja a nullable: NULL = "sin cliente
--    registrado", el mismo criterio que se usa para pedidos anónimos
--    del Catálogo Público.
-- 2) `ordenes_venta.contacto_nombre` / `contacto_telefono` (nuevas,
--    nullables): el nombre/teléfono de contacto del pedido en sí,
--    independiente de si hay o no un cliente_venta_id registrado --
--    mismo criterio que ya distingue el dominio de Delivery
--    (`clienteNombre` del pedido vs `clienteVentaNombre` del cliente
--    registrado).
-- 3) `pedidos_delivery.direccion` / `modalidad` (nuevas): la dirección
--    de entrega y si es retiro o envío pasan a vivir acá -- son datos
--    de logística de reparto, no del pedido en sí (un pedido tipo
--    'servicio' o 'produccion' de Ventas no necesita dirección).
-- 4) RLS aditiva en `orden_venta_items` para el permiso
--    'delivery-whatsapp' (select/insert/update) -- mismo criterio que
--    ya se usó en 0035 para `ordenes_venta`, necesario porque el alta
--    manual de pedidos desde Index.tsx corre autenticado y necesita
--    poder escribir sus propios ítems.
-- 5) Reescritura completa de `crear_orden_venta_publica`: misma firma
--    (MenuPublico.tsx no cambia), pero ahora inserta en el esquema
--    real -- `numero` calculado en el servidor (máximo + 1 por
--    cliente_id + tipo), ítems en `orden_venta_items` (no jsonb),
--    `cliente_venta_id` null (pedido anónimo), estado real 'pendiente'.
-- ============================================================

-- ─── 1) ordenes_venta: nullable + columnas de contacto ───────────

alter table edgy_gestion.ordenes_venta
  alter column cliente_venta_id drop not null;

alter table edgy_gestion.ordenes_venta
  add column if not exists contacto_nombre text,
  add column if not exists contacto_telefono text;

-- ─── 2) pedidos_delivery: dirección y modalidad ──────────────────

alter table edgy_gestion.pedidos_delivery
  add column if not exists direccion text,
  add column if not exists modalidad text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pedidos_delivery_modalidad_check'
  ) then
    alter table edgy_gestion.pedidos_delivery
      add constraint pedidos_delivery_modalidad_check check (modalidad in ('retiro', 'delivery'));
  end if;
end $$;

-- ─── 3) RLS aditiva en orden_venta_items para delivery-whatsapp ──

drop policy if exists "orden_venta_items_select_delivery" on edgy_gestion.orden_venta_items;
create policy "orden_venta_items_select_delivery" on edgy_gestion.orden_venta_items
  for select using (
    edgy_gestion.es_personal_edgy()
    or orden_id in (
      select id from edgy_gestion.ordenes_venta
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('delivery-whatsapp', 'lectura')
    )
  );

drop policy if exists "orden_venta_items_insert_delivery" on edgy_gestion.orden_venta_items;
create policy "orden_venta_items_insert_delivery" on edgy_gestion.orden_venta_items
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or orden_id in (
      select id from edgy_gestion.ordenes_venta
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('delivery-whatsapp', 'escritura')
    )
  );

drop policy if exists "orden_venta_items_update_delivery" on edgy_gestion.orden_venta_items;
create policy "orden_venta_items_update_delivery" on edgy_gestion.orden_venta_items
  for update using (
    edgy_gestion.es_personal_edgy()
    or orden_id in (
      select id from edgy_gestion.ordenes_venta
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('delivery-whatsapp', 'escritura')
    )
  );

-- ─── 4) Motor público: crear_orden_venta_publica (esquema real) ──

create or replace function edgy_gestion.crear_orden_venta_publica(
  p_slug text,
  p_cliente_nombre text,
  p_telefono text,
  p_canal_cumplimiento text, -- 'retiro' | 'delivery'
  p_direccion text,
  p_notas text,
  p_items jsonb -- [{ "productoId": "<uuid>", "cantidad": <numeric> }, ...]
)
returns jsonb
language plpgsql
security definer
set search_path = edgy_gestion, public
as $$
declare
  v_cliente_id uuid;
  v_lista_id uuid;
  v_porcentaje numeric;
  v_item jsonb;
  v_producto record;
  v_override numeric;
  v_precio numeric;
  v_cantidad numeric;
  v_total numeric := 0;
  v_orden_id uuid;
  v_numero integer;
begin
  select c.id, c.lista_precio_delivery_id into v_cliente_id, v_lista_id
  from edgy_gestion.clientes c
  where c.slug = p_slug and c.estado = 'activo';

  if v_cliente_id is null then
    raise exception 'Negocio no encontrado';
  end if;

  if p_cliente_nombre is null or btrim(p_cliente_nombre) = '' then
    raise exception 'Falta el nombre';
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

  select coalesce(lp.porcentaje_recargo, 0) into v_porcentaje
  from edgy_gestion.listas_precio lp
  where lp.id = v_lista_id;

  select coalesce(max(numero), 0) + 1 into v_numero
  from edgy_gestion.ordenes_venta
  where cliente_id = v_cliente_id and tipo = 'pedido';

  v_orden_id := gen_random_uuid();

  insert into edgy_gestion.ordenes_venta (
    id, cliente_id, numero, tipo, cliente_venta_id,
    contacto_nombre, contacto_telefono,
    fecha, estado, subtotal, descuento_general, total, notas,
    origen_modulo, origen_canal
  ) values (
    v_orden_id, v_cliente_id, v_numero, 'pedido', null,
    btrim(p_cliente_nombre), btrim(p_telefono),
    current_date, 'pendiente', 0, 0, 0,
    nullif(btrim(coalesce(p_notas, '')), ''),
    'menu-publico', p_canal_cumplimiento
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
      and p.cliente_id = v_cliente_id
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

  -- Extensión logística: el pedido sigue apareciendo en la pantalla
  -- de Delivery igual que antes de este retrofit, sea "retiro" o
  -- "delivery".
  insert into edgy_gestion.pedidos_delivery (id, orden_venta_id, estado, direccion, modalidad)
  values (gen_random_uuid(), v_orden_id, 'pendiente', btrim(p_direccion), p_canal_cumplimiento);

  return jsonb_build_object('id', v_orden_id, 'numero', v_numero, 'total', v_total);
end;
$$;

grant execute on function edgy_gestion.crear_orden_venta_publica(text, text, text, text, text, text, jsonb) to anon;
grant execute on function edgy_gestion.crear_orden_venta_publica(text, text, text, text, text, text, jsonb) to authenticated;

-- ─── Verificación ────────────────────────────────────────────

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'ordenes_venta'
  and column_name in ('cliente_venta_id', 'contacto_nombre', 'contacto_telefono')
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'pedidos_delivery'
order by ordinal_position;
