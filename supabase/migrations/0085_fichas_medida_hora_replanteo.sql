-- Migración 0085 · Fichas de medida: hora de Replanteo
--
-- El Replanteo es una visita a domicilio con horario acordado (a
-- diferencia de la Entrega, que es un compromiso de día, no de horario
-- puntual) -- se guarda la hora aparte de la fecha, nullable, y viaja
-- como hora_inicio de la tarea de Agenda que genera automáticamente
-- (ver sincronizarTareasAgenda en useFichasMedida.ts).

alter table edgy_gestion.fichas_medida
  add column if not exists hora_replanteo time;

-- ─── Verificación ────────────────────────────────────────────

select column_name, data_type from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'fichas_medida' and column_name = 'hora_replanteo';
