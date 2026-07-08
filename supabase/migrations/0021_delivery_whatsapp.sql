-- ============================================================
-- Migración 0021: módulo Delivery por WhatsApp (opcional)
-- Edgy Gestión · schema edgy_gestion
--
-- Scope acordado con el usuario: "Registro manual del pedido". El
-- operador recibe el pedido por WhatsApp fuera del sistema (no hay
-- integración técnica real con la API de WhatsApp acá) y lo carga a
-- mano en este módulo: cliente, dirección, ítems, total.
--
-- Circuito plata: el pedido se carga en estado 'pendiente' (todavía
-- no es una venta). Recién cuando se marca como 'entregado' se pide
-- el medio de pago y en ese momento se genera la Venta real
-- (comprobantes_venta + comprobante_venta_items) y el movimiento en
-- Tesorería vía registrarMovimientoTesoreria -- mismo patrón que
-- "cerrar comanda" en comandas-cocina (ver
-- 0018_gastronomico_nucleo.sql y cerrarComandaVenta.ts): allá el
-- equivalente de "cerrar mesa" es acá "marcar entregado y cobrar".
--
-- Los ítems del pedido son texto libre (jsonb), no productos reales
-- del catálogo -- a diferencia de Comandas, el pedido llega por
-- WhatsApp en lenguaje natural ("2 empanadas de carne, 1 gaseosa") y
-- no siempre corresponde 1:1 con SKUs de Productos y Stock. Por eso
-- al facturar se usa una alícuota de IVA por defecto (21%), igual
-- que hace cerrarComandaVenta.ts cuando un ítem no tiene producto_id.
--
-- cliente_venta_id es opcional: si el operador no elige un cliente
-- registrado en Ventas, la venta se factura a Consumidor Final
-- (CONSUMIDOR_FINAL_ID), igual que hace comandas-cocina con las
-- mesas.
-- ============================================================

create table if not exists edgy_gestion.pedidos_delivery (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  cliente_venta_id uuid references edgy_gestion.clientes_venta(id),
  cliente_nombre text not null,
  telefono text,
  direccion text not null,
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  medio_pago text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_camino', 'entregado', 'cancelado')),
  comprobante_id uuid references edgy_gestion.comprobantes_venta(id),
  notas text,
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);

alter table edgy_gestion.pedidos_delivery enable row level security;

create policy "pedidos_delivery_select" on edgy_gestion.pedidos_delivery
  for select using (
    edgy_gestion.es_personal_edgy()
    or (
      cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and edgy_gestion.tiene_permiso('delivery-whatsapp', 'lectura')
    )
  );

create policy "pedidos_delivery_insert" on edgy_gestion.pedidos_delivery
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (
      cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and edgy_gestion.tiene_permiso('delivery-whatsapp', 'escritura')
    )
  );

create policy "pedidos_delivery_update" on edgy_gestion.pedidos_delivery
  for update using (
    edgy_gestion.es_personal_edgy()
    or (
      cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and edgy_gestion.tiene_permiso('delivery-whatsapp', 'escritura')
    )
  );

create policy "pedidos_delivery_delete" on edgy_gestion.pedidos_delivery
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (
      cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and edgy_gestion.tiene_permiso('delivery-whatsapp', 'admin')
    )
  );
