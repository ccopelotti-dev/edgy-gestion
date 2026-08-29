-- ============================================================
-- Migración 0103: Fase 54 -- Agente administrativo carga
-- comprobantes en Compras (Tarea #149)
-- Edgy Gestión · schema edgy_gestion
--
-- Acordado con Carlos el 29/08: cuando el agente recibe una foto de un
-- comprobante (combustible, servicios, etc.) por el canal
-- administrativo, intenta extraer los datos con una IA de visión y
-- cargar directo en `comprobantes_compra` -- pero SOLO si logra
-- resolver dos cosas: quién es el proveedor (match exacto por CUIT) y
-- la forma de pago (Contado / Cuenta Corriente). Si algo de eso falta,
-- el comprobante se queda en la bandeja (`comprobantes_recibidos`)
-- para completar a mano -- nunca se inventa un proveedor ni se asume
-- la forma de pago.
--
-- `pendiente_aclaracion`: cuando la IA no pudo determinar la forma de
-- pago, el agente le pregunta directo al admin que mandó la foto por
-- el mismo chat de WhatsApp. Esta columna guarda QUÉ le está
-- preguntando (hoy solo 'forma_pago') para poder interpretar la
-- respuesta cuando llegue como el próximo mensaje de texto de ese
-- número, en vez de tratarlo como un comprobante nuevo.
--
-- `comprobante_compra_id`: trazabilidad -- si el agente efectivamente
-- generó el comprobante en Compras a partir de este documento, queda
-- linkeado acá (además de la nota de texto en comprobantes_compra.notas
-- que ya se agrega desde el código).
-- ============================================================

alter table edgy_gestion.comprobantes_recibidos
  add column if not exists pendiente_aclaracion text
    check (pendiente_aclaracion is null or pendiente_aclaracion in ('forma_pago')),
  add column if not exists comprobante_compra_id uuid references edgy_gestion.comprobantes_compra(id) on delete set null;

comment on column edgy_gestion.comprobantes_recibidos.pendiente_aclaracion is
  'Si no es null, el agente le preguntó al admin algo puntual (hoy: forma_pago) y está esperando la respuesta como próximo mensaje de texto de ese número antes de poder cargar el comprobante en Compras.';

comment on column edgy_gestion.comprobantes_recibidos.comprobante_compra_id is
  'Si el agente logró cargar este documento en Compras automáticamente, acá queda el id del comprobante generado.';

create index if not exists idx_comprobantes_recibidos_pendiente_aclaracion
  on edgy_gestion.comprobantes_recibidos (cliente_id, admin_id, pendiente_aclaracion)
  where pendiente_aclaracion is not null;

-- ─── Verificación ────────────────────────────────────────────

select column_name, data_type
from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'comprobantes_recibidos'
  and column_name in ('pendiente_aclaracion', 'comprobante_compra_id');
