-- ============================================================
-- Fase 74: Home Keep — Vehículos, Inmuebles y Servicios (pagos
-- de servicios continuos: impuestos, tasas, seguros, etc.)
-- ============================================================
--
-- A pedido de Carlos (07/09): tomar la idea del Excel manual que
-- usa Rosana (impuestos, tasas, seguros, servicios como luz/gas/
-- internet, colegios, etc.) y convertirla en un panel dinámico que
-- se precarga con lo que ya se sabe y se va completando/desagotando
-- a medida que llegan los comprobantes reales y se pagan.
--
-- Criterio de trazabilidad pedido explícitamente por Carlos:
--   - Un Vehículo se da de alta desde el perfil de su titular
--     (Perfil Familiar), mismo patrón que TarjetaCredito (Fase 72c):
--     usuario_cliente_id como FK de alta, gestión funcional aparte.
--   - Un Inmueble sigue el MISMO patrón (titular único vía
--     usuario_cliente_id) -- Carlos pidió explícitamente simplificarlo
--     así por ahora ("simplifica inmueble a solo titular por ahora"),
--     dejando la cotitularidad (uno o los dos cónyuges) para una fase
--     futura en vez de modelar ya una tabla puente N:M.
--   - Servicios es la tabla de "obligación recurrente" (el service/
--     póliza/impuesto en sí -- no el pago puntual): se vincula
--     opcionalmente a un vehículo, a un inmueble, a una persona
--     (ej. colegio/psicóloga de un hijo) o a nada (ej. Netflix).
--     Trae una estimación de monto/día de vencimiento para poder
--     precargar el panel antes de que llegue el comprobante real.
--   - comprobantes_hogar gana un link opcional a la Servicio que
--     ese comprobante puntual está pagando, para que el panel pueda
--     "desagotar" (marcar como cubierto) ese vencimiento del período.
-- ============================================================

set search_path to edgy_gestion, public;

-- ─── 1. Vehículos (alta desde Perfil Familiar, titular único) ─────

