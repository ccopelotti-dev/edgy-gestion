-- Fase 75k (09/09, a pedido de Carlos): Agenda (módulo "core", compartida
-- por todos los clientes) tiene el rol Cónyuge/Hijo en 'sin_acceso' a
-- propósito -- la misma tabla `agenda_tareas` mezcla tareas operativas de
-- La Charcutería (reposición, replanteos, entregas) con lo personal de la
-- familia, sin ningún campo que distinga uno de otro. Abrirla tal cual a
-- los roles familiares expondría el lado negocio.
--
-- Solución (la más simple, a pedido de Carlos: "duplicar la agenda y
-- migrarla a Home Keep"): una tabla PROPIA para Home Keep, con su propia
-- RLS atada al permiso de 'home_keep' (no de 'agenda') -- como Cónyuge/
-- Hijo ya tienen home_keep en escritura/admin (Fase 266), heredan acceso
-- automáticamente sin tocar ningún permisos_rol.
--
-- usuario_cliente_id (nullable): a diferencia de agenda_tareas, esta
-- tabla sí sabe "de/para quién de la familia" es un evento (mismo
-- patrón que Ingreso.usuarioClienteId, Fase 71i) -- null = evento
-- compartido de toda la familia. Pensado para que el agente de Acadeu
-- pueda cargar acá la actividad de cada hijo.
--
-- origen (nullable): tag libre para integraciones automáticas (ej.
-- 'acadeu') -- permite que un job de sincronización identifique y
-- actualice/evite duplicar sus propias filas sin tocar las cargadas a
-- mano por la familia.

create table if not exists edgy_gestion.home_keep_tareas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  usuario_cliente_id uuid references edgy_gestion.usuarios_cliente(id),
  titulo text not null,
  descripcion text,
  fecha date not null default current_date,
  hora_inicio time without time zone,
  hora_fin time without time zone,
  categoria text not null default 'personal',
  prioridad text not null default 'media',
  estado text not null default 'pendiente',
  origen text,
  created_at timestamptz not null default now()
);

create index if not exists home_keep_tareas_cliente_fecha_idx
  on edgy_gestion.home_keep_tareas (cliente_id, fecha);

create index if not exists home_keep_tareas_usuario_cliente_idx
  on edgy_gestion.home_keep_tareas (usuario_cliente_id);

alter table edgy_gestion.home_keep_tareas enable row level security;

create policy "Alta de home_keep_tareas" on edgy_gestion.home_keep_tareas
  for insert
  with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura'))
  );

create policy "Lectura interna de home_keep_tareas" on edgy_gestion.home_keep_tareas
  for select
  using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'lectura'))
  );

create policy "Edicion de home_keep_tareas" on edgy_gestion.home_keep_tareas
  for update
  using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura'))
  );

create policy "Borrado de home_keep_tareas" on edgy_gestion.home_keep_tareas
  for delete
  using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'escritura'))
  );
