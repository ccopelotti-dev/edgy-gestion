-- Fase 75o (11/09, a pedido de Carlos): generalización de "lo educativo"
-- (Acadeu) a un concepto más amplio -- una PERSONA de la familia puede
-- estar vinculada a una o más INSTITUCIONES (hoy: el colegio de cada
-- hijo vía Acadeu; a futuro: un club, una actividad extracurricular,
-- etc.), y cada institución expone distintos tipos de REGISTRO según
-- su tipo (colegio: boletín, convivencia, materias adeudadas,
-- asistencias histórico -- ninguno de estos encaja en el patrón de
-- "novedad" que ya cubre home_keep_tareas/Agenda, son consultas de
-- historial, no recordatorios con fecha).
--
-- Decisión de diseño (11/09, a pedido de Carlos): esto vive en Perfil
-- Familiar, no en Home Keep -- Home Keep es plata (gasto del hogar),
-- esto es historial de una persona. Mismo patrón que Vehículos/
-- Inmuebles/Tarjetas (Fase 72c/74): el alta vive en la ficha de la
-- persona en Perfil Familiar.
--
-- `curso` queda como campo editable en vez de hardcodeado en el código
-- del sincronizador de Acadeu (CURSO_A_NOMBRE_PILA en
-- acadeu-sincronizar.js) -- así, si un hijo cambia de división, Carlos
-- lo actualiza acá mismo sin pedir un cambio de código (Fase 75n dejó
-- esto anotado como pendiente).

create table if not exists edgy_gestion.vinculos_institucionales (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  usuario_cliente_id uuid not null references edgy_gestion.usuarios_cliente(id),
  tipo text not null default 'colegio' check (tipo in ('colegio', 'club', 'otro')),
  nombre text not null,
  -- 'acadeu' = se sincroniza solo (Netlify function + n8n); 'manual' =
  -- Carlos carga los registros a mano (institucion_registros) porque la
  -- institución no tiene ninguna integración todavía.
  proveedor text not null default 'manual' check (proveedor in ('acadeu', 'manual')),
  -- Solo tiene sentido para proveedor='acadeu' hoy (curso/división del
  -- colegio) -- el sincronizador lo usa para resolver "nueva evaluación
  -- cargada (X)" a la persona correcta sin mapeo hardcodeado.
  curso text,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vinculos_institucionales_cliente_idx
  on edgy_gestion.vinculos_institucionales (cliente_id);

create index if not exists vinculos_institucionales_usuario_idx
  on edgy_gestion.vinculos_institucionales (usuario_cliente_id);

-- Búsqueda del sincronizador de Acadeu: "dado este curso, a qué persona
-- corresponde" -- reemplaza CURSO_A_NOMBRE_PILA hardcodeado.
create index if not exists vinculos_institucionales_curso_idx
  on edgy_gestion.vinculos_institucionales (cliente_id, proveedor, curso)
  where proveedor = 'acadeu';

alter table edgy_gestion.vinculos_institucionales enable row level security;

create policy "Alta de vinculos_institucionales" on edgy_gestion.vinculos_institucionales
  for insert
  with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura'))
  );

create policy "Lectura interna de vinculos_institucionales" on edgy_gestion.vinculos_institucionales
  for select
  using (
    edgy_gestion.es_personal_edgy()
    or cliente_id = edgy_gestion.cliente_del_usuario_actual()
  );

create policy "Edicion de vinculos_institucionales" on edgy_gestion.vinculos_institucionales
  for update
  using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura'))
  );

create policy "Borrado de vinculos_institucionales" on edgy_gestion.vinculos_institucionales
  for delete
  using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura'))
  );

-- ─── Registros por institución (boletín, convivencia, etc.) ──────────
-- Snapshot/consulta, NO agenda -- no tiene fecha de recordatorio, tiene
-- un período (ej. "2026-T2") y un contenido libre en jsonb (la forma
-- exacta depende de qué logre traer el scraper de Acadeu; arrancar
-- flexible acá evita una migración nueva por cada campo que aparezca).

create table if not exists edgy_gestion.institucion_registros (
  id uuid primary key default gen_random_uuid(),
  vinculo_id uuid not null references edgy_gestion.vinculos_institucionales(id) on delete cascade,
  tipo_registro text not null check (tipo_registro in ('boletin', 'convivencia', 'materias_adeudadas', 'asistencias_historico', 'otro')),
  periodo text,
  contenido jsonb not null default '{}'::jsonb,
  origen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists institucion_registros_vinculo_idx
  on edgy_gestion.institucion_registros (vinculo_id, tipo_registro);

alter table edgy_gestion.institucion_registros enable row level security;

create policy "Escritura de institucion_registros" on edgy_gestion.institucion_registros
  for all
  using (
    edgy_gestion.es_personal_edgy()
    or exists (
      select 1 from edgy_gestion.vinculos_institucionales v
      where v.id = institucion_registros.vinculo_id
        and v.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('home_keep', 'escritura')
    )
  )
  with check (
    edgy_gestion.es_personal_edgy()
    or exists (
      select 1 from edgy_gestion.vinculos_institucionales v
      where v.id = institucion_registros.vinculo_id
        and v.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('home_keep', 'escritura')
    )
  );

create policy "Lectura interna de institucion_registros" on edgy_gestion.institucion_registros
  for select
  using (
    edgy_gestion.es_personal_edgy()
    or exists (
      select 1 from edgy_gestion.vinculos_institucionales v
      where v.id = institucion_registros.vinculo_id
        and v.cliente_id = edgy_gestion.cliente_del_usuario_actual()
    )
  );

-- Seed: los 3 hijos de La Charcutería, vínculo con Acadeu, curso tal
-- cual está hoy hardcodeado en acadeu-sincronizar.js (CURSO_A_NOMBRE_PILA,
-- confirmado por Carlos el 11/09).
insert into edgy_gestion.vinculos_institucionales (cliente_id, usuario_cliente_id, tipo, nombre, proveedor, curso)
select '4dc63cde-f1f9-4f73-9ea8-d46a77c4825b', id, 'colegio', 'Colegio (Acadeu)', 'acadeu', curso
from (
  values
    ('9075de5e-5549-46ca-8041-22dceabb4988'::uuid, '1° III'),
    ('796ee737-6c8c-486f-84e4-7ac9be7fe9c9'::uuid, '6° Economía y Administración'),
    ('e336ac0a-2551-462b-a08b-be3b2e50f289'::uuid, '4° B Prim')
) as datos(id, curso)
on conflict do nothing;
