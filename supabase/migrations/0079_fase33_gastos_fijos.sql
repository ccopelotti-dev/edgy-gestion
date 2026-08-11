-- ============================================================
-- Migración 0079 · Fase 33: módulo Gastos Fijos y Fiscales (núcleo)
-- Edgy Gestión · schema edgy_gestion
--
-- Pestaña 1 (esta entrega) — Sueldos: empleados + recibos con el
-- modelo completo del Anexo III (Decreto 407/2026 / Ley 27.802):
-- 4 secciones (identificación, contribuciones patronales, bruto y
-- deducciones, neto), líneas de concepto con base de cálculo +
-- monto, numeración única con soporte de rectificativas. El gráfico
-- de torta y el QR de validación se arman en el PDF (Fase 33b) a
-- partir de `recibo_conceptos` -- no hace falta más esquema para
-- eso. El QR de validación pública contra ARCA queda pendiente de
-- la integración de facturación electrónica (fuera de alcance acá).
--
-- Pestaña 2 (próxima entrega, mismo módulo) — Alquiler y Servicios:
-- gastos_fijos, carga manual por período (sin generación automática,
-- decisión explícita), con comprobante adjunto y que dispara egreso
-- en Tesorería al marcarse pagado (mismo mecanismo que Sueldos).
--
-- vertical = 'core': va debajo de Agenda en el sidebar (ver
-- ORDEN_PRINCIPALES en Sidebar.tsx).
--
-- Alícuotas de deducciones/contribuciones patronales NO se
-- hardcodean: quedan en `parametros_liquidacion` (jsonb, 1 fila por
-- cliente) para que un cambio de paritaria o de contrato de ART no
-- requiera deploy de código. Los valores por defecto son una base
-- razonable de referencia -- Carlos/el contador del cliente los
-- ajusta desde la propia pantalla de Sueldos.
-- ============================================================

insert into edgy_gestion.modulos (nombre, slug, vertical, descripcion) values
  ('Gastos Fijos y Fiscales', 'gastos-fijos', 'core', 'Sueldos, alquiler, servicios y (a futuro) impuestos')
on conflict (slug) do nothing;

-- ─── Backfill: activar el módulo para los clientes ya existentes ──

insert into edgy_gestion.cliente_modulos (cliente_id, modulo_id, activo, activado_en)
select c.id, m.id, true, now()
from edgy_gestion.clientes c
cross join (select id from edgy_gestion.modulos where slug = 'gastos-fijos') m
where not exists (
  select 1 from edgy_gestion.cliente_modulos cm
  where cm.cliente_id = c.id and cm.modulo_id = m.id
);

-- ─── Empleados ───────────────────────────────────────────────

create table if not exists edgy_gestion.empleados (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  nombre text not null,
  cuil text,
  fecha_ingreso date not null,
  categoria text,
  -- Carga libre (no tabla de escalas CCT) -- decisión explícita: el
  -- cliente define el básico al alta, sin depender de que Edgy
  -- mantenga actualizada cada paritaria.
  sueldo_basico numeric(12,2) not null default 0,
  activo boolean not null default true,
  creado_por uuid references edgy_gestion.usuarios_cliente(id),
  created_at timestamptz not null default now()
);

alter table edgy_gestion.empleados enable row level security;

create policy "Lectura interna de empleados" on edgy_gestion.empleados
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'lectura'))
  );

create policy "Alta de empleados" on edgy_gestion.empleados
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'escritura'))
  );

create policy "Edicion de empleados" on edgy_gestion.empleados
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'escritura'))
  );

create policy "Borrado de empleados" on edgy_gestion.empleados
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'escritura'))
  );

-- ─── Parámetros de liquidación (1 fila por cliente) ─────────
--
-- Valores de referencia -- confirmar con el contador de cada cliente
-- antes de emitir recibos reales. Todos son porcentajes salvo
-- seguro_vida_monto (importe fijo mensual, Art. 97 CCT 130/75) y
-- art_monto_fijo (cuota fija si el contrato de ART la tiene).

