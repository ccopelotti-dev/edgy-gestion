-- ============================================================
-- Migración 0069: Fase 27a — Puntos de venta (base multi-local)
-- Edgy Gestión
--
-- Contexto: un mismo cliente (mismo CUIT, un solo titular) puede tener
-- más de un local -- ej. Punto Tex (sedería/cortinas/blanco) y Rúa
-- (deco textil), cada uno facturando con su propio punto de venta de
-- ARCA. Hasta ahora todo el esquema asumía 1 cliente = 1 negocio = 1
-- local; esta migración agrega esa noción DENTRO de un mismo cliente,
-- sin romper nada para los clientes existentes (siguen sin ninguna
-- fila acá y funcionan exactamente igual que hoy).
--
-- IMPORTANTE -- esto NO es una tabla nueva de "sucursales": ya existía
-- pensado un concepto para esto, `puntos_venta`, con pantalla propia
-- en Configuración > Facturación (src/modules/configuracion/pages/
-- PuntosVenta.tsx + usePuntosVenta.ts) y el diseño ya documentado en
-- src/modules/configuracion/types/index.ts: "unifica 'sucursal' y
-- 'punto de venta ARCA' en una sola entidad, igual que lo hace
-- Contabilium". Esa pantalla llamaba a supabase.from('puntos_venta')
-- pero la tabla NUNCA llegó a tener una migración versionada -- no
-- existe en la base real. Esta migración la crea por primera vez, con
-- las columnas exactas que ya esperaba ese código (alias, numero,
-- direccion, activo, por_defecto, para_integraciones, fecha_baja) --
-- de paso arregla una pantalla que estaba rota en producción.
--
-- Esta es la base (27a) de una fase más grande (27a-27f): acá se crea
-- el catálogo y la restricción de acceso por punto de venta a nivel de
-- usuario. La numeración de comprobantes, el catálogo compartido/
-- exclusivo y el stock por punto de venta se resuelven en sub-fases
-- posteriores. La unificación con clientes_arca_config.punto_venta
-- (hoy un entero suelto, 1 por cliente) se resuelve en la 27b.
-- ============================================================

-- ─── Catálogo de puntos de venta ────────────────────────────

create table if not exists edgy_gestion.puntos_venta (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  alias text not null,
  numero text,
  direccion text,
  activo boolean not null default true,
  por_defecto boolean not null default false,
  para_integraciones boolean not null default false,
  fecha_baja timestamptz,
  created_at timestamptz not null default now()
);

-- El número fiscal (AFIP) no debería repetirse dentro del mismo
-- cliente -- es lo que espera usePuntosVenta.ts al interpretar un
-- 23505 como "Ya existe un punto de venta con ese número". Nullable
-- (numero es opcional hasta conectar facturación electrónica), por
-- eso el índice es parcial.
create unique index if not exists puntos_venta_cliente_numero_uniq
  on edgy_gestion.puntos_venta (cliente_id, numero)
  where numero is not null;

alter table edgy_gestion.puntos_venta enable row level security;

-- Cualquier usuario del cliente puede LEER la lista (la necesita el
-- selector que se agrega en 27c, incluso un usuario restringido a un
-- solo punto de venta tiene que poder ver su propio nombre/alias).
create policy "puntos_venta_select_propio" on edgy_gestion.puntos_venta
  for select using (
    edgy_gestion.es_personal_edgy()
    or cliente_id = edgy_gestion.cliente_actual_id()
  );

-- Alta/edición/baja queda reservada al admin del propio cliente (mismo
-- criterio que roles_insert_admin/etc.) -- es una decisión estructural
-- del negocio, no una tarea operativa del día a día.
create policy "puntos_venta_insert_admin" on edgy_gestion.puntos_venta
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_actual_id() and edgy_gestion.es_admin_cliente())
  );

create policy "puntos_venta_update_admin" on edgy_gestion.puntos_venta
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_actual_id() and edgy_gestion.es_admin_cliente())
  )
  with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_actual_id() and edgy_gestion.es_admin_cliente())
  );

create policy "puntos_venta_delete_admin" on edgy_gestion.puntos_venta
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_actual_id() and edgy_gestion.es_admin_cliente())
  );

-- ─── Restricción de acceso por punto de venta ───────────────
--
-- NULL = acceso global (ve/opera todos los puntos de venta del cliente
-- -- así queda cualquier usuario existente hoy, sin cambiar nada para
-- ellos). Un valor puntual = ese usuario queda limitado a ese punto de
-- venta específico en las pantallas/datos que en fases posteriores
-- empiecen a filtrar por punto de venta (comprobantes, stock, caja).
--
-- No es lo mismo que es_admin: un empleado NO admin puede tener
-- punto_venta_id null (acceso global) si así lo decide el dueño, y
-- viceversa -- son dos restricciones independientes.
alter table edgy_gestion.usuarios_cliente
  add column if not exists punto_venta_id uuid references edgy_gestion.puntos_venta(id) on delete set null;

-- ─── Función: punto de venta asignado al usuario actual ─────
--
-- Mismo patrón que cliente_actual_id() -- helper para las policies de
-- RLS que en las próximas sub-fases empiecen a filtrar por punto de
-- venta.
create or replace function edgy_gestion.punto_venta_del_usuario_actual()
returns uuid
language sql
security definer
stable
as $$
  select punto_venta_id
  from edgy_gestion.usuarios_cliente
  where user_id = auth.uid()
  limit 1;
$$;

-- ─── Completa un hueco existente: personal Edgy podía dar de alta
-- (usuarios_cliente_insert_staff) y leer (usuarios_cliente_select_staff)
-- filas de usuarios_cliente desde el panel interno, pero nunca pudo
-- ACTUALIZARLAS -- no había policy de update para es_personal_edgy().
-- Hace falta para que ClienteDetalle.tsx (panel interno) pueda asignar
-- el punto de venta de un empleado ya existente, sin tener que borrar
-- y recrear la fila.
create policy "usuarios_cliente_update_staff" on edgy_gestion.usuarios_cliente
  for update using (edgy_gestion.es_personal_edgy())
  with check (edgy_gestion.es_personal_edgy());
