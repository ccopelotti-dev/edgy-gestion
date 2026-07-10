-- ============================================================
-- Migración 0035: Catálogo Público genérico + convergencia de
-- Delivery/Menú QR · Fase 8b + 8c (en un solo despliegue)
-- Edgy Gestión · schema edgy_gestion
--
-- Se hacen juntas 8b y 8c porque la decisión tomada con el usuario
-- fue una sola página pública / una sola URL para cualquier rubro
-- (reusar src/pages/MenuPublico.tsx en vez de duplicar) -- si se
-- cambiaba a qué RPC apunta esa página sin al mismo tiempo migrar a
-- Delivery para que lea `ordenes_venta`, los pedidos que entren por
-- el Menú QR habrían quedado invisibles para el operador. Se
-- confirmó con el usuario que `pedidos_delivery` hoy solo tiene datos
-- de prueba, así que se trunca en vez de migrar filas existentes.
--
-- Qué trae:
-- 1) crear_orden_venta_publica(...): reemplaza a
--    crear_pedido_menu_publico (que queda eliminada). Mismo criterio
--    de seguridad que la Fase 7b: SECURITY DEFINER, ejecutable sin
--    sesión (rol anon), precio siempre recalculado en el servidor.
--    A diferencia de la anterior, ahora inserta en `ordenes_venta`
--    (no en `pedidos_delivery`) y además crea la fila de extensión
--    logística en `pedidos_delivery` -- así el pedido sigue
--    apareciendo en la pantalla de Delivery exactamente igual que
--    antes, sea "retiro" o "delivery".
-- 2) `pedidos_delivery` pasa a ser una extensión logística de
--    `ordenes_venta` (FK `orden_venta_id`): pierde todas las columnas
--    que ahora vive en `ordenes_venta` (cliente, ítems, total, medio
--    de pago, comprobante, notas, fecha, origen) y se queda solo con
--    lo que es exclusivamente de logística de reparto: su propio
--    `estado` (pendiente/en_camino/entregado/cancelado -- vocabulario
--    distinto al de `ordenes_venta.estado`, no se pisan).
-- 3) RLS: `pedidos_delivery` ya no tiene `cliente_id` propio, así que
--    sus políticas pasan a resolver el tenant vía join contra
--    `ordenes_venta` (mismo patrón que `comanda_items` -> `comandas`
--    en 0018_gastronomico_nucleo.sql). Se agregan políticas
--    adicionales en `ordenes_venta` para el permiso
--    'delivery-whatsapp' (select/insert/update), mismo criterio
--    aditivo que ya se usó en la Fase 7a para 'comandas-cocina'.
--
-- Qué NO cambia en el frontend: Index.tsx y Pedido.tsx de
-- delivery-whatsapp quedan intactos -- todo el reacomodo de datos se
-- resuelve adentro de store.tsx, que sigue devolviendo exactamente
-- la misma forma de `PedidoDelivery` (con un campo interno nuevo,
-- `ordenVentaId`, que esas dos pantallas no necesitan leer).
-- ============================================================

-- ─── 1) Reestructurar pedidos_delivery como extensión logística ──

-- Todo lo que hay hoy es de prueba (confirmado con el usuario) --
-- se trunca en vez de migrar filas existentes.
truncate table edgy_gestion.pedidos_delivery;

alter table edgy_gestion.pedidos_delivery
  add column if not exists orden_venta_id uuid references edgy_gestion.ordenes_venta(id) on delete cascade;

alter table edgy_gestion.pedidos_delivery
  drop column if exists cliente_id,
  drop column if exists cliente_venta_id,
  drop column if exists cliente_nombre,
  drop column if exists telefono,
  drop column if exists direccion,
  drop column if exists items,
  drop column if exists total,
  drop column if exists medio_pago,
  drop column if exists comprobante_id,
  drop column if exists notas,
  drop column if exists fecha,
  drop column if exists origen;

alter table edgy_gestion.pedidos_delivery
  alter column orden_venta_id set not null;

alter table edgy_gestion.pedidos_delivery
  add constraint pedidos_delivery_orden_venta_id_key unique (orden_venta_id);

-- ─── RLS de pedidos_delivery: ahora resuelve el tenant vía join ──

