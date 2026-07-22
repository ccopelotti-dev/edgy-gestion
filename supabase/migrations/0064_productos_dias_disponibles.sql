-- ============================================================
-- Fase 24a: días disponibles en Producto + rubro Viandas
-- Edgy Gestión · Productos y Stock
-- ============================================================
--
-- Contexto: Fase 24 rehace Viandas para que use productos reales del
-- catálogo (rubro "Viandas", creado por el cliente desde la pantalla
-- normal de Rubros -- no hace falta seedearlo acá) en vez de un campo
-- de texto libre. La diferencia de estos productos es que algunos solo
-- se elaboran ciertos días de la semana (ej. "Milanesa" los lunes y
-- miércoles) -- pero es un campo genérico de Producto, no exclusivo de
-- Viandas: cualquier artículo con disponibilidad acotada por día puede
-- usarlo.
--
-- `dias_disponibles` es un array de enteros 0-6 siguiendo la
-- convención de `Date.getDay()` en JS / `extract(dow from ...)` en
-- Postgres (0 = domingo ... 6 = sábado) para poder comparar "hoy"
-- directo sin traducir en ninguno de los dos lados. NULL o array vacío
-- = disponible todos los días (default, no afecta a ningún producto
-- existente).
--
-- Se respeta en `menu_publico()` (Catálogo Público/Menú QR) -- los
-- canales internos (Punto de Venta, Comandas, Nuevo comprobante) NO lo
-- filtran a propósito: el personal sabe qué hay disponible hoy: la
-- restricción es para que un cliente autoservido no pida algo que no
-- se está haciendo ese día.

set search_path to edgy_gestion, public;

alter table edgy_gestion.productos
  add column if not exists dias_disponibles integer[];

-- ─── menu_publico(): agrega el filtro por día ─────────────────
-- Mismo cuerpo que la versión anterior (0052_fase8_cierre_...sql), solo
-- se agrega la condición de dias_disponibles al WHERE de productos.

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
    )
  );
$$;
