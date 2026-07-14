-- Fix: el rol "Dueño" (y cualquier rol marcado es_admin) no tenía
-- acceso real a ningún módulo gestionado por tiene_permiso().
--
-- Encontrado auditando el bug "el pedido del Menú público no aparece
-- en Delivery y WhatsApp" (cierre de Fase 8): altaEquipo.ts crea el rol
-- Dueño con `es_admin: true`, pero nunca le carga filas en
-- `permisos_rol` -- y tiene_permiso() nunca miraba `es_admin`, solo
-- `permisos` (excepción individual) y `permisos_rol` (bundle del rol).
-- Resultado: el Dueño solo veía los módulos donde alguien le había
-- cargado un permiso individual a mano (en este cliente de prueba:
-- productos-stock, tesoreria, ventas, compras, servicios, contable) y
-- quedaba ciego a cualquier módulo del Kit Gastronómico
-- (delivery-whatsapp, comandas-cocina, menu-qr, viandas, caja-turno,
-- mesas-salon) sin que nadie lo hubiera notado, porque las pruebas se
-- venían haciendo casi siempre con una sesión de personal Edgy
-- (es_personal_edgy(), que sí bypassea todo esto).
--
-- Fix: un rol es_admin tiene acceso total (nivel 'admin') a cualquier
-- módulo, sin necesidad de filas explícitas en permisos_rol. Esto es
-- retroactivo -- corrige el problema para todos los clientes/roles
-- Dueño existentes y futuros, sin tener que cargar permisos módulo por
-- módulo a mano.
create or replace function edgy_gestion.tiene_permiso(p_modulo_slug text, p_nivel_minimo text)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  v_usuario_cliente_id uuid;
  v_rol_id             uuid;
  v_modulo_id          uuid;
  v_es_admin           boolean;
  v_override           text;
  v_bundle             text;
  v_nivel_efectivo     text;
begin
  select uc.id, uc.rol_id
    into v_usuario_cliente_id, v_rol_id
  from edgy_gestion.usuarios_cliente uc
  where uc.user_id = auth.uid();

  select id into v_modulo_id from edgy_gestion.modulos where slug = p_modulo_slug;

  if v_usuario_cliente_id is null or v_modulo_id is null then
    return false;
  end if;

  -- Un rol es_admin (ej. "Dueño") tiene acceso total a todos los
  -- módulos del cliente, sin necesidad de permisos_rol explícitos.
  if v_rol_id is not null then
    select r.es_admin into v_es_admin from edgy_gestion.roles r where r.id = v_rol_id;
    if v_es_admin then
      return true;
    end if;
  end if;

  -- excepción individual pisa al bundle del rol
  select nivel into v_override
  from edgy_gestion.permisos
  where usuario_cliente_id = v_usuario_cliente_id and modulo_id = v_modulo_id;

  if v_override is not null then
    v_nivel_efectivo := v_override;
  elsif v_rol_id is not null then
    select nivel into v_bundle
    from edgy_gestion.permisos_rol
    where rol_id = v_rol_id and modulo_id = v_modulo_id;
    v_nivel_efectivo := v_bundle;
  end if;

  if v_nivel_efectivo is null then
    return false;
  end if;

  return edgy_gestion.nivel_rango(v_nivel_efectivo) >= edgy_gestion.nivel_rango(p_nivel_minimo);
end;
$$;
