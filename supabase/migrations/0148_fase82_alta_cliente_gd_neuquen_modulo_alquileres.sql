-- ============================================================
-- Migración (Fase 82, 15/09): alta del Cliente "GD Neuquén" y del
-- módulo global "Alquileres" -- primer paso de la integración del
-- proyecto viejo "GD Neuquén"/G-Admin-Prop (gestión de alquileres del
-- complejo de deptos del suegro de Carlos, operado por Rosana y Mateo)
-- dentro del ecosistema Edgy Gestión. Carlos confirmó: es un Cliente
-- NUEVO (tenant separado), no una extensión de La Charcutería.
--
-- Nombre de tipo_negocio elegido: 'inmobiliario'. Mismo criterio que
-- 'hogar' (Home Keep): se agrega directo al CHECK de clientes sin
-- tocar el union TS `TipoNegocio` de src/types/index.ts, porque este
-- alta se hace de una por SQL (no pasa por el wizard de onboarding),
-- que es exactamente el mismo patrón ya usado para los clientes
-- 'hogar'. Si en algún momento 'inmobiliario' necesita pasar por el
-- wizard normal, ahí sí hay que sumarlo a
-- TIPO_NEGOCIO_LABEL/MODULOS_SUGERIDOS/ROLES_SUGERIDOS.
--
-- NOTA (corregida en la migración 0150_fase82c): esta migración le dio
-- a Carlos el rol "Dueño" acá -- eso se revirtió después, porque Carlos
-- aclaró que él no opera este negocio (solo lo integró como creador del
-- software, ya tiene acceso vía personal_edgy). El rol "Dueño" quedó
-- para Rosana y Mateo, que son el Cliente real.
--
-- Este es solo el esqueleto (Cliente + módulo + roles + personas). El
-- esquema de tablas propio del módulo (propietarios/propiedades/
-- unidades/inquilinos/pagos/eventos) es la migración siguiente
-- (0149_fase82b_esquema_alquileres.sql).
-- ============================================================

-- ─── 1) Nuevo valor de tipo_negocio ──────────────────────────
alter table edgy_gestion.clientes drop constraint clientes_tipo_negocio_check;
alter table edgy_gestion.clientes
  add constraint clientes_tipo_negocio_check
    check (tipo_negocio = ANY (ARRAY[
      'gastronomico_con_salon', 'gastronomico_sin_salon', 'comercio', 'logistica',
      'produccion', 'servicios', 'agro', 'comercio_produccion', 'comercio_servicios',
      'comercio_produccion_servicios', 'hogar', 'inmobiliario'
    ]));

do $$
declare
  v_cliente_id uuid;
  v_modulo_id uuid;
  v_rol_dueno_id uuid;
  v_rol_admin_id uuid;
  v_carlos_user_id uuid := '94e4477b-c660-4447-9f04-47c678c5e7af';
begin
  -- ─── 2) Cliente ────────────────────────────────────────────
  insert into edgy_gestion.clientes (nombre, tipo_negocio, slug, estado)
  values ('GD Neuquén', 'inmobiliario', 'gd-neuquen', 'activo')
  returning id into v_cliente_id;

  -- ─── 3) Módulo global "Alquileres" ─────────────────────────
  insert into edgy_gestion.modulos (nombre, slug, vertical, descripcion)
  values (
    'Alquileres',
    'alquileres',
    'inmobiliario',
    'Administración de alquileres: propiedades, unidades, inquilinos, cobranzas y liquidaciones a propietarios.'
  )
  returning id into v_modulo_id;

  insert into edgy_gestion.cliente_modulos (cliente_id, modulo_id, activo)
  values (v_cliente_id, v_modulo_id, true);

  -- ─── 4) Roles ────────────────────────────────────────────────
  -- Dueño: (ver nota arriba -- terminó siendo de Rosana/Mateo, no de
  -- Carlos, después de la corrección en 0150_fase82c).
  insert into edgy_gestion.roles (cliente_id, nombre, es_sistema, es_admin, vista)
  values (v_cliente_id, 'Dueño', true, true, 'administrativo')
  returning id into v_rol_dueno_id;

  -- Administrador: Rosana y Mateo -- en el sistema viejo (G-Admin-Prop)
  -- ambos tenían profiles.role='admin' (ven cifras financieras y
  -- liquidaciones), sin distinción real de un rol 'colab'.
  insert into edgy_gestion.roles (cliente_id, nombre, es_sistema, es_admin, vista)
  values (v_cliente_id, 'Administrador', true, true, 'administrativo')
  returning id into v_rol_admin_id;

  insert into edgy_gestion.permisos_rol (rol_id, modulo_id, nivel) values
    (v_rol_dueno_id, v_modulo_id, 'admin'),
    (v_rol_admin_id, v_modulo_id, 'admin');

  -- ─── 5) Personas ─────────────────────────────────────────────
  insert into edgy_gestion.usuarios_cliente (cliente_id, rol_id, rol, nombre, auth_mode, email, user_id)
  values (v_cliente_id, v_rol_dueno_id, 'Dueño', 'Carlos Copelotti', 'full', 'cmcopelotti@gmail.com', v_carlos_user_id);

  insert into edgy_gestion.usuarios_cliente (cliente_id, rol_id, rol, nombre, auth_mode, email)
  values
    (v_cliente_id, v_rol_admin_id, 'Administrador', 'Rosana', 'full', 'rosana_arq@hotmail.com'),
    (v_cliente_id, v_rol_admin_id, 'Administrador', 'Mateo', 'full', 'mateo.copelotti1@gmail.com');
end $$;
