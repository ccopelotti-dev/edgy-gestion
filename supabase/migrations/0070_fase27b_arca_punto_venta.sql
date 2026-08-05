-- ============================================================
-- Migración 0070: Fase 27b — ARCA con un punto de venta por local
-- Edgy Gestión
--
-- Hasta ahora clientes_arca_config.punto_venta era un entero único por
-- cliente -- toda la facturación electrónica de un negocio salía
-- siempre con el mismo número de punto de venta AFIP. Con la 27a ya
-- existe edgy_gestion.puntos_venta (uno o más locales por cliente,
-- cada uno con su propio `numero` fiscal); esta migración conecta las
-- dos cosas:
--
--  1. Backfill: todo cliente que ya tenga clientes_arca_config recibe
--     automáticamente una fila en puntos_venta con ese mismo número
--     (si todavía no tenía ninguna) -- así ningún cliente existente
--     pierde su configuración ni tiene que volver a cargar el
--     certificado.
--  2. comprobantes_venta.punto_venta_id (nullable): qué punto de venta
--     emite ESE comprobante en particular. Null = comportamiento
--     legado, se sigue resolviendo con clientes_arca_config.punto_venta
--     (el fallback que ya usaban todos los clientes de un solo local).
--
-- El certificado, CUIT y modo (homologación/producción) siguen siendo
-- por cliente en clientes_arca_config -- no hace falta cargarlos dos
-- veces aunque haya dos locales, porque el certificado autoriza al
-- CUIT completo ante ARCA, no a un punto de venta en particular.
--
-- clientes_arca_config.punto_venta NO se borra en esta migración
-- (queda como fallback legado) -- se puede limpiar en una fase de
-- housekeeping más adelante, una vez confirmado en producción que
-- todo pasa por el camino nuevo.
-- ============================================================

-- ─── 1) Backfill: un punto de venta por cada config ARCA existente ──

insert into edgy_gestion.puntos_venta (cliente_id, alias, numero, activo, por_defecto, para_integraciones)
select
  cac.cliente_id,
  'Casa Central',
  lpad(cac.punto_venta::text, 4, '0'),
  true,
  true,
  true
from edgy_gestion.clientes_arca_config cac
where not exists (
  select 1 from edgy_gestion.puntos_venta pv where pv.cliente_id = cac.cliente_id
);

-- ─── 2) Qué punto de venta emite cada comprobante ───────────────────

alter table edgy_gestion.comprobantes_venta
  add column if not exists punto_venta_id uuid references edgy_gestion.puntos_venta(id) on delete set null;
