-- ============================================================
-- Fase 23b: cadete asignado al despacho + cobro contra entrega
-- Edgy Gestión · Ventas
-- ============================================================
--
-- Contexto: Fase 21 agregó el despacho/logística de una Orden
-- (estado_logistica/proveedor_logistica/numero_seguimiento/
-- url_seguimiento/fecha_despacho, ver 0061_ordenes_venta_logistica.sql)
-- pero no identifica QUIÉN hizo la entrega ni si esa entrega implica
-- cobrar en efectivo al cliente. Fase 23 (análisis de cobro) agrega
-- esa pieza: cuando el reparto es "propio" (no un tercero como Rappi/
-- PedidosYa), se puede asignar un cadete (una fila de
-- `usuarios_cliente` del mismo tenant) y marcar si ese pedido cobra
-- contra entrega -- lo que lo deja pendiente de "rendición" (Fase 23c,
-- todavía no construida en esta migración).
--
-- `cadete_id` es una FK simple a `usuarios_cliente` (mismo patrón que
-- `turnos_caja.usuario_apertura_id`/`usuario_cierre_id`, ver
-- 0018_gastronomico_nucleo.sql) -- no hace falta ampliar el rol de
-- `usuarios_cliente`: desde 0003_consolidado_v2_a_v8.sql (v8) el campo
-- `rol` es texto libre sin check constraint (el dato real vive en
-- `rol_id` -> `roles.nombre`), así que cualquier empleado puede
-- asignarse como cadete sin necesidad de migrar nada ahí.
--
-- No se agregan policies RLS nuevas: son columnas nuevas en una tabla
-- ya cubierta por el RLS existente de `ordenes_venta` (Fase 8a).

set search_path to edgy_gestion, public;

alter table edgy_gestion.ordenes_venta
  add column if not exists cadete_id uuid references edgy_gestion.usuarios_cliente(id),
  add column if not exists cobra_contra_entrega boolean not null default false;
