-- ============================================================
-- Migración (Fase 82b, 15/09): esquema propio del módulo "Alquileres"
-- -- segunda parte de la integración GD Neuquén/G-Admin-Prop. Todas las
-- tablas van scopeadas por cliente_id (multi-tenant, como el resto de
-- Edgy Gestión) y con RLS atada a tiene_permiso('alquileres', nivel) --
-- a diferencia del sistema viejo, donde TODAS las tablas tenían RLS
-- "true para cualquiera" (incluido anon), sin autenticación real.
--
-- Mejoras deliberadas respecto del esquema viejo (G-Admin-Prop),
-- confirmadas durante la auditoría (tarea #54):
--   - FKs reales entre unidades/propiedades/inquilinos/pagos (el
--     viejo no tenía tenants.unit_id -> units, payments.tenant_id ->
--     tenants, ni properties.owner_id -> owners).
--   - inquilinos.garantes es jsonb (el viejo tenía `guarantors` como
--     texto plano pese a que el frontend lo trataba como array).
--   - Firmas y comprobantes van a Storage (bucket "archivos-cliente",
--     ya existente, carpeteado por cliente_id -- mismo patrón que
--     institucion_registro_adjuntos, Fase 75r) en vez de base64 en la
--     fila (el viejo guardaba owners.signatureUrl y
--     payments.bankDetails.receiptUrl como data URLs). Migración de
--     esas imágenes: pendiente, es un paso aparte.
--   - monto_total en pagos es una columna generada (evita el
--     desincronismo del viejo, donde el total lo calculaba el
--     frontend a mano en cada lugar).
-- ============================================================

create table if not exists edgy_gestion.alquileres_propietarios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  nombre_completo text not null,
  documento text not null,
  telefono text not null,
  email text,
  direccion text,
  comision_porcentaje numeric not null default 0,
  firma_path text,
  created_at timestamptz not null default now()
);

create index if not exists alquileres_propietarios_cliente_idx
  on edgy_gestion.alquileres_propietarios (cliente_id);

create table if not exists edgy_gestion.alquileres_propiedades (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  propietario_id uuid not null references edgy_gestion.alquileres_propietarios(id) on delete restrict,
  nombre text not null,
  direccion text,
  created_at timestamptz not null default now()
);

create index if not exists alquileres_propiedades_cliente_idx
  on edgy_gestion.alquileres_propiedades (cliente_id);
create index if not exists alquileres_propiedades_propietario_idx
  on edgy_gestion.alquileres_propiedades (propietario_id);

create table if not exists edgy_gestion.alquileres_unidades (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  propiedad_id uuid not null references edgy_gestion.alquileres_propiedades(id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('departamento', 'local', 'cochera')),
  ambientes integer,
  superficie_m2 numeric,
  extras text,
  estado text not null default 'disponible' check (estado in ('disponible', 'ocupada', 'mantenimiento')),
  created_at timestamptz not null default now()
);

create index if not exists alquileres_unidades_cliente_idx
  on edgy_gestion.alquileres_unidades (cliente_id);
create index if not exists alquileres_unidades_propiedad_idx
  on edgy_gestion.alquileres_unidades (propiedad_id);

create table if not exists edgy_gestion.alquileres_inquilinos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  unidad_id uuid not null references edgy_gestion.alquileres_unidades(id) on delete restrict,
  nombre text not null,
  apellido text not null,
  documento text,
  direccion text,
  ciudad text,
  provincia text,
  codigo_postal text,
  telefono text,
  email text,
  monto_alquiler numeric not null default 0,
  inicio_contrato date,
  fin_contrato date,
  monto_deposito numeric not null default 0,
  frecuencia_ajuste text,
  garantes jsonb not null default '[]'::jsonb,
  notas text,
  created_at timestamptz not null default now()
);

create index if not exists alquileres_inquilinos_cliente_idx
  on edgy_gestion.alquileres_inquilinos (cliente_id);
create index if not exists alquileres_inquilinos_unidad_idx
  on edgy_gestion.alquileres_inquilinos (unidad_id);

create table if not exists edgy_gestion.alquileres_pagos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  inquilino_id uuid not null references edgy_gestion.alquileres_inquilinos(id) on delete restrict,
  unidad_id uuid references edgy_gestion.alquileres_unidades(id) on delete set null,
  propietario_id uuid references edgy_gestion.alquileres_propietarios(id) on delete set null,
  fecha date not null default current_date,
  concepto text,
  forma_pago text check (forma_pago is null or forma_pago in ('efectivo', 'transferencia')),
  monto_alquiler numeric not null default 0,
  monto_tasas numeric not null default 0,
  monto_expensas numeric not null default 0,
  monto_otros numeric not null default 0,
  monto_total numeric generated always as (monto_alquiler + monto_tasas + monto_expensas + monto_otros) stored,
  comision_porcentaje_aplicado numeric,
  comision_admin numeric,
  saldo_propietario numeric,
  periodo_fechas jsonb not null default '[]'::jsonb,
  datos_bancarios jsonb,
  comprobante_path text,
  numero_recibo text,
  firmado_por uuid references edgy_gestion.alquileres_propietarios(id) on delete set null,
  notas text,
  created_at timestamptz not null default now()
);

create index if not exists alquileres_pagos_cliente_idx
  on edgy_gestion.alquileres_pagos (cliente_id);
create index if not exists alquileres_pagos_inquilino_idx
  on edgy_gestion.alquileres_pagos (inquilino_id);
create index if not exists alquileres_pagos_propietario_idx
  on edgy_gestion.alquileres_pagos (propietario_id);
create index if not exists alquileres_pagos_fecha_idx
  on edgy_gestion.alquileres_pagos (cliente_id, fecha);

create table if not exists edgy_gestion.alquileres_eventos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  unidad_id uuid not null references edgy_gestion.alquileres_unidades(id) on delete cascade,
  fecha date not null default current_date,
  descripcion text,
  accion text,
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  costo numeric,
  created_at timestamptz not null default now()
);

create index if not exists alquileres_eventos_cliente_idx
  on edgy_gestion.alquileres_eventos (cliente_id);
create index if not exists alquileres_eventos_unidad_idx
  on edgy_gestion.alquileres_eventos (unidad_id);

-- ─── RLS -- mismo patrón que el resto de Edgy Gestión ─────────
alter table edgy_gestion.alquileres_propietarios enable row level security;
alter table edgy_gestion.alquileres_propiedades enable row level security;
alter table edgy_gestion.alquileres_unidades enable row level security;
alter table edgy_gestion.alquileres_inquilinos enable row level security;
alter table edgy_gestion.alquileres_pagos enable row level security;
alter table edgy_gestion.alquileres_eventos enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'alquileres_propietarios', 'alquileres_propiedades', 'alquileres_unidades',
    'alquileres_inquilinos', 'alquileres_pagos', 'alquileres_eventos'
  ]
  loop
    execute format(
      'create policy "Alta de %1$s" on edgy_gestion.%1$s for insert with check (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso(''alquileres'', ''escritura'')));',
      t
    );
    execute format(
      'create policy "Lectura interna de %1$s" on edgy_gestion.%1$s for select using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso(''alquileres'', ''lectura'')));',
      t
    );
    execute format(
      'create policy "Edicion de %1$s" on edgy_gestion.%1$s for update using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso(''alquileres'', ''escritura'')));',
      t
    );
    execute format(
      'create policy "Borrado de %1$s" on edgy_gestion.%1$s for delete using (edgy_gestion.es_personal_edgy() or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso(''alquileres'', ''escritura'')));',
      t
    );
  end loop;
end $$;
