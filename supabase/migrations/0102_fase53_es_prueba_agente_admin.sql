-- ============================================================
-- Migración 0102: Fase 53 -- Marca de "prueba" en el canal
-- administrativo del agente de WhatsApp
-- Edgy Gestión · schema edgy_gestion
--
-- Antes de perfilar la Tarea #149 (extraer datos del comprobante y
-- cargarlo en Compras), Carlos pidió poder simular el flujo completo
-- sin mezclar esos comprobantes de prueba con comprobantes reales --
-- para poder borrarlos después sin dudar.
--
-- Mecanismo elegido (29/08): un número de WhatsApp dedicado a pruebas,
-- dado de alta en `clientes_agente_admins` con `solo_prueba = true`.
-- Todo lo que llegue desde ese número se guarda automáticamente
-- marcado `es_prueba = true`, tanto en `comprobantes_recibidos` (la
-- bandeja de entrada, ver 0100) como -- más adelante, cuando la Tarea
-- #149 esté implementada -- en el `comprobantes_compra` que se genere
-- a partir de él. No depende de que alguien se acuerde de escribir
-- nada en el mensaje ni de prender/apagar un switch.
-- ============================================================

alter table edgy_gestion.clientes_agente_admins
  add column if not exists solo_prueba boolean not null default false;

comment on column edgy_gestion.clientes_agente_admins.solo_prueba is
  'Si es true, todo lo que mande este número por el canal administrativo del agente se guarda marcado como es_prueba=true (comprobantes_recibidos y, más adelante, comprobantes_compra) -- pensado para simular el flujo sin ensuciar datos reales.';

alter table edgy_gestion.comprobantes_recibidos
  add column if not exists es_prueba boolean not null default false;

alter table edgy_gestion.comprobantes_compra
  add column if not exists es_prueba boolean not null default false;

comment on column edgy_gestion.comprobantes_recibidos.es_prueba is
  'Heredado de clientes_agente_admins.solo_prueba al momento de recibir el documento -- true si vino de un número de WhatsApp dado de alta solo para simulaciones.';

comment on column edgy_gestion.comprobantes_compra.es_prueba is
  'true si el comprobante se generó a partir de un comprobantes_recibidos marcado como prueba (ver Tarea #149) -- permite borrar todo lo simulado con un solo filtro, sin tocar comprobantes reales.';

create index if not exists idx_comprobantes_recibidos_es_prueba
  on edgy_gestion.comprobantes_recibidos (cliente_id, es_prueba)
  where es_prueba = true;

create index if not exists idx_comprobantes_compra_es_prueba
  on edgy_gestion.comprobantes_compra (cliente_id, es_prueba)
  where es_prueba = true;

-- ─── Verificación ────────────────────────────────────────────

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'edgy_gestion'
  and table_name in ('clientes_agente_admins', 'comprobantes_recibidos', 'comprobantes_compra')
  and column_name in ('solo_prueba', 'es_prueba')
order by table_name, column_name;
