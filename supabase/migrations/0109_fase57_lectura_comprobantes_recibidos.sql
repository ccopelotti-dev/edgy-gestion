-- ============================================================
-- Fase 57: RLS de lectura en comprobantes_recibidos
-- ============================================================
--
-- Hasta ahora comprobantes_recibidos (la "bandeja" del agente de
-- WhatsApp) solo la leían las Netlify Functions con service_role --
-- tenía RLS habilitado pero SIN ninguna policy, así que el frontend
-- (con el usuario logueado) no podía leer ni una fila. Hace falta para
-- poder mostrar, desde Comprobantes (Compras y Home Keep), la imagen
-- original que mandó el admin por WhatsApp y a partir de la cual se
-- cargó el comprobante.
-- ============================================================

set search_path to edgy_gestion, public;

create policy "Lectura interna de comprobantes_recibidos" on edgy_gestion.comprobantes_recibidos
  for select using (edgy_gestion.es_personal_edgy() or cliente_id = edgy_gestion.cliente_del_usuario_actual());
