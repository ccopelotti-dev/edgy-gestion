-- Fase 75p (11/09, a pedido de Carlos): para un integrante MENOR de 18
-- no tiene sentido mostrarle "Patrimonio" (Ingresos que aporta,
-- Vehículos, Inmuebles -- cosas que legalmente no puede tener a su
-- nombre) -- en su lugar, la ficha muestra "Cuentas": accesos digitales
-- simples que sí puede tener (un mail propio, una cuenta de MercadoPago
-- a partir de los 13 según la política del propio MercadoPago
-- Argentina), con la posibilidad de sumar más a mano.
--
-- Solo para menores (decisión de Carlos, 11/09) -- un adulto sigue
-- viendo "Patrimonio" exactamente como hoy, sin esta sección.

create table if not exists edgy_gestion.cuentas_digitales (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  usuario_cliente_id uuid not null references edgy_gestion.usuarios_cliente(id),
  tipo text not null check (tipo in ('email', 'mercadopago', 'otro')),
  valor text not null,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cuentas_digitales_usuario_idx
  on edgy_gestion.cuentas_digitales (usuario_cliente_id);

alter table edgy_gestion.cuentas_digitales enable row level security;

create policy "Alta de cuentas_digitales" on edgy_gestion.cuentas_digitales
  for insert
  with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura'))
  );

create policy "Lectura interna de cuentas_digitales" on edgy_gestion.cuentas_digitales
  for select
  using (
    edgy_gestion.es_personal_edgy()
    or cliente_id = edgy_gestion.cliente_del_usuario_actual()
  );

create policy "Edicion de cuentas_digitales" on edgy_gestion.cuentas_digitales
  for update
  using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura'))
  );

create policy "Borrado de cuentas_digitales" on edgy_gestion.cuentas_digitales
  for delete
  using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura'))
  );
