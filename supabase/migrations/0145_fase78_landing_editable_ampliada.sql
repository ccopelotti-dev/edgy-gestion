-- ============================================================
-- Migración 0145 (Fase 78, 15/09): módulo "Landing" -- más libertad
-- de edición, sin salirse del alcance "básico"
-- Edgy Gestión
--
-- Contexto: el panel de Landing (0143) solo dejaba tocar foto+contraste
-- del hero y una promo. Carlos pidió sumar, sección por sección:
--
--   - Hero: título, bajada, y el destino del botón principal (ir al
--     catálogo QR real del negocio, o a un producto puntual por
--     WhatsApp) + el número de WhatsApp del negocio (hoy hardcodeado
--     en el HTML de la landing estática).
--   - Nosotros: foto + los dos párrafos de texto.
--   - Nuestros productos: NO es texto libre -- se eligen productos
--     reales del catálogo (checklist), así el nombre/precio/imagen que
--     se ve en la landing siempre sale del catálogo real y nunca puede
--     desincronizarse (mismo motivo por el que se corrigieron los
--     nombres de producto la semana pasada).
--   - Tienda de Picadas -> generalizada como "Galería": título+bajada
--     editables (con default "Tienda de Picadas" para no romper la
--     landing actual) + un set de fotos que el operador sube y
--     ordena. Sin nada de "picada" cableado -- sirve para cualquier
--     comercio gastronómico.
--
-- No se crea tabla nueva ni bucket nuevo: son columnas nuevas sobre
-- edgy_gestion.landing_config (0143) y el mismo bucket
-- "landing-imagenes" ya expuesto. Tampoco se toca conector_landing
-- (0144) -- envuelve landing_publica()::jsonb tal cual, así que los
-- campos nuevos viajan solos sin tener que tocar ese archivo.
-- ============================================================

-- ─── 1. Columnas nuevas ─────────────────────────────────────────────

alter table edgy_gestion.landing_config
  add column if not exists whatsapp_numero text,
  add column if not exists hero_titulo text,
  add column if not exists hero_bajada text,
  add column if not exists hero_cta_tipo text not null default 'catalogo'
    check (hero_cta_tipo in ('catalogo', 'producto')),
  add column if not exists hero_cta_producto_id uuid references edgy_gestion.productos(id) on delete set null,
  add column if not exists nosotros_titulo text,
  add column if not exists nosotros_texto1 text,
  add column if not exists nosotros_texto2 text,
  add column if not exists nosotros_imagen_url text,
  -- Ids de productos reales elegidos para "Nuestros productos", en el
  -- orden en que se muestran. El nombre/precio/imagen NO se copian acá
  -- -- se resuelven en el momento contra el catálogo real (menu_publico),
  -- así nunca quedan desactualizados.
  add column if not exists productos_destacados_ids uuid[] not null default '{}'::uuid[],
  add column if not exists galeria_titulo text,
  add column if not exists galeria_bajada text,
  -- Array ordenado de URLs (bucket landing-imagenes). jsonb y no
  -- text[] para no tener que migrar de nuevo el día que haga falta
  -- guardar algo más por foto (ej. un alt de texto).
  add column if not exists galeria_imagenes jsonb not null default '[]'::jsonb;

-- ─── 2. landing_publica: expone los campos nuevos ───────────────────
-- Mismo criterio que 0143: solo lo que la landing pública necesita.
-- productosDestacadosIds viaja como array de ids -- el estático los
-- resuelve contra `categorias` (que ya trae conector_landing) para no
-- duplicar el cálculo de precio acá.

create or replace function edgy_gestion.landing_publica(p_slug text)
returns json
language plpgsql
security definer
stable
set search_path to 'edgy_gestion', 'public', 'pg_temp'
as $$
declare
  v_cliente_id uuid;
  v_row edgy_gestion.landing_config%rowtype;
begin
  select id into v_cliente_id from edgy_gestion.clientes where slug = p_slug;
  if v_cliente_id is null then
    return null;
  end if;

  select * into v_row from edgy_gestion.landing_config where cliente_id = v_cliente_id;
  if not found then
    return null;
  end if;

  return json_build_object(
    'heroImagenUrl', v_row.hero_imagen_url,
    'heroContraste', v_row.hero_contraste,
    'heroTitulo', v_row.hero_titulo,
    'heroBajada', v_row.hero_bajada,
    'heroCtaTipo', v_row.hero_cta_tipo,
    'heroCtaProductoId', v_row.hero_cta_producto_id,
    'whatsappNumero', v_row.whatsapp_numero,
    'promoActiva', v_row.promo_activa,
    'promoTitulo', case when v_row.promo_activa then v_row.promo_titulo else null end,
    'promoTexto', case when v_row.promo_activa then v_row.promo_texto else null end,
    'nosotrosTitulo', v_row.nosotros_titulo,
    'nosotrosTexto1', v_row.nosotros_texto1,
    'nosotrosTexto2', v_row.nosotros_texto2,
    'nosotrosImagenUrl', v_row.nosotros_imagen_url,
    'productosDestacadosIds', to_json(v_row.productos_destacados_ids),
    'galeriaTitulo', v_row.galeria_titulo,
    'galeriaBajada', v_row.galeria_bajada,
    'galeriaImagenes', v_row.galeria_imagenes
  );
end;
$$;

grant execute on function edgy_gestion.landing_publica(text) to anon, authenticated;

-- ─── Verificación ────────────────────────────────────────────
select edgy_gestion.conector_landing('la-charcuteria-express');
