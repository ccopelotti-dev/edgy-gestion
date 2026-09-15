-- ============================================================
-- Migración 0144 (Fase 77, 15/09): "Conector" público para landings
-- externas -- Edgy Gestión
--
-- Contexto: Carlos pidió dejar preparado un conector por si en el
-- futuro alguien (con su propio desarrollador) quiere armar una landing
-- propia para un cliente, tomando TODO lo que hay en el catálogo --
-- sin depender de este repo ni de tener acceso a él.
--
-- No hay nada nuevo que construir en la parte pesada: el Catálogo
-- Público (Menú QR, ver 0020/0072) ya expone categorías, productos con
-- precio real e imagen, y combos, sin login, vía
-- edgy_gestion.menu_publico(slug). Esta migración solo:
--
--   1. Junta ese catálogo con lo que ya expone el módulo Landing
--      (foto de portada, contraste, promo -- ver 0143) en un ÚNICO
--      llamado, para que un desarrollador externo no tenga que hacer
--      dos requests ni enterarse de que son dos módulos separados.
--   2. Es genérico por slug -- sirve para CUALQUIER cliente que tenga
--      catálogo y/o landing activados, no solo La Charcutería.
--
-- No reescribe la lógica de menu_publico/landing_publica -- las llama
-- y combina el resultado, para no duplicar código ni arriesgar que
-- diverjan con el tiempo.
-- ============================================================

create or replace function edgy_gestion.conector_landing(p_slug text, p_punto_venta_slug text)
returns jsonb
language sql
stable
security definer
set search_path = edgy_gestion, public
as $$
  select jsonb_build_object(
    'negocio', (edgy_gestion.menu_publico(p_slug, p_punto_venta_slug))->'cliente',
    'categorias', (edgy_gestion.menu_publico(p_slug, p_punto_venta_slug))->'categorias',
    'combos', (edgy_gestion.menu_publico(p_slug, p_punto_venta_slug))->'combos',
    -- landing_publica devuelve `json` (no jsonb) y puede devolver NULL
    -- si ese cliente no tiene el módulo Landing activado o nunca
    -- guardó nada todavía -- se deja explícito como null en el JSON de
    -- salida en vez de omitir la clave, para que el desarrollador
    -- externo no tenga que adivinar si la clave puede faltar.
    'landing', coalesce(edgy_gestion.landing_publica(p_slug)::jsonb, 'null'::jsonb)
  );
$$;

grant execute on function edgy_gestion.conector_landing(text, text) to anon, authenticated;

-- Overload de un solo parámetro (sin punto de venta) -- mismo criterio
-- que menu_publico(text): delega en el de dos parámetros pasando null,
-- para el caso común de un cliente de un solo local.
create or replace function edgy_gestion.conector_landing(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = edgy_gestion, public
as $$
  select edgy_gestion.conector_landing(p_slug, null::text);
$$;

grant execute on function edgy_gestion.conector_landing(text) to anon, authenticated;

-- ─── Verificación ────────────────────────────────────────────

select edgy_gestion.conector_landing('la-charcuteria-express');
