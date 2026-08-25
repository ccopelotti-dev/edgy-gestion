-- ============================================================
-- Migración 0096: Cobro presencial · Fase 12c -- Mercado Pago Point
-- Edgy Gestión · schema edgy_gestion
--
-- Base de código para cobrar con tarjeta desde el Mostrador (Ventas >
-- Punto de Venta) usando una terminal física Mercado Pago Point.
-- Carlos todavía NO tiene el dispositivo -- esta migración deja lista
-- la estructura para activarla apenas lo compre y lo empareje con la
-- cuenta de Mercado Pago desde la app oficial (paso que la API no
-- reemplaza).
--
-- Arquitectura vigente de Mercado Pago a 2026 (Orders API -- la Point
-- Integration API con "payment intents" que usaba device_id está
-- deprecada, ver /developers/.../point/migrate-payment-intent-to-orders):
--   1) GET  /terminals/v1/list           -- listar terminales de la cuenta
--   2) PATCH /terminals/v1/setup          -- poner una terminal en modo PDV
--   3) POST  /v1/orders  {type:"point"}   -- crear la orden de cobro,
--      queda cargada en la terminal para que el cliente pague
--   4) Webhook topic "order" (action order.processed/canceled/...)      --
--      SIEMPRE se reconfirma con GET /v1/orders/{id} antes de tocar nada
--      (mismo criterio que mp-webhook.js / talo-webhook.js).
--
-- Point usa LA MISMA cuenta/access_token que ya se carga para el
-- Checkout Pro (clientes_pago_config, proveedor='mercadopago') -- no es
-- un proveedor nuevo, es otro producto sobre la misma cuenta. Por eso
-- se agregan columnas nuevas a esa fila en vez de crear una fila con
-- proveedor='mercadopago_point' (que duplicaría el access_token).
-- ============================================================

alter table edgy_gestion.clientes_pago_config
  add column if not exists point_habilitado boolean not null default false,
  add column if not exists point_store_id text,
  add column if not exists point_pos_id text,
  add column if not exists point_terminal_id text,
  add column if not exists point_terminal_label text,
  add column if not exists point_webhook_secret text;

comment on column edgy_gestion.clientes_pago_config.point_habilitado is
  'Fase 12c: cobro presencial con Mercado Pago Point habilitado para este negocio (independiente de "habilitado", que es el Checkout Pro online).';
comment on column edgy_gestion.clientes_pago_config.point_terminal_id is
  'Id de terminal tal cual lo devuelve GET /terminals/v1/list (ej. "NEWLAND_N950__N950NCB801293324"), ya puesta en modo PDV.';
comment on column edgy_gestion.clientes_pago_config.point_terminal_label is
  'Etiqueta amigable para mostrar en la UI (ej. últimos caracteres del serial) -- se arma al vincular, no hace falta volver a listar terminales para mostrarla.';
comment on column edgy_gestion.clientes_pago_config.point_webhook_secret is
  'Secreto HMAC del Webhook de la Orders API (topic "order"), independiente del webhook_secret de Checkout Pro -- Mercado Pago lo genera al configurar ese Webhook a mano en el panel (evento "Order"), no viaja por API como notification_url en Point.';

-- ─── point_ordenes ──────────────────────────────────────────
-- Tracking local de las órdenes de cobro creadas en la terminal.
-- Es la fuente de verdad que consulta el FRONTEND mientras espera el
-- cobro (polling liviano contra esta tabla, nunca contra la API de
-- Mercado Pago directo -- el propio doc de Point pide no hacer polling
-- sobre GET /v1/orders/{id}, tiene rate limit de 1 req/seg y está
-- pensado "solo para pruebas y eventualidades").
create table if not exists edgy_gestion.point_ordenes (
  id text primary key, -- id de la orden en Mercado Pago (ej. "ORD...")
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  external_reference text not null unique, -- generado acá antes de crear la orden
  terminal_id text not null,
  monto numeric not null,
  estado text not null default 'created'
    check (estado in ('created', 'at_terminal', 'processed', 'action_required', 'canceled', 'refunded', 'failed', 'expired')),
  status_detail text,
  payment_id text,
  payment_method_tipo text, -- credit_card | debit_card, según responde la orden procesada
  comprobante_id text, -- se completa cuando PuntoDeVenta.tsx confirma la venta con este cobro
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists point_ordenes_cliente_id_idx on edgy_gestion.point_ordenes (cliente_id);
create index if not exists point_ordenes_external_reference_idx on edgy_gestion.point_ordenes (external_reference);

alter table edgy_gestion.point_ordenes enable row level security;

-- Solo lectura desde el frontend (polling del estado de una orden ya
-- creada) -- el alta/edición la hacen siempre las Netlify Functions
-- con SUPABASE_SERVICE_ROLE_KEY (mismo criterio que clientes_pago_config).
create policy "Lectura de point_ordenes" on edgy_gestion.point_ordenes
  for select using (
    edgy_gestion.es_personal_edgy()
    or (
      cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and edgy_gestion.tiene_permiso('ventas', 'lectura')
    )
  );

-- ─── Verificación ────────────────────────────────────────────

select column_name, data_type
from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'clientes_pago_config'
order by ordinal_position;

select table_name from information_schema.tables
where table_schema = 'edgy_gestion' and table_name = 'point_ordenes';
