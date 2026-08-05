-- ============================================================
-- Migración 0072: Fase 27d-2 — Menú público con link separado
-- por punto de venta (local/sucursal)
-- Edgy Gestión
--
-- Hasta la 0071, el Catálogo Público (Menú QR/Delivery) era UN solo
-- link por cliente (`/menu/:slug`) que, ante 2+ locales, solo mostraba
-- el catálogo COMPARTIDO (no había forma de saber desde qué local se
-- estaba mirando). El cliente pidió ahora un link separado por local
-- -- cada uno con su propio catálogo (compartido + exclusivo de ESE
-- local), decisión tomada porque cada local puede vender rubros
-- completamente distintos (ej. "Punto Tex" vs "Rúa").
--
-- Cambios:
--  1. puntos_venta.slug (nullable, único por cliente): identificador
--     público del local en la URL, análogo a clientes.slug.
--  2. ordenes_venta.punto_venta_id (nullable): qué local generó ese
--     pedido -- mismo patrón que comprobantes_venta.punto_venta_id
--     (0070) y necesario para que la Fase 27f (Caja por turno) pueda
--     filtrar por local más adelante.
--  3. edgy_gestion.menu_publico(p_slug, p_punto_venta_slug) -- nuevo
--     overload de dos parámetros: si se pasa el slug del local,
--     resuelve su catálogo (compartido + exclusivo de ese local) e
--     incluye un objeto `puntoVenta` en la respuesta. El overload de
--     UN solo parámetro (`/menu/:slug`, sin local) sigue existiendo
--     sin cambios de comportamiento -- delega en el nuevo, pasando
--     null -- para no romper ningún link ya impreso/compartido de un
--     cliente de un solo local.
--  4. edgy_gestion.crear_orden_venta_publica -- se le agrega
--     `p_punto_venta_slug` (parámetro nuevo al final, default null,
--     así que los llamados existentes sin ese dato siguen funcionando
--     igual que hoy). Valida que cada ítem del pedido efectivamente
--     esté disponible para ESE local (antes no se validaba en el
--     servidor -- lo único que impedía pedir un producto exclusivo de
--     otro local era que no apareciera en el menú, defensa en
--     profundidad real, no solo de UI).
-- ============================================================

-- ─── 1) Slug del punto de venta ──────────────────────────────────────

alter table edgy_gestion.puntos_venta
  add column if not exists slug text;

create unique index if not exists puntos_venta_cliente_slug_uniq
  on edgy_gestion.puntos_venta (cliente_id, slug)
  where slug is not null;

-- ─── 2) Qué local generó cada pedido del Catálogo Público ───────────

alter table edgy_gestion.ordenes_venta
  add column if not exists punto_venta_id uuid references edgy_gestion.puntos_venta(id) on delete set null;

-- ─── 3) menu_publico: nuevo overload con punto de venta ─────────────

