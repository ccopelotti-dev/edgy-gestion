-- ============================================================
-- OBSOLETO -- ver Fase 56b (migración 0107)
-- ============================================================
-- La columna `cliente_id_compras` quedó sin uso al reemplazar el
-- tenant Hogar por el módulo Home Keep (Fase 56): ya no hace falta
-- cambiar de cliente_id, así que no hace falta guardar "a qué otro
-- cliente" cargar el comprobante. La reemplaza la columna `destino`
-- (texto simple: 'hogar' | null) -- ver 0107_fase56b_...sql. La
-- columna vieja se deja en la tabla (comentada como obsoleta) para no
-- romper filas históricas.
-- ============================================================
--
-- Fase 55b: destino de carga (Hogar) persistido en comprobantes_recibidos
-- ============================================================
--
-- Cuando el admin manda la foto con "hogar" de pie de foto,
-- agente-comprobante-recibir.js decide cargar el comprobante contra el
-- tenant Hogar en vez del negocio real (ver agenteComprobanteCompra.js).
-- Esa decisión hay que recordarla: si falta la forma de pago, el admin
-- responde más tarde por texto y agente-comprobante-resolver.js
-- necesita saber, en ESE segundo llamado, si tiene que seguir
-- apuntando a Hogar o al negocio de siempre -- sin este campo,
-- recalcularía mal (volvería a usar el cliente_id del admin).
--
-- null = comportamiento de siempre (se carga contra cliente_id, el
-- negocio real del admin que mandó la foto).
-- ============================================================

set search_path to edgy_gestion, public;

alter table edgy_gestion.comprobantes_recibidos
  add column if not exists cliente_id_compras uuid references edgy_gestion.clientes(id);

comment on column edgy_gestion.comprobantes_recibidos.cliente_id_compras is
  'Tenant contra el que se carga el comprobante en Compras. NULL = usar cliente_id (comportamiento default). Distinto de cliente_id cuando el admin desvía el gasto a otro tenant (ej. "hogar" en el pie de foto -> tenant Hogar).';
