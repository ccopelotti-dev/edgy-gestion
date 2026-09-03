-- ============================================================
-- Fase 70: Home Keep — Ingresos y Tarjetas de crédito hogareñas
-- ============================================================
--
-- A pedido de Carlos (03/09): Home Keep hasta ahora solo manejaba
-- egresos (Comprobantes/Pagos, clon recortado de Compras). Faltaban
-- dos piezas para que sea un módulo completo de finanzas del hogar:
--
--   1. Ingresos: de dónde sale la plata para pagar los gastos. Dos
--      orígenes: un aporte del negocio (La Charcutería) y un ingreso
--      fijo mensual de otro integrante de la familia. El aporte del
--      negocio se registra DOBLE (a pedido explícito de Carlos): acá
--      como ingreso, y además como egreso real en la Tesorería del
--      negocio (ver registrarMovimientoTesoreria en
--      src/lib/tesoreriaSync.ts) -- así el negocio también refleja la
--      salida de esa plata, no queda "invisible".
--
--   2. Tarjetas de crédito: con nivel de detalle completo (consumos +
--      cuotas), no solo el total del resumen -- para poder ver qué
--      compra puntual compone cada resumen mensual. Se paga un resumen
--      con el mismo mecanismo de Pago/LineaPago que ya existe (un
--      resumen de tarjeta es, en el fondo, una deuda más a cancelar),
--      así que NO hace falta un proveedor "banco" ficticio: el pago se
--      referencia directo desde resumenes_tarjeta_hogar.pago_id.
--
-- Servicios del hogar (luz, gas, internet, etc.) NO necesitan tablas
-- nuevas: son Comprobantes de un Proveedor más (la empresa de
-- servicio), ya clasificables con la categoría "Servicios y
-- Suscripciones" que la Fase 56 siembra automáticamente.
-- ============================================================

set search_path to edgy_gestion, public;

-- ─── 1. Ingresos del hogar ────────────────────────────────────────

create table if not exists edgy_gestion.ingresos_hogar (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  fecha date not null,
  tipo text not null check (tipo in ('aporte_negocio', 'ingreso_familiar', 'otro')),
  -- Nombre libre de quién aporta -- "La Charcutería" para aporte_negocio,
  -- el nombre del familiar para ingreso_familiar, lo que sea para 'otro'.
  origen text,
  concepto text,
  monto numeric not null default 0,
  -- Ingreso fijo mensual (ej. sueldo de un familiar): se marca recurrente
  -- para poder recordarlo/sugerirlo cada mes sin tener que cargarlo a
  -- mano desde cero cada vez.
  recurrente boolean not null default false,
  dia_mes_recurrente integer check (dia_mes_recurrente between 1 and 31),
  -- Id del movimiento espejo en movimientos_caja (Tesorería del negocio)
  -- cuando tipo = 'aporte_negocio' -- sin FK dura a propósito (Tesorería
  -- no expone esa tabla como catálogo referenciable entre módulos, mismo
  -- criterio que origen_id en movimientos_caja/movimientos_bancarios).
  movimiento_caja_id uuid,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── 2. Tarjetas de crédito ───────────────────────────────────────

create table if not exists edgy_gestion.tarjetas_credito_hogar (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  -- Ej. "Visa Santander - Carlos" -- soporta varias tarjetas de
  -- distintos bancos/titulares en paralelo (a pedido de Carlos).
  nombre text not null,
  banco text,
  titular text,
  ultimos_digitos text,
  dia_cierre integer check (dia_cierre between 1 and 31),
  dia_vencimiento integer check (dia_vencimiento between 1 and 31),
  limite numeric,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── 3. Resúmenes (uno por tarjeta y período) ─────────────────────

create table if not exists edgy_gestion.resumenes_tarjeta_hogar (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  tarjeta_id uuid not null references edgy_gestion.tarjetas_credito_hogar(id) on delete cascade,
  -- 'YYYY-MM' del cierre -- único por tarjeta para no cargar el mismo
  -- resumen dos veces.
  periodo text not null,
  fecha_cierre date,
  fecha_vencimiento date,
  total numeric not null default 0,
  pago_minimo numeric,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'pagado_parcial', 'pagado')),
  monto_pagado numeric not null default 0,
  saldo_pendiente numeric not null default 0,
  -- Un resumen se paga con el mismo Pago/LineaPago que ya existe en Home
  -- Keep (no hace falta modelar la tarjeta como "proveedor").
  pago_id uuid references edgy_gestion.pagos_hogar(id),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tarjeta_id, periodo)
);

-- ─── 4. Consumos de cada resumen (con cuotas) ─────────────────────

