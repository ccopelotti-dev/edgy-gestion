-- Fase 75n (11/09): el sincronizador de Acadeu pasa de leer solo el
-- widget de "evaluaciones próximas" (texto libre, diff por igualdad
-- exacta -- frágil) a leer el feed completo de /notificaciones
-- (ausencias, calificaciones publicadas Y evaluaciones nuevas, cada
-- una con un ID único y creciente). Con ID propio alcanza con guardar
-- "hasta qué ID ya procesamos" -- un cursor único por cliente, no por
-- hijo (el feed es compartido entre los 3).
--
-- Reemplaza en los hechos a `acadeu_estado_evaluaciones` (Fase 75l),
-- que queda sin uso pero no se borra por las dudas.

create table if not exists edgy_gestion.acadeu_estado_notificaciones (
  cliente_id uuid primary key references edgy_gestion.clientes(id),
  ultimo_id_procesado bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table edgy_gestion.acadeu_estado_notificaciones enable row level security;

-- Mismo criterio que acadeu_estado_evaluaciones: la toca únicamente el
-- sincronizador (service_role), policy de solo lectura por si hace
-- falta inspeccionar a mano.
create policy "Lectura interna de acadeu_estado_notificaciones" on edgy_gestion.acadeu_estado_notificaciones
  for select
  using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'admin'))
  );
