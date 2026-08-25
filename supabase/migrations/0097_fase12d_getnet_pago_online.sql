-- ============================================================
-- Migración 0097: Cobro online · Fase 12d -- tercer proveedor (Getnet)
-- Edgy Gestión · schema edgy_gestion
--
-- Suma Getnet Web Checkout ("Get Checkout", docs.globalgetnet.com)
-- como tercer proveedor de clientes_pago_config -- mismo patrón que
-- Talo (Fase 12b) y Mercado Pago Point (Fase 12c): la tabla ya está
-- factorizada por (cliente_id, proveedor) para justamente esto.
--
-- Alcance: SOLO Get Checkout (cobro online, redirect/iframe/lightbox
-- a un formulario hosteado por Getnet). La integración con terminal
-- física de Getnet ("App2App") queda afuera -- requiere una app
-- Android corriendo en el propio terminal (Intents), incompatible con
-- la arquitectura web/Electron de Edgy Gestión.
--
-- Diferencias de credenciales con los otros dos proveedores:
--  - Auth: OAuth2 client_credentials (client_id + client_secret ->
--    access_token Bearer, vence en ~1h). No hay token de larga
--    duración para guardar -- se guardan client_id/client_secret y se
--    pide un access_token nuevo en cada operación.
--  - seller_id: UUID que Getnet asigna al dar de alta la cuenta --
--    hace falta en el path de los endpoints de configuración técnica
--    y comercial (PUT únicos por cuenta, no por pago).
--  - Webhook SIN firma HMAC: Getnet autentica sus notificaciones con
--    HTTP Basic Auth (user/password), no con un secreto firmado.
--    getnet-guardar-config.js genera un user/password random al
--    guardar la config y se los manda a Getnet en el PUT de
--    configuración técnica; getnet-webhook.js valida el header
--    Authorization entrante contra lo guardado acá.
--  - getnet_config_tecnica_ok: si ya se ejecutó con éxito el PUT de
--    configuración técnica (success_url/error_url/webhook) contra la
--    API de Getnet -- evita repetirlo en cada guardado de config si
--    las credenciales no cambiaron.
-- ============================================================

alter table edgy_gestion.clientes_pago_config
  add column if not exists getnet_client_id text,
  add column if not exists getnet_client_secret text,
  add column if not exists getnet_seller_id text,
  add column if not exists getnet_merchant_id text,
  add column if not exists getnet_webhook_user text,
  add column if not exists getnet_webhook_password text,
  add column if not exists getnet_config_tecnica_ok boolean not null default false;

alter table edgy_gestion.clientes_pago_config
  drop constraint if exists clientes_pago_config_proveedor_check;

alter table edgy_gestion.clientes_pago_config
  add constraint clientes_pago_config_proveedor_check
  check (proveedor in ('mercadopago', 'talo', 'getnet'));

-- menu_publico(): sumar 'getnet' a la lista de proveedores de cobro
-- online válidos -- mismo criterio de prioridad ya usado en Fase 12b
-- (si por algún motivo hay más de uno habilitado a la vez, se
-- prioriza mercadopago, después talo, después getnet -- un solo
-- proveedor activo por negocio es el uso esperado).
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
            and pc.proveedor in ('mercadopago', 'talo', 'getnet')
            and pc.habilitado = true
        ),
        'pagoOnlineProveedor', (
          select pc.proveedor from edgy_gestion.clientes_pago_config pc
          where pc.cliente_id = c.id
            and pc.proveedor in ('mercadopago', 'talo', 'getnet')
            and pc.habilitado = true
          order by case pc.proveedor when 'mercadopago' then 0 when 'talo' then 1 else 2 end
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