create table if not exists edgy_gestion.vehiculos_hogar (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  -- El alta de un vehículo se hace desde su ficha en Perfil Familiar
  -- (mismo criterio que tarjetas_credito_hogar.usuario_cliente_id,
  -- Fase 72c) -- Home Keep > Servicios es donde se maneja el pago de
  -- lo que se le asocie (patente, seguro), no el alta del vehículo.
  usuario_cliente_id uuid references edgy_gestion.usuarios_cliente(id),
  patente text,
  marca text,
  modelo text,
  anio integer,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── 2. Inmuebles (alta desde Perfil Familiar, titular único) ─────
--
-- Simplificado a pedido de Carlos: mismo patrón de titular único que
-- Vehículos por ahora. La cotitularidad (uno o los dos cónyuges)
-- queda pendiente para una fase futura.

create table if not exists edgy_gestion.inmuebles_hogar (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  usuario_cliente_id uuid references edgy_gestion.usuarios_cliente(id),
  nombre text not null,
  direccion text,
  -- Identificador catastral/partida (ej. "47-03-J-3-030", "Partida
  -- 668280/2") -- formato libre porque cada municipio/provincia lo
  -- referencia distinto, tal cual se ve en el Excel de Rosana.
  partida_inmobiliaria text,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── 3. Servicios (definición de la obligación recurrente) ────────

create table if not exists edgy_gestion.servicios_hogar (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  -- Ej. "Seguro Auto NATIVA", "Impuesto Inmobiliario Casa 1", "Colegio
  -- Mateo", "Internet CPE" -- lo que en el Excel es cada fila.
  nombre text not null,
  categoria_gasto_id uuid references edgy_gestion.categorias_gasto(id),
  proveedor_id uuid references edgy_gestion.proveedores_hogar(id),
  -- Con qué está vinculada esta obligación, para trazabilidad --
  -- 'vehiculo' (ej. patente, seguro del auto), 'inmueble' (impuestos,
  -- tasas municipales, expensas), 'persona' (colegio, psicóloga de un
  -- integrante puntual) o 'general' (servicios sin vínculo directo,
  -- ej. Netflix, Mercado Pago crédito).
  tipo_vinculo text not null default 'general' check (tipo_vinculo in ('vehiculo', 'inmueble', 'persona', 'general')),
  vehiculo_id uuid references edgy_gestion.vehiculos_hogar(id),
  inmueble_id uuid references edgy_gestion.inmuebles_hogar(id),
  usuario_cliente_id uuid references edgy_gestion.usuarios_cliente(id),
  periodicidad text not null default 'mensual' check (periodicidad in ('mensual', 'bimestral', 'trimestral', 'semestral', 'anual')),
  -- Para precargar el panel antes de que llegue el comprobante real
  -- del mes -- valores aproximados, se corrigen solos cuando el
  -- comprobante real llega y se vincula (servicio_hogar_id abajo).
  dia_vencimiento_aproximado integer check (dia_vencimiento_aproximado between 1 and 31),
  monto_estimado numeric,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_servicios_hogar_vehiculo on edgy_gestion.servicios_hogar (vehiculo_id);
create index if not exists idx_servicios_hogar_inmueble on edgy_gestion.servicios_hogar (inmueble_id);

-- ─── 4. Link del comprobante real a la Servicio que paga ──────────
-- Nullable: un comprobante puede seguir sin estar vinculado a ningún
-- servicio recurrente (compras sueltas, tickets varios). Cuando SÍ
-- se vincula, el panel de Servicios lo toma como "cubierto" para ese
-- período y lo saca de pendientes (criterio de "desagotarse" pedido
-- por Carlos).

alter table edgy_gestion.comprobantes_hogar
  add column if not exists servicio_hogar_id uuid references edgy_gestion.servicios_hogar(id);

create index if not exists idx_comprobantes_hogar_servicio on edgy_gestion.comprobantes_hogar (servicio_hogar_id);

-- ─── 5. RLS -- mismo patrón que el resto de Home Keep (Fase 56/70) ──

alter table edgy_gestion.vehiculos_hogar enable row level security;
alter table edgy_gestion.inmuebles_hogar enable row level security;
alter table edgy_gestion.servicios_hogar enable row level security;

create policy "Lectura interna de vehiculos_hogar" on edgy_gestion.vehiculos_hogar
  for select using (edgy_gestion.es_personal_edgy() or cliente_id = edgy_gestion.cliente_del_usuario_actual());
create policy "Alta de vehiculos_hogar" on edgy_gestion.vehiculos_hogar
  for insert with check (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Edicion de vehiculos_hogar" on edgy_gestion.vehiculos_hogar
  for update using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Borrado de vehiculos_hogar" on edgy_gestion.vehiculos_hogar
  for delete using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));

create policy "Lectura interna de inmuebles_hogar" on edgy_gestion.inmuebles_hogar
  for select using (edgy_gestion.es_personal_edgy() or cliente_id = edgy_gestion.cliente_del_usuario_actual());
create policy "Alta de inmuebles_hogar" on edgy_gestion.inmuebles_hogar
  for insert with check (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Edicion de inmuebles_hogar" on edgy_gestion.inmuebles_hogar
  for update using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Borrado de inmuebles_hogar" on edgy_gestion.inmuebles_hogar
  for delete using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));

create policy "Lectura interna de servicios_hogar" on edgy_gestion.servicios_hogar
  for select using (edgy_gestion.es_personal_edgy() or cliente_id = edgy_gestion.cliente_del_usuario_actual());
create policy "Alta de servicios_hogar" on edgy_gestion.servicios_hogar
  for insert with check (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Edicion de servicios_hogar" on edgy_gestion.servicios_hogar
  for update using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));
create policy "Borrado de servicios_hogar" on edgy_gestion.servicios_hogar
  for delete using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura')));

-- ─── Verificación ────────────────────────────────────────────
select table_name from information_schema.tables
where table_schema = 'edgy_gestion'
  and table_name in ('vehiculos_hogar', 'inmuebles_hogar', 'servicios_hogar');

select column_name from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'comprobantes_hogar' and column_name = 'servicio_hogar_id';
