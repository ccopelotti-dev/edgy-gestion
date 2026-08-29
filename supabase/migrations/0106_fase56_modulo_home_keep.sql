-- ============================================================
-- Fase 56: módulo "Home Keep" (Kit Hogar)
-- ============================================================
--
-- Reemplaza el enfoque de la Fase 55 (tenant "Hogar" aparte, con su
-- propio login) por uno más simple y más alineado con la arquitectura
-- del sistema: Home Keep es un MÓDULO más -- como Compras, Ventas,
-- Agenda -- que cualquier cliente puede activar desde el panel interno
-- (Kit Hogar, igual que ya existen Kit A Medida y Kit Gastronómico).
-- Corre bajo el mismo cliente_id y el mismo login del negocio real: no
-- hace falta una identidad de Auth separada.
--
-- Pensado como feature de plataforma, no solo para Carlos: cualquier
-- cliente (ej. un profesional independiente) puede prender Kit Hogar y
-- llevar los gastos de su familia con la misma cuenta de su negocio,
-- sin que se mezclen con los datos reales de ese negocio.
--
-- Por eso Home Keep tiene TABLAS PROPIAS (no reutiliza proveedores /
-- comprobantes_compra / pagos_compra con una columna discriminadora):
-- así un bug en un reporte o dashboard de Compras nunca puede filtrar
-- sin querer un gasto personal, ni viceversa.
--
-- Recortado respecto de Compras: sin Cotizaciones ni Órdenes de Compra
-- (no aplica un flujo de cotizar-a-proveedor para gastos del hogar), y
-- sin nada de stock/recepción (Home Keep no tiene catálogo de
-- Productos/Insumos). "Órdenes de Pago" se llama simplemente "Pagos"
-- en la UI de este módulo (el modelo interno es el mismo).
-- ============================================================

set search_path to edgy_gestion, public;

-- ─── 1. Catálogo del módulo ──────────────────────────────────────────

insert into edgy_gestion.modulos (id, nombre, slug, vertical, descripcion)
values (
  'a1f3c9d4-6b8e-4a2f-9c1d-7e5f8b3a2c11',
  'Home Keep',
  'home_keep',
  'hogar',
  'Gastos personales y del hogar (proveedores, comprobantes y pagos) -- separado del negocio real, mismo login.'
)
on conflict (id) do nothing;

-- ─── 2. Proveedores del hogar ────────────────────────────────────────

create table if not exists edgy_gestion.proveedores_hogar (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  nombre text not null,
  nombre_fantasia text,
  cuit text,
  condicion_iva text,
  email text,
  telefono text,
  direccion text,
  localidad text,
  provincia text,
  contacto text,
  rubro text,
  notas text,
  saldo_cuenta_corriente numeric not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── 3. Comprobantes del hogar ───────────────────────────────────────

create table if not exists edgy_gestion.comprobantes_hogar (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  tipo text not null,
  numero integer not null,
  proveedor_id uuid references edgy_gestion.proveedores_hogar(id),
  fecha date not null,
  fecha_vencimiento date,
  subtotal numeric not null default 0,
  monto_iva numeric not null default 0,
  otros_impuestos jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  estado text not null default 'pendiente',
  medio_pago text,
  monto_pagado numeric not null default 0,
  saldo_pendiente numeric not null default 0,
  numero_comprobante_proveedor text,
  notas text,
  es_prueba boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists edgy_gestion.comprobante_hogar_items (
  id uuid primary key default gen_random_uuid(),
  comprobante_id uuid not null references edgy_gestion.comprobantes_hogar(id) on delete cascade,
  descripcion text not null,
  cantidad numeric not null default 1,
  precio_unitario numeric not null default 0,
  descuento numeric not null default 0,
  alicuota_iva numeric not null default 21,
  subtotal numeric not null default 0,
  monto_iva numeric not null default 0,
  unidad text,
  categoria_gasto_id uuid references edgy_gestion.categorias_gasto(id)
);

-- ─── 4. Pagos del hogar ──────────────────────────────────────────────

create table if not exists edgy_gestion.pagos_hogar (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  numero integer not null,
  proveedor_id uuid references edgy_gestion.proveedores_hogar(id),
  fecha date not null,
  monto numeric not null default 0,
  medio_pago text,
  estado text not null default 'pendiente',
  lineas_pago jsonb not null default '[]'::jsonb,
  fecha_confirmacion date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists edgy_gestion.pago_hogar_imputaciones (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references edgy_gestion.pagos_hogar(id) on delete cascade,
  comprobante_id uuid not null references edgy_gestion.comprobantes_hogar(id),
  monto_imputado numeric not null default 0
);

-- ─── 5. RLS -- mismo patrón que Compras, slug 'home_keep' ────────────

alter table edgy_gestion.proveedores_hogar enable row level security;
alter table edgy_gestion.comprobantes_hogar enable row level security;
alter table edgy_gestion.comprobante_hogar_items enable row level security;
alter table edgy_gestion.pagos_hogar enable row level security;
alter table edgy_gestion.pago_hogar_imputaciones enable row level security;

create policy "Lectura interna de proveedores_hogar" on edgy_gestion.proveedores_hogar
  for select using (edgy_gestion.es_personal_edgy() or cliente_id = edgy_gestion.cliente_del_usuario_actual());
create policy "Alta de proveedores_hogar" on edgy_gestion.proveedores_hogar
  for insert with check (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Edicion de proveedores_hogar" on edgy_gestion.proveedores_hogar
  for update using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Borrado de proveedores_hogar" on edgy_gestion.proveedores_hogar
  for delete using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));

create policy "Lectura interna de comprobantes_hogar" on edgy_gestion.comprobantes_hogar
  for select using (edgy_gestion.es_personal_edgy() or cliente_id = edgy_gestion.cliente_del_usuario_actual());
create policy "Alta de comprobantes_hogar" on edgy_gestion.comprobantes_hogar
  for insert with check (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Edicion de comprobantes_hogar" on edgy_gestion.comprobantes_hogar
  for update using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Borrado de comprobantes_hogar" on edgy_gestion.comprobantes_hogar
  for delete using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));

create policy "Lectura interna de comprobante_hogar_items" on edgy_gestion.comprobante_hogar_items
  for select using (edgy_gestion.es_personal_edgy() or exists (
    select 1 from edgy_gestion.comprobantes_hogar c
    where c.id = comprobante_hogar_items.comprobante_id and c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
  ));
create policy "Escritura de comprobante_hogar_items" on edgy_gestion.comprobante_hogar_items
  for all using (edgy_gestion.es_personal_edgy() or exists (
    select 1 from edgy_gestion.comprobantes_hogar c
    where c.id = comprobante_hogar_items.comprobante_id and c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and edgy_gestion.tiene_permiso('home_keep', 'escritura')
  )) with check (edgy_gestion.es_personal_edgy() or exists (
    select 1 from edgy_gestion.comprobantes_hogar c
    where c.id = comprobante_hogar_items.comprobante_id and c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and edgy_gestion.tiene_permiso('home_keep', 'escritura')
  ));

create policy "Lectura interna de pagos_hogar" on edgy_gestion.pagos_hogar
  for select using (edgy_gestion.es_personal_edgy() or cliente_id = edgy_gestion.cliente_del_usuario_actual());
create policy "Alta de pagos_hogar" on edgy_gestion.pagos_hogar
  for insert with check (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Edicion de pagos_hogar" on edgy_gestion.pagos_hogar
  for update using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Borrado de pagos_hogar" on edgy_gestion.pagos_hogar
  for delete using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));

