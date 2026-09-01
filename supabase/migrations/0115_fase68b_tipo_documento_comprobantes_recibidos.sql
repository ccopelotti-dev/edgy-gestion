-- Fase 68b -- clasificación factura vs. ticket de pago (agente de WhatsApp).
--
-- El agente venía tratando cualquier imagen recibida por WhatsApp como
-- una factura de compra, incluso cuando en realidad era la foto de un
-- comprobante de pago (transferencia, Mercado Pago, etc.) -- eso generó
-- comprobantes de compra "basura" (ver incidente del 01/09 con un ticket
-- de pago QR de Mercado Pago cargado como si fuera una factura nueva).
--
-- Esta columna guarda la clasificación que ahora hace la IA de visión
-- (ver n8n: prompt de "Extraer Datos Comprobante {Tenant}") ANTES de
-- intentar cargar nada en Compras/Home Keep.
alter table edgy_gestion.comprobantes_recibidos
  add column tipo_documento text;

alter table edgy_gestion.comprobantes_recibidos
  add constraint comprobantes_recibidos_tipo_documento_check
  check (tipo_documento is null or tipo_documento in ('factura', 'ticket_pago', 'otro'));

comment on column edgy_gestion.comprobantes_recibidos.tipo_documento is
  'Fase 68b: clasificacion de la imagen recibida por WhatsApp. NULL = no clasificado aun (comprobantes viejos, se tratan como factura). factura = comprobante de compra a cargar en Compras/Home Keep. ticket_pago = comprobante de una transferencia/pago (Mercado Pago, transferencia bancaria, etc.), no se carga como factura -- queda pendiente para vincular a un pago existente (ver Fase 68c). otro = no es ninguno de los dos casos anteriores.';
