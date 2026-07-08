-- ============================================================
-- Migración 0020: módulo Menú QR (opcional)
-- Edgy Gestión · schema edgy_gestion
--
-- Scope acordado con el usuario: "Solo menú visual (sin pedidos)".
-- Página pública (sin login) accesible vía QR que muestra los
-- productos/precios de un cliente agrupados por categoría. No
-- integra con Ventas ni Comandas -- es puramente informativo.
--
-- El catálogo `modulos` ya tiene la fila 'menu-qr' (insertada en
-- 0001_init.sql), así que acá no hace falta tocar esa tabla.
--
-- Diseño de acceso público: en vez de abrir políticas RLS nuevas
-- sobre `productos`/`rubros`/`clientes` (lo que arriesgaría filtrar
-- columnas sensibles como cuit/telefono/direccion a cualquier
-- visitante sin sesión, o interferir con las policies existentes de
-- esas tablas), se expone una única función SECURITY DEFINER
-- `edgy_gestion.menu_publico(p_slug)` de solo lectura. La función
-- hace el join productos/rubros por dentro, filtra
-- disponible=true/estado='activo' y arma un JSON con exactamente
-- los campos que necesita la página pública (nombre del negocio,
-- logo, color de marca, categorías y productos). No se tocan las
-- tablas base ni sus políticas existentes.
--
-- El acceso es por `clientes.slug` (columna que ya existe en la
-- tabla core `clientes`), no por UUID -- así el QR apunta a una URL
-- legible tipo /menu/la-charcuteria-express.
-- ============================================================

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
                'precio', p.precio_venta,
                'imagen', p.imagenes[1]
              )
              order by p.nombre
            ), '[]'::jsonb)
            from edgy_gestion.productos p
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

-- Solo lectura, filtrada dentro de la función. Se permite ejecutar
-- sin sesión (rol anon) para que la página del QR funcione sin login.
grant execute on function edgy_gestion.menu_publico(text) to anon;
grant execute on function edgy_gestion.menu_publico(text) to authenticated;
