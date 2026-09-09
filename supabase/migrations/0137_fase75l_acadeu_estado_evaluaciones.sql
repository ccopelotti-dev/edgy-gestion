-- Fase 75l (09/09): "último estado visto" por hijo, para que el
-- sincronizador de Acadeu (Netlify function acadeu-sincronizar.js,
-- llamada desde el workflow n8n "Acadeu - Prueba de login y
-- evaluaciones") pueda detectar SOLO lo nuevo en cada pasada -- sin
-- esto, cada corrida (cada 30 min) volvería a marcar como "novedad" la
-- misma evaluación pendiente de siempre, y mandaría WhatsApp repetido.
--
-- unique(usuario_cliente_id): un renglón por hijo, se pisa (upsert) en
-- cada sincronización -- no hace falta historial acá, la Agenda
-- familiar (home_keep_tareas, Fase 75k) ya es el registro persistente
-- de lo detectado.

create table if not exists edgy_gestion.acadeu_estado_evaluaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  usuario_cliente_id uuid not null references edgy_gestion.usuarios_cliente(id),
  ultimo_texto text not null,
  updated_at timestamptz not null default now(),
  unique (usuario_cliente_id)
);

alter table edgy_gestion.acadeu_estado_evaluaciones enable row level security;

-- Esta tabla la toca únicamente el sincronizador (Netlify function con
-- SUPABASE_SERVICE_ROLE_KEY, que bypasea RLS por diseño) -- no hay
-- ningún flujo de la app que deba escribir acá. Se deja una policy de
-- solo lectura para personal Edgy/admin del cliente, por si hace falta
-- inspeccionar el estado a mano alguna vez.
create policy "Lectura interna de acadeu_estado_evaluaciones" on edgy_gestion.acadeu_estado_evaluaciones
  for select
  using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual() and edgy_gestion.tiene_permiso('home_keep', 'admin'))
  );