create table if not exists edgy_gestion.parametros_liquidacion (
  cliente_id uuid primary key references edgy_gestion.clientes(id),
  alicuotas jsonb not null default '{
    "jubilacion_empleado": 11,
    "ley19032_empleado": 3,
    "obra_social_empleado": 3,
    "sindical_empleado": 0.5,
    "seguro_vida_monto": 0,
    "sipa_patronal": 20.4,
    "fondo_nacional_empleo_patronal": 0.89,
    "asignaciones_familiares_patronal": 4.44,
    "obra_social_patronal": 6,
    "art_alicuota": 0,
    "art_monto_fijo": 0,
    "sindical_patronal": 0,
    "camara_patronal": 0
  }'::jsonb,
  updated_at timestamptz not null default now()
);

alter table edgy_gestion.parametros_liquidacion enable row level security;

create policy "Lectura interna de parametros_liquidacion" on edgy_gestion.parametros_liquidacion
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'lectura'))
  );

create policy "Alta de parametros_liquidacion" on edgy_gestion.parametros_liquidacion
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'escritura'))
  );

create policy "Edicion de parametros_liquidacion" on edgy_gestion.parametros_liquidacion
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'escritura'))
  );

-- ─── Recibos de sueldo (cabecera) ────────────────────────────

create table if not exists edgy_gestion.recibos_sueldo (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  empleado_id uuid not null references edgy_gestion.empleados(id),
  -- Correlativo por cliente, calculado en el frontend (max+1), mismo
  -- criterio que pagos.numero en Compras -- no hay trigger de DB.
  numero integer not null,
  periodo text not null, -- 'YYYY-MM'
  fecha_pago date,
  estado text not null default 'borrador' check (estado in ('borrador', 'emitido')),
  presentismo boolean not null default true,
  es_rectificativa boolean not null default false,
  recibo_original_id uuid references edgy_gestion.recibos_sueldo(id),
  total_remunerativo numeric(12,2) not null default 0,
  total_deducciones numeric(12,2) not null default 0,
  neto numeric(12,2) not null default 0,
  total_contribuciones_patronales numeric(12,2) not null default 0,
  pagado boolean not null default false,
  fecha_pago_real date,
  creado_por uuid references edgy_gestion.usuarios_cliente(id),
  created_at timestamptz not null default now(),
  unique (cliente_id, numero)
);

alter table edgy_gestion.recibos_sueldo enable row level security;

create policy "Lectura interna de recibos_sueldo" on edgy_gestion.recibos_sueldo
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'lectura'))
  );

create policy "Alta de recibos_sueldo" on edgy_gestion.recibos_sueldo
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'escritura'))
  );

create policy "Edicion de recibos_sueldo" on edgy_gestion.recibos_sueldo
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'escritura'))
  );

create policy "Borrado de recibos_sueldo" on edgy_gestion.recibos_sueldo
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'escritura'))
  );

-- ─── Conceptos del recibo (líneas) ───────────────────────────
--
-- Modelo flexible en vez de columnas fijas: cada línea trae su base
-- de cálculo y monto (exigencia del Art. 140 inciso j), y las de
-- tipo 'contribucion_patronal' llevan además `rubro` para poder
-- agrupar el gráfico de torta del Anexo III.

create table if not exists edgy_gestion.recibo_conceptos (
  id uuid primary key default gen_random_uuid(),
  recibo_id uuid not null references edgy_gestion.recibos_sueldo(id) on delete cascade,
  tipo text not null check (tipo in ('remunerativo', 'deduccion', 'contribucion_patronal')),
  rubro text check (rubro in ('sindical', 'seguridad_social', 'obra_social', 'pami', 'art', 'camaras', 'otros')),
  concepto text not null,
  base_calculo numeric(12,2),
  monto numeric(12,2) not null default 0,
  orden integer not null default 0
);

alter table edgy_gestion.recibo_conceptos enable row level security;

create policy "Lectura interna de recibo_conceptos" on edgy_gestion.recibo_conceptos
  for select using (
    edgy_gestion.es_personal_edgy()
    or exists (
      select 1 from edgy_gestion.recibos_sueldo r
      where r.id = recibo_conceptos.recibo_id
        and r.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'lectura')
    )
  );

