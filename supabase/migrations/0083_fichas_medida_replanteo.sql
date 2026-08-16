-- Migración 0083 · Fichas de medida: Fecha de Replanteo + sync con Agenda
--
-- "Replanteo": segunda visita a domicilio para confirmar medidas
-- exactas antes de fabricar (entre la toma de medida inicial/pedido y
-- la entrega). Tanto Replanteo como Entrega generan automáticamente
-- una tarea en agenda_tareas -- el vínculo se guarda en
-- tarea_replanteo_id/tarea_entrega_id para poder actualizar la misma
-- tarea en vez de duplicarla si se edita la fecha, y para poder
-- borrarla si se borra la ficha (ver useFichasMedida.ts).

alter table edgy_gestion.fichas_medida
  add column if not exists fecha_replanteo date,
  add column if not exists tarea_replanteo_id uuid references edgy_gestion.agenda_tareas(id) on delete set null,
  add column if not exists tarea_entrega_id uuid references edgy_gestion.agenda_tareas(id) on delete set null;

alter table edgy_gestion.agenda_tareas drop constraint if exists agenda_tareas_categoria_check;
alter table edgy_gestion.agenda_tareas add constraint agenda_tareas_categoria_check
  check (categoria in ('trabajo', 'personal', 'pago', 'entrega', 'otro', 'replanteo'));

-- ─── Verificación ────────────────────────────────────────────

select column_name from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'fichas_medida'
  and column_name in ('fecha_replanteo', 'tarea_replanteo_id', 'tarea_entrega_id');

select pg_get_constraintdef(oid) from pg_constraint where conname = 'agenda_tareas_categoria_check';
