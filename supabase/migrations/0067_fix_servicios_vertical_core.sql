-- ============================================================
-- Fix: módulo "Servicios" con vertical incorrecto
-- Edgy Gestión · Núcleo (modulos.vertical)
-- ============================================================
--
-- El módulo 'servicios' nunca se insertó vía una migración versionada
-- (no aparece en 0001_init.sql ni en ningún insert posterior a
-- edgy_gestion.modulos) -- se cargó directo en la base en algún momento,
-- con un vertical distinto de 'core'. Como el Sidebar (Fase 25) agrupa
-- por `vertical` y le da un recuadro de color propio a cualquier valor
-- que no sea 'core', Servicios terminó con su propio recuadro suelto en
-- vez de aparecer junto al resto del núcleo (Tesorería, Productos y
-- stock, Ventas, Compras, etc.) -- que es donde conceptualmente
-- pertenece: es un módulo de negocio general, no parte de ningún kit
-- vertical (gastronómico, transporte, etc.).
-- ============================================================

set search_path to edgy_gestion, public;

update edgy_gestion.modulos
  set vertical = 'core'
  where slug = 'servicios' and vertical <> 'core';

-- ─── Verificación ────────────────────────────────────────────

select slug, nombre, vertical from edgy_gestion.modulos order by vertical, slug;