create policy "Alta de recibo_conceptos" on edgy_gestion.recibo_conceptos
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or exists (
      select 1 from edgy_gestion.recibos_sueldo r
      where r.id = recibo_conceptos.recibo_id
        and r.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'escritura')
    )
  );

create policy "Edicion de recibo_conceptos" on edgy_gestion.recibo_conceptos
  for update using (
    edgy_gestion.es_personal_edgy()
    or exists (
      select 1 from edgy_gestion.recibos_sueldo r
      where r.id = recibo_conceptos.recibo_id
        and r.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'escritura')
    )
  );

create policy "Borrado de recibo_conceptos" on edgy_gestion.recibo_conceptos
  for delete using (
    edgy_gestion.es_personal_edgy()
    or exists (
      select 1 from edgy_gestion.recibos_sueldo r
      where r.id = recibo_conceptos.recibo_id
        and r.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'escritura')
    )
  );

-- ─── Gastos fijos (Alquiler y Servicios) ─────────────────────
--
-- Carga manual por período (decisión explícita, sin generación
-- automática). Comprobante adjunto opcional vía el bucket privado
-- de más abajo.

create table if not exists edgy_gestion.gastos_fijos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  concepto text not null,
  tipo text not null default 'otro' check (tipo in ('alquiler', 'luz', 'gas', 'internet', 'telefonia', 'otro')),
  proveedor text,
  periodo text not null, -- 'YYYY-MM'
  monto numeric(12,2) not null default 0,
  vencimiento date,
  fecha_pago date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'pagado', 'vencido')),
  comprobante_path text,
  creado_por uuid references edgy_gestion.usuarios_cliente(id),
  created_at timestamptz not null default now()
);

alter table edgy_gestion.gastos_fijos enable row level security;

create policy "Lectura interna de gastos_fijos" on edgy_gestion.gastos_fijos
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'lectura'))
  );

create policy "Alta de gastos_fijos" on edgy_gestion.gastos_fijos
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'escritura'))
  );

create policy "Edicion de gastos_fijos" on edgy_gestion.gastos_fijos
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'escritura'))
  );

create policy "Borrado de gastos_fijos" on edgy_gestion.gastos_fijos
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('gastos-fijos', 'escritura'))
  );

-- ─── Bucket de comprobantes (privado) ────────────────────────
-- Mismo criterio que "notas-media": privado, path
-- "{clienteId}/{id}-{nombre}", URL de descarga firmada al vuelo.

insert into storage.buckets (id, name, public)
values ('comprobantes-gastos', 'comprobantes-gastos', false)
on conflict (id) do update set public = false;

drop policy if exists "comprobantes_gastos_lectura" on storage.objects;
create policy "comprobantes_gastos_lectura"
on storage.objects for select
to authenticated
using (
  bucket_id = 'comprobantes-gastos'
  and (
    edgy_gestion.es_personal_edgy()
    or (storage.foldername(name))[1] = edgy_gestion.cliente_del_usuario_actual()::text
  )
);

drop policy if exists "comprobantes_gastos_escritura" on storage.objects;
create policy "comprobantes_gastos_escritura"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'comprobantes-gastos'
  and (
    edgy_gestion.es_personal_edgy()
    or (storage.foldername(name))[1] = edgy_gestion.cliente_del_usuario_actual()::text
  )
);

drop policy if exists "comprobantes_gastos_borrado" on storage.objects;
create policy "comprobantes_gastos_borrado"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'comprobantes-gastos'
  and (
    edgy_gestion.es_personal_edgy()
    or (storage.foldername(name))[1] = edgy_gestion.cliente_del_usuario_actual()::text
  )
);

-- ─── Verificación ────────────────────────────────────────────

select table_name
from information_schema.tables
where table_schema = 'edgy_gestion'
  and table_name = any(array['empleados', 'parametros_liquidacion', 'recibos_sueldo', 'recibo_conceptos', 'gastos_fijos']);

select slug, vertical from edgy_gestion.modulos where slug = 'gastos-fijos';

select count(*) as clientes_con_gastos_fijos_activo
from edgy_gestion.cliente_modulos cm
join edgy_gestion.modulos m on m.id = cm.modulo_id
where m.slug = 'gastos-fijos' and cm.activo = true;

select id, public from storage.buckets where id = 'comprobantes-gastos';
