-- ============================================================
-- Migración 0019: módulo Viandas (opcional)
-- Edgy Gestión · schema edgy_gestion
--
-- Planes de vianda por abono, con entregas periódicas. Patrón
-- parent-child igual al de SeguimientoHoras/EntradaHoras de
-- Utilidades: PlanVianda es el abono contratado (cantidad incluida
-- por período, vigencia), EntregaVianda es cada entrega real.
--
-- El cliente del plan es un cliente_venta real de Ventas (no un
-- Consumidor Final ni un cliente propio del módulo) porque el abono
-- se cobra a una persona identificada, a diferencia de una mesa.
--
-- Facturación: se reutiliza el flujo de Cobro de Ventas (tabla
-- `cobros`, sin comprobante asociado) en vez de inventar un circuito
-- de facturación nuevo -- el cobro del abono se registra como un
-- Cobro normal contra el cliente_venta_id del plan, y se refleja en
-- Tesorería vía registrarMovimientoTesoreria (mismo criterio que
-- comandas-cocina, ver 0018_gastronomico_nucleo.sql).
--
-- Vencimiento/atraso: se calcula en el cliente con daysUntil() sobre
-- fecha_vencimiento (mismo helper que Tesorería/Compras/Ventas usan
-- para cheques y comprobantes), no hace falta un job ni una columna
-- calculada -- `estado` solo distingue cancelado de no-cancelado; la
-- UI decide "vencido" comparando fechas.
-- ============================================================

insert into edgy_gestion.modulos (nombre, slug, vertical, descripcion) values
  ('Viandas', 'viandas', 'gastronomico', 'Planes de vianda por abono con entregas periódicas')
on conflict (slug) do nothing;

-- ─── Planes de vianda ────────────────────────────────────────

create table if not exists edgy_gestion.planes_vianda (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  cliente_venta_id uuid not null references edgy_gestion.clientes_venta(id),
  cantidad_periodo integer not null default 1,
  periodo text not null default 'semanal' check (periodo in ('semanal', 'mensual')),
  precio_abono numeric not null default 0,
  fecha_inicio date not null default current_date,
  fecha_vencimiento date not null,
  estado text not null default 'activo' check (estado in ('activo', 'cancelado')),
  notas text,
  created_at timestamptz not null default now()
);

alter table edgy_gestion.planes_vianda enable row level security;

create policy "Lectura interna de planes_vianda" on edgy_gestion.planes_vianda
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('viandas', 'lectura'))
  );

create policy "Alta de planes_vianda" on edgy_gestion.planes_vianda
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('viandas', 'escritura'))
  );

create policy "Edicion de planes_vianda" on edgy_gestion.planes_vianda
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('viandas', 'escritura'))
  );

create policy "Borrado de planes_vianda" on edgy_gestion.planes_vianda
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('viandas', 'escritura'))
  );

-- ─── Entregas de vianda ──────────────────────────────────────

create table if not exists edgy_gestion.entregas_vianda (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references edgy_gestion.planes_vianda(id) on delete cascade,
  fecha date not null default current_date,
  cantidad integer not null default 1,
  menu_del_dia text,
  created_at timestamptz not null default now()
);

alter table edgy_gestion.entregas_vianda enable row level security;

create policy "Lectura interna de entregas_vianda" on edgy_gestion.entregas_vianda
  for select using (
    edgy_gestion.es_personal_edgy()
    or plan_id in (
      select p.id from edgy_gestion.planes_vianda p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('viandas', 'lectura')
    )
  );

create policy "Alta de entregas_vianda" on edgy_gestion.entregas_vianda
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or plan_id in (
      select p.id from edgy_gestion.planes_vianda p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('viandas', 'escritura')
    )
  );

create policy "Borrado de entregas_vianda" on edgy_gestion.entregas_vianda
  for delete using (
    edgy_gestion.es_personal_edgy()
    or plan_id in (
      select p.id from edgy_gestion.planes_vianda p
      where p.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('viandas', 'escritura')
    )
  );

-- ─── Verificación ────────────────────────────────────────────

select table_name
from information_schema.tables
where table_schema = 'edgy_gestion'
  and table_name = any(array['planes_vianda', 'entregas_vianda']);

select slug from edgy_gestion.modulos where slug = 'viandas';
