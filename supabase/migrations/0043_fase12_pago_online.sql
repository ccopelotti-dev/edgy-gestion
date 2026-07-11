-- ============================================================
-- Migración 0043: Cobro online · Fase 12 (primera parte: checkout)
-- Edgy Gestión · schema edgy_gestion
--
-- Scope acordado con el usuario: arrancar por "cobro online" (checkout
-- para pedidos de Menú QR/Delivery), dejando afuera por ahora las
-- terminales físicas (Mercado Pago Point, Getnet, etc. en el
-- mostrador -- eso es la segunda parte de la Fase 12, no esta
-- migración). Proveedor elegido para arrancar: Mercado Pago (Checkout
-- Pro), pero la tabla de configuración se factoriza por
-- (cliente_id, proveedor) desde el día uno para poder sumar otros
-- proveedores más adelante sin rediseñar nada -- pedido explícito del
-- usuario ("1 y 2 para dejar la factorizacion terminada").
--
-- Mismo patrón de seguridad que clientes_arca_config (Fase 11): tabla
-- con RLS habilitado y CERO policies -- solo accesible vía Netlify
-- Functions con SUPABASE_SERVICE_ROLE_KEY (nunca directo desde el
-- frontend, porque guarda el access_token y el secreto de firma de
-- los webhooks). El estado no sensible (habilitado/modo/proveedor) se
-- expone en un endpoint aparte -- ver netlify/functions/
-- pago-estado-config.js.
--
-- Qué trae:
-- 1) clientes_pago_config: credenciales de cobro online por cliente +
--    proveedor. Cada negocio pega SU PROPIO access_token de Mercado
--    Pago (cuenta propia, sin OAuth/marketplace -- mismo criterio
--    "el cliente carga sus propias credenciales" que ARCA) y SU PROPIO
--    webhook_secret (lo genera Mercado Pago en "Tus integraciones" >
--    Webhooks de la cuenta del cliente).
-- 2) ordenes_venta.pago_*: columnas para trackear el cobro online de
--    un pedido -- independientes del `estado` de cumplimiento
--    (pendiente/en_preparacion/terminada/...), que sigue siendo sobre
--    logística de entrega, no sobre el dinero.
-- 3) menu_publico(p_slug): se agrega 'pagoOnlineHabilitado' al objeto
--    `cliente` -- así MenuPublico.tsx sabe si mostrar el botón "Pagar
--    online" sin exponer nada sensible (la función ya es SECURITY
--    DEFINER y anon-callable desde 0033/0036).
-- ============================================================

-- ─── 1) Config de cobro online (por cliente + proveedor) ─────────

create table if not exists edgy_gestion.clientes_pago_config (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  proveedor text not null default 'mercadopago'
    check (proveedor in ('mercadopago')),
  modo text not null default 'test'
    check (modo in ('test', 'produccion')),
  access_token text,
  webhook_secret text,
  habilitado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, proveedor)
);

alter table edgy_gestion.clientes_pago_config enable row level security;
-- Sin policies a propósito -- ver comentario de cabecera. Solo
-- accesible con la service role key desde Netlify Functions.

-- ─── 2) Tracking de cobro online en ordenes_venta ────────────────

alter table edgy_gestion.ordenes_venta
  add column if not exists pago_proveedor text,
  add column if not exists pago_estado text
    check (pago_estado in ('pendiente', 'aprobado', 'rechazado', 'en_proceso')),
  add column if not exists pago_preference_id text,
  add column if not exists pago_payment_id text,
  add column if not exists pago_init_point text,
  add column if not exists pago_monto numeric;

-- No hace falta RLS nueva: ordenes_venta ya tiene policies de
-- select/insert/update por cliente_id + permiso 'ventas' (0034), y
-- estas columnas nuevas quedan cubiertas por las mismas -- las
-- Netlify Functions que las escriben (crear-preferencia-pago,
-- mp-webhook) usan la service role key igual que arca-autorizar-
-- comprobante.js, así que tampoco dependen de esas policies.

-- ─── 3) menu_publico: agregar pagoOnlineHabilitado ───────────────

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

select table_name
from information_schema.tables
where table_schema = 'edgy_gestion'
  and table_name = 'clientes_pago_config';

select column_name, data_type
from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'ordenes_venta'
  and column_name like 'pago_%'
order by ordinal_position;
