-- ============================================================
-- Migración 0071: Fase 27d — Catálogo compartido o exclusivo por
-- punto de venta (local/sucursal)
-- Edgy Gestión
--
-- Decisión del cliente (Fase 27, punto 1): el catálogo de productos
-- puede compartirse entre los locales de un mismo negocio O generarse
-- por separado -- pero como flexibilidad OPCIONAL por producto, no
-- como una decisión global del cliente. Esta migración agrega
-- `punto_venta_id` (nullable) a `productos` y `combos`:
--
--   NULL  = visible/vendible desde CUALQUIER punto de venta del
--           cliente (comportamiento actual, sin cambios -- default).
--   valor = visible/vendible SOLO desde ESE punto de venta.
--
-- No se toca `insumos` (solo se compra, no se vende -- Compras/OC
-- siguen viendo el catálogo completo sin restricción) ni `servicios`
-- (módulo aislado, no conectado a los catálogos de venta todavía).
-- Tampoco se toca la policy BASE de administración de productos/combos
-- (permiso 'productos-stock', usada por el CRUD del módulo y por
-- Compras/Kardex/Reportes): la exclusividad por local aplica solo a
-- lo que se OFRECE para vender en cada canal, no a la gestión de
-- catálogo, que sigue siendo unificada (el stock en sí recién se
-- divide por local en la Fase 27e).
-- ============================================================

-- ─── 1) Columna punto_venta_id en productos y combos ────────────────

alter table edgy_gestion.productos
  add column if not exists punto_venta_id uuid references edgy_gestion.puntos_venta(id) on delete set null;

alter table edgy_gestion.combos
  add column if not exists punto_venta_id uuid references edgy_gestion.puntos_venta(id) on delete set null;

-- ─── 2) RLS: policies de SELECT por canal de venta ──────────────────
--
-- Regla común agregada a cada una: una fila es visible si es
-- compartida (punto_venta_id is null), o si el usuario logueado tiene
-- acceso global (punto_venta_del_usuario_actual() is null -- típico
-- de un admin o de un cliente de un solo local), o si coincide con el
-- local al que está restringido ese usuario. La función ya existe
-- desde la 27a (0069_fase27a_puntos_venta.sql).

drop policy if exists "productos_select_ventas_lectura" on edgy_gestion.productos;
create policy "productos_select_ventas_lectura" on edgy_gestion.productos
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas', 'lectura')
    and (
      punto_venta_id is null
      or edgy_gestion.punto_venta_del_usuario_actual() is null
      or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
    )
  );

drop policy if exists "productos_select_delivery_lectura" on edgy_gestion.productos;
create policy "productos_select_delivery_lectura" on edgy_gestion.productos
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas-online', 'lectura')
    and (
      punto_venta_id is null
      or edgy_gestion.punto_venta_del_usuario_actual() is null
      or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
    )
  );

drop policy if exists "productos_select_comandas_lectura" on edgy_gestion.productos;
create policy "productos_select_comandas_lectura" on edgy_gestion.productos
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('comandas-cocina', 'lectura')
    and (
      punto_venta_id is null
      or edgy_gestion.punto_venta_del_usuario_actual() is null
      or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
    )
  );

drop policy if exists "combos_select_ventas_lectura" on edgy_gestion.combos;
create policy "combos_select_ventas_lectura" on edgy_gestion.combos
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas', 'lectura')
    and (
      punto_venta_id is null
      or edgy_gestion.punto_venta_del_usuario_actual() is null
      or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
    )
  );

drop policy if exists "combos_select_comandas_cocina_lectura" on edgy_gestion.combos;
create policy "combos_select_comandas_cocina_lectura" on edgy_gestion.combos
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('comandas-cocina', 'lectura')
    and (
      punto_venta_id is null
      or edgy_gestion.punto_venta_del_usuario_actual() is null
      or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
    )
  );

-- ─── 3) Menú público (QR/Delivery) — solo catálogo compartido ───────
--
-- edgy_gestion.menu_publico(p_slug) corre SECURITY DEFINER sin sesión
-- (lo ve cualquier visitante anónimo desde un único link por cliente),
-- así que no hay forma de resolver "desde qué local están mirando" --
-- no existe punto_venta_del_usuario_actual() para un visitante anónimo.
-- Por eso, hasta que exista un link público por local (posible fase
-- futura), el Menú público solo muestra productos/combos COMPARTIDOS
-- (punto_venta_id is null) -- nunca expone algo cargado como exclusivo
-- de un local puntual a través del link genérico del cliente.
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
              and p.punto_venta_id is null
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
        and co.punto_venta_id is null
    )
  );
$$;
