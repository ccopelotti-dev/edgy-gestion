-- ============================================================
-- Migración 0081: Fix -- cliente_venta_id no puede ser NOT NULL
-- Edgy Gestión
--
-- Bug real detectado en producción (Punto Tex, prueba de facturación
-- ARCA): "Consumidor Final" es un cliente virtual (types/index.ts,
-- CONSUMIDOR_FINAL_ID = '__consumidor_final__') que NUNCA se persiste
-- en clientes_venta -- a propósito, es un cliente de ventas rápidas
-- sin ficha. Pero comprobantes_venta.cliente_venta_id es `uuid NOT
-- NULL`, así que cualquier INSERT de un comprobante facturado a
-- Consumidor Final fallaba en silencio (Postgres: "invalid input
-- syntax for type uuid: __consumidor_final__"), sin llegar nunca a la
-- base ni a ARCA -- el store.tsx del cliente hace fire-and-forget con
-- el insert (logErr solo hace console.error), así que la UI seguía
-- mostrando "factura generada" sin que nada se hubiera guardado.
--
-- El código ya tenía esClienteReal() para este caso exacto (se usa en
-- ADD_CLIENTE/UPDATE_CLIENTE/etc.) pero nunca se aplicó al guardar
-- comprobantes. Este fix de datos habilita el null; el fix de código
-- (comprobanteToRow en store.tsx) va en el mismo commit.
-- ============================================================

alter table edgy_gestion.comprobantes_venta
  alter column cliente_venta_id drop not null;