create or replace function edgy_gestion.menu_publico(p_slug text, p_punto_venta_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = edgy_gestion, public
as $$
declare
  v_cliente_id uuid;
  v_punto_venta_id uuid;
  v_punto_venta_alias text;
begin
  select id into v_cliente_id
  from edgy_gestion.clientes
  where slug = p_slug and estado = 'activo';

  if v_cliente_id is null then
    return jsonb_build_object('cliente', null, 'categorias', '[]'::jsonb, 'combos', '[]'::jsonb);
  end if;

  if p_punto_venta_slug is not null then
    select id, alias into v_punto_venta_id, v_punto_venta_alias
    from edgy_gestion.puntos_venta
    where cliente_id = v_cliente_id and slug = p_punto_venta_slug and activo = true;

    -- Local inexistente/dado de baja: mismo "no encontrado" que un
    -- slug de cliente inválido -- nunca cae de vuelta al catálogo
    -- genérico del cliente por error.
    if v_punto_venta_id is null then
      return jsonb_build_object('cliente', null, 'categorias', '[]'::jsonb, 'combos', '[]'::jsonb);
    end if;
  end if;

  return jsonb_build_object(
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
        'horarioDias', c.horario_dias,
        'combosTituloSeccion', c.combos_titulo_seccion,
        'puntoVenta', case
          when v_punto_venta_id is not null
          then jsonb_build_object('id', v_punto_venta_id, 'slug', p_punto_venta_slug, 'nombre', v_punto_venta_alias)
          else null
        end
      )
      from edgy_gestion.clientes c
      where c.id = v_cliente_id
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
                'tipo', p.tipo,
                'unidadVenta', p.unidad_venta
              )
              order by p.nombre
            ), '[]'::jsonb)
            from edgy_gestion.productos p
            join edgy_gestion.clientes cli on cli.id = p.cliente_id
            where p.rubro_id = r.id
              and p.cliente_id = r.cliente_id
              and p.disponible = true
              and p.estado = 'activo'
              and (p.punto_venta_id is null or p.punto_venta_id = v_punto_venta_id)
              and (
                p.dias_disponibles is null
                or array_length(p.dias_disponibles, 1) is null
                or extract(dow from (now() at time zone 'America/Argentina/Buenos_Aires'))::int = any(p.dias_disponibles)
              )
          )
        )
        order by r.nombre
      ), '[]'::jsonb)
      from edgy_gestion.rubros r
      join edgy_gestion.clientes c on c.id = r.cliente_id
      where c.slug = p_slug
        and c.estado = 'activo'
    ),
    'combos', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', co.id,
          'nombre', co.nombre,
          'descripcion', co.descripcion,
          'precio', co.precio_venta,
          'imagen', co.imagenes[1],
          'etiqueta', co.etiqueta
        )
        order by co.nombre
      ), '[]'::jsonb)
      from edgy_gestion.combos co
      join edgy_gestion.clientes c on c.id = co.cliente_id
      where c.slug = p_slug
        and c.estado = 'activo'
        and co.disponible = true
        and (co.punto_venta_id is null or co.punto_venta_id = v_punto_venta_id)
    )
  );
end;
$$;

grant execute on function edgy_gestion.menu_publico(text, text) to anon;
grant execute on function edgy_gestion.menu_publico(text, text) to authenticated;

-- El overload de un solo parámetro (link genérico de cliente, usado
-- por clientes de un solo local) delega en el de arriba pasando
-- null -- mismo resultado que tenía desde la 0071 (solo catálogo
-- compartido), cero cambio de comportamiento para links ya impresos.
create or replace function edgy_gestion.menu_publico(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = edgy_gestion, public
as $$
  select edgy_gestion.menu_publico(p_slug, null::text);
$$;

-- ─── 4) crear_orden_venta_publica: agrega p_punto_venta_slug ────────
--
-- Cambia la lista de parámetros (se suma uno al final) -- eso es una
-- firma distinta para Postgres, así que hace falta dropear la versión
-- vieja antes de recrear (CREATE OR REPLACE no alcanza cuando cambia
-- la cantidad de parámetros) y volver a otorgar los grants.

drop function if exists edgy_gestion.crear_orden_venta_publica(text, text, text, text, text, text, jsonb);