create table if not exists edgy_gestion.consumos_tarjeta_hogar (
  id uuid primary key default gen_random_uuid(),
  resumen_id uuid not null references edgy_gestion.resumenes_tarjeta_hogar(id) on delete cascade,
  tarjeta_id uuid not null references edgy_gestion.tarjetas_credito_hogar(id) on delete cascade,
  descripcion text not null,
  fecha_consumo date,
  -- Monto de ESTA cuota puntual (no el total de la compra original).
  monto numeric not null default 0,
  cuota_actual integer not null default 1,
  cuotas_totales integer not null default 1,
  -- Agrupa todas las cuotas de UNA misma compra a través de distintos
  -- resúmenes/meses (ver matcheo por descripción al cargar un resumen
  -- nuevo, mismo criterio de similitud de texto que matchearItemsFacturaConOc
  -- en Fase 69b). Null si es la primera cuota o no se pudo encadenar.
  compra_id uuid,
  categoria_gasto_id uuid references edgy_gestion.categorias_gasto(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_consumos_tarjeta_hogar_compra on edgy_gestion.consumos_tarjeta_hogar (tarjeta_id, compra_id);

-- ─── 5. RLS -- mismo patrón que el resto de Home Keep (Fase 56) ──────

alter table edgy_gestion.ingresos_hogar enable row level security;
alter table edgy_gestion.tarjetas_credito_hogar enable row level security;
alter table edgy_gestion.resumenes_tarjeta_hogar enable row level security;
alter table edgy_gestion.consumos_tarjeta_hogar enable row level security;

create policy "Lectura interna de ingresos_hogar" on edgy_gestion.ingresos_hogar
  for select using (edgy_gestion.es_personal_edgy() or cliente_id = edgy_gestion.cliente_del_usuario_actual());
create policy "Alta de ingresos_hogar" on edgy_gestion.ingresos_hogar
  for insert with check (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Edicion de ingresos_hogar" on edgy_gestion.ingresos_hogar
  for update using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Borrado de ingresos_hogar" on edgy_gestion.ingresos_hogar
  for delete using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));

create policy "Lectura interna de tarjetas_credito_hogar" on edgy_gestion.tarjetas_credito_hogar
  for select using (edgy_gestion.es_personal_edgy() or cliente_id = edgy_gestion.cliente_del_usuario_actual());
create policy "Alta de tarjetas_credito_hogar" on edgy_gestion.tarjetas_credito_hogar
  for insert with check (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Edicion de tarjetas_credito_hogar" on edgy_gestion.tarjetas_credito_hogar
  for update using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Borrado de tarjetas_credito_hogar" on edgy_gestion.tarjetas_credito_hogar
  for delete using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));

create policy "Lectura interna de resumenes_tarjeta_hogar" on edgy_gestion.resumenes_tarjeta_hogar
  for select using (edgy_gestion.es_personal_edgy() or cliente_id = edgy_gestion.cliente_del_usuario_actual());
create policy "Alta de resumenes_tarjeta_hogar" on edgy_gestion.resumenes_tarjeta_hogar
  for insert with check (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Edicion de resumenes_tarjeta_hogar" on edgy_gestion.resumenes_tarjeta_hogar
  for update using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Borrado de resumenes_tarjeta_hogar" on edgy_gestion.resumenes_tarjeta_hogar
  for delete using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));

create policy "Lectura interna de consumos_tarjeta_hogar" on edgy_gestion.consumos_tarjeta_hogar
  for select using (edgy_gestion.es_personal_edgy() or exists (
    select 1 from edgy_gestion.resumenes_tarjeta_hogar r
    where r.id = consumos_tarjeta_hogar.resumen_id and r.cliente_id = edgy_gestion.cliente_del_usuario_actual()
  ));
create policy "Escritura de consumos_tarjeta_hogar" on edgy_gestion.consumos_tarjeta_hogar
  for all using (edgy_gestion.es_personal_edgy() or exists (
    select 1 from edgy_gestion.resumenes_tarjeta_hogar r
    where r.id = consumos_tarjeta_hogar.resumen_id and r.cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and edgy_gestion.tiene_permiso('home_keep', 'escritura')
  )) with check (edgy_gestion.es_personal_edgy() or exists (
    select 1 from edgy_gestion.resumenes_tarjeta_hogar r
    where r.id = consumos_tarjeta_hogar.resumen_id and r.cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and edgy_gestion.tiene_permiso('home_keep', 'escritura')
  ));

-- ─── Verificación ────────────────────────────────────────────
select table_name from information_schema.tables
where table_schema = 'edgy_gestion'
  and table_name in ('ingresos_hogar', 'tarjetas_credito_hogar', 'resumenes_tarjeta_hogar', 'consumos_tarjeta_hogar');
