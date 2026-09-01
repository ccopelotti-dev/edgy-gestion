-- ============================================================
-- Fase 67 (01/09, a pedido de Carlos): Créditos y Reintegros
-- ============================================================
--
-- Origen: promociones bancarias tipo "Promo Pampa" (reintegro % con
-- tope, acreditado DESPUÉS en el resumen de la tarjeta -- no es un
-- descuento que dé el proveedor, así que NO debe tocar el total de la
-- factura ni el costo del insumo/producto comprado). Carlos remarcó
-- que esto se va a usar mucho también en Home Keep (gastos personales)
-- -- por eso esta tabla es compartida entre Compras y Home Keep en vez
-- de vivir adentro del schema de un solo módulo, igual que ya se hace
-- con `comprobantes_recibidos` (Fase 56b) para los adjuntos del agente.
--
-- `pago_id` apunta a `pagos_compra.id` o `pagos_hogar.id` según
-- `modulo` -- sin FK real (es polimórfico), mismo criterio que
-- `movimientos_stock.item_id` (item_tipo + item_id) en Productos y
-- Stock.
--
-- Diseño DELIBERADAMENTE separado del costo del insumo: `insumos.costo`
-- sigue siendo el costo de compra real (fiscal, auditable). El crédito
-- acá registrado es un dato de Tesorería/caja -- una vez `acreditado`,
-- sirve para calcular un "costo neto de caja" a nivel informativo, sin
-- pisar el costo de compra que ya se usa en Fórmulas/Producción.

create table if not exists edgy_gestion.creditos_pendientes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  modulo text not null check (modulo in ('compras', 'home_keep')),
  pago_id uuid not null,
  proveedor_id uuid,
  concepto text not null,
  monto_esperado numeric not null check (monto_esperado > 0),
  monto_acreditado numeric,
  fecha_esperada date,
  fecha_acreditacion date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'acreditado', 'perdido')),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_creditos_pendientes_cliente on edgy_gestion.creditos_pendientes(cliente_id);
create index if not exists idx_creditos_pendientes_pago on edgy_gestion.creditos_pendientes(pago_id);
create index if not exists idx_creditos_pendientes_estado on edgy_gestion.creditos_pendientes(cliente_id, estado);

alter table edgy_gestion.creditos_pendientes enable row level security;

-- Lectura: cualquier usuario del cliente (se muestra en Tesorería, pero
-- también se referencia desde Compras/Home Keep al listar pagos).
create policy "Lectura interna de creditos_pendientes"
  on edgy_gestion.creditos_pendientes for select
  using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual())
  );

-- Escritura: alta/edición/borrado permitido si el usuario tiene
-- permiso de escritura en Tesorería, Compras o Home Keep -- el crédito
-- se puede crear desde el formulario de Pago (Compras/Home Keep) y se
-- marca "acreditado" desde Tesorería.
create policy "Alta de creditos_pendientes"
  on edgy_gestion.creditos_pendientes for insert
  with check (
    edgy_gestion.es_personal_edgy()
    or (
      cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and (
        edgy_gestion.tiene_permiso('tesoreria', 'escritura')
        or edgy_gestion.tiene_permiso('compras', 'escritura')
        or edgy_gestion.tiene_permiso('home_keep', 'escritura')
      )
    )
  );

create policy "Edicion de creditos_pendientes"
  on edgy_gestion.creditos_pendientes for update
  using (
    edgy_gestion.es_personal_edgy()
    or (
      cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and (
        edgy_gestion.tiene_permiso('tesoreria', 'escritura')
        or edgy_gestion.tiene_permiso('compras', 'escritura')
        or edgy_gestion.tiene_permiso('home_keep', 'escritura')
      )
    )
  );

create policy "Borrado de creditos_pendientes"
  on edgy_gestion.creditos_pendientes for delete
  using (
    edgy_gestion.es_personal_edgy()
    or (
      cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and (
        edgy_gestion.tiene_permiso('tesoreria', 'escritura')
        or edgy_gestion.tiene_permiso('compras', 'escritura')
        or edgy_gestion.tiene_permiso('home_keep', 'escritura')
      )
    )
  );

comment on table edgy_gestion.creditos_pendientes is
  'Reintegros/créditos futuros de promociones bancarias (ej. Promo Pampa) sobre un pago ya realizado. No modifica el total del comprobante ni el costo del insumo/producto -- es un dato de Tesorería que se acredita después.';
comment on column edgy_gestion.creditos_pendientes.modulo is
  'Qué módulo generó el pago: compras (pagos_compra) o home_keep (pagos_hogar).';
comment on column edgy_gestion.creditos_pendientes.pago_id is
  'Id de pagos_compra o pagos_hogar según `modulo` -- sin FK (referencia polimórfica).';
