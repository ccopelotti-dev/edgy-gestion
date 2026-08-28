-- ============================================================
-- Migración 0101: Fase 50d -- Agente como canal de salida
-- (envío de documentos de Ventas por WhatsApp, no solo recepción)
-- Edgy Gestión · schema edgy_gestion
-- ============================================================
--
-- Hasta ahora `clientes_agente_config` solo describía el número que
-- RECIBE mensajes (Capa 1/3 del agente entrante). Para que el panel
-- pueda mandar un PDF (Presupuesto, Ficha, Comprobante, etc.) como
-- documento adjunto por WhatsApp usando esa misma instancia de
-- Evolution API, hace falta guardar acá el nombre de la instancia y su
-- apikey -- son datos de infraestructura del VPS, no del negocio, así
-- que viven en la misma tabla que ya representa "el canal de WhatsApp
-- de este tenant" en vez de crear una tabla nueva.

alter table edgy_gestion.clientes_agente_config
  add column if not exists evolution_instance_nombre text,
  add column if not exists evolution_instance_apikey text;
