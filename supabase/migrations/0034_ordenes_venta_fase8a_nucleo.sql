-- ============================================================
-- Migración 0034: Órdenes de Venta · Fase 8a (núcleo)
-- Edgy Gestión · schema edgy_gestion
--
-- Arranca la unificación acordada con el usuario: un solo motor
-- central de "pedido confirmado, pendiente de armar/entregar y
-- facturar" para CUALQUIER rubro -- no solo Gastronomía. Hasta
-- ahora cada kit se armaba el suyo (Comandas con `comandas` +
-- `comanda_items`, Delivery con `pedidos_delivery`); a partir de
-- acá los verticales nuevos -- y Delivery/Menú QR en la Fase 8c --
-- se apoyan en esta tabla en vez de reinventarla.
--
-- Estados (mismo patrón de máquina de estados que `comandas`,
-- ver 0018_gastronomico_nucleo.sql):
--   pendiente      -> recién creada, todavía no se armó/preparó
--   en_preparacion -> opcional, comercios que sí necesitan producción
--   terminada      -> lista para despachar/entregar, habilita facturar
--   facturada      -> ya se generó el comprobante (comprobante_id)
--   cancelada
--
-- A diferencia de `comanda_items` (normalizada porque cada plato
-- tiene su propio estado de cocina para el KDS), acá los ítems
-- quedan en jsonb -- mismo criterio que `pedidos_delivery`: el caso
-- genérico (tienda online, mostrador) no necesita estado por ítem.
-- Si en la Fase 8c un pedido de Delivery/QR que además pasa por
-- cocina termina necesitando ese detalle por ítem, se decide ahí --
-- no se fuerza acá.
--
-- `canal_cumplimiento` es lo que en la Fase 8c le va a permitir a
-- Delivery filtrar "sus" órdenes (canal_cumplimiento = 'delivery')
-- sin que el resto de Ventas las vea mezcladas.
--
-- Qué NO trae esta migración (queda para las próximas fases del
-- plan acordado con el usuario):
--   - RPC pública para Catálogo/Carrito (Fase 8b)
--   - Que Delivery/Menú QR usen esta tabla en vez de pedidos_delivery
--     (Fase 8c)
--   - Enmascarar "Orden de Venta" como "Comanda" en Gastronomía, y
--     renombrar la Comanda de mesas a "Comanda de salón" (Fase 8d)
--
-- v2: create table/policy no es idempotente en Postgres (a
-- diferencia de "if not exists" en la tabla) -- si este script ya
-- se corrió una vez, "create policy" explota con "already exists".
-- Se agrega "drop policy if exists" antes de cada create para poder
-- reintentar sin problema.
-- ============================================================

create table if not exists edgy_gestion.ordenes_venta (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  cliente_venta_id uuid references edgy_gestion.clientes_venta(id) on delete set null,
  cliente_nombre text not null,
  telefono text,
  direccion text,
  canal_cumplimiento text not null default 'mostrador'
    check (canal_cumplimiento in ('mostrador', 'retiro', 'delivery')),
  origen text not null default 'operador'
    check (origen in ('operador', 'catalogo_publico')),
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  total numeric not null default 0,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_preparacion', 'terminada', 'facturada', 'cancelada')),
  medio_pago text,
  comprobante_id uuid references edgy_gestion.comprobantes_venta(id),
  notas text,
  fecha date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table edgy_gestion.ordenes_venta enable row level security;

drop policy if exists "Lectura interna de ordenes_venta" on edgy_gestion.ordenes_venta;
create policy "Lectura interna de ordenes_venta" on edgy_gestion.ordenes_venta
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas', 'lectura'))
  );

drop policy if exists "Alta de ordenes_venta" on edgy_gestion.ordenes_venta;
create policy "Alta de ordenes_venta" on edgy_gestion.ordenes_venta
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas', 'escritura'))
  );

drop policy if exists "Edicion de ordenes_venta" on edgy_gestion.ordenes_venta;
create policy "Edicion de ordenes_venta" on edgy_gestion.ordenes_venta
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas', 'escritura'))
  );

-- ─── Verificación ────────────────────────────────────────────

select table_name
from information_schema.tables
where table_schema = 'edgy_gestion'
  and table_name = 'ordenes_venta';

select slug from edgy_gestion.modulos where slug = 'ventas';