drop policy if exists "pedidos_delivery_select" on edgy_gestion.pedidos_delivery;
drop policy if exists "pedidos_delivery_insert" on edgy_gestion.pedidos_delivery;
drop policy if exists "pedidos_delivery_update" on edgy_gestion.pedidos_delivery;

create policy "pedidos_delivery_select" on edgy_gestion.pedidos_delivery
  for select using (
    edgy_gestion.es_personal_edgy()
    or orden_venta_id in (
      select id from edgy_gestion.ordenes_venta
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('delivery-whatsapp', 'lectura')
    )
  );

create policy "pedidos_delivery_insert" on edgy_gestion.pedidos_delivery
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or orden_venta_id in (
      select id from edgy_gestion.ordenes_venta
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('delivery-whatsapp', 'escritura')
    )
  );

create policy "pedidos_delivery_update" on edgy_gestion.pedidos_delivery
  for update using (
    edgy_gestion.es_personal_edgy()
    or orden_venta_id in (
      select id from edgy_gestion.ordenes_venta
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('delivery-whatsapp', 'escritura')
    )
  );

-- ─── 2) ordenes_venta: políticas aditivas para delivery-whatsapp ──
-- (mismo criterio que la Fase 7a con comandas-cocina: un usuario con
-- permiso solo de delivery-whatsapp también necesita poder leer/
-- crear/editar sus propias ordenes_venta, no solo las de 'ventas')

drop policy if exists "ordenes_venta_select_delivery" on edgy_gestion.ordenes_venta;
create policy "ordenes_venta_select_delivery" on edgy_gestion.ordenes_venta
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('delivery-whatsapp', 'lectura')
  );

drop policy if exists "ordenes_venta_insert_delivery" on edgy_gestion.ordenes_venta;
create policy "ordenes_venta_insert_delivery" on edgy_gestion.ordenes_venta
  for insert with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('delivery-whatsapp', 'escritura')
  );

drop policy if exists "ordenes_venta_update_delivery" on edgy_gestion.ordenes_venta;
create policy "ordenes_venta_update_delivery" on edgy_gestion.ordenes_venta
  for update using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('delivery-whatsapp', 'escritura')
  );

-- ─── 3) Motor público: crear_orden_venta_publica ─────────────────

drop function if exists edgy_gestion.crear_pedido_menu_publico(text, text, text, text, text, jsonb);

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
  v_items_resueltos jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_orden_id uuid;
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

    v_items_resueltos := v_items_resueltos || jsonb_build_object(
      'productoId', v_producto.id,
      'descripcion', v_producto.nombre,
      'cantidad', v_cantidad,
      'precioUnitario', v_precio
    );
    v_total := v_total + (v_precio * v_cantidad);
  end loop;

  v_orden_id := gen_random_uuid();

  insert into edgy_gestion.ordenes_venta (
    id, cliente_id, cliente_nombre, telefono, direccion,
    canal_cumplimiento, origen, items, subtotal, total, estado, notas, fecha
  ) values (
    v_orden_id, v_cliente_id, btrim(p_cliente_nombre), btrim(p_telefono),
    btrim(p_direccion), p_canal_cumplimiento, 'catalogo_publico',
    v_items_resueltos, v_total, v_total, 'pendiente',
    nullif(btrim(coalesce(p_notas, '')), ''), current_date
  );

  -- Extensión logística: el pedido sigue apareciendo en la pantalla
  -- de Delivery igual que antes, sea "retiro" o "delivery" -- todavía
  -- no existe una pantalla separada para "retiro sin reparto" (queda
  -- para cuando se construya el módulo genérico de Órdenes de Venta,
  -- Fase 8e).
  insert into edgy_gestion.pedidos_delivery (id, orden_venta_id, estado)
  values (gen_random_uuid(), v_orden_id, 'pendiente');

  return jsonb_build_object('id', v_orden_id, 'total', v_total);
end;
$$;

grant execute on function edgy_gestion.crear_orden_venta_publica(text, text, text, text, text, text, jsonb) to anon;
grant execute on function edgy_gestion.crear_orden_venta_publica(text, text, text, text, text, text, jsonb) to authenticated;

-- ─── Verificación ────────────────────────────────────────────

select column_name, data_type
from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'pedidos_delivery'
order by ordinal_position;
