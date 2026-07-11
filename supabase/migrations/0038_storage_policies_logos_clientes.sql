-- ============================================================
-- Migración 0038: Políticas de Storage para el bucket "logos-clientes"
-- Edgy Gestión
--
-- Contexto: el bucket "logos-clientes" se creó a mano (probablemente
-- vía el dashboard de Supabase) en algún momento anterior a la
-- convención de migraciones para Storage de este repo -- no hay
-- ningún registro de su creación ni de sus políticas en el historial
-- de migraciones. Storage.objects tiene RLS activado por defecto en
-- Supabase, así que sin una policy de INSERT explícita para
-- 'authenticated', la subida de logo SIEMPRE falló en silencio desde
-- la app (tanto en el onboarding original -- src/pages/onboarding/
-- NuevoProyecto.tsx -- como ahora en Configuración > Empresa, Fase
-- 10a). subirLogo() en Empresa.tsx devuelve null en error sin
-- mostrar ningún mensaje, por eso pasó desapercibido.
--
-- El logo que en su momento SÍ se veía para un cliente real (ej. "La
-- Charcutería Express") casi seguro se cargó a mano por Storage UI
-- del dashboard (con rol de servicio, que bypassea RLS) -- no a
-- través del wizard ni de la app.
-- ============================================================

-- Asegura que el bucket exista y sea público para lectura (necesario
-- para que las URLs devueltas por getPublicUrl() funcionen sin firmar).
insert into storage.buckets (id, name, public)
values ('logos-clientes', 'logos-clientes', true)
on conflict (id) do update set public = true;

-- Lectura pública: cualquiera con la URL puede ver el logo (son logos
-- de negocios, no hay dato sensible acá).
drop policy if exists "logos_clientes_lectura_publica" on storage.objects;
create policy "logos_clientes_lectura_publica"
on storage.objects for select
to public
using (bucket_id = 'logos-clientes');

-- Escritura para cualquier usuario autenticado. No hace falta acotar
-- por cliente_id: el nombre de archivo ya incluye un timestamp único
-- (Date.now()), y para llegar a esta pantalla ya se pasó por login.
drop policy if exists "logos_clientes_escritura_autenticados" on storage.objects;
create policy "logos_clientes_escritura_autenticados"
on storage.objects for insert
to authenticated
with check (bucket_id = 'logos-clientes');

-- Actualización y borrado para autenticados (por si más adelante se
-- agrega "quitar logo" o resubir con el mismo nombre de archivo).
drop policy if exists "logos_clientes_actualizacion_autenticados" on storage.objects;
create policy "logos_clientes_actualizacion_autenticados"
on storage.objects for update
to authenticated
using (bucket_id = 'logos-clientes')
with check (bucket_id = 'logos-clientes');

drop policy if exists "logos_clientes_borrado_autenticados" on storage.objects;
create policy "logos_clientes_borrado_autenticados"
on storage.objects for delete
to authenticated
using (bucket_id = 'logos-clientes');

-- ─── Verificación ────────────────────────────────────────────

select id, name, public from storage.buckets where id = 'logos-clientes';

select policyname, cmd, roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'logos_clientes_%'
order by policyname;
