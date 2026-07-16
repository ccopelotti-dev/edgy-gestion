-- Fase 8 (cierre): el carrito del Menú público ahora permite tipear la
-- cantidad, incluso fraccionaria (ej. 0.10 kg) para productos vendidos
-- por peso/volumen. El frontend necesita saber la unidad_venta de cada
-- producto para decidir si acepta decimales -- se agrega al JSON de
-- menu_publico(), que hasta ahora no la exponía.
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
        'horarioDias', c.horario_dias,
        'combosTituloSeccion', c.combos_titulo_seccion
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
    )
  );
$$;
