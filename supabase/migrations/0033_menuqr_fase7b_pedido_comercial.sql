-- ============================================================
-- Migración 0033: Menú QR · Fase 7b (acción comercial)
-- Edgy Gestión · schema edgy_gestion
--
-- Auditoría solicitada por el usuario: el Menú QR era puramente
-- informativo ("Scope acordado: solo menú visual, sin pedidos" -- ver
-- 0020_menu_qr.sql) -- una oferta pasiva sin forma de ejecutar una
-- acción comercial. Esta fase agrega esa acción: el cliente arma un
-- pedido desde el menú público y lo manda, sin login.
--
-- Diseño: el pedido generado desde el QR aterriza como un Pedido de
-- Delivery más (`pedidos_delivery`, estado 'pendiente'), con un nuevo
-- campo `origen` para distinguirlo de los que carga el operador a
-- mano por WhatsApp. A partir de ahí sigue exactamente el mismo
-- circuito que ya existe y está probado (Fase 6d): el operador lo ve
-- en Delivery, lo marca "en camino" y al entregarlo se genera la Venta
-- real, se descuenta stock (bloqueante si falta) y se activa garantía
-- si corresponde -- no hace falta duplicar nada de esa lógica acá.
--
-- Por eso esta migración NO valida stock ni genera venta: solo crea el
-- pedido, igual que si el operador lo hubiera tipeado. La única parte
-- sensible es el precio -- se resuelve siempre del lado del servidor
-- (nunca se confía en lo que mande el navegador) usando la lista de
-- precio de Delivery configurada (clientes.lista_precio_delivery_id,
-- Fase 6d), con el mismo criterio que ya usa catalogoDelivery.ts:
-- override en producto_precios si existe, si no costo * (1 +
-- %recargo), y si no hay lista configurada, precio_venta tal cual.
--
-- Qué trae:
-- 1) pedidos_delivery.origen: 'operador' (default, sin cambios para
--    los pedidos existentes) | 'menu_qr'.
-- 2) menu_publico(p_slug): se actualiza para que el precio mostrado ya
--    sea el de la lista de Delivery (antes siempre mostraba
--    precio_venta a secas), y se agrega 'tipo' por producto (el
--    front no ofrece pedir productos con variantes todavía, mismo
--    criterio que Comandas en la Fase 7a).
-- 3) crear_pedido_menu_publico(...): función nueva, SECURITY DEFINER,
--    ejecutable sin sesión (rol anon) -- inserta el pedido con los
--    precios recalculados en el servidor.
-- ============================================================

-- ─── Origen del pedido ──────────────────────────────────────────

alter table edgy_gestion.pedidos_delivery
  add column if not exists origen text not null default 'operador'
  check (origen in ('operador', 'menu_qr'));

-- ─── menu_publico: precio real de Delivery + tipo de producto ────

create or replace function edgy_gestion.menu_publico(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = edgy_gestion, public
as $$
  select jsonb_build_object(
    'cliente', (
      select jsonb_build_object(
        'nombre', c.nombre,
        'slug', c.slug,
        'logoUrl', c.logo_url,
        'colorMarca', c.color_marca
      )
      from edgy_gestion.clientes c
      where c.slug = p_slug
        and c.estado = 'activo'
    ),
    'categorias', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'nombre', r.nombre,
          'productos', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'id', p.id,
                'nombre', p.nombre,
                'descripcion', p.descripcion,
                'precio', case
                  when cli.lista_precio_delivery_id is null then p.precio_venta
                  else coalesce(
                    (select pp.precio from edgy_gestion.producto_precios pp
                     where pp.producto_id = p.id and pp.lista_id = cli.lista_precio_delivery_id),
                    p.costo * (1 + coalesce(
                      (select lp.porcentaje_recargo from edgy_gestion.listas_precio lp
                       where lp.id = cli.lista_precio_delivery_id),
                      0
                    ) / 100)
                  )
                end,
                'imagen', p.imagenes[1],
                'tipo', p.tipo
              )
              order by p.nombre
            ), '[]'::jsonb)
            from edgy_gestion.productos p
            join edgy_gestion.clientes cli on cli.id = p.cliente_id
            where p.rubro_id = r.id
              and p.cliente_id = r.cliente_id
              and p.disponible = true
              and p.estado = 'activo'
          )
        )
        order by r.nombre
      ), '[]'::jsonb)
      from edgy_gestion.rubros r
      join edgy_gestion.clientes c on c.id = r.cliente_id
      where c.slug = p_slug
        and c.estado = 'activo'
    )
  );
$$;

-- ─── Crear pedido desde el Menú QR (acción comercial) ────────────

create or replace function edgy_gestion.crear_pedido_menu_publico(
  p_slug text,
  p_cliente_nombre text,
  p_telefono text,
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
  v_pedido_id uuid;
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

  v_pedido_id := gen_random_uuid();

  insert into edgy_gestion.pedidos_delivery (
    id, cliente_id, cliente_nombre, telefono, direccion, items, total,
    estado, notas, fecha, origen
  ) values (
    v_pedido_id, v_cliente_id, btrim(p_cliente_nombre), btrim(p_telefono),
    btrim(p_direccion), v_items_resueltos, v_total, 'pendiente',
    nullif(btrim(coalesce(p_notas, '')), ''), current_date, 'menu_qr'
  );

  return jsonb_build_object('id', v_pedido_id, 'total', v_total);
end;
$$;

grant execute on function edgy_gestion.crear_pedido_menu_publico(text, text, text, text, text, jsonb) to anon;
grant execute on function edgy_gestion.crear_pedido_menu_publico(text, text, text, text, text, jsonb) to authenticated;
