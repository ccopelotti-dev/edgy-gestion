-- ============================================================
-- Migración 0143 (Fase 76, 14/09): módulo "Landing"
-- Edgy Gestión
--
-- Contexto: La Charcutería ya tiene una landing propia (sitio estático
-- en GitHub Pages, repo aparte "la-charcuteria-landing", fuera de este
-- repo). Carlos pidió un panel BÁSICO para que un operador humano
-- pueda, sin tocar código ni hacer git push:
--   - cambiar la foto del hero (subir una nueva)
--   - ajustar el contraste de esa foto
--   - prender/apagar una promo con título y texto corto
--
-- La landing estática no tiene backend propio, así que el mecanismo
-- elegido es el MISMO patrón que ya usa "menu-qr" (ver
-- 0020_menu_qr.sql): una función SECURITY DEFINER que arma un JSON
-- acotado y se le da permiso de ejecutar a `anon`, en vez de abrir RLS
-- de SELECT público sobre la tabla real. La landing hace un fetch a
-- esa función al cargar la página (ver charcuteria-landing/index.html)
-- y listo -- el cambio se ve al instante, sin redeploy.
--
-- El panel de edición vive ACÁ, adentro de edgy-gestion, como un
-- módulo más (mismo login, mismos permisos por rol que ya usa Home
-- Keep) -- no es un tenant aparte ni un login aparte.
-- ============================================================

-- ─── 1. Alta del módulo + activación solo para La Charcutería ──────

insert into edgy_gestion.modulos (id, nombre, slug, vertical, descripcion)
values (
  'b7d3f1a2-4e6c-4b8a-9f21-6c5d8a3e7b90',
  'Landing',
  'landing',
  -- 'core' y no un vertical de negocio: Modulo.vertical es
  -- `TipoNegocio | 'core'` en el frontend (src/types/index.ts) y
  -- Landing no es un kit de ningún rubro puntual, es una utilidad.
  'core',
  'Panel básico para editar la foto de portada, el contraste y la promo activa de la landing pública del negocio.'
)
on conflict (id) do nothing;

insert into edgy_gestion.cliente_modulos (cliente_id, modulo_id, activo, activado_en)
select c.id, m.id, true, now()
from edgy_gestion.clientes c
cross join (select id from edgy_gestion.modulos where slug = 'landing') m
where c.id = '4dc63cde-f1f9-4f73-9ea8-d46a77c4825b'
  and not exists (
    select 1 from edgy_gestion.cliente_modulos cm
    where cm.cliente_id = c.id and cm.modulo_id = m.id
  );

-- ─── 2. Tabla de configuración (una fila por cliente) ──────────────

create table if not exists edgy_gestion.landing_config (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null unique references edgy_gestion.clientes(id) on delete cascade,
  hero_imagen_url text,
  hero_contraste integer not null default 100 check (hero_contraste between 50 and 200),
  promo_titulo text,
  promo_texto text,
  promo_activa boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table edgy_gestion.landing_config enable row level security;

drop policy if exists landing_config_select on edgy_gestion.landing_config;
create policy landing_config_select
on edgy_gestion.landing_config for select
to authenticated
using (
  cliente_id = (select uc.cliente_id from edgy_gestion.usuarios_cliente uc where uc.user_id = auth.uid())
  and edgy_gestion.tiene_permiso('landing', 'lectura')
);

drop policy if exists landing_config_insert on edgy_gestion.landing_config;
create policy landing_config_insert
on edgy_gestion.landing_config for insert
to authenticated
with check (
  cliente_id = (select uc.cliente_id from edgy_gestion.usuarios_cliente uc where uc.user_id = auth.uid())
  and edgy_gestion.tiene_permiso('landing', 'escritura')
);

drop policy if exists landing_config_update on edgy_gestion.landing_config;
create policy landing_config_update
on edgy_gestion.landing_config for update
to authenticated
using (
  cliente_id = (select uc.cliente_id from edgy_gestion.usuarios_cliente uc where uc.user_id = auth.uid())
  and edgy_gestion.tiene_permiso('landing', 'escritura')
)
with check (
  cliente_id = (select uc.cliente_id from edgy_gestion.usuarios_cliente uc where uc.user_id = auth.uid())
  and edgy_gestion.tiene_permiso('landing', 'escritura')
);

-- ─── 3. Función pública (mismo patrón que menu_publico) ────────────
-- Solo expone los 4 campos que la landing necesita -- nunca cliente_id,
-- ni id de fila, ni updated_at.

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
    'promoActiva', v_row.promo_activa,
    'promoTitulo', case when v_row.promo_activa then v_row.promo_titulo else null end,
    'promoTexto', case when v_row.promo_activa then v_row.promo_texto else null end
  );
end;
$$;

grant execute on function edgy_gestion.landing_publica(text) to anon, authenticated;

-- ─── 4. Storage bucket para la foto del hero ───────────────────────
-- Mismo criterio que logos-clientes (0038): lectura pública (necesaria
-- para que la URL funcione sin firmar en un sitio estático externo),
-- escritura para cualquier autenticado (ya pasó por login + el guard
-- de permiso del módulo del lado de la app).

insert into storage.buckets (id, name, public)
values ('landing-imagenes', 'landing-imagenes', true)
on conflict (id) do update set public = true;

drop policy if exists "landing_imagenes_lectura_publica" on storage.objects;
create policy "landing_imagenes_lectura_publica"
on storage.objects for select
to public
using (bucket_id = 'landing-imagenes');

drop policy if exists "landing_imagenes_escritura_autenticados" on storage.objects;
create policy "landing_imagenes_escritura_autenticados"
on storage.objects for insert
to authenticated
with check (bucket_id = 'landing-imagenes');

drop policy if exists "landing_imagenes_actualizacion_autenticados" on storage.objects;
create policy "landing_imagenes_actualizacion_autenticados"
on storage.objects for update
to authenticated
using (bucket_id = 'landing-imagenes')
with check (bucket_id = 'landing-imagenes');

drop policy if exists "landing_imagenes_borrado_autenticados" on storage.objects;
create policy "landing_imagenes_borrado_autenticados"
on storage.objects for delete
to authenticated
using (bucket_id = 'landing-imagenes');

-- ─── Verificación ────────────────────────────────────────────

select slug, nombre from edgy_gestion.modulos where slug = 'landing';
select cliente_id, activo from edgy_gestion.cliente_modulos cm
  join edgy_gestion.modulos m on m.id = cm.modulo_id
  where m.slug = 'landing';
select id, name, public from storage.buckets where id = 'landing-imagenes';
