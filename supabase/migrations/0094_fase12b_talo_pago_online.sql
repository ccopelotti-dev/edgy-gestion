-- ============================================================
-- Migración 0094: Cobro online · Fase 12b -- segundo proveedor (Talo)
-- Edgy Gestión · schema edgy_gestion
--
-- Suma Talo (transferencias bancarias, docs.talo.com.ar) como segundo
-- proveedor de clientes_pago_config -- la tabla ya estaba factorizada
-- por (cliente_id, proveedor) desde la Fase 12 justamente para esto
-- ("1 y 2 para dejar la factorizacion terminada").
--
-- Diferencia con Mercado Pago: MP solo necesita un access_token
-- (secreto) para todo. Talo separa un identificador PÚBLICO de cuenta
-- (`user_id`, se manda en el body al crear un pago, sin auth) de un
-- token PRIVADO (Bearer, solo hace falta para consultar/confirmar un
-- pago vía GET). clientes_pago_config no tenía columna para ese
-- identificador público -- se agrega `merchant_id` (nombre genérico,
-- sirve para cualquier proveedor futuro que necesite lo mismo).
--
-- webhook_secret queda sin uso por ahora para Talo -- su webhook
-- todavía no firma las notificaciones (HMAC "próximamente" según su
-- documentación), así que no hay nada que guardar ahí todavía.
-- ============================================================

alter table edgy_gestion.clientes_pago_config
  add column if not exists merchant_id text;

alter table edgy_gestion.clientes_pago_config
  drop constraint if exists clientes_pago_config_proveedor_check;

alter table edgy_gestion.clientes_pago_config
  add constraint clientes_pago_config_proveedor_check
  check (proveedor in ('mercadopago', 'talo'));

-- menu_publico(): agregar `pagoOnlineProveedor` -- MenuPublico.tsx
-- necesita saber CUÁL proveedor está habilitado (no solo si hay uno)
-- para pegarle a la Netlify Function correcta (crear-preferencia-pago
-- vs crear-pago-talo). Si por algún motivo hay más de uno habilitado
-- a la vez, se prioriza mercadopago (proveedor más maduro/con firma
-- de webhook ya validada) -- un solo proveedor activo por negocio es
-- el uso esperado por ahora.
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
            and pc.proveedor in ('mercadopago', 'talo')
            and pc.habilitado = true
        ),
        'pagoOnlineProveedor', (
          select pc.proveedor from edgy_gestion.clientes_pago_config pc
          where pc.cliente_id = c.id
            and pc.proveedor in ('mercadopago', 'talo')
            and pc.habilitado = true
          order by case pc.proveedor when 'mercadopago' then 0 else 1 end
          limit 1
        )
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

-- ─── Verificación ────────────────────────────────────────────

select column_name, data_type
from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'clientes_pago_config'
order by ordinal_position;
