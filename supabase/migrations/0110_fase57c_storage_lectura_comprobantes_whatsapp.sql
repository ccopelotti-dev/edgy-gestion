-- ============================================================
-- Fase 57c: lectura de Storage para imágenes del agente de WhatsApp
-- ============================================================
--
-- Las imágenes subidas por el agente de WhatsApp (Tarea #149,
-- agente-comprobante-recibir.js) quedan en
-- "whatsapp-admin/<cliente_id>/...", NO en "<cliente_id>/..." como las
-- de Gastos Fijos (modules/gastos-fijos/lib/comprobantesGastos.ts) --
-- por eso la policy de lectura original del bucket "comprobantes-gastos"
-- (que solo miraba el PRIMER segmento de la ruta) las bloqueaba, y el
-- frontend no podía firmar la URL para la miniatura/lightbox de la
-- Fase 57/57b (fallaba en silencio: sin error visible, simplemente no
-- aparecía la miniatura).
-- ============================================================

drop policy if exists "comprobantes_gastos_lectura" on storage.objects;
create policy "comprobantes_gastos_lectura" on storage.objects
  for select using (
    bucket_id = 'comprobantes-gastos' and (
      edgy_gestion.es_personal_edgy()
      or (storage.foldername(name))[1] = (edgy_gestion.cliente_del_usuario_actual())::text
      or (
        (storage.foldername(name))[1] = 'whatsapp-admin'
        and (storage.foldername(name))[2] = (edgy_gestion.cliente_del_usuario_actual())::text
      )
    )
  );

drop policy if exists "comprobantes_gastos_borrado" on storage.objects;
create policy "comprobantes_gastos_borrado" on storage.objects
  for delete using (
    bucket_id = 'comprobantes-gastos' and (
      edgy_gestion.es_personal_edgy()
      or (storage.foldername(name))[1] = (edgy_gestion.cliente_del_usuario_actual())::text
      or (
        (storage.foldername(name))[1] = 'whatsapp-admin'
        and (storage.foldername(name))[2] = (edgy_gestion.cliente_del_usuario_actual())::text
      )
    )
  );
