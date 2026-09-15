-- ============================================================
-- Migración (Fase 82c, 15/09): corrección de roles en "GD Neuquén" --
-- Carlos aclaró que él no opera este negocio, solo lo integró como
-- creador del software ("no soy nada dentro de eso"). Ya tiene acceso
-- total vía personal_edgy (su otra identidad, c.copelotti@gmail.com --
-- ver tabla edgy_gestion.personal_edgy). El Cliente real son Rosana y
-- Mateo, que administran las propiedades del suegro (5 unidades) y del
-- cuñado (1 unidad).
--
-- Se elimina la fila de Carlos como "Dueño" y se pasa a Rosana/Mateo el
-- rol "Dueño" (en vez de "Administrador", que queda sin uso y se borra).
-- ============================================================

delete from edgy_gestion.usuarios_cliente
where cliente_id = (select id from edgy_gestion.clientes where slug = 'gd-neuquen')
  and user_id = '94e4477b-c660-4447-9f04-47c678c5e7af';

update edgy_gestion.usuarios_cliente
set rol_id = (select id from edgy_gestion.roles where cliente_id = (select id from edgy_gestion.clientes where slug = 'gd-neuquen') and nombre = 'Dueño'),
    rol = 'Dueño'
where cliente_id = (select id from edgy_gestion.clientes where slug = 'gd-neuquen')
  and rol_id = (select id from edgy_gestion.roles where cliente_id = (select id from edgy_gestion.clientes where slug = 'gd-neuquen') and nombre = 'Administrador');

delete from edgy_gestion.permisos_rol
where rol_id = (select id from edgy_gestion.roles where cliente_id = (select id from edgy_gestion.clientes where slug = 'gd-neuquen') and nombre = 'Administrador');

delete from edgy_gestion.roles
where cliente_id = (select id from edgy_gestion.clientes where slug = 'gd-neuquen') and nombre = 'Administrador';