create policy "Lectura interna de pago_hogar_imputaciones" on edgy_gestion.pago_hogar_imputaciones
  for select using (edgy_gestion.es_personal_edgy() or exists (
    select 1 from edgy_gestion.pagos_hogar p
    where p.id = pago_hogar_imputaciones.pago_id and p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
  ));
create policy "Escritura de pago_hogar_imputaciones" on edgy_gestion.pago_hogar_imputaciones
  for all using (edgy_gestion.es_personal_edgy() or exists (
    select 1 from edgy_gestion.pagos_hogar p
    where p.id = pago_hogar_imputaciones.pago_id and p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and edgy_gestion.tiene_permiso('home_keep', 'escritura')
  )) with check (edgy_gestion.es_personal_edgy() or exists (
    select 1 from edgy_gestion.pagos_hogar p
    where p.id = pago_hogar_imputaciones.pago_id and p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
      and edgy_gestion.tiene_permiso('home_keep', 'escritura')
  ));

-- ─── 6. Auto-seed de categorías de gasto al activar el módulo ───────
--
-- categorias_gasto ya existía (Fase 55), scoped por cliente_id -- se
-- mantiene tal cual, ahora al servicio de CUALQUIER cliente que active
-- Home Keep (no solo el extinto tenant Hogar). Para que activar el Kit
-- Hogar sea un solo click (sin tener que cargar las 9 categorías a
-- mano cada vez), un trigger las siembra automáticamente la primera
-- vez que se prende el módulo para un cliente.

create or replace function edgy_gestion.seed_categorias_gasto_home_keep()
returns trigger
language plpgsql
security definer
set search_path to edgy_gestion, public
as $$
declare
  v_modulo_home_keep uuid;
begin
  select id into v_modulo_home_keep from edgy_gestion.modulos where slug = 'home_keep';

  if new.modulo_id = v_modulo_home_keep and new.activo = true then
    insert into edgy_gestion.categorias_gasto (cliente_id, nombre)
    select new.cliente_id, d.nombre
    from (values
      ('Vivienda'), ('Alimentación y Supermercado'), ('Educación'), ('Salud'),
      ('Transporte y Movilidad'), ('Servicios y Suscripciones'),
      ('Entretenimiento y Actividades'), ('Vestimenta y Calzado'), ('Ahorros e Imprevistos')
    ) as d(nombre)
    on conflict (cliente_id, nombre) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_seed_categorias_gasto_home_keep on edgy_gestion.cliente_modulos;
create trigger trg_seed_categorias_gasto_home_keep
  after insert or update of activo on edgy_gestion.cliente_modulos
  for each row execute function edgy_gestion.seed_categorias_gasto_home_keep();

-- ─── Verificación ────────────────────────────────────────────
select id, nombre, slug, vertical from edgy_gestion.modulos where slug = 'home_keep';
