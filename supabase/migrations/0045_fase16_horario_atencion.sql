-- ============================================================
-- Migración 0045: Fase 16 (Backlog menor) · Horario de atención del
-- Catálogo público
-- Edgy Gestión · schema edgy_gestion
--
-- Primer ítem del backlog menor: el Catálogo público (MenuPublico.tsx,
-- /menu/:slug) hoy acepta pedidos las 24 hs, sin importar si el
-- negocio está realmente atendiendo. Se suma un horario de atención
-- opcional (apagado por defecto = comportamiento actual, sin cambios
-- para nadie que no lo configure) que:
--   1) se edita en Configuración > Empresa junto con el resto de los
--      datos nativos (no hace falta una tabla aparte como ARCA/Pago
--      porque no hay ningún dato sensible acá);
--   2) se expone en menu_publico() para que MenuPublico.tsx pueda
--      mostrar "Cerrado ahora" y deshabilitar el agregado al carrito
--      fuera de horario;
--   3) se valida TAMBIÉN del lado del servidor en
--      crear_orden_venta_publica() -- defensa en profundidad, el
--      front-end nunca es la única barrera para un pedido anónimo.
--
-- Días de la semana con la misma convención que JS Date.getDay():
-- 0 = domingo … 6 = sábado. Default: los 7 días (mismo criterio que
-- "no configurado = sin restricción").
-- ============================================================

alter table edgy_gestion.clientes
  add column if not exists horario_activo boolean not null default false,
  add column if not exists horario_apertura time,
  add column if not exists horario_cierre time,
  add column if not exists horario_dias smallint[] not null default '{0,1,2,3,4,5,6}';

-- ─── menu_publico: exponer el horario ────────────────────────────

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
        'colorMarca', c.color_marca,
        'pagoOnlineHabilitado', exists (
          select 1 from edgy_gestion.clientes_pago_config pc
          where pc.cliente_id = c.id
            and pc.proveedor = 'mercadopago'
            and pc.habilitado = true
        ),
        'horarioActivo', c.horario_activo,
        'horarioApertura', c.horario_apertura,
        'horarioCierre', c.horario_cierre,
        'horarioDias', c.horario_dias
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

-- ─── crear_orden_venta_publica: rechazar pedidos fuera de horario ──

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
  v_horario_activo boolean;
  v_horario_apertura time;
  v_horario_cierre time;
  v_horario_dias smallint[];
  v_ahora timestamptz;
  v_hora_local time;
  v_dia_local smallint;
  v_dentro_horario boolean;
begin
  select c.id, c.lista_precio_delivery_id,
         c.horario_activo, c.horario_apertura, c.horario_cierre, c.horario_dias
    into v_cliente_id, v_lista_id,
         v_horario_activo, v_horario_apertura, v_horario_cierre, v_horario_dias
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

  -- Horario de atención (opcional, apagado por defecto). Misma zona
  -- horaria que el resto del sistema (Argentina) -- no se guarda por
  -- cliente porque hoy todos los negocios de Edgy operan ahí.
  if v_horario_activo and v_horario_apertura is not null and v_horario_cierre is not null then
    v_ahora := now() at time zone 'America/Argentina/Buenos_Aires';
    v_hora_local := v_ahora::time;
    v_dia_local := extract(dow from v_ahora);

    if v_dia_local <> all(coalesce(v_horario_dias, '{0,1,2,3,4,5,6}'::smallint[])) then
      v_dentro_horario := false;
    elsif v_horario_apertura <= v_horario_cierre then
      v_dentro_horario := v_hora_local >= v_horario_apertura and v_hora_local <= v_horario_cierre;
    else
      -- Horario que cruza medianoche (ej. 20:00 a 02:00).
      v_dentro_horario := v_hora_local >= v_horario_apertura or v_hora_local <= v_horario_cierre;
    end if;

    if not v_dentro_horario then
      raise exception 'El local está cerrado en este momento. Volvé a intentar dentro del horario de atención.';
    end if;
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

  insert into edgy_gestion.pedidos_delivery (id, orden_venta_id, estado, direccion, modalidad)
  values (gen_random_uuid(), v_orden_id, 'pendiente', btrim(p_direccion), p_canal_cumplimiento);

  return jsonb_build_object('id', v_orden_id, 'numero', v_numero, 'total', v_total);
end;
$$;

-- ─── Verificación ────────────────────────────────────────────

select column_name, data_type
from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'clientes'
  and column_name like 'horario_%'
order by ordinal_position;