create or replace function edgy_gestion.crear_orden_venta_publica(
  p_slug text,
  p_cliente_nombre text,
  p_telefono text,
  p_canal_cumplimiento text, -- 'retiro' | 'delivery'
  p_direccion text,
  p_notas text,
  p_items jsonb, -- [{ "productoId"|"comboId": "<uuid>", "cantidad": <numeric> }, ...]
  p_punto_venta_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path = edgy_gestion, public
as $$
declare
  v_cliente_id uuid;
  v_punto_venta_id uuid;
  v_lista_id uuid;
  v_porcentaje numeric;
  v_item jsonb;
  v_producto record;
  v_combo record;
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

  if p_punto_venta_slug is not null then
    select id into v_punto_venta_id
    from edgy_gestion.puntos_venta
    where cliente_id = v_cliente_id and slug = p_punto_venta_slug and activo = true;

    if v_punto_venta_id is null then
      raise exception 'Local no encontrado';
    end if;
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

  -- Horario de atención (opcional, apagado por defecto).
  if v_horario_activo and v_horario_apertura is not null and v_horario_cierre is not null then
    v_ahora := now() at time zone 'America/Argentina/Buenos_Aires';
    v_hora_local := v_ahora::time;
    v_dia_local := extract(dow from v_ahora);

    if v_dia_local <> all(coalesce(v_horario_dias, '{0,1,2,3,4,5,6}'::smallint[])) then
      v_dentro_horario := false;
    elsif v_horario_apertura <= v_horario_cierre then
      v_dentro_horario := v_hora_local >= v_horario_apertura and v_hora_local <= v_horario_cierre;
    else
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
    origen_modulo, origen_canal, punto_venta_id
  ) values (
    v_orden_id, v_cliente_id, v_numero, 'pedido', null,
    btrim(p_cliente_nombre), btrim(p_telefono),
    current_date, 'pendiente', 0, 0, 0,
    nullif(btrim(coalesce(p_notas, '')), ''),
    'menu-publico', p_canal_cumplimiento, v_punto_venta_id
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cantidad := (v_item->>'cantidad')::numeric;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad inválida en el pedido';
    end if;

    if (v_item->>'comboId') is not null then
      select co.id, co.nombre, co.precio_venta
        into v_combo
      from edgy_gestion.combos co
      where co.id = (v_item->>'comboId')::uuid
        and co.cliente_id = v_cliente_id
        and co.disponible = true
        and (co.punto_venta_id is null or co.punto_venta_id = v_punto_venta_id);

      if v_combo.id is null then
        raise exception 'Un combo del pedido ya no está disponible';
      end if;

      v_precio := v_combo.precio_venta;

      insert into edgy_gestion.orden_venta_items (
        id, orden_id, producto_id, combo_id, descripcion, cantidad,
        precio_unitario, descuento, subtotal, cantidad_entregada
      ) values (
        gen_random_uuid(), v_orden_id, null, v_combo.id, v_combo.nombre, v_cantidad,
        v_precio, 0, v_precio * v_cantidad, 0
      );

      v_total := v_total + (v_precio * v_cantidad);
    else
      select p.id, p.nombre, p.precio_venta, p.costo
        into v_producto
      from edgy_gestion.productos p
      where p.id = (v_item->>'productoId')::uuid
        and p.cliente_id = v_cliente_id
        and p.disponible = true
        and p.estado = 'activo'
        and p.tipo is distinct from 'con_variantes'
        and (p.punto_venta_id is null or p.punto_venta_id = v_punto_venta_id);

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
        id, orden_id, producto_id, combo_id, descripcion, cantidad,
        precio_unitario, descuento, subtotal, cantidad_entregada
      ) values (
        gen_random_uuid(), v_orden_id, v_producto.id, null, v_producto.nombre, v_cantidad,
        v_precio, 0, v_precio * v_cantidad, 0
      );

      v_total := v_total + (v_precio * v_cantidad);
    end if;
  end loop;

  update edgy_gestion.ordenes_venta
  set subtotal = v_total, total = v_total
  where id = v_orden_id;

  insert into edgy_gestion.pedidos_delivery (id, orden_venta_id, estado, direccion, modalidad)
  values (gen_random_uuid(), v_orden_id, 'pendiente', btrim(p_direccion), p_canal_cumplimiento);

  return jsonb_build_object('id', v_orden_id, 'numero', v_numero, 'total', v_total);
end;
$$;

grant execute on function edgy_gestion.crear_orden_venta_publica(text, text, text, text, text, text, jsonb, text) to anon;
grant execute on function edgy_gestion.crear_orden_venta_publica(text, text, text, text, text, text, jsonb, text) to authenticated;
